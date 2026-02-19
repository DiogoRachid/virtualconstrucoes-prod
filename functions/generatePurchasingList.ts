import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const { workId, abcFilter } = await req.json();

    if (!workId) {
      return Response.json({ success: false, error: 'ID da obra é obrigatório' }, { status: 400 });
    }

    // 1. Buscar orçamento da obra (qualquer status, incluindo rascunho)
    const budgets = await base44.asServiceRole.entities.Budget.filter({ obra_id: workId });
    
    if (!budgets || budgets.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum orçamento encontrado para esta obra' 
      }, { status: 404 });
    }

    const budget = budgets[0];
    const totalMeses = budget.duracao_meses || 12;

    // 2. Buscar itens do orçamento (serviços)
    const budgetItems = await base44.asServiceRole.entities.BudgetItem.filter({ 
      orcamento_id: budget.id 
    });

    if (!budgetItems || budgetItems.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum serviço encontrado no orçamento' 
      }, { status: 404 });
    }

    // 3. Buscar cronograma (distribuição mensal dos serviços)
    const distributions = await base44.asServiceRole.entities.ServiceMonthlyDistribution.filter({
      orcamento_id: budget.id
    });

    if (!distributions || distributions.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Cronograma não encontrado. Salve o cronograma primeiro.' 
      }, { status: 404 });
    }

    // 4. Buscar todos os serviços únicos
    const serviceIds = [...new Set(budgetItems.map(item => item.servico_id))];
    const services = await base44.asServiceRole.entities.Service.filter({
      id: { $in: serviceIds }
    });

    // 5. Buscar composições (insumos) de todos os serviços
    const serviceItems = await base44.asServiceRole.entities.ServiceItem.filter({
      servico_id: { $in: serviceIds },
      tipo_item: 'INSUMO'
    });

    if (!serviceItems || serviceItems.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Nenhum insumo encontrado nas composições dos serviços' 
      }, { status: 404 });
    }

    // 6. Buscar todos os insumos
    const insumoIds = [...new Set(serviceItems.map(si => si.item_id))];
    const inputs = await base44.asServiceRole.entities.Input.filter({
      id: { $in: insumoIds }
    });

    // Criar mapas para acesso rápido
    const serviceMap = new Map(services.map(s => [s.id, s]));
    const inputMap = new Map(inputs.map(i => [i.id, i]));
    
    // Mapa de composições: servico_id -> array de insumos
    const compositionMap = new Map();
    serviceItems.forEach(si => {
      if (!compositionMap.has(si.servico_id)) {
        compositionMap.set(si.servico_id, []);
      }
      compositionMap.get(si.servico_id).push(si);
    });

    // 7. LÓGICA PRINCIPAL: Calcular insumos por mês
    const periodoMap = new Map(); // mes -> array de itens

    distributions.forEach(dist => {
      // Encontrar o item do orçamento correspondente
      const budgetItem = budgetItems.find(bi => bi.id === dist.budget_item_id);
      if (!budgetItem) return;

      // Quantidade do serviço neste mês (baseado no percentual)
      const quantidadeServico = (budgetItem.quantidade * dist.percentual) / 100;
      
      if (quantidadeServico <= 0) return;

      // Buscar composição do serviço
      const composicao = compositionMap.get(budgetItem.servico_id) || [];

      // Para cada insumo da composição, calcular quantidade
      composicao.forEach(serviceItem => {
        const input = inputMap.get(serviceItem.item_id);
        if (!input) return;

        // Quantidade do insumo = quantidade do serviço * quantidade na composição
        const quantidadeInsumo = quantidadeServico * serviceItem.quantidade;

        if (!periodoMap.has(dist.mes)) {
          periodoMap.set(dist.mes, new Map());
        }

        const mesMap = periodoMap.get(dist.mes);
        const key = input.id;

        if (mesMap.has(key)) {
          // Somar quantidade se já existe
          const existing = mesMap.get(key);
          existing.quantidade += quantidadeInsumo;
        } else {
          // Criar novo item
          mesMap.set(key, {
            insumo_id: input.id,
            codigo: input.codigo,
            descricao: input.descricao,
            unidade: input.unidade,
            valor_unitario: input.valor_unitario || 0,
            quantidade: quantidadeInsumo
          });
        }
      });
    });

    // 8. Classificação ABC
    // Calcular valor total para classificação ABC
    const allItems = [];
    periodoMap.forEach(mesMap => {
      mesMap.forEach(item => {
        const existing = allItems.find(i => i.insumo_id === item.insumo_id);
        if (existing) {
          existing.quantidade += item.quantidade;
        } else {
          allItems.push({ ...item });
        }
      });
    });

    allItems.forEach(item => {
      item.valor_total = item.quantidade * item.valor_unitario;
    });

    const totalValue = allItems.reduce((sum, item) => sum + item.valor_total, 0);

    // Ordenar por valor total
    allItems.sort((a, b) => b.valor_total - a.valor_total);

    // Classificar ABC
    let accumulated = 0;
    allItems.forEach(item => {
      accumulated += item.valor_total;
      const percentage = (accumulated / totalValue) * 100;
      
      if (percentage <= 80) {
        item.abc_class = 'A';
      } else if (percentage <= 95) {
        item.abc_class = 'B';
      } else {
        item.abc_class = 'C';
      }
    });

    // Criar mapa ABC
    const abcMap = new Map(allItems.map(item => [item.insumo_id, item.abc_class]));

    // 9. Montar resposta
    const periodos = [];
    for (let mes = 1; mes <= totalMeses; mes++) {
      const mesMap = periodoMap.get(mes);
      if (!mesMap || mesMap.size === 0) continue;

      const itens = Array.from(mesMap.values()).map(item => ({
        ...item,
        abc_class: abcMap.get(item.insumo_id) || 'C'
      }));

      // Filtrar por classe ABC se necessário
      const itensFiltrados = abcFilter 
        ? itens.filter(item => item.abc_class === abcFilter)
        : itens;

      if (itensFiltrados.length === 0) continue;

      const totalValor = itensFiltrados.reduce((sum, item) => 
        sum + (item.quantidade * item.valor_unitario), 0
      );

      periodos.push({
        mes,
        periodo: `Mês ${mes}`,
        itens: itensFiltrados.sort((a, b) => {
          const classOrder = { 'A': 0, 'B': 1, 'C': 2 };
          return classOrder[a.abc_class] - classOrder[b.abc_class];
        }),
        total_itens: itensFiltrados.length,
        total_valor: totalValor
      });
    }

    const obra = await base44.asServiceRole.entities.Project.get(workId);

    return Response.json({
      success: true,
      data: {
        obra_id: workId,
        obra_nome: obra?.nome || 'N/A',
        total_meses: totalMeses,
        data_geracao: new Date().toISOString().split('T')[0],
        periodos,
        total_geral_itens: allItems.length,
        total_geral_valor: totalValue
      }
    });

  } catch (error) {
    console.error('Erro ao gerar lista:', error);
    return Response.json({ 
      success: false, 
      error: error.message || 'Erro interno do servidor' 
    }, { status: 500 });
  }
});