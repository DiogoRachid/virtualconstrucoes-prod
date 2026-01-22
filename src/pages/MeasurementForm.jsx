import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Save, CheckCircle, Loader2, AlertTriangle, TrendingUp, FileSpreadsheet, FileText } from 'lucide-react';
import { exportMeasurementXLSX, exportMeasurementPDF } from '@/components/measurements/MeasurementExporter';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MeasurementForm() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const measurementId = urlParams.get('id');
  const isEditing = !!measurementId;

  const [formData, setFormData] = useState({
    obra_id: '',
    obra_nome: '',
    orcamento_id: '',
    numero_medicao: 1,
    periodo_referencia: '',
    data_inicio: '',
    data_fim: '',
    status: 'em_edicao',
    observacao: ''
  });

  const [items, setItems] = useState([]);
  const [editableQuantities, setEditableQuantities] = useState({});
  const [scheduleData, setScheduleData] = useState([]);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => base44.entities.Budget.list(),
    enabled: !!formData.obra_id
  });

  const { data: measurement, isLoading: loadingMeasurement } = useQuery({
    queryKey: ['measurement', measurementId],
    queryFn: async () => {
      const m = await base44.entities.Measurement.filter({ id: measurementId });
      return m[0];
    },
    enabled: isEditing
  });

  const { data: measurementItems = [] } = useQuery({
    queryKey: ['measurementItems', measurementId],
    queryFn: () => base44.entities.MeasurementItem.filter({ medicao_id: measurementId }),
    enabled: isEditing
  });

  // Funções para corrigir problema de timezone em datas
  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    // Se já está no formato correto, retorna direto
    if (dateString.includes('-') && dateString.length === 10) {
      return dateString;
    }
    const date = new Date(dateString + 'T00:00:00');
    return date.toISOString().split('T')[0];
  };

  const formatDateForSave = (dateString) => {
    if (!dateString) return '';
    // Retorna a data sem conversão de timezone
    return dateString;
  };

  useEffect(() => {
    if (measurement) {
      setFormData({
        ...measurement,
        data_inicio: formatDateForInput(measurement.data_inicio),
        data_fim: formatDateForInput(measurement.data_fim)
      });
    }
  }, [measurement]);

  useEffect(() => {
    if (measurementItems.length > 0) {
      setItems(measurementItems);
      const quantities = {};
      measurementItems.forEach(item => {
        quantities[item.id] = item.quantidade_executada_periodo || 0;
      });
      setEditableQuantities(quantities);
    }
  }, [measurementItems]);

  const handleObraChange = async (obraId) => {
    const obra = projects.find(p => p.id === obraId);
    setFormData(prev => ({
      ...prev,
      obra_id: obraId,
      obra_nome: obra?.nome || '',
      orcamento_id: ''
    }));
  };

  const handleBudgetChange = async (orcamentoId) => {
    setFormData(prev => ({ ...prev, orcamento_id: orcamentoId }));

    if (!isEditing) {
      // Buscar último número de medição
      const existingMeasurements = await base44.entities.Measurement.filter({ 
        obra_id: formData.obra_id,
        orcamento_id: orcamentoId 
      });
      const lastNumber = existingMeasurements.length > 0 
        ? Math.max(...existingMeasurements.map(m => m.numero_medicao || 0))
        : 0;

      setFormData(prev => ({
        ...prev,
        numero_medicao: lastNumber + 1
      }));

      // Buscar itens do orçamento
      const budgetItems = await base44.entities.BudgetItem.filter({ orcamento_id: orcamentoId });
      
      // Buscar etapas do projeto vinculadas ao orçamento
      const projectStages = await base44.entities.ProjectStage.filter({ orcamento_id: orcamentoId });
      
      // Buscar etapas padrão (BudgetStage)
      const budgetStages = await base44.entities.BudgetStage.list();
      
      // Criar mapa de etapas do projeto por serviço
      const serviceStageMap = {};
      projectStages.forEach(stage => {
        if (stage.servicos_ids && Array.isArray(stage.servicos_ids)) {
          stage.servicos_ids.forEach(servicoId => {
            serviceStageMap[servicoId] = {
              id: stage.id,
              nome: stage.nome,
              budget_stage_id: stage.budget_stage_id
            };
          });
        }
      });

      // Criar mapa de nomes de budget stages
      const budgetStageNames = {};
      budgetStages.forEach(s => {
        budgetStageNames[s.id] = s.nome;
      });
      
      // Buscar última medição para pegar acumulados
      const lastMeasurement = existingMeasurements.length > 0
        ? existingMeasurements.reduce((max, m) => m.numero_medicao > max.numero_medicao ? m : max)
        : null;

      let lastItems = [];
      if (lastMeasurement) {
        lastItems = await base44.entities.MeasurementItem.filter({ medicao_id: lastMeasurement.id });
      }

      const newItems = budgetItems.map(item => {
        const lastItem = lastItems.find(li => li.servico_id === item.servico_id);
        const acumulado = lastItem?.quantidade_executada_acumulada || 0;
        
        // Buscar etapa a partir do stage_id do BudgetItem
        let stageId = item.stage_id;
        let stageName = 'Sem Etapa';
        
        if (stageId && budgetStageNames[stageId]) {
          stageName = budgetStageNames[stageId];
        } else if (item.servico_id && serviceStageMap[item.servico_id]) {
          // Fallback: buscar pela project stage
          const projectStage = serviceStageMap[item.servico_id];
          stageId = projectStage.budget_stage_id || projectStage.id;
          stageName = projectStage.nome;
        }
        
        return {
          servico_id: item.servico_id,
          codigo: item.codigo,
          descricao: item.descricao,
          unidade: item.unidade,
          stage_id: stageId,
          stage_nome: stageName,
          quantidade_orcada: item.quantidade,
          quantidade_executada_periodo: 0,
          quantidade_executada_acumulada: acumulado,
          saldo_a_executar: item.quantidade - acumulado,
          custo_unitario: item.custo_com_bdi_unitario || 0,
          valor_executado_periodo: 0,
          valor_executado_acumulado: acumulado * (item.custo_com_bdi_unitario || 0)
        };
      });

      // Buscar distribuição mensal para cronograma do mês da medição
      const monthlyDistributions = await base44.entities.ServiceMonthlyDistribution.filter({ 
        orcamento_id: orcamentoId,
        mes: formData.numero_medicao
      });
      setScheduleData(monthlyDistributions);

      setItems(newItems);
      const quantities = {};
      newItems.forEach((item, idx) => {
        quantities[idx] = 0;
      });
      setEditableQuantities(quantities);
    }
  };

  const handleQuantityChange = (itemId, value) => {
    const numValue = parseFloat(value) || 0;
    setEditableQuantities(prev => ({
      ...prev,
      [itemId]: numValue
    }));

    setItems(prev => prev.map(item => {
      const id = item.id || prev.indexOf(item);
      if (id === itemId) {
        const executadaPeriodo = numValue;
        const executadaAcumulada = (item.quantidade_executada_acumulada || 0) - (item.quantidade_executada_periodo || 0) + executadaPeriodo;
        const saldo = (item.quantidade_orcada || 0) - executadaAcumulada;
        const valorPeriodo = executadaPeriodo * (item.custo_unitario || 0);
        const valorAcumulado = executadaAcumulada * (item.custo_unitario || 0);

        return {
          ...item,
          quantidade_executada_periodo: executadaPeriodo,
          quantidade_executada_acumulada: executadaAcumulada,
          saldo_a_executar: saldo,
          valor_executado_periodo: valorPeriodo,
          valor_executado_acumulado: valorAcumulado
        };
      }
      return item;
    }));
  };

  const calculateTotals = () => {
    const totalPeriodo = items.reduce((sum, item) => sum + (item.valor_executado_periodo || 0), 0);
    const totalAcumulado = items.reduce((sum, item) => sum + (item.valor_executado_acumulado || 0), 0);
    
    // Buscar valor total do orçamento para calcular percentuais
    const budget = budgets.find(b => b.id === formData.orcamento_id);
    const totalOrcamento = budget?.total_final || 0;
    
    const percentualFisico = totalOrcamento > 0 ? (totalAcumulado / totalOrcamento) * 100 : 0;
    const percentualFinanceiro = percentualFisico; // Simplificado

    return { totalPeriodo, totalAcumulado, percentualFisico, percentualFinanceiro };
  };

  const saveMutation = useMutation({
    mutationFn: async (status) => {
      const { totalPeriodo, totalAcumulado, percentualFisico, percentualFinanceiro } = calculateTotals();
      
      const measurementData = {
        ...formData,
        data_inicio: formatDateForSave(formData.data_inicio),
        data_fim: formatDateForSave(formData.data_fim),
        status,
        valor_total_periodo: totalPeriodo,
        valor_total_acumulado: totalAcumulado,
        percentual_fisico_executado: percentualFisico,
        percentual_financeiro_executado: percentualFinanceiro
      };

      let savedMeasurement;
      if (isEditing) {
        await base44.entities.Measurement.update(measurementId, measurementData);
        savedMeasurement = { ...measurement, ...measurementData };
        
        // Atualizar itens
        for (const item of items) {
          await base44.entities.MeasurementItem.update(item.id, item);
        }
      } else {
        savedMeasurement = await base44.entities.Measurement.create(measurementData);
        
        // Criar itens
        const itemsToCreate = items.map(item => ({
          ...item,
          medicao_id: savedMeasurement.id
        }));
        await base44.entities.MeasurementItem.bulkCreate(itemsToCreate);
      }

      return savedMeasurement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurements'] });
      toast.success('Medição salva com sucesso!');
      setTimeout(() => window.location.href = createPageUrl('Measurements'), 1000);
    },
    onError: () => {
      toast.error('Erro ao salvar medição');
    }
  });

  const totals = calculateTotals();
  const isReadOnly = false; // Sempre editável

  // Group items by stage
  const itemsByStage = {};
  items.forEach(item => {
    const stageName = item.stage_nome || 'Sem Etapa';
    if (!itemsByStage[stageName]) {
      itemsByStage[stageName] = [];
    }
    itemsByStage[stageName].push(item);
  });

  if (loadingMeasurement) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.href = createPageUrl('Measurements')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isEditing ? `Medição #${formData.numero_medicao}` : 'Nova Medição'}
            </h1>
            <p className="text-sm text-slate-500">
              {isEditing ? formData.obra_nome : 'Preencha os dados para criar uma nova medição'}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {isEditing && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  const result = await exportMeasurementXLSX(measurementId);
                  if (result.success) {
                    toast.success(result.message);
                  } else {
                    toast.error(result.message);
                  }
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar XLSX
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const result = await exportMeasurementPDF(measurementId);
                  if (result.success) {
                    toast.success(result.message);
                  } else {
                    toast.error(result.message);
                  }
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Exportar PDF
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate('salva')}
            disabled={saveMutation.isPending || !formData.orcamento_id}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
          <Button
            onClick={() => saveMutation.mutate('aprovada')}
            disabled={saveMutation.isPending || !formData.orcamento_id}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Aprovar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dados" className="space-y-6">
        <TabsList>
          <TabsTrigger value="dados">Dados da Medição</TabsTrigger>
          <TabsTrigger value="servicos" disabled={!formData.orcamento_id}>
            Serviços ({items.length})
          </TabsTrigger>
          <TabsTrigger value="cronograma" disabled={!formData.orcamento_id}>
            Cronograma
          </TabsTrigger>
          <TabsTrigger value="resumo" disabled={!formData.orcamento_id}>
            Resumo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card>
            <CardHeader>
              <CardTitle>Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Obra *</Label>
                  <Select
                    value={formData.obra_id}
                    onValueChange={handleObraChange}
                    disabled={isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a obra" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Orçamento *</Label>
                  <Select
                    value={formData.orcamento_id}
                    onValueChange={handleBudgetChange}
                    disabled={!formData.obra_id || isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o orçamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {budgets
                        .filter(b => b.obra_id === formData.obra_id)
                        .map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.descricao} (v{b.versao})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Período (MM/AAAA) *</Label>
                  <Input
                    value={formData.periodo_referencia}
                    onChange={(e) => setFormData(prev => ({ ...prev, periodo_referencia: e.target.value }))}
                    placeholder="Ex: 01/2026"
                  />
                </div>

                <div>
                  <Label>Nº Medição</Label>
                  <Input
                    type="number"
                    value={formData.numero_medicao}
                    onChange={(e) => setFormData(prev => ({ ...prev, numero_medicao: parseInt(e.target.value) || 1 }))}
                  />
                </div>

                <div>
                  <Label>Data Início</Label>
                  <Input
                    type="date"
                    value={formData.data_inicio}
                    onChange={(e) => setFormData(prev => ({ ...prev, data_inicio: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>Data Fim</Label>
                  <Input
                    type="date"
                    value={formData.data_fim}
                    onChange={(e) => setFormData(prev => ({ ...prev, data_fim: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea
                  value={formData.observacao}
                  onChange={(e) => setFormData(prev => ({ ...prev, observacao: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servicos">
          <Card>
            <CardHeader>
              <CardTitle>Lançamento de Quantidades</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(itemsByStage).map(stageName => (
                <div key={stageName} className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-700 mb-3 pb-2 border-b">
                    {stageName}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Código</th>
                          <th className="px-3 py-2 text-left">Descrição</th>
                          <th className="px-3 py-2 text-center">Un</th>
                          <th className="px-3 py-2 text-right">Orçada</th>
                          <th className="px-3 py-2 text-right">Exec. Período</th>
                          <th className="px-3 py-2 text-right">Exec. Acum.</th>
                          <th className="px-3 py-2 text-right">Saldo</th>
                          <th className="px-3 py-2 text-right">Valor Período</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsByStage[stageName].map((item, idx) => {
                          const itemId = item.id || items.indexOf(item);
                          const hasExceeded = item.quantidade_executada_acumulada > item.quantidade_orcada;
                          
                          return (
                            <tr key={itemId} className={`border-b ${hasExceeded ? 'bg-red-50' : ''}`}>
                              <td className="px-3 py-2 text-slate-600">{item.codigo}</td>
                              <td className="px-3 py-2">{item.descricao}</td>
                              <td className="px-3 py-2 text-center text-slate-600">{item.unidade}</td>
                              <td className="px-3 py-2 text-right font-medium">
                                {(item.quantidade_orcada || 0).toFixed(2)}
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editableQuantities[itemId] || 0}
                                  onChange={(e) => handleQuantityChange(itemId, e.target.value)}
                                  className="w-24 text-right"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-blue-600">
                                {(item.quantidade_executada_acumulada || 0).toFixed(2)}
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${
                                item.saldo_a_executar < 0 ? 'text-red-600' : 'text-slate-700'
                              }`}>
                                {(item.saldo_a_executar || 0).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {new Intl.NumberFormat('pt-BR', { 
                                  style: 'currency', 
                                  currency: 'BRL' 
                                }).format(item.valor_executado_periodo || 0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {items.some(item => item.quantidade_executada_acumulada > item.quantidade_orcada) && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-900">Atenção: Quantidade excedida!</p>
                    <p className="text-sm text-red-700 mt-1">
                      Alguns serviços foram executados acima da quantidade orçada.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cronograma">
          <Card>
            <CardHeader>
              <CardTitle>Cronograma: Previsto vs Executado</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                // Agrupar execução por etapa
                const executionByStage = {};
                items.forEach(item => {
                  const stage = item.stage_nome || 'Sem Etapa';
                  if (!executionByStage[stage]) {
                    executionByStage[stage] = {
                      previsto_periodo: 0,
                      executado_periodo: item.valor_executado_periodo || 0,
                      previsto_acumulado: 0,
                      executado_acumulado: item.valor_executado_acumulado || 0
                    };
                  } else {
                    executionByStage[stage].executado_periodo += item.valor_executado_periodo || 0;
                    executionByStage[stage].executado_acumulado += item.valor_executado_acumulado || 0;
                  }
                });

                // Buscar dados previstos do cronograma para este período
                scheduleData.forEach(dist => {
                  // Buscar a project stage para obter o nome correto
                  const projectStage = projectStages.find(ps => ps.id === dist.project_stage_id);
                  const stageName = projectStage?.nome || 'Sem Etapa';
                  
                  if (!executionByStage[stageName]) {
                    executionByStage[stageName] = {
                      previsto_periodo: 0,
                      executado_periodo: 0,
                      previsto_acumulado: 0,
                      executado_acumulado: 0
                    };
                  }
                  executionByStage[stageName].previsto_periodo += dist.valor_mes || 0;
                });

                return (
                  <div className="space-y-6">
                    {Object.entries(executionByStage).map(([stage, data]) => {
                      const percentPeriodo = data.previsto_periodo > 0 
                        ? (data.executado_periodo / data.previsto_periodo) * 100 
                        : 0;
                      const isOnTrack = percentPeriodo >= 95;
                      const isBehind = percentPeriodo < 80;

                      return (
                        <div key={stage} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-slate-700">{stage}</h4>
                            <span className={`text-sm font-semibold ${
                              isOnTrack ? 'text-green-600' : 
                              isBehind ? 'text-red-600' : 'text-yellow-600'
                            }`}>
                              {percentPeriodo.toFixed(1)}%
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                            <div>
                              <span className="text-slate-500">Previsto Período:</span>
                              <span className="ml-2 font-medium">
                                {new Intl.NumberFormat('pt-BR', { 
                                  style: 'currency', 
                                  currency: 'BRL' 
                                }).format(data.previsto_periodo)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">Executado Período:</span>
                              <span className="ml-2 font-medium text-blue-600">
                                {new Intl.NumberFormat('pt-BR', { 
                                  style: 'currency', 
                                  currency: 'BRL' 
                                }).format(data.executado_periodo)}
                              </span>
                            </div>
                          </div>

                          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                isOnTrack ? 'bg-green-500' : 
                                isBehind ? 'bg-red-500' : 'bg-yellow-500'
                              }`}
                              style={{ width: `${Math.min(percentPeriodo, 100)}%` }}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 mt-1">
                            <div>Acumulado: {new Intl.NumberFormat('pt-BR', { 
                              style: 'currency', 
                              currency: 'BRL',
                              minimumFractionDigits: 0
                            }).format(data.executado_acumulado)}</div>
                          </div>
                        </div>
                      );
                    })}

                    {Object.keys(executionByStage).length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <p>Nenhum dado de cronograma disponível</p>
                        <p className="text-sm mt-2">Configure o cronograma no planejamento do orçamento</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumo">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">
                  Valor Executado - Período
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-slate-900">
                  {new Intl.NumberFormat('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                  }).format(totals.totalPeriodo)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">
                  Valor Executado - Acumulado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">
                  {new Intl.NumberFormat('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                  }).format(totals.totalAcumulado)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">
                  % Físico Executado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <p className="text-2xl font-bold text-green-600">
                    {totals.percentualFisico.toFixed(1)}%
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}