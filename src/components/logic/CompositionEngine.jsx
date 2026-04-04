import { base44 } from '@/api/base44Client';

let cachedInputs = null;
let cachedServices = null;
let cacheTime = null;
let cachedAllItemsMap = null;
const CACHE_DURATION = 30000;

export const clearCache = () => {
  cachedInputs = null;
  cachedServices = null;
  cacheTime = null;
  cachedAllItemsMap = null;
};

const fetchAll = async (entity) => {
  const limit = 1000;
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

export const checkCircularDependency = async (serviceId, targetItemId) => {
  if (serviceId === targetItemId) return true;
  const allItems = await base44.entities.ServiceItem.list();
  const visited = new Set();
  const queue = [targetItemId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    if (currentId === serviceId) return true;
    const items = allItems.filter(i => i.servico_id === currentId && i.tipo_item === 'SERVICO');
    for (const item of items) queue.push(item.item_id);
  }
  return false;
};

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

const calcDataBaseCascata = (serviceId, allItemsMap, inputMap, serviceMap, visited = new Set()) => {
  if (visited.has(serviceId)) return null;
  visited.add(serviceId);
  const items = allItemsMap.get(serviceId) || [];
  let maisRecente = null;
  for (const item of items) {
    let dataStr = null;
    if (item.tipo_item === 'INSUMO') {
      dataStr = inputMap.get(item.item_id)?.data_base || null;
    } else if (item.tipo_item === 'SERVICO') {
      dataStr = calcDataBaseCascata(item.item_id, allItemsMap, inputMap, serviceMap, visited);
    }
    if (dataStr) {
      const d = parseDate(dataStr);
      if (d && (!maisRecente || d > maisRecente)) maisRecente = d;
    }
  }
  return maisRecente ? formatDate(maisRecente) : null;
};

const getAllItemsMap = async () => {
  if (cachedAllItemsMap) return cachedAllItemsMap;
  const allItems = await fetchAll(base44.entities.ServiceItem);
  const map = new Map();
  for (const item of allItems) {
    if (!map.has(item.servico_id)) map.set(item.servico_id, []);
    map.get(item.servico_id).push(item);
  }
  cachedAllItemsMap = map;
  return map;
};

export const recalculateService = async (serviceId) => {
  const { inputMap, serviceMap } = await getCachedData();
  const allItemsMap = await getAllItemsMap();
  return recalculateServiceFast(serviceId, inputMap, serviceMap, allItemsMap, new Set());
};

export const updateDependents = async (itemType, itemId) => {
  const allItems = await base44.entities.ServiceItem.list();
  const dependentItems = allItems.filter(i => i.tipo_item === itemType && i.item_id === itemId);
  const parentServiceIds = [...new Set(dependentItems.map(d => d.servico_id))];
  for (const serviceId of parentServiceIds) {
    await recalculateService(serviceId);
    await updateDependents('SERVICO', serviceId);
  }
};

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

const topoSort = (serviceIds, allItemsMap) => {
  const idSet = new Set(serviceIds);
  const visited = new Set();
  const order = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    const items = allItemsMap.get(id) || [];
    for (const item of items) {
      if (item.tipo_item === 'SERVICO' && idSet.has(item.item_id)) visit(item.item_id);
    }
    order.push(id);
  };
  for (const id of serviceIds) visit(id);
  return order;
};

// Deduplica array de objetos por id
const dedup = (arr) => {
  const seen = new Map();
  for (const r of arr) seen.set(r.id, r);
  return [...seen.values()];
};

export const recalculateMultipleServices = async (serviceIds, onProgress) => {
  clearCache();
  const { inputMap, serviceMap } = await getCachedData();
  const allItemsMap = await getAllItemsMap();

  const allServiceIds = new Set(serviceMap.keys());
  let expanded;
  if (serviceIds.length >= allServiceIds.size) {
    expanded = [...allServiceIds];
  } else {
    expanded = collectAllSubServices(serviceIds, allItemsMap);
  }

  const ordered = topoSort(expanded, allItemsMap);

  const allHistory = await fetchAll(base44.entities.ServicePriceHistory);
  const historySet = new Set(allHistory.map(h => `${h.servico_id}|${h.data_base}`));

  const serviceUpdates = [];
  const itemUpdatesMap = new Map(); // usa Map para deduplicar por id automaticamente
  const historyCreates = [];

  for (let i = 0; i < ordered.length; i++) {
    if (onProgress) onProgress(i, ordered.length);

    const serviceId = ordered[i];
    const items = allItemsMap.get(serviceId) || [];
    let custoMaterial = 0;
    let custoMaoObra = 0;
    let maxNivelDep = 0;

    const dataBaseStr = calcDataBaseCascata(serviceId, allItemsMap, inputMap, serviceMap);

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
        // Map garante deduplicação por id
        itemUpdatesMap.set(item.id, { id: item.id, custo_unitario_snapshot: unitCost, custo_total_item: totalItem });
      }
    }

    const custoTotal = custoMaterial + custoMaoObra;
    const currentService = serviceMap.get(serviceId);

    if (currentService && currentService.data_base && currentService.custo_total > 0) {
      const key = `${serviceId}|${currentService.data_base}`;
      if (!historySet.has(key)) {
        historySet.add(key);
        historyCreates.push({
          servico_id: serviceId,
          codigo: currentService.codigo,
          descricao: currentService.descricao,
          unidade: currentService.unidade,
          custo_total: currentService.custo_total,
          custo_material: currentService.custo_material || 0,
          custo_mao_obra: currentService.custo_mao_obra || 0,
          data_base: currentService.data_base,
        });
      }
    }

    serviceUpdates.push({
      id: serviceId,
      custo_material: custoMaterial,
      custo_mao_obra: custoMaoObra,
      custo_total: custoTotal,
      nivel_max_dependencia: maxNivelDep,
      data_base: dataBaseStr,
    });

    if (currentService) {
      currentService.custo_material = custoMaterial;
      currentService.custo_mao_obra = custoMaoObra;
      currentService.custo_total = custoTotal;
      currentService.nivel_max_dependencia = maxNivelDep;
      currentService.data_base = dataBaseStr;
    }

    if (onProgress) onProgress(i + 1, ordered.length);
  }

  if (onProgress) onProgress(ordered.length, ordered.length);

  const BATCH = 500;

  // ServiceItems — já deduplicados pelo Map
  const uniqueItemUpdates = [...itemUpdatesMap.values()];
  for (let i = 0; i < uniqueItemUpdates.length; i += BATCH) {
    await base44.entities.ServiceItem.bulkUpdate(uniqueItemUpdates.slice(i, i + BATCH));
  }

  // Services — deduplicar por segurança
  const uniqueServiceUpdates = dedup(serviceUpdates);
  for (let i = 0; i < uniqueServiceUpdates.length; i += BATCH) {
    await base44.entities.Service.bulkUpdate(uniqueServiceUpdates.slice(i, i + BATCH));
  }

  // Históricos
  if (historyCreates.length > 0) {
    for (let i = 0; i < historyCreates.length; i += BATCH) {
      await base44.entities.ServicePriceHistory.bulkCreate(historyCreates.slice(i, i + BATCH));
    }
  }

  clearCache();
  return serviceUpdates.map(s => ({ serviceId: s.id, success: true, ...s }));
};

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

  if (currentService && currentService.data_base && currentService.custo_total > 0) {
    const key = `${serviceId}|${currentService.data_base}`;
    if (!historySet.has(key)) {
      historySet.add(key);
      base44.entities.ServicePriceHistory.create({
        servico_id: serviceId,
        codigo: currentService.codigo,
        descricao: currentService.descricao,
        unidade: currentService.unidade,
        custo_total: currentService.custo_total,
        custo_material: currentService.custo_material || 0,
        custo_mao_obra: currentService.custo_mao_obra || 0,
        data_base: currentService.data_base,
      }).catch(() => {});
    }
  }

  await base44.entities.Service.update(serviceId, {
    custo_material: custoMaterial,
    custo_mao_obra: custoMaoObra,
    custo_total: custoTotal,
    nivel_max_dependencia: maxNivelDep,
    data_base: dataBaseStr,
  });

  if (currentService) {
    currentService.custo_material = custoMaterial;
    currentService.custo_mao_obra = custoMaoObra;
    currentService.custo_total = custoTotal;
    currentService.nivel_max_dependencia = maxNivelDep;
    currentService.data_base = dataBaseStr;
  }

  return { custo_total: custoTotal, custo_material: custoMaterial, custo_mao_obra: custoMaoObra, data_base: dataBaseStr };
};
