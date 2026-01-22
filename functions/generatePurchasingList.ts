import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { workId, month, year, abcFilter } = await req.json();

    // Buscar orçamentos da obra
    const budgets = await base44.asServiceRole.entities.Budget.filter({ obra_id: workId });
    
    if (!budgets.length) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum orçamento encontrado para esta obra' 
      }, { status: 400 });
    }

    // Buscar itens de orçamento
    const allBudgetItems = [];
    for (const budget of budgets) {
      const items = await base44.asServiceRole.entities.BudgetItem.filter({ orcamento_id: budget.id });
      allBudgetItems.push(...items);
    }

    // Buscar planejamento (cronograma) para extrair distribuição mensal
    const planning = await base44.asServiceRole.entities.ProjectStage.filter({ obra_id: workId });
    
    // Compilar lista de compras baseada no cronograma
    const purchaseList = [];
    const inputMap = new Map(); // Para agregar quantidades por insumo

    for (const item of allBudgetItems) {
      // Buscar histórico de compra para verificar curva ABC
      const history = await base44.asServiceRole.entities.InputPurchaseHistory.filter({ 
        insumo_id: item.servico_id 
      });

      const totalValue = history.reduce((sum, h) => sum + h.valor_total, 0);
      
      // Classificar ABC (simplificado)
      let abcClass = 'C';
      if (totalValue > 5000) abcClass = 'A';
      else if (totalValue > 1000) abcClass = 'B';

      // Aplicar filtro ABC se definido
      if (abcFilter && abcFilter !== abcClass) continue;

      const key = item.servico_id;
      if (!inputMap.has(key)) {
        inputMap.set(key, {
          insumo_id: item.servico_id,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: 0,
          valor_unitario: item.custo_unitario,
          abc_class: abcClass,
          meses: []
        });
      }
      
      const entry = inputMap.get(key);
      entry.quantidade += item.quantidade_orcada || 0;
      entry.meses.push(month);
    }

    // Converter Map em Array
    const items = Array.from(inputMap.values());

    return Response.json({ 
      success: true,
      data: {
        obra_id: workId,
        mes: month,
        ano: year,
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