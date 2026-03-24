import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { action, codes, items_info, parentCodes } = await req.json();

        if (action === 'update_service_costs_cascade') {
            // Update all ServiceItems that reference the given service IDs
            const { service_ids } = body;
            
            if (!service_ids || !Array.isArray(service_ids)) {
                return Response.json({ error: 'service_ids required' }, { status: 400 });
            }
            
            let updatedCount = 0;
            
            for (const serviceId of service_ids) {
                // Get the service to get its current cost
                const service = await base44.asServiceRole.entities.Service.filter({ id: serviceId }).then(r => r[0]);
                if (!service) continue;
                
                // Find all ServiceItems that reference this service
                const dependentItems = await base44.asServiceRole.entities.ServiceItem.filter({
                    tipo_item: 'SERVICO',
                    item_id: serviceId
                });
                
                // Update each dependent item's snapshot
                for (const item of dependentItems) {
                    const newTotal = item.quantidade * service.custo_total;
                    await base44.asServiceRole.entities.ServiceItem.update(item.id, {
                        custo_unitario_snapshot: service.custo_total,
                        custo_total_item: newTotal
                    });
                    updatedCount++;
                }
            }
            
            return Response.json({ updated: updatedCount });
        }

        if (action === 'resolve_and_create') {
            const uniqueCodes = [...new Set(codes || [])];
            
            if (uniqueCodes.length === 0) return Response.json({ mapping: {} });

            // 1. Fetch Existing
            const fetchAllMap = async (entity) => {
                const map = new Map();
                let page = 0;
                while(true) {
                    const items = await base44.entities[entity].list('created_date', 1000, page * 1000);
                    if (!items || items.length === 0) break;
                    items.forEach(i => map.set(i.codigo, i));
                    if (items.length < 1000) break;
                    page++;
                }
                return map;
            };

            const [serviceMap, inputMap] = await Promise.all([
                fetchAllMap('Service'),
                fetchAllMap('Input')
            ]);

            const mapping = {};
            const servicesToCreate = [];
            const servicesToUpdate = [];

            // 2. Resolve
            for (const code of uniqueCodes) {
                if (inputMap.has(code)) {
                    // It's an Input
                    const i = inputMap.get(code);
                    mapping[code] = { 
                        id: i.id, 
                        type: 'INSUMO', 
                        unit: i.unidade,
                        cost: i.valor_unitario || 0
                    };
                } else if (serviceMap.has(code)) {
                    // It's a Service - check if needs update
                    const s = serviceMap.get(code);
                    const info = items_info && items_info[code] ? items_info[code] : {};
                    
                    // Update if description or unit changed
                    if (info.description && info.description !== s.descricao) {
                        servicesToUpdate.push({ id: s.id, descricao: info.description });
                    }
                    if (info.unit && info.unit !== s.unidade) {
                        servicesToUpdate.push({ id: s.id, unidade: info.unit });
                    }
                    
                    mapping[code] = { 
                        id: s.id, 
                        type: 'SERVICO', 
                        unit: info.unit || s.unidade,
                        cost: s.custo_total || 0
                    };
                } else {
                    // Missing! Create as Service.
                    const info = items_info && items_info[code] ? items_info[code] : {};
                    
                    servicesToCreate.push({
                        codigo: code,
                        descricao: info.description || `Service ${code} (Auto)`,
                        unidade: info.unit || 'UN',
                        ativo: true,
                        custo_total: 0
                    });
                }
            }

            // 3. Create Missing Services
            const createdServices = [];
            if (servicesToCreate.length > 0) {
                 for (let i=0; i<servicesToCreate.length; i+=1000) {
                     const chunk = servicesToCreate.slice(i, i+1000);
                     const res = await base44.entities.Service.bulkCreate(chunk);
                     if (res) createdServices.push(...res);
                 }
            }

            // 4. Update Existing Services and cascade changes
            const updatedServiceIds = [];
            if (servicesToUpdate.length > 0) {
                // Group updates by id
                const updateMap = new Map();
                servicesToUpdate.forEach(u => {
                    if (!updateMap.has(u.id)) {
                        updateMap.set(u.id, {});
                    }
                    Object.assign(updateMap.get(u.id), u);
                });
                
                for (const [id, data] of updateMap.entries()) {
                    const { id: _, ...updateData } = data;
                    await base44.entities.Service.update(id, updateData);
                    updatedServiceIds.push(id);
                }
                
                // For each updated service, update compositions that use it
                for (const serviceId of updatedServiceIds) {
                    // Find all ServiceItems that reference this service
                    const dependentItems = await base44.asServiceRole.entities.ServiceItem.filter({
                        tipo_item: 'SERVICO',
                        item_id: serviceId
                    });
                    
                    // Get the updated service to get its new cost
                    const updatedService = await base44.asServiceRole.entities.Service.filter({ id: serviceId }).then(r => r[0]);
                    if (!updatedService) continue;
                    
                    // Update each dependent item's snapshot
                    for (const item of dependentItems) {
                        const newTotal = item.quantidade * updatedService.custo_total;
                        await base44.asServiceRole.entities.ServiceItem.update(item.id, {
                            custo_unitario_snapshot: updatedService.custo_total,
                            custo_total_item: newTotal
                        });
                    }
                }
            }

            // 5. Update Mapping
            createdServices.forEach(s => {
                mapping[s.codigo] = { 
                    id: s.id, 
                    type: 'SERVICO', 
                    unit: s.unidade,
                    cost: 0 
                };
            });

            return Response.json({ mapping });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});