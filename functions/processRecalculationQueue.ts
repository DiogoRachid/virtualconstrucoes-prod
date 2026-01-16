import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    console.log('=== INICIANDO PROCESSAMENTO ===');
    
    // 1. Buscar TODOS os itens pendentes
    const allQueueItems = await base44.asServiceRole.entities.RecalculationQueue.list();
    const pendingItems = allQueueItems.filter(item => item.status === 'pending');
    
    console.log(`Total na fila: ${allQueueItems.length}`);
    console.log(`Pendentes: ${pendingItems.length}`);
    
    if (pendingItems.length === 0) {
      return Response.json({ 
        success: true,
        message: 'Nenhum item pendente', 
        processed: 0, 
        failed: 0 
      });
    }

    // 2. Ordenar por prioridade e processar em lote
    pendingItems.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const batch = pendingItems.slice(0, 10);
    
    console.log(`Processando lote de ${batch.length} itens`);

    let processed = 0;
    let failed = 0;

    // 3. Processar cada item
    for (const queueItem of batch) {
      try {
        console.log(`\n--- Processando serviço: ${queueItem.service_id} ---`);
        
        // Marcar como processando
        await base44.asServiceRole.entities.RecalculationQueue.update(queueItem.id, {
          status: 'processing'
        });

        // Buscar o serviço
        const serviceList = await base44.asServiceRole.entities.Service.list();
        const service = serviceList.find(s => s.id === queueItem.service_id);
        
        if (!service) {
          throw new Error(`Serviço ${queueItem.service_id} não encontrado`);
        }

        // Buscar itens do serviço
        const allServiceItems = await base44.asServiceRole.entities.ServiceItem.list();
        const serviceItems = allServiceItems.filter(item => item.servico_id === queueItem.service_id);
        
        console.log(`Serviço tem ${serviceItems.length} itens`);

        // Buscar todos os insumos e serviços necessários
        const allInputs = await base44.asServiceRole.entities.Input.list();
        const allServices = await base44.asServiceRole.entities.Service.list();
        
        const inputMap = new Map(allInputs.map(i => [i.id, i]));
        const serviceMap = new Map(allServices.map(s => [s.id, s]));

        // Calcular custos
        let custoMaterial = 0;
        let custoMaoObra = 0;
        let maxNivelDep = 0;
        let dataBaseMaisAntiga = null;

        const parseDate = (str) => {
          if (!str) return null;
          const parts = str.split('/');
          if (parts.length !== 2) return null;
          return new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1);
        };

        // Processar cada item
        for (const item of serviceItems) {
          let unitCost = 0;

          if (item.tipo_item === 'INSUMO') {
            const insumo = inputMap.get(item.item_id);
            
            if (insumo) {
              unitCost = insumo.valor_unitario || 0;
              const totalItem = item.quantidade * unitCost;

              // Categoria do insumo
              if (insumo.categoria === 'MAO_OBRA') {
                custoMaoObra += totalItem;
              } else {
                custoMaterial += totalItem;
              }

              // Data base
              if (insumo.data_base) {
                const dataItem = parseDate(insumo.data_base);
                if (dataItem && (!dataBaseMaisAntiga || dataItem < dataBaseMaisAntiga)) {
                  dataBaseMaisAntiga = dataItem;
                }
              }
            }
          } else if (item.tipo_item === 'SERVICO') {
            const subService = serviceMap.get(item.item_id);
            
            if (subService) {
              unitCost = subService.custo_total || 0;
              const totalItem = item.quantidade * unitCost;

              // Proporcional
              if (subService.custo_total > 0) {
                const matRatio = (subService.custo_material || 0) / subService.custo_total;
                const laborRatio = (subService.custo_mao_obra || 0) / subService.custo_total;
                custoMaterial += totalItem * matRatio;
                custoMaoObra += totalItem * laborRatio;
              }

              // Nível de dependência
              const depLevel = subService.nivel_max_dependencia || 0;
              if (depLevel >= maxNivelDep) {
                maxNivelDep = depLevel + 1;
              }
            }
          }

          // Atualizar snapshot do item
          try {
            const totalItem = item.quantidade * unitCost;
            await base44.asServiceRole.entities.ServiceItem.update(item.id, {
              custo_unitario_snapshot: unitCost,
              custo_total_item: totalItem
            });
          } catch (e) {
            console.warn(`Erro ao atualizar item ${item.id}: ${e.message}`);
          }
        }

        const custoTotal = custoMaterial + custoMaoObra;

        // Formatar data base
        let dataBaseStr = null;
        if (dataBaseMaisAntiga) {
          const mes = String(dataBaseMaisAntiga.getMonth() + 1).padStart(2, '0');
          const ano = dataBaseMaisAntiga.getFullYear();
          dataBaseStr = `${mes}/${ano}`;
        }

        // Atualizar serviço
        await base44.asServiceRole.entities.Service.update(queueItem.service_id, {
          custo_material: custoMaterial,
          custo_mao_obra: custoMaoObra,
          custo_total: custoTotal,
          nivel_max_dependencia: maxNivelDep,
          data_base: dataBaseStr
        });

        console.log(`✅ Recalculado: Total=R$${custoTotal.toFixed(2)}, Mat=R$${custoMaterial.toFixed(2)}, MO=R$${custoMaoObra.toFixed(2)}`);

        // Enfileirar dependentes
        const dependentItems = allServiceItems.filter(si => 
          si.tipo_item === 'SERVICO' && si.item_id === queueItem.service_id
        );
        const parentServiceIds = [...new Set(dependentItems.map(di => di.servico_id))];
        
        if (parentServiceIds.length > 0) {
          console.log(`Enfileirando ${parentServiceIds.length} dependentes`);
          const existingQueueIds = new Set(allQueueItems.map(q => q.service_id));
          
          for (const parentId of parentServiceIds) {
            if (!existingQueueIds.has(parentId)) {
              const parentService = serviceMap.get(parentId);
              try {
                await base44.asServiceRole.entities.RecalculationQueue.create({
                  service_id: parentId,
                  priority: (parentService?.nivel_max_dependencia || 0),
                  status: 'pending',
                  retry_count: 0
                });
                console.log(`  ➕ Adicionado: ${parentId}`);
              } catch (e) {
                // Já existe, ignorar
              }
            }
          }
        }

        // Remover da fila
        await base44.asServiceRole.entities.RecalculationQueue.delete(queueItem.id);
        processed++;
        
      } catch (error) {
        console.error(`❌ ERRO: ${error.message}`);
        console.error(error.stack);
        
        const newRetryCount = (queueItem.retry_count || 0) + 1;
        
        if (newRetryCount >= 3) {
          await base44.asServiceRole.entities.RecalculationQueue.update(queueItem.id, {
            status: 'failed',
            retry_count: newRetryCount,
            error_message: error.message
          });
          console.log(`💀 Falhou após 3 tentativas`);
        } else {
          await base44.asServiceRole.entities.RecalculationQueue.update(queueItem.id, {
            status: 'pending',
            retry_count: newRetryCount,
            error_message: error.message
          });
          console.log(`🔄 Reenfileirado (tentativa ${newRetryCount})`);
        }
        
        failed++;
      }
    }

    console.log(`\n=== FINALIZADO: ${processed} OK, ${failed} FALHOU ===\n`);

    return Response.json({
      success: true,
      processed,
      failed,
      remaining: pendingItems.length - batch.length
    });

  } catch (error) {
    console.error('❌❌❌ ERRO CRÍTICO:', error.message);
    console.error(error.stack);
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});