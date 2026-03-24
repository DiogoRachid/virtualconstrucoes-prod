import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Não autenticado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { workId, budgetId, abcFilter } = body;

    console.log('[INFO] Requisição recebida:', JSON.stringify({ workId, budgetId, abcFilter }));

    if (!workId || typeof workId !== 'string' || workId === 'null' || workId === 'undefined') {
      console.error('[ERROR] ID da obra inválido:', workId);
      return new Response(JSON.stringify({ success: false, error: 'ID da obra inválido ou não fornecido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!budgetId || typeof budgetId !== 'string' || budgetId === 'null' || budgetId === 'undefined') {
      console.error('[ERROR] ID do orçamento inválido:', budgetId);
      return new Response(JSON.stringify({ success: false, error: 'ID do orçamento inválido ou não fornecido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Buscar orçamento específico
    let budget;
    try {
      const budgets = await base44.asServiceRole.entities.Budget.filter({ 
        id: budgetId,
        obra_id: workId 
      });
      budget = budgets[0];
      console.log('[INFO] Orçamento encontrado:', budget ? budget.id : 'Nenhum');
    } catch (error) {
      console.error('[ERROR] Erro ao buscar orçamento:', error.message);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Erro ao buscar orçamento: ' + error.message 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!budget) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Orçamento ${budgetId} não encontrado para a obra selecionada.` 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const totalMeses = budget.duracao_meses || 12;
    
    console.log(`[DEBUG] Orçamento: ${budget.id}, Duração: ${totalMeses} meses, Status: ${budget.status}`);

    // 2. Buscar itens do orçamento (serviços)
    const budgetItems = await base44.asServiceRole.entities.BudgetItem.filter({ 
      orcamento_id: budget.id 
    });

    console.log(`[DEBUG] Itens do orçamento: ${budgetItems?.length || 0}`);

    if (!budgetItems || budgetItems.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'O orçamento não tem serviços cadastrados. Adicione serviços ao orçamento.' 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Buscar cronograma (distribuição mensal dos serviços - aceita rascunho)
    const distributions = await base44.asServiceRole.entities.ServiceMonthlyDistribution.filter({
      orcamento_id: budget.id
    });

    console.log(`[DEBUG] Distribuições mensais: ${distributions?.length || 0}`);

    if (!distributions || distributions.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'O cronograma não está configurado. Acesse Planejamento e configure a distribuição mensal dos serviços.' 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Buscar todos os serviços únicos
    const serviceIds = [...new Set(budgetItems.map(item => item.servico_id))];
    const services = await base44.asServiceRole.entities.Service.filter({
      id: { $in: serviceIds }
    });

    // 5. Buscar composições de todos os serviços (incluindo insumos e serviços aninhados)
    const allServiceItems = await base44.asServiceRole.entities.ServiceItem.filter({
      servico_id: { $in: serviceIds }
    });

    console.log(`[DEBUG] Composições de serviços: ${allServiceItems?.length || 0}`);
    console.log(`[DEBUG] Serviços únicos no orçamento: ${serviceIds.length}`);

    if (!allServiceItems || allServiceItems.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Os serviços não têm composições cadastradas. Configure as composições dos ${serviceIds.length} serviços no orçamento.` 
      }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Função recursiva para expandir serviços aninhados em insumos
    async function expandService(servicoId, quantidade = 1, visited = new Set()) {
      if (visited.has(servicoId)) return [];
      visited.add(servicoId);

      const items = allServiceItems.filter(si => si.servico_id === servicoId);
      const expandedItems = [];

      for (const item of items) {
        if (item.tipo_item === 'INSUMO') {
          expandedItems.push({
            item_id: item.item_id,
            quantidade: item.quantidade * quantidade
          });
        } else if (item.tipo_item === 'SERVICO') {
          const nested = await expandService(item.item_id, item.quantidade * quantidade, visited);
          expandedItems.push(...nested);
        }
      }

      return expandedItems;
    }

    // 6. Expandir composições de cada serviço para obter todos os insumos
    const serviceCompositions = new Map();
    
    for (const serviceId of serviceIds) {
      const expandedItems = await expandService(serviceId);
      serviceCompositions.set(serviceId, expandedItems);
    }

    // 7. Buscar todos os insumos únicos
    const allInsumoIds = new Set();
    serviceCompositions.forEach(items => {
      items.forEach(item => allInsumoIds.add(item.item_id));
    });

    const inputs = await base44.asServiceRole.entities.Input.filter({
      id: { $in: Array.from(allInsumoIds) }
    });

    const inputMap = new Map(inputs.map(i => [i.id, i]));

    // 8. LÓGICA PRINCIPAL: Calcular insumos por mês
    const periodoMap = new Map(); // mes -> Map(insumo_id -> item)

    for (const dist of distributions) {
      // Encontrar o item do orçamento correspondente
      const budgetItem = budgetItems.find(bi => bi.id === dist.budget_item_id);
      if (!budgetItem) continue;

      // Quantidade do serviço neste mês (baseado no percentual)
      const quantidadeServico = (budgetItem.quantidade * dist.percentual) / 100;
      
      if (quantidadeServico <= 0) continue;

      // Buscar composição expandida do serviço
      const composicao = serviceCompositions.get(budgetItem.servico_id) || [];

      // Para cada insumo da composição, calcular quantidade
      for (const compItem of composicao) {
        const input = inputMap.get(compItem.item_id);
        if (!input) continue;

        // Quantidade do insumo = quantidade do serviço * quantidade na composição
        const quantidadeInsumo = quantidadeServico * compItem.quantidade;

        if (!periodoMap.has(dist.mes)) {
          periodoMap.set(dist.mes, new Map());
        }

        const mesMap = periodoMap.get(dist.mes);

        if (mesMap.has(input.id)) {
          // Somar quantidade se já existe
          const existing = mesMap.get(input.id);
          existing.quantidade += quantidadeInsumo;
        } else {
          // Criar novo item
          mesMap.set(input.id, {
            insumo_id: input.id,
            codigo: input.codigo,
            descricao: input.descricao,
            unidade: input.unidade,
            valor_unitario: input.valor_unitario || 0,
            quantidade: quantidadeInsumo
          });
        }
      }
    }

    // 9. Classificação ABC
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

    // 10. Montar resposta
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

    console.log(`[DEBUG] Lista gerada com sucesso: ${periodos.length} períodos, ${allItems.length} insumos únicos`);

    return new Response(JSON.stringify({
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
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ERROR] Erro ao gerar lista:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Erro interno do servidor',
      details: error.stack
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});