import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { action, codes, parentCodes } = await req.json();

        // Helper to fetch in chunks if needed, but for "resolve" we try to optimize
        // Since we can't do massive "IN" queries efficiently if limit is small, we assume we might need multiple queries
        // or we rely on the fact that we can list and filter in memory if the dataset isn't huge.
        // But 55k lines implies potentially 10k+ unique codes.
        
        if (action === 'resolve_and_create') {
            const uniqueCodes = [...new Set(codes || [])];
            const uniqueParents = new Set(parentCodes || []);
            
            if (uniqueCodes.length === 0) return Response.json({ mapping: {} });

            // 1. Fetch Existing (Optimized: fetch ALL codes only if we could, but better to query by chunks if SDK allows)
            // Limitations: SDK .filter with huge array might break. 
            // Strategy: We will try to fetch ALL Services and ALL Inputs (lightweight, only code & id) 
            // because filtering 10k items by code list is hard. 
            // Fetches 1000 at a time.
            
            const fetchAllMap = async (entity) => {
                const map = new Map();
                let page = 0;
                while(true) {
                    // Fetching only needed fields would be great but SDK might return all. 
                    // We rely on list speed.
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
            const inputsToCreate = [];
            const servicesToCreate = [];

            // 2. Resolve
            for (const code of uniqueCodes) {
                if (inputMap.has(code)) {
                    mapping[code] = { id: inputMap.get(code).id, type: 'INSUMO', unit: inputMap.get(code).unidade };
                } else if (serviceMap.has(code)) {
                    mapping[code] = { id: serviceMap.get(code).id, type: 'SERVICO', unit: serviceMap.get(code).unidade };
                } else {
                    // Missing!
                    // If it's in parentCodes list, it MUST be a Service.
                    // If not, we assume Input (Material) by default for safety, or we could leave it blank?
                    // The prompt says "services without items", implying missing children.
                    // Usually children are inputs unless defined as services.
                    
                    if (uniqueParents.has(code)) {
                        servicesToCreate.push({
                            codigo: code,
                            descricao: `Service ${code} (Auto)`,
                            unidade: 'UN',
                            ativo: true
                        });
                    } else {
                        inputsToCreate.push({
                            codigo: code,
                            descricao: `Input ${code} (Auto)`,
                            unidade: 'UN',
                            valor_unitario: 0,
                            categoria: 'MATERIAL',
                            fonte: 'IMPORT'
                        });
                    }
                }
            }

            // 3. Create Missing
            const createdInputs = [];
            if (inputsToCreate.length > 0) {
                 // Batch create inputs
                 for (let i=0; i<inputsToCreate.length; i+=1000) {
                     const chunk = inputsToCreate.slice(i, i+1000);
                     const res = await base44.entities.Input.bulkCreate(chunk);
                     if (res) createdInputs.push(...res);
                 }
            }

            const createdServices = [];
            if (servicesToCreate.length > 0) {
                 for (let i=0; i<servicesToCreate.length; i+=1000) {
                     const chunk = servicesToCreate.slice(i, i+1000);
                     const res = await base44.entities.Service.bulkCreate(chunk);
                     if (res) createdServices.push(...res);
                 }
            }

            // 4. Update Mapping
            createdInputs.forEach(i => {
                mapping[i.codigo] = { id: i.id, type: 'INSUMO', unit: i.unidade };
            });
            createdServices.forEach(s => {
                mapping[s.codigo] = { id: s.id, type: 'SERVICO', unit: s.unidade };
            });

            return Response.json({ mapping });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});