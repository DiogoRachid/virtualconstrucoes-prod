import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { workId, period, abcFilter } = await req.json();

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

    // Extrair número do período (ex: "Mês 3" -> 3)
    const periodNum = parseInt(period.split(' ')[1]);
    if (isNaN(periodNum) || periodNum < 1 || periodNum > months) {
      return Response.json({ 
        success: false, 
        error: 'Período inválido' 
      }, { status: 400 });
    }

    // Buscar itens de orçamento
    const allBudgetItems = [];
    for (const budget of budgets) {
      const items = await base44.asServiceRole.entities.BudgetItem.filter({ orcamento_id: budget.id });
      allBudgetItems.push(...items);
    }

    // Buscar distribuição mensal dos serviços
    const distributions = await base44.asServiceRole.entities.ServiceMonthlyDistribution.filter({ 
      obra_id: workId 
    });

    // Mapa de distribuição por serviço e mês
    const distributionMap = new Map();
    for (const dist of distributions) {
      const key = `${dist.servico_id}_${dist.mes_numero}`;
      distributionMap.set(key, dist);
    }

    // Compilar lista de compras baseada no período selecionado
    const inputMap = new Map();

    for (const item of allBudgetItems) {
      // Buscar histórico de compra para curva ABC
      const history = await base44.asServiceRole.entities.InputPurchaseHistory.filter({ 
        insumo_id: item.servico_id 
      });

      const totalValue = history.reduce((sum, h) => sum + (h.valor_total || 0), 0);
      
      // Classificar ABC
      let abcClass = 'C';
      if (totalValue > 5000) abcClass = 'A';
      else if (totalValue > 1000) abcClass = 'B';

      // Aplicar filtro ABC
      if (abcFilter && abcFilter !== abcClass) continue;

      // Buscar distribuição para este mês
      const distKey = `${item.servico_id}_${periodNum}`;
      const distribution = distributionMap.get(distKey);
      
      const quantidadeParaEsseMes = distribution 
        ? (item.quantidade_orcada * (distribution.percentual_fisico / 100))
        : 0;

      if (quantidadeParaEsseMes > 0) {
        const key = item.servico_id;
        if (!inputMap.has(key)) {
          inputMap.set(key, {
            insumo_id: item.servico_id,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: 0,
            valor_unitario: item.custo_unitario || 0,
            abc_class: abcClass
          });
        }
        
        const entry = inputMap.get(key);
        entry.quantidade += quantidadeParaEsseMes;
      }
    }

    // Converter Map em Array e ordenar por ABC
    const items = Array.from(inputMap.values()).sort((a, b) => {
      const abcOrder = { 'A': 1, 'B': 2, 'C': 3 };
      return abcOrder[a.abc_class] - abcOrder[b.abc_class];
    });

    return Response.json({ 
      success: true,
      data: {
        obra_id: workId,
        periodo: period,
        total_meses: months,
        data_geracao: new Date().toISOString().split('T')[0],
        itens: items,
        total_valor: items.reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0),
        total_itens: items.length
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