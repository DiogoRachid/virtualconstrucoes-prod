import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função de recálculo (copiada do CompositionEngine)
const recalculateService = async (base44, serviceId) => {
  const items = await base44.asServiceRole.entities.ServiceItem.filter({ servico_id: serviceId });
  
  let custoMaterial = 0;
  let custoMaoObra = 0;
  let maxNivelDep = 0;

  for (const item of items) {
    let unitCost = 0;

    if (item.tipo_item === 'INSUMO') {
      const insumo = await base44.asServiceRole.entities.Input.filter({ id: item.item_id }).then(r => r[0]);
      unitCost = insumo ? insumo.valor_unitario : 0;
    } else {
      const subService = await base44.asServiceRole.entities.Service.filter({ id: item.item_id }).then(r => r[0]);
      unitCost = subService ? subService.custo_total : 0;
      if (subService && subService.nivel_max_dependencia >= maxNivelDep) {
        maxNivelDep = subService.nivel_max_dependencia + 1;
      }
    }

    const totalItem = item.quantidade * unitCost;

    try {
      await base44.asServiceRole.entities.ServiceItem.update(item.id, {
        custo_unitario_snapshot: unitCost,
        custo_total_item: totalItem
      });
    } catch (e) {
      console.warn('Falha ao atualizar item de serviço', item.id, e);
    }

    if (item.tipo_item === 'SERVICO') {
      const subService = await base44.asServiceRole.entities.Service.filter({ id: item.item_id }).then(r => r[0]);
      if (subService) {
        const matRatio = subService.custo_total ? (subService.custo_material / subService.custo_total) : 0;
        const laborRatio = subService.custo_total ? (subService.custo_mao_obra / subService.custo_total) : 0;

        custoMaterial += totalItem * matRatio;
        custoMaoObra += totalItem * laborRatio;
      } else {
        if (item.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
        else custoMaterial += totalItem;
      }
    } else {
      const insumo = await base44.asServiceRole.entities.Input.filter({ id: item.item_id }).then(r => r[0]);
      if (insumo) {
        if (insumo.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
        else custoMaterial += totalItem;
      } else {
        if (item.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
        else custoMaterial += totalItem;
      }
    }
  }

  const custoTotal = custoMaterial + custoMaoObra;

  // Calcular data_base
  let dataBaseMaisAntiga = null;
  const parseDate = (str) => {
    if (!str) return null;
    const [mes, ano] = str.split('/');
    if (!mes || !ano) return null;
    return new Date(parseInt(ano), parseInt(mes) - 1, 1);
  };

  for (const item of items) {
    if (item.tipo_item === 'INSUMO') {
      const insumo = await base44.asServiceRole.entities.Input.filter({ id: item.item_id }).then(r => r[0]);
      if (insumo?.data_base) {
        const dataItem = parseDate(insumo.data_base);
        if (dataItem && (!dataBaseMaisAntiga || dataItem < dataBaseMaisAntiga)) {
          dataBaseMaisAntiga = dataItem;
        }
      }
    }
  }

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
      return Response.json({ message: 'Nenhum item na fila', processed: 0 });
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
            error_message: error.message
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
      failed,
      remaining: queueItems.length - batch.length
    });

  } catch (error) {
    console.error('Erro ao processar fila:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});