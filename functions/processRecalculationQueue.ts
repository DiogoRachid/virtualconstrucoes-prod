import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função auxiliar para adicionar dependentes à fila
const enqueueDependents = async (base44, serviceId) => {
  try {
    const dependentItems = await base44.asServiceRole.entities.ServiceItem.filter({
      tipo_item: 'SERVICO',
      item_id: serviceId
    });

    const parentServiceIds = [...new Set(dependentItems.map(d => d.servico_id))];
    
    if (parentServiceIds.length === 0) return;

    console.log(`📋 Encontrados ${parentServiceIds.length} serviços dependentes`);
    
    // Buscar serviços com suas prioridades
    const parentServices = await Promise.all(
      parentServiceIds.map(id => 
        base44.asServiceRole.entities.Service.filter({ id }).then(arr => arr[0])
      )
    ).then(services => services.filter(Boolean));
    
    // Verificar quais já estão na fila
    const existingQueue = await base44.asServiceRole.entities.RecalculationQueue.list();
    const existingServiceIds = new Set(existingQueue.map(q => q.service_id));
    
    // Adicionar apenas os que NÃO estão na fila
    for (const parentService of parentServices) {
      if (!existingServiceIds.has(parentService.id)) {
        await base44.asServiceRole.entities.RecalculationQueue.create({
          service_id: parentService.id,
          priority: parentService.nivel_max_dependencia || 0,
          status: 'pending',
          retry_count: 0
        });
        console.log(`➕ Enfileirado: ${parentService.id}`);
      }
    }
  } catch (e) {
    console.error('Erro em enqueueDependents:', e.message);
  }
};

// Função de recálculo
const recalculateService = async (base44, serviceId) => {
  const items = await base44.asServiceRole.entities.ServiceItem.filter({ servico_id: serviceId });
  
  if (items.length === 0) {
    await base44.asServiceRole.entities.Service.update(serviceId, {
      custo_material: 0,
      custo_mao_obra: 0,
      custo_total: 0,
      nivel_max_dependencia: 0,
      data_base: null
    });
    return { custo_total: 0, custo_material: 0, custo_mao_obra: 0 };
  }
  
  const insumoIds = [...new Set(items.filter(i => i.tipo_item === 'INSUMO').map(i => i.item_id))];
  const serviceIds = [...new Set(items.filter(i => i.tipo_item === 'SERVICO').map(i => i.item_id))];
  
  // Buscar dados em paralelo
  const [insumos, subServices] = await Promise.all([
    insumoIds.length > 0 
      ? Promise.all(insumoIds.map(id => 
          base44.asServiceRole.entities.Input.filter({ id }).then(arr => arr[0])
        ))
      : Promise.resolve([]),
    serviceIds.length > 0 
      ? Promise.all(serviceIds.map(id => 
          base44.asServiceRole.entities.Service.filter({ id }).then(arr => arr[0])
        ))
      : Promise.resolve([])
  ]);
  
  const insumoMap = new Map(insumos.filter(Boolean).map(i => [i.id, i]));
  const serviceMap = new Map(subServices.filter(Boolean).map(s => [s.id, s]));
  
  let custoMaterial = 0;
  let custoMaoObra = 0;
  let maxNivelDep = 0;
  let dataBaseMaisAntiga = null;
  
  const parseDate = (str) => {
    if (!str) return null;
    const [mes, ano] = str.split('/');
    if (!mes || !ano) return null;
    return new Date(parseInt(ano), parseInt(mes) - 1, 1);
  };
  
  const itemUpdates = [];

  for (const item of items) {
    let unitCost = 0;

    if (item.tipo_item === 'INSUMO') {
      const insumo = insumoMap.get(item.item_id);
      unitCost = insumo?.valor_unitario || 0;
      
      if (insumo?.data_base) {
        const dataItem = parseDate(insumo.data_base);
        if (dataItem && (!dataBaseMaisAntiga || dataItem < dataBaseMaisAntiga)) {
          dataBaseMaisAntiga = dataItem;
        }
      }
      
      if (insumo) {
        const totalItem = item.quantidade * unitCost;
        if (insumo.categoria === 'MAO_OBRA') {
          custoMaoObra += totalItem;
        } else {
          custoMaterial += totalItem;
        }
      }
    } else {
      const subService = serviceMap.get(item.item_id);
      unitCost = subService?.custo_total || 0;
      
      if (subService && subService.nivel_max_dependencia >= maxNivelDep) {
        maxNivelDep = subService.nivel_max_dependencia + 1;
      }
      
      const totalItem = item.quantidade * unitCost;
      if (subService && subService.custo_total > 0) {
        const matRatio = subService.custo_material / subService.custo_total;
        const laborRatio = subService.custo_mao_obra / subService.custo_total;
        custoMaterial += totalItem * matRatio;
        custoMaoObra += totalItem * laborRatio;
      }
    }

    const totalItem = item.quantidade * unitCost;
    itemUpdates.push({
      id: item.id,
      data: {
        custo_unitario_snapshot: unitCost,
        custo_total_item: totalItem
      }
    });
  }
  
  // Atualizar itens em lote
  for (let i = 0; i < itemUpdates.length; i += 20) {
    const batch = itemUpdates.slice(i, i + 20);
    await Promise.all(
      batch.map(update => 
        base44.asServiceRole.entities.ServiceItem.update(update.id, update.data)
          .catch(() => {})
      )
    );
  }

  const custoTotal = custoMaterial + custoMaoObra;

  let dataBaseStr = null;
  if (dataBaseMaisAntiga) {
    const mes = String(dataBaseMaisAntiga.getMonth() + 1).padStart(2, '0');
    const ano = dataBaseMaisAntiga.getFullYear();
    dataBaseStr = `${mes}/${ano}`;
  }

  await base44.asServiceRole.entities.Service.update(serviceId, {
    custo_material: custoMaterial,
    custo_mao_obra: custoMaoObra,
    custo_total: custoTotal,
    nivel_max_dependencia: maxNivelDep,
    data_base: dataBaseStr
  });

  console.log(`✅ ${serviceId}: R$ ${custoTotal.toFixed(2)}`);
  return { custo_total: custoTotal, custo_material: custoMaterial, custo_mao_obra: custoMaoObra };
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const queueItems = await base44.asServiceRole.entities.RecalculationQueue.filter({
      status: 'pending'
    });

    if (queueItems.length === 0) {
      return Response.json({ message: 'Fila vazia', processed: 0, failed: 0 });
    }

    // Ordenar por prioridade (menor = folha da árvore = processar primeiro)
    queueItems.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const batch = queueItems.slice(0, 10);

    console.log(`🔄 Processando ${batch.length} de ${queueItems.length}`);

    let processed = 0;
    let failed = 0;

    for (const item of batch) {
      try {
        console.log(`⚙️ ${item.service_id} (p:${item.priority})`);
        
        await base44.asServiceRole.entities.RecalculationQueue.update(item.id, {
          status: 'processing'
        });

        await recalculateService(base44, item.service_id);
        await enqueueDependents(base44, item.service_id);
        await base44.asServiceRole.entities.RecalculationQueue.delete(item.id);
        
        processed++;

      } catch (error) {
        console.error(`❌ ${item.service_id}: ${error.message}`);
        
        const newRetryCount = (item.retry_count || 0) + 1;
        
        if (newRetryCount >= 3) {
          await base44.asServiceRole.entities.RecalculationQueue.update(item.id, {
            status: 'failed',
            retry_count: newRetryCount,
            error_message: error.message
          });
        } else {
          await base44.asServiceRole.entities.RecalculationQueue.update(item.id, {
            status: 'pending',
            retry_count: newRetryCount,
            error_message: null
          });
        }
        failed++;
      }
    }

    console.log(`🏁 ${processed} OK, ${failed} falhou`);

    return Response.json({
      success: true,
      processed,
      failed,
      remaining: queueItems.length - batch.length
    });

  } catch (error) {
    console.error('❌ Erro crítico:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});