import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { action, codes, items_info } = await req.json();

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

            // 2. Resolve
            for (const code of uniqueCodes) {
                if (inputMap.has(code)) {
                    const i = inputMap.get(code);
                    mapping[code] = { 
                        id: i.id, 
                        type: 'INSUMO', 
                        unit: i.unidade,
                        cost: i.valor_unitario || 0
                    };
                } else if (serviceMap.has(code)) {
                    const s = serviceMap.get(code);
                    mapping[code] = { 
                        id: s.id, 
                        type: 'SERVICO', 
                        unit: s.unidade,
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
                        custo_total: 0 // New service starts with 0
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

            // 4. Update Mapping for created services
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