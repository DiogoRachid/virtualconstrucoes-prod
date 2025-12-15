import { base44 } from '@/api/base44Client';

// --- Helper: Fetch All Data Efficiently ---
export const fetchAll = async (entityName) => {
  let allData = [];
  let page = 0;
  const limit = 1000;
  while (true) {
    // Use 'created_date' for stable sorting to avoid pagination gaps/dups
    const data = await base44.entities[entityName].list('created_date', limit, page * limit);
    if (!data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length < limit) break;
    page++;
  }
  return allData;
};

// --- Helper: Build Maps ---
export const buildMaps = (inputs, services, compositions) => {
  const inputMap = new Map(inputs.map(i => [i.id, i]));
  const serviceMap = new Map(services.map(s => [s.id, s]));
  const compMap = new Map(); // servico_id -> [compositions]
  const reverseCompMap = new Map(); // item_id (child) -> [compositions (where it is used)]

  for (const comp of compositions) {
    // Forward Map (Parent -> Children)
    if (!compMap.has(comp.servico_id)) compMap.set(comp.servico_id, []);
    compMap.get(comp.servico_id).push(comp);

    // Reverse Map (Child -> Parents) - Used for Cascade Updates
    // We only care if the child is a SERVICE or INSUMO
    if (!reverseCompMap.has(comp.item_id)) reverseCompMap.set(comp.item_id, []);
    reverseCompMap.get(comp.item_id).push(comp);
  }

  return { inputMap, serviceMap, compMap, reverseCompMap };
};

// --- Logic 1: Circular Dependency Check ---
// Returns true if circular dependency exists
export const checkCircularDependency = async (parentId, childId) => {
  // If child is not a service, no circle possible (Inputs are leaves)
  // Need to fetch compositions to check graph
  // Optimization: For single check, we might fetch only relevant paths, but doing it client-side without full graph is hard.
  // We'll assume this is called when we have the graph or we do a targeted BFS.
  
  // Simple check: Is childId == parentId?
  if (parentId === childId) return true;

  // BFS to see if 'parentId' is reachable from 'childId' (meaning child depends on parent)
  // We need the composition list. If not provided, we must fetch.
  const allComps = await fetchAll('ServiceComposition');
  const { compMap } = buildMaps([], [], allComps);

  const queue = [childId];
  const visited = new Set([childId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === parentId) return true; // Found path from child to parent -> Circle!

    const children = compMap.get(current) || [];
    for (const comp of children) {
      if (comp.tipo_item === 'SERVICO' && !visited.has(comp.item_id)) {
        visited.add(comp.item_id);
        queue.push(comp.item_id);
      }
    }
  }

  return false;
};

// --- Logic 2: Recalculate Costs (Recursive with Snapshot Updates) ---
export const recalculateCosts = async (
  updateDataBase, // String: MM/AAAA
  updateMode = 'VALUES_AND_DESC', // 'VALUES_ONLY' | 'VALUES_AND_DESC'
  logUser = 'System'
) => {
  // 1. Load Everything
  const [allInputs, allServices, allComps] = await Promise.all([
    fetchAll('Input'),
    fetchAll('Service'),
    fetchAll('ServiceComposition')
  ]);

  const { inputMap, serviceMap, compMap } = buildMaps(allInputs, allServices, allComps);
  
  const serviceUpdates = [];
  const compUpdates = [];
  const computedCosts = new Map(); // serviceId -> { total, mat, labor, level }

  // 2. Calculate Levels & Costs (Depth First Search)
  // We need to calculate costs from leaves up.
  // Memoization ensures we process each service once.
  
  const calculate = (serviceId, stack = new Set()) => {
    if (stack.has(serviceId)) throw new Error(`Ciclo detectado no serviço ${serviceId}`);
    if (computedCosts.has(serviceId)) return computedCosts.get(serviceId);

    stack.add(serviceId);
    
    const comps = compMap.get(serviceId) || [];
    let total = 0;
    let mat = 0;
    let labor = 0;
    let maxLevel = 0;

    for (const comp of comps) {
      let unitCost = 0;
      let desc = comp.descricao_snapshot;
      let unit = comp.unidade_snapshot;
      let itemLevel = 0;

      if (comp.tipo_item === 'INSUMO') {
        const input = inputMap.get(comp.item_id);
        if (input) {
           unitCost = input.valor_referencia || 0;
           if (updateMode === 'VALUES_AND_DESC') {
             desc = input.descricao;
             unit = input.unidade;
           }
        }
      } else { // SERVICO
        const subResult = calculate(comp.item_id, stack);
        unitCost = subResult.total;
        itemLevel = subResult.level;
        if (updateMode === 'VALUES_AND_DESC') {
           const subService = serviceMap.get(comp.item_id);
           if (subService) {
             desc = subService.descricao;
             unit = subService.unidade;
           }
        }
      }

      // Update Max Level
      if (itemLevel > maxLevel) maxLevel = itemLevel;

      // Calc Total for Item
      const totalItem = unitCost * comp.quantidade;
      
      // Accumulate
      total += totalItem;
      if (comp.tipo_custo === 'MATERIAL') mat += totalItem;
      else labor += totalItem;

      // Prepare Composition Snapshot Update if changed
      // We compare with existing fields
      const hasChanged = 
        Math.abs(comp.custo_unitario - unitCost) > 0.0001 ||
        Math.abs(comp.custo_total_item - totalItem) > 0.0001 ||
        (updateMode === 'VALUES_AND_DESC' && (comp.descricao_snapshot !== desc || comp.unidade_snapshot !== unit));

      if (hasChanged) {
        compUpdates.push({
          id: comp.id,
          data: {
            custo_unitario: unitCost,
            custo_total_item: totalItem,
            descricao_snapshot: desc,
            unidade_snapshot: unit,
            // also legacy fields if needed
            item_nome: desc,
            unidade: unit
          }
        });
      }
    }

    const myLevel = maxLevel + 1;
    const result = { total, mat, labor, level: myLevel };
    computedCosts.set(serviceId, result);
    
    // Prepare Service Update
    const service = serviceMap.get(serviceId);
    if (service) {
      const hasChanged = 
        Math.abs(service.custo_total - total) > 0.0001 ||
        Math.abs(service.custo_material - mat) > 0.0001 ||
        Math.abs(service.custo_mao_obra - labor) > 0.0001 ||
        (updateDataBase && service.data_base !== updateDataBase);

      if (hasChanged) {
        serviceUpdates.push({
          id: serviceId,
          data: {
            custo_material: mat,
            custo_mao_obra: labor,
            custo_total: total,
            ...(updateDataBase ? { data_base: updateDataBase } : {})
          }
        });
      }
    }

    stack.delete(serviceId);
    return result;
  };

  // Run calculation for all services
  const errors = [];
  for (const service of allServices) {
    try {
      calculate(service.id);
    } catch (e) {
      errors.push(e.message);
    }
  }

  // 3. Batch Updates
  // We return the updates so the caller can execute them and show progress
  return { 
    serviceUpdates, 
    compUpdates, 
    errors, 
    stats: {
      processedServices: allServices.length,
      affectedServices: serviceUpdates.length,
      affectedComps: compUpdates.length
    } 
  };
};

// --- Logic 3: Execute Batch Updates ---
export const executeUpdates = async (updates, onProgress) => {
  const { serviceUpdates, compUpdates } = updates;
  // Optimized batch size and delay for better speed while respecting limits
  const BATCH_SIZE = 10;
  let processed = 0;
  const total = serviceUpdates.length + compUpdates.length;

  const processBatch = async (items, entityName) => {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
       const batch = items.slice(i, i + BATCH_SIZE);
       try {
         await Promise.all(batch.map(item => base44.entities[entityName].update(item.id, item.data)));
       } catch (err) {
         console.error(`Error updating batch in ${entityName}`, err);
       }
       processed += batch.length;
       if (onProgress) onProgress(processed, total);
       // Moderate delay: 100ms
       await new Promise(r => setTimeout(r, 100)); 
    }
  };

  await processBatch(compUpdates, 'ServiceComposition');
  await processBatch(serviceUpdates, 'Service');
};

// --- Logic 4: Create Log ---
export const createLog = async (data) => {
  await base44.entities.CompositionUpdateLog.create(data);
};