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

  const [schedule, setSchedule] = useState({});
  const [months, setMonths] = useState(12);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);

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

  // Carregar duração do projeto e cronograma inicial
  useEffect(() => {
    if (!stages || stages.length === 0) return;
    
    // Carregar duração
    if (budget?.duracao_meses) {
      setMonths(budget.duracao_meses);
    } else if (stages.length > 0) {
      const stageWithDuration = stages.find(s => s.duracao_meses);
      if (stageWithDuration) {
        setMonths(stageWithDuration.duracao_meses);
      }
    }
    
    // Carregar cronograma inicial dos dados salvos
    if (!scheduleLoaded) {
      const initialSchedule = {};
      const duration = budget?.duracao_meses || 12;
      
      stages.forEach(stage => {
        if (stage.distribuicao_mensal && stage.distribuicao_mensal.length > 0) {
          const percentages = Array(duration).fill(0);
          stage.distribuicao_mensal.forEach(d => {
            if (d.mes >= 1 && d.mes <= duration) {
              percentages[d.mes - 1] = d.percentual || 0;
            }
          });
          initialSchedule[stage.id] = {
            percentages,
            total: percentages.reduce((sum, p) => sum + p, 0)
          };
        } else {
          initialSchedule[stage.id] = {
            percentages: Array(duration).fill(0),
            total: 0
          };
        }
      });
      
      setSchedule(initialSchedule);
      setScheduleLoaded(true);
    }
  }, [budget, stages, scheduleLoaded]);

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
    setSchedule(newSchedule);
    setMonths(newMonths);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ schedule, months }) => {
      const updates = [];
      
      // Atualizar duração no orçamento
      updates.push(
        base44.entities.Budget.update(budgetId, {
          duracao_meses: months
        })
      );
      
      // Atualizar etapas
      for (const stageId in schedule) {
        const stageData = schedule[stageId];
        const distribuicao_mensal = stageData.percentages.map((percentual, idx) => ({
          mes: idx + 1,
          percentual
        }));
        updates.push(
          base44.entities.ProjectStage.update(stageId, {
            distribuicao_mensal,
            duracao_meses: months
          })
        );
      }
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectStages', budgetId] });
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
      toast.success('Cronograma salvo com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao salvar cronograma');
    }
  });

  const handleSave = (schedule, months) => {
    saveMutation.mutate({ schedule, months });
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
            schedule={schedule}
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
            schedule={schedule}
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