import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, TrendingUp, PieChart as PieChartIcon, Users, CheckSquare } from 'lucide-react';
import { toast } from "sonner";
import ScheduleEditor from '@/components/planner/ScheduleEditor';
import SCurveChart from '@/components/planner/SCurveChart';
import ABCAnalysis from '@/components/planner/ABCAnalysis';
import StaffingCalculator from '@/components/planner/StaffingCalculator';
import RealizadoTab from '@/components/planner/RealizadoTab';

export default function ProjectSchedule() {
  const urlParams = new URLSearchParams(window.location.search);
  const budgetId = urlParams.get('budgetId');
  const queryClient = useQueryClient();

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

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['budgetItems', budgetId],
    queryFn: () => base44.entities.BudgetItem.filter({ orcamento_id: budgetId }),
    enabled: !!budgetId
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list()
  });

  const saveMutation = useMutation({
    mutationFn: async ({ itemPercentages, months }) => {
      // Atualizar duração
      await base44.entities.Budget.update(budgetId, { duracao_meses: months });

      // Limpar distribuições antigas
      const oldDist = await base44.entities.ServiceMonthlyDistribution.filter({ orcamento_id: budgetId });
      for (const d of oldDist) {
        await base44.entities.ServiceMonthlyDistribution.delete(d.id);
      }

      // Criar novas distribuições
      const newDistributions = [];
      
      for (const item of items) {
        const percentages = itemPercentages[item.id] || [];
        
        for (let monthIdx = 0; monthIdx < months; monthIdx++) {
          const percentual = percentages[monthIdx] || 0;
          
          if (percentual > 0) {
            newDistributions.push({
              orcamento_id: budgetId,
              project_stage_id: item.stage_id,
              servico_id: item.servico_id,
              servico_codigo: item.codigo,
              servico_descricao: item.descricao,
              mes: monthIdx + 1,
              quantidade: ((item.quantidade || 0) * percentual) / 100,
              percentual: percentual,
              valor_mes: ((item.subtotal || 0) * percentual) / 100
            });
          }
        }
      }

      if (newDistributions.length > 0) {
        await base44.entities.ServiceMonthlyDistribution.bulkCreate(newDistributions);
      }

      // Atualizar etapas com distribuição mensal
      for (const stage of stages) {
        const stageItems = items.filter(i => i.stage_id === stage.id);
        const distribuicao_mensal = [];
        let valor_total = 0;

        for (let mes = 1; mes <= months; mes++) {
          let valorMes = 0;
          
          for (const item of stageItems) {
            const percentages = itemPercentages[item.id] || [];
            const percentual = percentages[mes - 1] || 0;
            valorMes += ((item.subtotal || 0) * percentual) / 100;
          }
          
          valor_total += valorMes;
        }

        for (let mes = 1; mes <= months; mes++) {
          let valorMes = 0;
          
          for (const item of stageItems) {
            const percentages = itemPercentages[item.id] || [];
            const percentual = percentages[mes - 1] || 0;
            valorMes += ((item.subtotal || 0) * percentual) / 100;
          }
          
          const percentual = valor_total > 0 ? (valorMes / valor_total) * 100 : 0;
          distribuicao_mensal.push({ mes, percentual });
        }

        await base44.entities.ProjectStage.update(stage.id, {
          distribuicao_mensal,
          duracao_meses: months,
          valor_total
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectStages', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
      toast.success('Cronograma salvo com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao salvar: ' + error.message);
    }
  });

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
          <p className="text-slate-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <CardContent className="pt-6">
          <div className="grid grid-cols-4 gap-6">
            <div>
              <div className="text-sm opacity-90 mb-1">Valor Total</div>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget?.total_final || 0)}
              </div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Etapas</div>
              <div className="text-2xl font-bold">{stages.length}</div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Serviços</div>
              <div className="text-2xl font-bold">{items.length}</div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Status</div>
              <div className="text-2xl font-bold capitalize">{budget?.status || 'Rascunho'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="schedule">
            <Calendar className="h-4 w-4 mr-2" />
            Cronograma
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
            Recursos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6">
          <ScheduleEditor
            budget={budget}
            stages={stages}
            items={items}
            onSave={(data) => saveMutation.mutate(data)}
            isSaving={saveMutation.isPending}
          />
        </TabsContent>

        <TabsContent value="scurve" className="mt-6">
          <SCurveChart
            schedule={{}}
            stages={stages}
            items={items}
            months={budget?.duracao_meses || 12}
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
            schedule={{}}
            stages={stages}
            items={items}
            services={services}
            months={budget?.duracao_meses || 12}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}