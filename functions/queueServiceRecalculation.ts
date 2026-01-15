import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { itemType, itemId } = await req.json();

    if (!itemType || !itemId) {
      return Response.json({ error: 'itemType e itemId são obrigatórios' }, { status: 400 });
    }

    // Buscar todos os ServiceItems que usam este item
    const dependentItems = await base44.asServiceRole.entities.ServiceItem.filter({
      tipo_item: itemType,
      item_id: itemId
    });

    // IDs únicos dos serviços pais
    const parentServiceIds = [...new Set(dependentItems.map(d => d.servico_id))];

    // Função recursiva para buscar dependentes indiretos
    const findAllDependents = async (serviceId, visited = new Set()) => {
      if (visited.has(serviceId)) return visited;
      visited.add(serviceId);

      const items = await base44.asServiceRole.entities.ServiceItem.filter({
        tipo_item: 'SERVICO',
        item_id: serviceId
      });

      for (const item of items) {
        await findAllDependents(item.servico_id, visited);
      }

      return visited;
    };

    // Coletar todos os serviços afetados (diretos e indiretos)
    const allAffectedServices = new Set();
    for (const serviceId of parentServiceIds) {
      const deps = await findAllDependents(serviceId);
      deps.forEach(id => allAffectedServices.add(id));
    }

    // Adicionar à fila (evitar duplicatas)
    const addedCount = { count: 0 };
    for (const serviceId of allAffectedServices) {
      // Verificar se já existe na fila com status pending
      const existing = await base44.asServiceRole.entities.RecalculationQueue.filter({
        service_id: serviceId,
        status: 'pending'
      });

      if (existing.length === 0) {
        await base44.asServiceRole.entities.RecalculationQueue.create({
          service_id: serviceId,
          priority: 0,
          status: 'pending'
        });
        addedCount.count++;
      }
    }

    return Response.json({
      success: true,
      affected_services: allAffectedServices.size,
      queued: addedCount.count
    });

  } catch (error) {
    console.error('Erro ao enfileirar recálculo:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});