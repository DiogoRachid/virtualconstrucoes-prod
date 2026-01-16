import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função de recálculo otimizada
const recalculateService = async (base44, serviceId) => {
  const items = await base44.asServiceRole.entities.ServiceItem.filter({ servico_id: serviceId });
  
  if (items.length === 0) {
    return { custo_total: 0, custo_material: 0, custo_mao_obra: 0 };
  }
  
  // Buscar todos os IDs únicos necessários
  const insumoIds = [...new Set(items.filter(i => i.tipo_item === 'INSUMO').map(i => i.item_id))];
  const serviceIds = [...new Set(items.filter(i => i.tipo_item === 'SERVICO').map(i => i.item_id))];
  
  // Buscar todos os dados necessários em paralelo
  const [allInsumos, allSubServices] = await Promise.all([
    insumoIds.length > 0 
      ? base44.asServiceRole.entities.Input.list() 
      : Promise.resolve([]),
    serviceIds.length > 0 
      ? base44.asServiceRole.entities.Service.list() 
      : Promise.resolve([])
  ]);
  
  // Criar Maps para lookup rápido
  const insumoMap = new Map(allInsumos.map(i => [i.id, i]));
  const serviceMap = new Map(allSubServices.map(s => [s.id, s]));
  
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
  
  // Preparar atualizações de ServiceItems
  const itemUpdates = [];

  for (const item of items) {
    let unitCost = 0;

    if (item.tipo_item === 'INSUMO') {
      const insumo = insumoMap.get(item.item_id);
      unitCost = insumo ? insumo.valor_unitario : 0;
      
      // Calcular data_base
      if (insumo?.data_base) {
        const dataItem = parseDate(insumo.data_base);
        if (dataItem && (!dataBaseMaisAntiga || dataItem < dataBaseMaisAntiga)) {
          dataBaseMaisAntiga = dataItem;
        }
      }
      
      // Calcular custos
      if (insumo) {
        const totalItem = item.quantidade * unitCost;
        if (insumo.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
        else custoMaterial += totalItem;
      }
    } else {
      const subService = serviceMap.get(item.item_id);
      unitCost = subService ? subService.custo_total : 0;
      
      if (subService && subService.nivel_max_dependencia >= maxNivelDep) {
        maxNivelDep = subService.nivel_max_dependencia + 1;
      }
      
      // Calcular custos
      const totalItem = item.quantidade * unitCost;
      if (subService) {
        const matRatio = subService.custo_total ? (subService.custo_material / subService.custo_total) : 0;
        const laborRatio = subService.custo_total ? (subService.custo_mao_obra / subService.custo_total) : 0;
        custoMaterial += totalItem * matRatio;
        custoMaoObra += totalItem * laborRatio;
      } else {
        if (item.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
        else custoMaterial += totalItem;
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
  
  // Atualizar todos os ServiceItems em paralelo (lotes de 10)
  const batchSize = 10;
  for (let i = 0; i < itemUpdates.length; i += batchSize) {
    const batch = itemUpdates.slice(i, i + batchSize);
    await Promise.all(
      batch.map(update => 
        base44.asServiceRole.entities.ServiceItem.update(update.id, update.data)
          .catch(e => console.warn('Falha ao atualizar item', update.id, e))
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

  return { custo_total: custoTotal, custo_material: custoMaterial, custo_mao_obra: custoMaoObra };
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar itens pendentes da fila (ordenados por prioridade)
    const queueItems = await base44.asServiceRole.entities.RecalculationQueue.filter({
      status: 'pending'
    });

    if (queueItems.length === 0) {
      return Response.json({ message: 'Nenhum item na fila', processed: 0, failed: 0 });
    }

    // Ordenar por prioridade e pegar até 5 itens
    queueItems.sort((a, b) => a.priority - b.priority);
    const batch = queueItems.slice(0, 5);

    let processed = 0;
    let failed = 0;

    for (const item of batch) {
      try {
        // Marcar como processando
        await base44.asServiceRole.entities.RecalculationQueue.update(item.id, {
          status: 'processing'
        });

        // Recalcular o serviço
        await recalculateService(base44, item.service_id);

        // Marcar como concluído e deletar da fila
        await base44.asServiceRole.entities.RecalculationQueue.delete(item.id);
        processed++;

      } catch (error) {
        console.error(`Erro ao processar serviço ${item.service_id}:`, error);
        
        // Incrementar retry_count
        const newRetryCount = (item.retry_count || 0) + 1;
        
        if (newRetryCount >= 3) {
          // Marcar como falhou após 3 tentativas
          await base44.asServiceRole.entities.RecalculationQueue.update(item.id, {
            status: 'failed',
            retry_count: newRetryCount,
            error_message: error.message
          });
        } else {
          // Voltar para pending para tentar novamente
          await base44.asServiceRole.entities.RecalculationQueue.update(item.id, {
            status: 'pending',
            retry_count: newRetryCount,
            error_message: null
          });
        }
        failed++;
      }

      // Aguardar 1 segundo entre cada recálculo
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return Response.json({
      success: true,
      processed,
      failed
    });

  } catch (error) {
    console.error('Erro ao processar fila:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});