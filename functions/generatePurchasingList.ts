import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { workId, workName, abcFilter } = await req.json();

    console.log('[INFO] Iniciando geração de lista de compras', { workId, workName, abcFilter });

    // Buscar projeto por ID ou Nome
    let project;
    try {
      if (workId) {
        const projects = await base44.asServiceRole.entities.Project.filter({ id: workId });
        project = projects[0];
      } else if (workName) {
        const projects = await base44.asServiceRole.entities.Project.filter({ nome: workName });
        project = projects[0];
      }
    } catch (error) {
      console.error('[ERROR] Erro ao buscar projeto:', error);
      return Response.json({ 
        success: false, 
        error: `Erro ao buscar projeto: ${error.message}` 
      }, { status: 500 });
    }

    if (!project) {
      console.error('[ERROR] Projeto não encontrado');
      return Response.json({ 
        success: false, 
        error: 'Obra não encontrada' 
      }, { status: 404 });
    }

    console.log('[INFO] Projeto encontrado:', project.nome);

    // Buscar orçamentos da obra
    const budgets = await base44.asServiceRole.entities.Budget.filter({ obra_id: project.id });
    console.log(`[INFO] Encontrados ${budgets.length} orçamentos`);
    
    if (!budgets.length) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum orçamento encontrado para esta obra' 
      }, { status: 404 });
    }

    // Buscar cronograma (ProjectStage) para calcular meses
    const projectStages = await base44.asServiceRole.entities.ProjectStage.filter({ orcamento_id: budgets[0]?.id });
    let months = budgets[0]?.duracao_meses || 12;

    if (projectStages.length > 0) {
      const maxMesFim = Math.max(...projectStages.map(s => s.mes_fim || 0));
      months = maxMesFim > 0 ? maxMesFim : months;
    }

    // Buscar todos os BudgetItems
    const allBudgetItems = [];
    for (const budget of budgets) {
      const items = await base44.asServiceRole.entities.BudgetItem.filter({ orcamento_id: budget.id });
      allBudgetItems.push(...items);
    }

    console.log(`[INFO] Total de itens de orçamento: ${allBudgetItems.length}`);

    if (!allBudgetItems.length) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum serviço encontrado no orçamento. Adicione serviços ao orçamento primeiro.' 
      }, { status: 404 });
    }

    // Buscar todos os ServiceItems para decompor os serviços em insumos
    let allServiceItems = [];
    try {
      allServiceItems = await base44.asServiceRole.entities.ServiceItem.list();
      console.log(`[INFO] Encontrados ${allServiceItems.length} ServiceItems`);
    } catch (error) {
      console.error('[ERROR] Erro ao buscar ServiceItems:', error);
      return Response.json({ 
        success: false, 
        error: `Erro ao buscar insumos dos serviços: ${error.message}` 
      }, { status: 500 });
    }
    
    const serviceItemMap = new Map();
    for (const si of allServiceItems) {
      const key = si.servico_id;
      if (!serviceItemMap.has(key)) {
        serviceItemMap.set(key, []);
      }
      serviceItemMap.get(key).push(si);
    }
    
    console.log(`[INFO] ${serviceItemMap.size} serviços têm insumos vinculados`);

    // Buscar distribuições mensais dos serviços do cronograma (ServiceMonthlyDistribution)
    const monthlyDistributions = await base44.asServiceRole.entities.ServiceMonthlyDistribution.filter({ 
      orcamento_id: budgets[0]?.id 
    });
    
    // Criar mapa: budget_item_id -> [{ mes, percentual }]
    const distributionMap = new Map();
    for (const dist of monthlyDistributions) {
      if (!dist.budget_item_id) continue;
      
      if (!distributionMap.has(dist.budget_item_id)) {
        distributionMap.set(dist.budget_item_id, []);
      }
      
      distributionMap.get(dist.budget_item_id).push({
        mes: dist.mes,
        percentual: dist.percentual || 0
      });
    }
    
    console.log(`[INFO] Encontradas ${monthlyDistributions.length} distribuições mensais para ${distributionMap.size} itens`);
    
    if (monthlyDistributions.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Nenhuma distribuição mensal encontrada. É necessário salvar o cronograma no Planejamento antes de gerar a lista de compras.' 
      }, { status: 404 });
    }

    // Buscar insumos para obter dados completos
    let allInputs = [];
    try {
      allInputs = await base44.asServiceRole.entities.Input.list();
      console.log(`[INFO] Encontrados ${allInputs.length} insumos cadastrados`);
    } catch (error) {
      console.error('[ERROR] Erro ao buscar insumos:', error);
      return Response.json({ 
        success: false, 
        error: `Erro ao buscar insumos: ${error.message}` 
      }, { status: 500 });
    }
    
    const inputMap = new Map();
    for (const input of allInputs) {
      inputMap.set(input.id, input);
    }

    // Compilar lista de compras por período
    const periodosMap = new Map(); // mes -> { insumos_map, valor_total }
    const totalQuantidadesPorInsumo = new Map(); // insumo_id -> total_quantidade

    // Rastrear serviços sem insumos
    const servicosSemInsumos = [];
    const servicosComInsumos = [];
    
    // Para cada BudgetItem (serviço do orçamento)
    for (const budgetItem of allBudgetItems) {
      console.log(`[DEBUG] === Processando BudgetItem ===`);
      console.log(`[DEBUG] ID: ${budgetItem.id}`);
      console.log(`[DEBUG] Código: ${budgetItem.codigo}`);
      console.log(`[DEBUG] Descrição: ${budgetItem.descricao}`);
      console.log(`[DEBUG] Serviço ID: ${budgetItem.servico_id}`);
      console.log(`[DEBUG] Quantidade: ${budgetItem.quantidade}`);
      
      // Buscar distribuição mensal deste item
      const distribuicoesServico = distributionMap.get(budgetItem.id) || [];
      console.log(`[DEBUG] Distribuições mensais: ${distribuicoesServico.length}`);
      
      if (distribuicoesServico.length === 0) {
        console.log(`[DEBUG] ⚠️ Item ${budgetItem.codigo} não tem distribuição mensal - PULANDO`);
        continue;
      }
      
      // Buscar ServiceItems deste serviço
      const serviceItems = serviceItemMap.get(budgetItem.servico_id) || [];
      console.log(`[DEBUG] ServiceItems encontrados: ${serviceItems.length}`);

      if (serviceItems.length === 0) {
        console.log(`[DEBUG] ⚠️ Serviço ${budgetItem.codigo} (ID: ${budgetItem.servico_id}) não tem insumos cadastrados`);
        servicosSemInsumos.push(`${budgetItem.codigo} - ${budgetItem.descricao}`);
        continue;
      }
      
      // Filtrar apenas insumos (não incluir serviços aninhados)
      const insumoItems = serviceItems.filter(si => si.tipo_item === 'INSUMO');
      console.log(`[DEBUG] Insumos (filtrado): ${insumoItems.length}`);
      
      if (insumoItems.length === 0) {
        console.log(`[DEBUG] ⚠️ Serviço ${budgetItem.codigo} só tem serviços aninhados`);
        servicosSemInsumos.push(`${budgetItem.codigo} - ${budgetItem.descricao} (só serviços aninhados)`);
        continue;
      }
      
      servicosComInsumos.push(`${budgetItem.codigo} - ${insumoItems.length} insumos`);
      console.log(`[DEBUG] ✓ Processando ${insumoItems.length} insumos`);

      // Para cada insumo que compõe este serviço (já filtrado acima)
      for (const serviceItem of insumoItems) {
        if (serviceItem.item_id) {
          const insumoId = serviceItem.item_id;
          const insumo = inputMap.get(insumoId);

          if (!insumo) {
            console.log(`[DEBUG] ⚠️ Insumo ID ${insumoId} não encontrado no cadastro de insumos`);
            continue;
          }

          console.log(`[DEBUG]   → Insumo: ${insumo.codigo} - ${insumo.descricao}, Qtd/serviço: ${serviceItem.quantidade}`);

          // Quantidade total de insumo necessária = quantidade_serviço * quantidade_insumo_por_serviço
          const quantidadeTotalInsumo = budgetItem.quantidade * serviceItem.quantidade;
          console.log(`[DEBUG]   → Quantidade total necessária: ${quantidadeTotalInsumo.toFixed(4)}`);

          // Aplicar distribuição mensal
          for (const dist of distribuicoesServico) {
            const quantidadeNecessaria = (quantidadeTotalInsumo * dist.percentual) / 100;
            
            console.log(`[DEBUG]   → Mês ${dist.mes}: ${dist.percentual}% = ${quantidadeNecessaria.toFixed(4)}`);

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

    console.log(`[INFO] === RESUMO DA GERAÇÃO ===`);
    console.log(`[INFO] Serviços com insumos: ${servicosComInsumos.length}`);
    console.log(`[INFO] Serviços sem insumos: ${servicosSemInsumos.length}`);
    if (servicosSemInsumos.length > 0) {
      console.log(`[INFO] Serviços sem insumos:`, servicosSemInsumos);
    }
    if (servicosComInsumos.length > 0) {
      console.log(`[INFO] Serviços com insumos:`, servicosComInsumos);
    }
    console.log(`[INFO] Total de itens gerados: ${totalGeralItens}`);
    console.log(`[INFO] Valor total: R$ ${totalGeralValor.toFixed(2)}`);

    const hasItems = periodosFormatados.some(p => p.itens.length > 0);
    if (!hasItems) {
      let errorMsg = 'Nenhum insumo encontrado na lista de compras.\n\n';
      
      if (servicosSemInsumos.length > 0) {
        errorMsg += `Serviços sem insumos cadastrados (${servicosSemInsumos.length}):\n`;
        errorMsg += servicosSemInsumos.slice(0, 5).join('\n');
        if (servicosSemInsumos.length > 5) {
          errorMsg += `\n... e mais ${servicosSemInsumos.length - 5} serviços`;
        }
        errorMsg += '\n\nVá em Cadastros > Serviços e adicione insumos a cada serviço.';
      } else if (distributionMap.size === 0) {
        errorMsg += 'O cronograma não foi salvo com distribuição mensal.\n';
        errorMsg += 'Vá em Planejamento > selecione o orçamento > preencha os percentuais mensais > clique em Salvar.';
      } else {
        errorMsg += 'Verifique:\n';
        errorMsg += '1. Os serviços do orçamento têm insumos cadastrados\n';
        errorMsg += '2. O cronograma foi salvo com percentuais preenchidos (0-100%)';
      }
      
      return Response.json({ 
        success: false, 
        error: errorMsg
      }, { status: 404 });
    }

    return Response.json({ 
      success: true,
      data: {
        obra_id: project.id,
        obra_nome: project.nome,
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