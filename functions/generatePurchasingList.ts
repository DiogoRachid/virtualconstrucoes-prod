import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { workId, abcFilter } = await req.json();

    // Buscar projeto para obter datas
    const project = await base44.asServiceRole.entities.Project.filter({ id: workId }).then(r => r[0]);
    if (!project) {
      return Response.json({ 
        success: false, 
        error: 'Obra não encontrada' 
      }, { status: 400 });
    }

    // Buscar orçamentos da obra
    const budgets = await base44.asServiceRole.entities.Budget.filter({ obra_id: workId });
    if (!budgets.length) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum orçamento encontrado para esta obra' 
      }, { status: 400 });
    }

    // Calcular total de meses da obra
    const startDate = new Date(project.data_inicio);
    const endDate = new Date(project.data_previsao);
    const months = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24 * 30.44));

    // Buscar itens de orçamento
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

    // Buscar distribuição mensal dos serviços
    const distributions = await base44.asServiceRole.entities.ServiceMonthlyDistribution.filter({ 
      obra_id: workId 
    });

    if (!distributions.length) {
      console.warn(`Nenhuma distribuição mensal encontrada para obra ${workId}`);
    }

    // Mapa de distribuição por serviço e mês
    const distributionMap = new Map();
    for (const dist of distributions) {
      const key = `${dist.servico_id}_${dist.mes_numero}`;
      distributionMap.set(key, dist);
    }

    // Compilar lista de compras para TODOS os períodos
    const periodsMap = new Map(); // periodo -> { itens, valor_total }

    for (const item of allBudgetItems) {
      // Se não há histórico, usa a quantidade total do orçamento para classificação
      let abcClass = 'C';
      const totalOrcado = item.quantidade_orcada * item.custo_unitario;
      
      // Classificar ABC baseado no valor total do item no orçamento
      if (totalOrcado > 10000) abcClass = 'A';
      else if (totalOrcado > 1000) abcClass = 'B';

      // Aplicar filtro ABC
      if (abcFilter && abcFilter !== abcClass) continue;

      // Calcular quantidade para cada período baseado na distribuição
      for (let mes = 1; mes <= months; mes++) {
        const distKey = `${item.servico_id}_${mes}`;
        const distribution = distributionMap.get(distKey);
        
        const quantidade = distribution 
          ? (item.quantidade_orcada * (distribution.percentual_fisico / 100))
          : 0;

        if (quantidade > 0) {
          // Garantir que o período existe no mapa
          if (!periodsMap.has(mes)) {
            periodsMap.set(mes, { itens: new Map(), valor_total: 0 });
          }

          const periodData = periodsMap.get(mes);
          const key = item.servico_id;

          if (!periodData.itens.has(key)) {
            periodData.itens.set(key, {
              insumo_id: item.servico_id,
              descricao: item.descricao,
              unidade: item.unidade,
              quantidade: 0,
              valor_unitario: item.custo_unitario || 0,
              abc_class: abcClass
            });
          }

          const entrada = periodData.itens.get(key);
          entrada.quantidade += quantidade;
          periodData.valor_total += quantidade * entrada.valor_unitario;
        }
      }
    }

    // Converter para formato de resposta
    const periodosFormatados = [];
    for (let mes = 1; mes <= months; mes++) {
      const periodData = periodsMap.get(mes);
      const itens = periodData 
        ? Array.from(periodData.itens.values()).sort((a, b) => {
            const abcOrder = { 'A': 1, 'B': 2, 'C': 3 };
            return abcOrder[a.abc_class] - abcOrder[b.abc_class];
          })
        : [];

      periodosFormatados.push({
        mes: mes,
        periodo: `Mês ${mes}`,
        itens: itens,
        total_itens: itens.length,
        total_valor: periodData ? periodData.valor_total : 0
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