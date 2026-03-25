import { base44 } from '@/api/base44Client';

// Cache global para otimização
let cachedInputs = null;
let cachedServices = null;
let cacheTime = null;
const CACHE_DURATION = 30000; // 30 segundos

// Limpar cache quando necessário
export const clearCache = () => {
  cachedInputs = null;
  cachedServices = null;
  cacheTime = null;
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

// Buscar recursivamente todos os insumos de um serviço
const getAllInputsFromService = async (serviceId, allItems, inputMap, serviceMap, visited = new Set()) => {
  if (visited.has(serviceId)) return [];
  visited.add(serviceId);
  
  const items = allItems.filter(item => item.servico_id === serviceId);
  const allInputs = [];
  
  for (const item of items) {
    if (item.tipo_item === 'INSUMO') {
      const insumo = inputMap.get(item.item_id);
      if (insumo) allInputs.push(insumo);
    } else if (item.tipo_item === 'SERVICO') {
      const subInputs = await getAllInputsFromService(item.item_id, allItems, inputMap, serviceMap, visited);
      allInputs.push(...subInputs);
    }
  }
  
  return allInputs;
};

// Recalcular serviço individual
export const recalculateService = async (serviceId) => {
  const items = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
  const { inputMap, serviceMap } = await getCachedData();
  
  let custoMaterial = 0;
  let custoMaoObra = 0;
  let maxNivelDep = 0;
  let dataBaseMaisAntiga = null;

  // Buscar todos os insumos recursivamente para determinar a data_base
  const allItems = await base44.entities.ServiceItem.list();
  const allInputs = await getAllInputsFromService(serviceId, allItems, inputMap, serviceMap);
  
  for (const insumo of allInputs) {
    if (insumo.data_base) {
      const dataItem = parseDate(insumo.data_base);
      if (dataItem && (!dataBaseMaisAntiga || dataItem < dataBaseMaisAntiga)) {
        dataBaseMaisAntiga = dataItem;
      }
    }
  }

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
        if (depLevel >= maxNivelDep) {
          maxNivelDep = depLevel + 1;
        }
      }
    }

    const totalItem = item.quantidade * unitCost;
    
    // Atualizar item se mudou
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

  // Formatar data base herdada dos insumos
  let dataBaseStr = null;
  if (dataBaseMaisAntiga) {
    const mes = String(dataBaseMaisAntiga.getMonth() + 1).padStart(2, '0');
    const ano = dataBaseMaisAntiga.getFullYear();
    dataBaseStr = `${mes}/${ano}`;
  }

  // Salvar snapshot histórico do valor atual antes de sobrescrever
  const currentService = serviceMap.get(serviceId);
  if (currentService && currentService.data_base && currentService.custo_total > 0) {
    const dataBaseAtual = currentService.data_base;
    // Verifica se já existe snapshot para essa data_base
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

  // Atualizar cache
  const service = serviceMap.get(serviceId);
  if (service) {
    service.custo_material = custoMaterial;
    service.custo_mao_obra = custoMaoObra;
    service.custo_total = custoTotal;
    service.nivel_max_dependencia = maxNivelDep;
    service.data_base = dataBaseStr;
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

// Recalcular múltiplos serviços em lote
export const recalculateMultipleServices = async (serviceIds, onProgress) => {
  clearCache(); // Limpar cache antes de começar
  await getCachedData(); // Carregar dados frescos
  
  const results = [];
  for (let i = 0; i < serviceIds.length; i++) {
    if (onProgress) onProgress(i, serviceIds.length); // antes: marca como "em andamento"
    try {
      const result = await recalculateService(serviceIds[i]);
      results.push({ serviceId: serviceIds[i], success: true, ...result });
    } catch (error) {
      results.push({ serviceId: serviceIds[i], success: false, error: error.message });
    }
    if (onProgress) onProgress(i + 1, serviceIds.length); // depois: marca como "concluído"
  }
  
  clearCache(); // Limpar cache no final
  return results;
};