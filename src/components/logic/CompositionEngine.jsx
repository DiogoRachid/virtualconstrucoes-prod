import { base44 } from '@/api/base44Client';

// Cache global para otimização
let cachedInputs = null;
let cachedServices = null;
let cacheTime = null;
let cachedAllItemsMap = null;
const CACHE_DURATION = 30000; // 30 segundos

// Limpar cache quando necessário
export const clearCache = () => {
  cachedInputs = null;
  cachedServices = null;
  cacheTime = null;
  cachedAllItemsMap = null;
};

// Buscar todos os registros com paginação automática
const fetchAll = async (entity) => {
  const limit = 5000;
  let all = [];
  let skip = 0;
  while (true) {
    const batch = await entity.list('created_date', limit, skip);
    all = all.concat(batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return all;
};

// Buscar todos os dados com cache
const getCachedData = async () => {
  const now = Date.now();
  if (!cacheTime || (now - cacheTime) > CACHE_DURATION) {
    const [inputs, services] = await Promise.all([
      fetchAll(base44.entities.Input),
      fetchAll(base44.entities.Service)
    ]);
    cachedInputs = new Map(inputs.map(i => [i.id, i]));
    cachedServices = new Map(services.map(s => [s.id, s]));
    cacheTime = now;
  }
  return { inputMap: cachedInputs, serviceMap: cachedServices };
};

// Verificar dependência circular
export const checkCircularDependency = async (serviceId, targetItemId) => {
  if (serviceId === targetItemId) return true;

  const { serviceMap } = await getCachedData();
  const allItems = await base44.entities.ServiceItem.list();
  
  const visited = new Set();
  const queue = [targetItemId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    if (currentId === serviceId) return true;

    const items = allItems.filter(i => i.servico_id === currentId && i.tipo_item === 'SERVICO');
    for (const item of items) {
      queue.push(item.item_id);
    }
  }
  return false;
};

// Parser de data
const parseDate = (str) => {
  if (!str) return null;
  const [mes, ano] = str.split('/');
  if (!mes || !ano) return null;
  return new Date(parseInt(ano), parseInt(mes) - 1, 1);
};

const formatDate = (date) => {
  if (!date) return null;
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${mes}/${date.getFullYear()}`;
};

// Calcular recursivamente a data_base mais recente de um serviço em cascata
// Considera insumos diretos + sub-serviços (usando cache já carregado + allItemsMap)
const calcDataBaseCascata = (serviceId, allItemsMap, inputMap, serviceMap, visited = new Set()) => {
  if (visited.has(serviceId)) return null;
  visited.add(serviceId);

  const items = allItemsMap.get(serviceId) || [];
  let maisRecente = null;

  for (const item of items) {
    let dataStr = null;

    if (item.tipo_item === 'INSUMO') {
      const insumo = inputMap.get(item.item_id);
      dataStr = insumo?.data_base || null;
    } else if (item.tipo_item === 'SERVICO') {
      // Recursão: pega a data_base calculada do sub-serviço
      dataStr = calcDataBaseCascata(item.item_id, allItemsMap, inputMap, serviceMap, visited);
    }

    if (dataStr) {
      const d = parseDate(dataStr);
      if (d && (!maisRecente || d > maisRecente)) {
        maisRecente = d;
      }
    }
  }

  return maisRecente ? formatDate(maisRecente) : null;
};



const getAllItemsMap = async () => {
  if (cachedAllItemsMap) return cachedAllItemsMap;
  const limit = 1000;
  let all = [];
  let skip = 0;
  while (true) {
    const batch = await base44.entities.ServiceItem.list('created_date', limit, skip);
    all = all.concat(batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  // Agrupar por servico_id para acesso O(1)
  const map = new Map();
  for (const item of all) {
    if (!map.has(item.servico_id)) map.set(item.servico_id, []);
    map.get(item.servico_id).push(item);
  }
  cachedAllItemsMap = map;
  return map;
};

// Recalcular serviço individual
export const recalculateService = async (serviceId) => {
  const { inputMap, serviceMap } = await getCachedData();
  const allItemsMap = await getAllItemsMap();
  const items = allItemsMap.get(serviceId) || [];

  let custoMaterial = 0;
  let custoMaoObra = 0;
  let maxNivelDep = 0;

  // Calcular data_base em cascata (mais recente entre todos os insumos/sub-serviços)
  const dataBaseStr = calcDataBaseCascata(serviceId, allItemsMap, inputMap, serviceMap);

  // Processar todos os itens para calcular custos
  const updatePromises = [];
  
  for (const item of items) {
    let unitCost = 0;

    if (item.tipo_item === 'INSUMO') {
      const insumo = inputMap.get(item.item_id);
      if (insumo) {
        unitCost = insumo.valor_unitario || 0;
        const totalItem = item.quantidade * unitCost;
        if (insumo.categoria === 'MAO_OBRA') {
          custoMaoObra += totalItem;
        } else {
          custoMaterial += totalItem;
        }
      }
    } else if (item.tipo_item === 'SERVICO') {
      const subService = serviceMap.get(item.item_id);
      if (subService) {
        unitCost = subService.custo_total || 0;
        const totalItem = item.quantidade * unitCost;
        if (subService.custo_total > 0) {
          const matRatio = (subService.custo_material || 0) / subService.custo_total;
          const laborRatio = (subService.custo_mao_obra || 0) / subService.custo_total;
          custoMaterial += totalItem * matRatio;
          custoMaoObra += totalItem * laborRatio;
        }
        const depLevel = subService.nivel_max_dependencia || 0;
        if (depLevel >= maxNivelDep) maxNivelDep = depLevel + 1;
      }
    }

    const totalItem = item.quantidade * unitCost;
    if (Math.abs((item.custo_unitario_snapshot || 0) - unitCost) > 0.0001 || 
        Math.abs((item.custo_total_item || 0) - totalItem) > 0.0001) {
      updatePromises.push(
        base44.entities.ServiceItem.update(item.id, {
          custo_unitario_snapshot: unitCost,
          custo_total_item: totalItem
        }).catch(() => {})
      );
    }
  }

  await Promise.all(updatePromises);

  const custoTotal = custoMaterial + custoMaoObra;

  // Salvar snapshot histórico do valor atual antes de sobrescrever
  const currentService = serviceMap.get(serviceId);
  if (currentService && currentService.data_base && currentService.custo_total > 0) {
    const dataBaseAtual = currentService.data_base;
    const existing = await base44.entities.ServicePriceHistory.filter({
      servico_id: serviceId,
      data_base: dataBaseAtual
    });
    if (existing.length === 0) {
      await base44.entities.ServicePriceHistory.create({
        servico_id: serviceId,
        codigo: currentService.codigo,
        descricao: currentService.descricao,
        unidade: currentService.unidade,
        custo_total: currentService.custo_total,
        custo_material: currentService.custo_material || 0,
        custo_mao_obra: currentService.custo_mao_obra || 0,
        data_base: dataBaseAtual
      }).catch(() => {});
    }
  }

  // Atualizar serviço
  await base44.entities.Service.update(serviceId, {
    custo_material: custoMaterial,
    custo_mao_obra: custoMaoObra,
    custo_total: custoTotal,
    nivel_max_dependencia: maxNivelDep,
    data_base: dataBaseStr
  });

  // Atualizar cache local
  if (currentService) {
    currentService.custo_material = custoMaterial;
    currentService.custo_mao_obra = custoMaoObra;
    currentService.custo_total = custoTotal;
    currentService.nivel_max_dependencia = maxNivelDep;
    currentService.data_base = dataBaseStr;
  }

  return { custo_total: custoTotal, custo_material: custoMaterial, custo_mao_obra: custoMaoObra, data_base: dataBaseStr };
};

// Atualizar dependentes em cascata
export const updateDependents = async (itemType, itemId) => {
  const allItems = await base44.entities.ServiceItem.list();
  const dependentItems = allItems.filter(i => i.tipo_item === itemType && i.item_id === itemId);
  const parentServiceIds = [...new Set(dependentItems.map(d => d.servico_id))];

  for (const serviceId of parentServiceIds) {
    await recalculateService(serviceId);
    await updateDependents('SERVICO', serviceId);
  }
};

// Coletar todos os sub-serviços recursivamente de um conjunto de IDs
const collectAllSubServices = (serviceIds, allItemsMap) => {
  const all = new Set(serviceIds);
  const queue = [...serviceIds];
  while (queue.length > 0) {
    const id = queue.shift();
    const items = allItemsMap.get(id) || [];
    for (const item of items) {
      if (item.tipo_item === 'SERVICO' && !all.has(item.item_id)) {
        all.add(item.item_id);
        queue.push(item.item_id);
      }
    }
  }
  return [...all];
};

// Ordenar serviços em ordem topológica (filhos antes dos pais) para recálculo bottom-up
const topoSort = (serviceIds, allItemsMap) => {
  const idSet = new Set(serviceIds);
  const visited = new Set();
  const order = [];

  const visit = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    const items = allItemsMap.get(id) || [];
    for (const item of items) {
      if (item.tipo_item === 'SERVICO' && idSet.has(item.item_id)) {
        visit(item.item_id);
      }
    }
    order.push(id);
  };

  for (const id of serviceIds) visit(id);
  return order; // filhos primeiro, pais depois
};

// Recalcular múltiplos serviços em lote
export const recalculateMultipleServices = async (serviceIds, onProgress) => {
  clearCache(); // Limpar cache antes de começar
  const { inputMap, serviceMap } = await getCachedData(); // Carregar dados frescos
  const allItemsMap = await getAllItemsMap(); // Pré-carregar mapa de itens uma única vez

  // Se todos os serviços já estão incluídos, não precisa expandir — só ordenar
  const allServiceIds = new Set(serviceMap.keys());
  const inputSet = new Set(serviceIds);
  const isAll = serviceIds.length >= allServiceIds.size || [...inputSet].every(id => allServiceIds.has(id));

  let expanded;
  if (isAll && serviceIds.length === allServiceIds.size) {
    // Caso "Recalcular Todos": usar todos os IDs do cache diretamente
    expanded = [...allServiceIds];
  } else {
    // Caso seleção parcial: expandir sub-serviços recursivamente
    expanded = collectAllSubServices(serviceIds, allItemsMap);
  }

  // Ordenar: filhos antes dos pais (bottom-up)
  const ordered = topoSort(expanded, allItemsMap);

  // Pré-carregar histórico de preços de uma vez (evita 1 query por serviço)
  const allHistory = await (async () => {
    const limit = 1000;
    let all = [];
    let skip = 0;
    while (true) {
      const batch = await base44.entities.ServicePriceHistory.list('created_date', limit, skip);
      all = all.concat(batch);
      if (batch.length < limit) break;
      skip += limit;
    }
    return all;
  })();
  const historySet = new Set(allHistory.map(h => `${h.servico_id}|${h.data_base}`));

  const results = [];
  for (let i = 0; i < ordered.length; i++) {
    if (onProgress) onProgress(i, ordered.length);
    try {
      const result = await recalculateServiceFast(ordered[i], inputMap, serviceMap, allItemsMap, historySet);
      results.push({ serviceId: ordered[i], success: true, ...result });
    } catch (error) {
      results.push({ serviceId: ordered[i], success: false, error: error.message });
    }
    if (onProgress) onProgress(i + 1, ordered.length);
  }
  
  clearCache(); // Limpar cache no final
  return results;
};

// Versão otimizada de recalculateService que reutiliza dados já carregados
const recalculateServiceFast = async (serviceId, inputMap, serviceMap, allItemsMap, historySet) => {
  const items = allItemsMap.get(serviceId) || [];

  let custoMaterial = 0;
  let custoMaoObra = 0;
  let maxNivelDep = 0;

  const dataBaseStr = calcDataBaseCascata(serviceId, allItemsMap, inputMap, serviceMap);

  const updatePromises = [];
  for (const item of items) {
    let unitCost = 0;
    if (item.tipo_item === 'INSUMO') {
      const insumo = inputMap.get(item.item_id);
      if (insumo) {
        unitCost = insumo.valor_unitario || 0;
        const totalItem = item.quantidade * unitCost;
        if (insumo.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
        else custoMaterial += totalItem;
      }
    } else if (item.tipo_item === 'SERVICO') {
      const subService = serviceMap.get(item.item_id);
      if (subService) {
        unitCost = subService.custo_total || 0;
        const totalItem = item.quantidade * unitCost;
        if (subService.custo_total > 0) {
          const matRatio = (subService.custo_material || 0) / subService.custo_total;
          const laborRatio = (subService.custo_mao_obra || 0) / subService.custo_total;
          custoMaterial += totalItem * matRatio;
          custoMaoObra += totalItem * laborRatio;
        }
        const depLevel = subService.nivel_max_dependencia || 0;
        if (depLevel >= maxNivelDep) maxNivelDep = depLevel + 1;
      }
    }
    const totalItem = item.quantidade * unitCost;
    if (Math.abs((item.custo_unitario_snapshot || 0) - unitCost) > 0.0001 ||
        Math.abs((item.custo_total_item || 0) - totalItem) > 0.0001) {
      updatePromises.push(
        base44.entities.ServiceItem.update(item.id, { custo_unitario_snapshot: unitCost, custo_total_item: totalItem }).catch(() => {})
      );
    }
  }
  await Promise.all(updatePromises);

  const custoTotal = custoMaterial + custoMaoObra;
  const currentService = serviceMap.get(serviceId);

  // Snapshot histórico usando o Set pré-carregado (sem query extra)
  if (currentService && currentService.data_base && currentService.custo_total > 0) {
    const key = `${serviceId}|${currentService.data_base}`;
    if (!historySet.has(key)) {
      historySet.add(key); // evitar duplicata dentro do mesmo lote
      base44.entities.ServicePriceHistory.create({
        servico_id: serviceId,
        codigo: currentService.codigo,
        descricao: currentService.descricao,
        unidade: currentService.unidade,
        custo_total: currentService.custo_total,
        custo_material: currentService.custo_material || 0,
        custo_mao_obra: currentService.custo_mao_obra || 0,
        data_base: currentService.data_base
      }).catch(() => {});
    }
  }

  await base44.entities.Service.update(serviceId, {
    custo_material: custoMaterial,
    custo_mao_obra: custoMaoObra,
    custo_total: custoTotal,
    nivel_max_dependencia: maxNivelDep,
    data_base: dataBaseStr
  });

  // Atualizar cache local para que serviços-pai usem valores atualizados
  if (currentService) {
    currentService.custo_material = custoMaterial;
    currentService.custo_mao_obra = custoMaoObra;
    currentService.custo_total = custoTotal;
    currentService.nivel_max_dependencia = maxNivelDep;
    currentService.data_base = dataBaseStr;
  }

  return { custo_total: custoTotal, custo_material: custoMaterial, custo_mao_obra: custoMaoObra, data_base: dataBaseStr };
};