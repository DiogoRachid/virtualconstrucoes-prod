import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, TrendingUp, PieChart as PieChartIcon, Users } from 'lucide-react';
import { toast } from "sonner";
import ScheduleEditor from '@/components/planner/ScheduleEditor';
import SCurveChart from '@/components/planner/SCurveChart';
import ABCAnalysis from '@/components/planner/ABCAnalysis';
import StaffingCalculator from '@/components/planner/StaffingCalculator';

export default function BudgetPlanner() {
  const urlParams = new URLSearchParams(window.location.search);
  const budgetId = urlParams.get('budgetId');
  const queryClient = useQueryClient();

  const [serviceSchedule, setServiceSchedule] = useState({});
  const [months, setMonths] = useState(12);

  // Carregar dados do orçamento
  const { data: budget, isLoading: loadingBudget } = useQuery({
    queryKey: ['budget', budgetId],
    queryFn: async () => {
      const budgets = await base44.entities.Budget.filter({ id: budgetId });
      return budgets[0];
    },
    enabled: !!budgetId
  });

  const { data: stages = [], isLoading: loadingStages } = useQuery({
    queryKey: ['projectStages', budgetId],
    queryFn: () => base44.entities.ProjectStage.filter({ orcamento_id: budgetId }),
    enabled: !!budgetId
  });

  useEffect(() => {
    if (budget?.duracao_meses) {
      setMonths(budget.duracao_meses);
    }
  }, [budget?.duracao_meses]);

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['budgetItems', budgetId],
    queryFn: () => base44.entities.BudgetItem.filter({ orcamento_id: budgetId }),
    enabled: !!budgetId
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list()
  });

  const handleScheduleChange = (newSchedule, newMonths) => {
    setServiceSchedule(newSchedule);
    setMonths(newMonths);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ schedule, months }) => {
      console.log('=== SALVAMENTO INICIADO ===');
      console.log('Schedule recebido:', JSON.stringify(schedule, null, 2));
      console.log('Meses:', months);
      console.log('Items:', items.length);
      console.log('Stages:', stages.length);
      
      // Atualizar duração do orçamento primeiro
      await base44.entities.Budget.update(budgetId, {
        duracao_meses: months
      });
      console.log('Duração do orçamento atualizada');
      
      // Agrupar itens por stage_id e calcular distribuições
      const stageDistributions = new Map();
      
      items.forEach(item => {
        const itemSchedule = schedule[item.id];
        if (!item.stage_id || !itemSchedule) {
          console.log(`Item ${item.id} sem stage_id ou schedule`);
          return;
        }
        
        if (!stageDistributions.has(item.stage_id)) {
          stageDistributions.set(item.stage_id, { items: [], totalValue: 0 });
        }
        
        const stageData = stageDistributions.get(item.stage_id);
        stageData.items.push({
          id: item.id,
          subtotal: item.subtotal || 0,
          percentages: itemSchedule.percentages
        });
        stageData.totalValue += item.subtotal || 0;
      });
      
      console.log('Etapas com dados:', stageDistributions.size);
      
      // Verificar quais etapas existem e atualizar
      for (const [stageId, data] of stageDistributions.entries()) {
        const distribuicao_mensal = [];
        
        for (let mes = 1; mes <= months; mes++) {
          let weightedPercentage = 0;
          
          data.items.forEach(item => {
            const itemPercentage = item.percentages[mes - 1] || 0;
            const weight = item.subtotal / data.totalValue;
            weightedPercentage += weight * itemPercentage;
          });
          
          distribuicao_mensal.push({
            mes,
            percentual: weightedPercentage
          });
        }
        
        console.log(`Salvando etapa ${stageId}:`, distribuicao_mensal);
        
        try {
          // Verificar se a etapa existe
          const existingStages = await base44.entities.ProjectStage.filter({ id: stageId });
          
          if (existingStages && existingStages.length > 0) {
            // Etapa existe, atualizar
            await base44.entities.ProjectStage.update(stageId, {
              distribuicao_mensal,
              duracao_meses: months
            });
            console.log(`Etapa ${stageId} atualizada`);
          } else {
            console.warn(`Etapa ${stageId} não encontrada, pulando`);
          }
        } catch (error) {
          console.error(`Erro ao salvar etapa ${stageId}:`, error);
          throw error;
        }
      }
      
      console.log('=== SALVAMENTO CONCLUÍDO ===');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectStages', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
      toast.success('Cronograma salvo com sucesso!');
    },
    onError: (error) => {
      console.error('=== ERRO NO SALVAMENTO ===', error);
      toast.error('Erro ao salvar cronograma: ' + error.message);
    }
  });

  const handleSave = (receivedSchedule, receivedMonths) => {
    console.log('=== BOTÃO SALVAR CLICADO ===');
    console.log('Schedule:', Object.keys(receivedSchedule).length, 'itens');
    console.log('Meses:', receivedMonths);
    saveMutation.mutate({ schedule: receivedSchedule, months: receivedMonths });
  };

  if (!budgetId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card>
          <CardContent className="pt-6">
            <p className="text-slate-600">Nenhum orçamento selecionado.</p>
            <Button onClick={() => window.location.href = createPageUrl('BudgetForm')} className="mt-4">
              Voltar para Orçamentos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingBudget || loadingStages || loadingItems) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Carregando dados do orçamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.location.href = createPageUrl('BudgetForm') + `?id=${budgetId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Planejamento e Cronograma</h1>
            <p className="text-slate-500">{budget?.descricao} • {budget?.obra_nome}</p>
          </div>
        </div>
      </div>

      {/* Resumo do Orçamento */}
      <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <CardContent className="pt-6">
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="text-sm opacity-90 mb-1">Valor Total do Orçamento</div>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget?.total_final || 0)}
              </div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Total de Etapas</div>
              <div className="text-2xl font-bold">{stages.length}</div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Total de Serviços</div>
              <div className="text-2xl font-bold">{items.length}</div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Status</div>
              <div className="text-2xl font-bold capitalize">{budget?.status || 'Rascunho'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs de Planejamento */}
      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="schedule">
            <Calendar className="h-4 w-4 mr-2" />
            Cronograma Detalhado
          </TabsTrigger>
          <TabsTrigger value="scurve">
            <TrendingUp className="h-4 w-4 mr-2" />
            Curva S
          </TabsTrigger>
          <TabsTrigger value="abc">
            <PieChartIcon className="h-4 w-4 mr-2" />
            Curva ABC
          </TabsTrigger>
          <TabsTrigger value="staffing">
            <Users className="h-4 w-4 mr-2" />
            Recursos e Equipes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6">
          <ScheduleEditor
            budget={budget}
            stages={stages}
            items={items}
            onChange={handleScheduleChange}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="scurve" className="mt-6">
          <SCurveChart
            schedule={serviceSchedule}
            stages={stages}
            items={items}
            months={months}
          />
        </TabsContent>

        <TabsContent value="abc" className="mt-6">
          <ABCAnalysis
            items={items}
            services={services}
            budget={budget}
          />
        </TabsContent>

        <TabsContent value="staffing" className="mt-6">
          <StaffingCalculator
            schedule={serviceSchedule}
            stages={stages}
            items={items}
            services={services}
            months={months}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}