import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { workId, workName, abcFilter } = await req.json();

    // Buscar projeto por ID ou Nome
    let project;
    if (workId) {
      project = await base44.asServiceRole.entities.Project.filter({ id: workId }).then(r => r[0]);
    } else if (workName) {
      project = await base44.asServiceRole.entities.Project.filter({ nome: workName }).then(r => r[0]);
    }
    if (!project) {
      return Response.json({ 
        success: false, 
        error: 'Obra não encontrada' 
      }, { status: 400 });
    }

    // Buscar cronograma (ProjectStage) para calcular meses
    const projectStages = await base44.asServiceRole.entities.ProjectStage.filter({ orcamento_id: budgets[0]?.id });
    let months = budgets[0]?.duracao_meses || 12;

    if (projectStages.length > 0) {
      const maxMesFim = Math.max(...projectStages.map(s => s.mes_fim || 0));
      months = maxMesFim > 0 ? maxMesFim : months;
    }

    // Buscar orçamentos da obra
    const budgets = await base44.asServiceRole.entities.Budget.filter({ obra_id: workId });
    if (!budgets.length) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum orçamento encontrado' 
      }, { status: 400 });
    }

    // Buscar todos os BudgetItems
    const allBudgetItems = [];
    for (const budget of budgets) {
      const items = await base44.asServiceRole.entities.BudgetItem.filter({ orcamento_id: budget.id });
      allBudgetItems.push(...items);
    }

    if (!allBudgetItems.length) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum item de orçamento encontrado' 
      }, { status: 400 });
    }

    // Buscar todos os ServiceItems para decompor os serviços em insumos
    const allServiceItems = await base44.asServiceRole.entities.ServiceItem.list();
    const serviceItemMap = new Map();
    for (const si of allServiceItems) {
      const key = si.servico_id;
      if (!serviceItemMap.has(key)) {
        serviceItemMap.set(key, []);
      }
      serviceItemMap.get(key).push(si);
    }

    // Buscar distribuição mensal dos serviços a partir das medições
    const measurementItems = [];
    for (const measurement of measurements) {
      const items = await base44.asServiceRole.entities.MeasurementItem.filter({ medicao_id: measurement.id });
      measurementItems.push(...items.map(item => ({
        ...item,
        mes: parseInt(measurement.periodo_referencia.split('/')[0])
      })));
    }

    const distributionMap = new Map();
    for (const item of measurementItems) {
      const key = `${item.servico_id}_${item.mes}`;
      const existing = distributionMap.get(key) || { quantidade_total: 0, percentual: 0 };
      existing.quantidade_total += item.quantidade_executada_periodo || 0;
      distributionMap.set(key, existing);
    }

    // Calcular percentuais baseado na quantidade planejada
    const servicoQtdMap = new Map();
    for (const budgetItem of allBudgetItems) {
      const key = budgetItem.servico_id;
      servicoQtdMap.set(key, (servicoQtdMap.get(key) || 0) + budgetItem.quantidade);
    }

    for (const [key, dist] of distributionMap) {
      const servico_id = key.split('_')[0];
      const qtdPlanejada = servicoQtdMap.get(servico_id) || 1;
      dist.percentual = (dist.quantidade_total / qtdPlanejada) * 100;
    }

    // Buscar insumos para obter dados completos
    const allInputs = await base44.asServiceRole.entities.Input.list();
    const inputMap = new Map();
    for (const input of allInputs) {
      inputMap.set(input.id, input);
    }

    // Log para debugging
    console.log(`[DEBUG] Obra: ${workId}, Meses: ${months}`);
    console.log(`[DEBUG] Medições: ${measurements.length}, Orçamentos: ${budgets.length}, BudgetItems: ${allBudgetItems.length}`);
    console.log(`[DEBUG] ServiceItems totais: ${allServiceItems.length}, Insumos: ${allInputs.length}`);
    console.log(`[DEBUG] MeasurementItems: ${measurementItems.length}, DistributionMap: ${distributionMap.size}`);

    // Compilar lista de compras por período
    const periodosMap = new Map(); // mes -> { insumos_map, valor_total }
    const totalQuantidadesPorInsumo = new Map(); // insumo_id -> total_quantidade

    // Para cada BudgetItem (serviço do orçamento)
    for (const budgetItem of allBudgetItems) {
     // Buscar ServiceItems deste serviço
     const serviceItems = serviceItemMap.get(budgetItem.servico_id) || [];

     if (serviceItems.length === 0) {
       console.log(`[DEBUG] BudgetItem ${budgetItem.id} (serviço: ${budgetItem.servico_id}) não tem ServiceItems`);
       continue;
     }

      // Para cada insumo que compõe este serviço
      for (const serviceItem of serviceItems) {
        // Se for INSUMO
        if (serviceItem.tipo_item === 'INSUMO' && serviceItem.item_id) {
          const insumoId = serviceItem.item_id;
          const insumo = inputMap.get(insumoId);

          if (!insumo) {
            console.log(`[DEBUG] Insumo ${insumoId} não encontrado no mapa`);
            continue;
          }

          // Quantidade total de insumo necessária = quantidade_serviço * quantidade_insumo_por_serviço
          const quantidadeTotalInsumo = budgetItem.quantidade * serviceItem.quantidade;
          console.log(`[DEBUG] BudgetItem qty=${budgetItem.quantidade}, ServiceItem qty=${serviceItem.quantidade}, Total=${quantidadeTotalInsumo}`);

          // Buscar distribuição mensal para este serviço
          const distribuicoesServico = [];
          for (let mes = 1; mes <= months; mes++) {
            const distKey = `${budgetItem.servico_id}_${mes}`;
            const distribution = distributionMap.get(distKey);
            if (distribution) {
              distribuicoesServico.push({ mes, percentual: distribution.percentual || 0 });
            }
          }

          // Se não há distribuição mensal, distribuir igualmente pelos meses
          if (distribuicoesServico.length === 0) {
            const quantidadePorMes = quantidadeTotalInsumo / months;
            for (let mes = 1; mes <= months; mes++) {
              distribuicoesServico.push({ mes, percentual: 100 / months });
            }
          }

          // Aplicar distribuição
          for (const dist of distribuicoesServico) {
            const quantidadeNecessaria = (quantidadeTotalInsumo * dist.percentual) / 100;

            if (quantidadeNecessaria > 0) {
              // Garantir que o mês existe
              if (!periodosMap.has(dist.mes)) {
                periodosMap.set(dist.mes, { insumos: new Map(), valor_total: 0 });
              }

              const periodData = periodosMap.get(dist.mes);

              if (!periodData.insumos.has(insumoId)) {
                periodData.insumos.set(insumoId, {
                  insumo_id: insumoId,
                  codigo: insumo.codigo,
                  descricao: insumo.descricao,
                  unidade: insumo.unidade,
                  quantidade: 0,
                  valor_unitario: insumo.valor_unitario || 0,
                  abc_class: 'C'
                });
              }

              const entrada = periodData.insumos.get(insumoId);
              entrada.quantidade += quantidadeNecessaria;
              periodData.valor_total += quantidadeNecessaria * entrada.valor_unitario;

              // Acumular para classificação ABC
              const totalAtual = totalQuantidadesPorInsumo.get(insumoId) || 0;
              totalQuantidadesPorInsumo.set(insumoId, totalAtual + quantidadeNecessaria);
            }
          }
        }
      }
    }

    // Calcular curva ABC baseado nas quantidades totais
    const abcMap = new Map();
    const quantidadesArray = Array.from(totalQuantidadesPorInsumo.entries())
      .map(([id, qty]) => ({ id, qty }))
      .sort((a, b) => b.qty - a.qty);

    const totalQtd = quantidadesArray.reduce((sum, item) => sum + item.qty, 0);
    let acumulado = 0;

    for (const item of quantidadesArray) {
      acumulado += item.qty;
      const percentual = (acumulado / totalQtd) * 100;

      if (percentual <= 80) {
        abcMap.set(item.id, 'A');
      } else if (percentual <= 95) {
        abcMap.set(item.id, 'B');
      } else {
        abcMap.set(item.id, 'C');
      }
    }

    // Aplicar classificação ABC aos períodos
    const periodosFormatados = [];
    for (let mes = 1; mes <= months; mes++) {
      const periodData = periodosMap.get(mes);
      
      let itens = [];
      let totalValor = 0;

      if (periodData) {
        itens = Array.from(periodData.insumos.values())
          .map(item => ({
            ...item,
            abc_class: abcMap.get(item.insumo_id) || 'C'
          }))
          .filter(item => !abcFilter || item.abc_class === abcFilter)
          .sort((a, b) => {
            const abcOrder = { 'A': 1, 'B': 2, 'C': 3 };
            return abcOrder[a.abc_class] - abcOrder[b.abc_class];
          });

        totalValor = itens.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0);
      }

      periodosFormatados.push({
        mes: mes,
        periodo: `Mês ${mes}`,
        itens: itens,
        total_itens: itens.length,
        total_valor: totalValor
      });
    }

    // Calcular totais gerais
    const totalGeralItens = periodosFormatados.reduce((sum, p) => sum + p.total_itens, 0);
    const totalGeralValor = periodosFormatados.reduce((sum, p) => sum + p.total_valor, 0);

    return Response.json({ 
      success: true,
      data: {
        obra_id: workId,
        total_meses: months,
        data_geracao: new Date().toISOString().split('T')[0],
        periodos: periodosFormatados,
        total_geral_itens: totalGeralItens,
        total_geral_valor: totalGeralValor
      }
    });

  } catch (error) {
    console.error('Erro ao gerar lista de compras:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});