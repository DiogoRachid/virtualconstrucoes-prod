import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { budgetId } = await req.json();

    if (!budgetId) {
      return Response.json({ error: 'budgetId é obrigatório' }, { status: 400 });
    }

    // Buscar todas as ProjectStages deste orçamento
    const stages = await base44.asServiceRole.entities.ProjectStage.filter({ orcamento_id: budgetId });

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
      budgetId,
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