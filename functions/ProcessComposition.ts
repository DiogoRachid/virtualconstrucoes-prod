import { base44 } from '@base44/backend-sdk';

// Helper to detect category
const detectCategory = (unit) => {
    if (!unit) return 'MATERIAL';
    const u = unit.toUpperCase().trim();
    if (u === 'H' || u === 'HORA' || u.startsWith('H')) return 'MAO_OBRA';
    return 'MATERIAL';
};

// Helper: Recalculate Service Cost
const recalculateService = async (serviceId) => {
    const items = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
    
    let custoMaterial = 0;
    let custoMaoObra = 0;
    let maxNivelDep = 0;

    for (const item of items) {
        let unitCost = 0;
        
        if (item.tipo_item === 'INSUMO') {
            const inputs = await base44.entities.Input.filter({ id: item.item_id });
            const insumo = inputs[0];
            unitCost = insumo ? insumo.valor_unitario : 0;
            
            // Fallback categorization
            if (insumo && insumo.categoria === 'MAO_OBRA') custoMaoObra += (item.quantidade * unitCost);
            else custoMaterial += (item.quantidade * unitCost);
            
        } else {
            const services = await base44.entities.Service.filter({ id: item.item_id });
            const subService = services[0];
            unitCost = subService ? subService.custo_total : 0;
            
            if (subService) {
                if (subService.nivel_max_dependencia >= maxNivelDep) {
                    maxNivelDep = subService.nivel_max_dependencia + 1;
                }
                const matRatio = subService.custo_total ? (subService.custo_material / subService.custo_total) : 0;
                const laborRatio = subService.custo_total ? (subService.custo_mao_obra / subService.custo_total) : 0;
                const totalItem = item.quantidade * unitCost;
                custoMaterial += totalItem * matRatio;
                custoMaoObra += totalItem * laborRatio;
            } else {
                 if (item.categoria === 'MAO_OBRA') custoMaoObra += (item.quantidade * unitCost);
                 else custoMaterial += (item.quantidade * unitCost);
            }
        }

        // Snapshot update
        if (item.custo_unitario_snapshot !== unitCost) {
            await base44.entities.ServiceItem.update(item.id, {
                custo_unitario_snapshot: unitCost,
                custo_total_item: item.quantidade * unitCost
            });
        }
    }

    const custoTotal = custoMaterial + custoMaoObra;
    await base44.entities.Service.update(serviceId, {
        custo_material: custoMaterial,
        custo_mao_obra: custoMaoObra,
        custo_total: custoTotal,
        nivel_max_dependencia: maxNivelDep
    });
};

export default async function ProcessComposition({ limit = 200 }) {
    // 1. Fetch Staging Data (grouped by parent logic)
    // We fetch a larger chunk to ensure we get enough unique parents
    const stagingChunk = await base44.entities.CompositionStaging.list({ 
        sort: { codigo_pai: 1 }, 
        limit: 5000 
    });

    if (!stagingChunk || stagingChunk.length === 0) {
        return { processedParents: 0, remaining: 0, finished: true };
    }

    // 2. Group by Parent
    const rowsByParent = new Map();
    for (const row of stagingChunk) {
        if (!rowsByParent.has(row.codigo_pai)) {
            rowsByParent.set(row.codigo_pai, []);
        }
        rowsByParent.get(row.codigo_pai).push(row);
    }

    let allParents = Array.from(rowsByParent.keys());
    
    // Logic to not break a parent in half if we hit 5000 limit
    let parentsToProcess = allParents;
    if (stagingChunk.length === 5000 && allParents.length > 1) {
        parentsToProcess.pop();
    }
    
    // Apply limit (default 200 parents)
    if (parentsToProcess.length > limit) {
        parentsToProcess = parentsToProcess.slice(0, limit);
    }
    
    // If we only have 1 massive parent, process it
    if (parentsToProcess.length === 0 && allParents.length === 1) {
        parentsToProcess = allParents;
    }

    const parentIdsToRecalculate = new Set();
    const rowsToDelete = [];

    // 3. Process Batch
    for (const parentCode of parentsToProcess) {
        const rows = rowsByParent.get(parentCode);
        rows.forEach(r => rowsToDelete.push(r.id));
        
        // 3.1 Upsert Service (Parent)
        let parentId = null;
        const meta = { d: rows[0].descricao_pai, u: rows[0].unidade_pai };
        
        const existingServices = await base44.entities.Service.filter({ codigo: parentCode });
        if (existingServices.length === 0) {
            const newService = await base44.entities.Service.create({
                codigo: parentCode,
                descricao: meta.d || `[IMPORTADO] Serviço ${parentCode}`,
                unidade: meta.u || 'UN',
                ativo: true
            });
            parentId = newService.id;
        } else {
            const svc = existingServices[0];
            parentId = svc.id;
            if (svc.descricao !== meta.d && meta.d) {
                await base44.entities.Service.update(svc.id, { 
                    descricao: meta.d, 
                    unidade: meta.u || svc.unidade 
                });
            }
        }
        
        parentIdsToRecalculate.add(parentId);

        // 3.2 Process Children (Items)
        for (const row of rows) {
             let childId = null;
             let type = 'SERVICO';
             let category = 'MATERIAL';
             let unitCost = 0;

             // Check Input
             const inputs = await base44.entities.Input.filter({ codigo: row.codigo_item });
             if (inputs.length > 0) {
                 childId = inputs[0].id;
                 type = 'INSUMO';
                 category = detectCategory(inputs[0].unidade);
                 unitCost = inputs[0].valor_unitario;
             } else {
                 // Check Service
                 const services = await base44.entities.Service.filter({ codigo: row.codigo_item });
                 if (services.length > 0) {
                     childId = services[0].id;
                     type = 'SERVICO';
                     category = detectCategory(services[0].unidade);
                     unitCost = services[0].custo_total;
                 } else {
                     // Create placeholder service if not exists? 
                     // Or skip? Usually standard behavior is to create placeholder or fail.
                     // We will create a placeholder to avoid breaking the tree.
                     const placeholder = await base44.entities.Service.create({
                         codigo: row.codigo_item,
                         descricao: `[PENDENTE] Item ${row.codigo_item}`,
                         unidade: 'UN',
                         ativo: true
                     });
                     childId = placeholder.id;
                     type = 'SERVICO';
                     category = 'MATERIAL';
                 }
             }

             // Create Link
             await base44.entities.ServiceItem.create({
                servico_id: parentId,
                tipo_item: type,
                item_id: childId,
                quantidade: row.quantidade,
                categoria: category,
                ordem: 0,
                custo_unitario_snapshot: unitCost,
                custo_total_item: (row.quantidade || 0) * unitCost
             });
        }
    }

    // 4. Cleanup Staging
    // Delete in chunks
    const deleteChunkSize = 500;
    for (let i = 0; i < rowsToDelete.length; i += deleteChunkSize) {
        await base44.entities.CompositionStaging.delete(rowsToDelete.slice(i, i + deleteChunkSize));
    }

    // 5. Recalculate Costs
    for (const pid of parentIdsToRecalculate) {
        await recalculateService(pid);
        // Note: Full recursive updateDependents is heavy. 
        // We do local recalc here. 
        // The user asked for optimization. 
        // Running updateDependents for every parent in a loop might be too much.
        // It's better to process all imports first, then do a global recalc.
        // OR we can trigger it. 
        // Let's rely on local recalc for now as we import bottom-up usually.
    }

    return { 
        processedParents: parentsToProcess.length, 
        rowsProcessed: rowsToDelete.length,
        finished: false 
    };
}