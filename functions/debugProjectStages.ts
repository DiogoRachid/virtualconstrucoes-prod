import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let requestData = {};
    
    try {
      requestData = await req.json();
    } catch (e) {
      requestData = {};
    }
    
    const { budgetId, budgetName } = requestData;
    console.log('[DEBUG] Request data:', JSON.stringify(requestData));

    let finalBudgetId = budgetId;

    // Se não tiver budgetId, buscar pelo nome
    if (!finalBudgetId && budgetName) {
      const budgets = await base44.asServiceRole.entities.Budget.filter({ descricao: budgetName });
      if (budgets.length === 0) {
        return Response.json({ error: `Orçamento "${budgetName}" não encontrado` }, { status: 400 });
      }
      finalBudgetId = budgets[0].id;
    }

    if (!finalBudgetId) {
      return Response.json({ error: 'budgetId ou budgetName é obrigatório' }, { status: 400 });
    }

    // Buscar todas as ProjectStages deste orçamento
    const stages = await base44.asServiceRole.entities.ProjectStage.filter({ orcamento_id: finalBudgetId });

    console.log(`[DEBUG] Total de stages encontradas: ${stages.length}`);

    const stagesDebug = stages.map(stage => ({
      id: stage.id,
      nome: stage.nome,
      mes_inicio: stage.mes_inicio,
      mes_fim: stage.mes_fim,
      duracao_meses: stage.duracao_meses,
      distribuicao_mensal: stage.distribuicao_mensal,
      servicos_ids: stage.servicos_ids
    }));

    console.log('[DEBUG] Dados das stages:', JSON.stringify(stagesDebug, null, 2));

    return Response.json({
      success: true,
      finalBudgetId,
      totalStages: stages.length,
      stages: stagesDebug
    });
  } catch (error) {
    console.error('Erro ao debugar ProjectStages:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});