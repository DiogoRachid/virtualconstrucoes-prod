import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Save, CheckCircle, Loader2, AlertTriangle, TrendingUp, FileSpreadsheet, FileText, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from 'recharts';
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
  const [projectStages, setProjectStages] = useState([]);

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

  // Carregar etapas e distribuições quando editando
  useEffect(() => {
    const loadStagesWhenEditing = async () => {
      if (isEditing && formData.orcamento_id && projectStages.length === 0) {
        const stages = await base44.entities.ProjectStage.filter({ orcamento_id: formData.orcamento_id });
        setProjectStages(stages);
        
        const monthlyDistributions = await base44.entities.ServiceMonthlyDistribution.filter({ 
          orcamento_id: formData.orcamento_id
        });
        setScheduleData(monthlyDistributions);
      }
    };
    loadStagesWhenEditing();
  }, [isEditing, formData.orcamento_id, projectStages.length]);

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
      const allBudgetItems = await base44.entities.BudgetItem.filter({ orcamento_id: orcamentoId });
      
      // Buscar etapas do projeto vinculadas ao orçamento
      const projectStages = await base44.entities.ProjectStage.filter({ orcamento_id: orcamentoId });
      
      // Filtrar apenas itens que têm etapa definida
      const budgetItems = allBudgetItems.filter(item => item.stage_id);
      
      // Criar mapa de etapas por ID
      const stageMap = {};
      projectStages.forEach(stage => {
        stageMap[stage.id] = {
          id: stage.id,
          nome: stage.nome,
          descricao: stage.descricao
        };
      });
      
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
        let stageName = stageMap[stageId]?.nome || 'Sem Etapa';
        
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

      // Buscar distribuição mensal para cronograma (todas as distribuições do orçamento)
      const monthlyDistributions = await base44.entities.ServiceMonthlyDistribution.filter({ 
        orcamento_id: orcamentoId
      });
      setScheduleData(monthlyDistributions);
      setProjectStages(projectStages);

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

  // Criar hierarquia de etapas com numeração
  const createStageHierarchy = () => {
    if (!formData.orcamento_id || projectStages.length === 0) return [];
    
    const mainStages = projectStages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);
    const hierarchy = [];
    
    mainStages.forEach((mainStage, mainIdx) => {
      const mainStageItems = items.filter(i => i.stage_id === mainStage.id);
      
      hierarchy.push({
        id: mainStage.id,
        nome: mainStage.nome,
        number: `${mainIdx + 1}.`,
        level: 0,
        items: mainStageItems,
        ordem: mainStage.ordem
      });
      
      const subStages = projectStages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
      subStages.forEach((subStage, subIdx) => {
        const subStageItems = items.filter(i => i.stage_id === subStage.id);
        
        hierarchy.push({
          id: subStage.id,
          nome: subStage.nome,
          number: `${mainIdx + 1}.${subIdx + 1}`,
          level: 1,
          items: subStageItems,
          ordem: subStage.ordem
        });
      });
    });
    
    return hierarchy;
  };
  
  const stageHierarchy = createStageHierarchy();
  
  // Verificar se uma etapa principal tem serviços (diretos ou em subetapas)
  const hasItemsInHierarchy = (stageId) => {
    // Verificar se a própria etapa tem itens
    if (items.some(i => i.stage_id === stageId)) return true;
    
    // Verificar se alguma subetapa tem itens
    return projectStages.some(s => 
      s.parent_stage_id === stageId && items.some(i => i.stage_id === s.id)
    );
  };

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
              {stageHierarchy.map(stage => {
                // Para etapas principais (nível 0), mostrar sempre se tiver itens na hierarquia
                if (stage.level === 0 && !hasItemsInHierarchy(stage.id)) return null;
                
                // Para subetapas (nível 1+), só mostrar se tiver itens diretos
                if (stage.level > 0 && stage.items.length === 0) return null;
                
                const indent = stage.level > 0 ? 'ml-8' : '';
                
                return (
                  <div key={stage.id} className={`mb-6 ${indent}`}>
                    <h3 className={`font-semibold text-slate-700 mb-3 pb-2 border-b ${
                      stage.level === 0 ? 'text-lg' : 'text-base'
                    }`}>
                      {stage.number} {stage.nome}
                    </h3>
                    
                    {stage.items.length > 0 && (
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
                            {stage.items.map((item, itemIdx) => {
                              const itemId = item.id || items.indexOf(item);
                              const hasExceeded = item.quantidade_executada_acumulada > item.quantidade_orcada;
                              const itemNumber = `${stage.number}${itemIdx + 1}`;
                              
                              return (
                                <tr key={itemId} className={`border-b ${hasExceeded ? 'bg-red-50' : ''}`}>
                                  <td className="px-3 py-2 text-slate-600">
                                    <div className="text-xs text-slate-400 mb-1">{itemNumber}</div>
                                    {item.codigo}
                                  </td>
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
                    )}
                  </div>
                );
              })}

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
                // Agrupar execução por etapa PRINCIPAL apenas
                const executionByMainStage = {};
                
                // Primeiro, processar os itens executados
                items.forEach(item => {
                  // Encontrar a etapa principal
                  const itemStage = projectStages.find(s => s.id === item.stage_id);
                  if (!itemStage) return;
                  
                  // Se for subetapa, buscar a etapa pai
                  let mainStage;
                  if (itemStage.parent_stage_id) {
                    mainStage = projectStages.find(s => s.id === itemStage.parent_stage_id);
                  } else {
                    mainStage = itemStage;
                  }
                  
                  if (!mainStage) return;
                  
                  const stageKey = mainStage.id;
                  
                  if (!executionByMainStage[stageKey]) {
                    executionByMainStage[stageKey] = {
                      nome: mainStage.nome,
                      ordem: mainStage.ordem,
                      previsto_periodo: 0,
                      executado_periodo: 0,
                      previsto_acumulado: 0,
                      executado_acumulado: 0,
                      valor_total_etapa: 0,
                      stageId: mainStage.id
                    };
                  }
                  executionByMainStage[stageKey].executado_periodo += item.valor_executado_periodo || 0;
                  executionByMainStage[stageKey].executado_acumulado += item.valor_executado_acumulado || 0;
                  // Calcular valor total da etapa (todos os serviços)
                  executionByMainStage[stageKey].valor_total_etapa += (item.quantidade_orcada || 0) * (item.custo_unitario || 0);
                });

                // Agora calcular o previsto baseado na distribuição mensal das etapas principais
                projectStages.filter(s => !s.parent_stage_id).forEach((stage, idx) => {
                  const stageKey = stage.id;
                  
                  // Verificar se a etapa tem distribuição mensal
                  if (stage.distribuicao_mensal && Array.isArray(stage.distribuicao_mensal)) {
                    // Calcular valor total dessa etapa específica
                    const valorTotalEtapa = executionByMainStage[stageKey]?.valor_total_etapa || 0;
                    
                    if (valorTotalEtapa > 0) {
                      if (!executionByMainStage[stageKey]) {
                        executionByMainStage[stageKey] = {
                          nome: stage.nome,
                          ordem: stage.ordem,
                          previsto_periodo: 0,
                          executado_periodo: 0,
                          previsto_acumulado: 0,
                          executado_acumulado: 0,
                          valor_total_etapa: valorTotalEtapa,
                          stageId: stage.id
                        };
                      }
                      
                      // Calcular previsto do período atual e acumulado
                      stage.distribuicao_mensal.forEach(dist => {
                        const percentual = dist.percentual || 0;
                        const valorMes = (percentual / 100) * valorTotalEtapa;
                        
                        // Previsto do período atual
                        if (dist.mes === formData.numero_medicao) {
                          executionByMainStage[stageKey].previsto_periodo += valorMes;
                        }
                        
                        // Previsto acumulado até este período
                        if (dist.mes <= formData.numero_medicao) {
                          executionByMainStage[stageKey].previsto_acumulado += valorMes;
                        }
                      });
                    }
                  }
                });

                // Ordenar etapas pela ordem e adicionar códigos hierárquicos
                const sortedStages = Object.entries(executionByMainStage)
                  .sort(([, a], [, b]) => a.ordem - b.ordem)
                  .map(([stageId, data], idx) => ({
                    ...data,
                    codigo: `${idx + 1}.`,
                    stageId
                  }));

                return (
                  <div className="space-y-6">
                    {sortedStages.map((stageData) => {
                      const percentExecutadoPeriodo = stageData.previsto_periodo > 0 
                        ? (stageData.executado_periodo / stageData.previsto_periodo) * 100 
                        : 0;
                      const percentExecutadoAcum = stageData.previsto_acumulado > 0 
                        ? (stageData.executado_acumulado / stageData.previsto_acumulado) * 100 
                        : 0;

                      return (
                        <Card key={stageData.stageId}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">
                              {stageData.codigo} {stageData.nome}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-slate-500 mb-1">Previsto Período</p>
                                <p className="text-lg font-semibold text-slate-900">
                                  {new Intl.NumberFormat('pt-BR', { 
                                    style: 'currency', 
                                    currency: 'BRL' 
                                  }).format(stageData.previsto_periodo)}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-slate-500 mb-1">Executado Período</p>
                                <p className="text-lg font-semibold text-blue-600">
                                  {new Intl.NumberFormat('pt-BR', { 
                                    style: 'currency', 
                                    currency: 'BRL' 
                                  }).format(stageData.executado_periodo)}
                                </p>
                                <div className="mt-2">
                                  <div className="w-full bg-slate-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full ${
                                        percentExecutadoPeriodo >= 100 ? 'bg-green-500' : 
                                        percentExecutadoPeriodo >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.min(percentExecutadoPeriodo, 100)}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {percentExecutadoPeriodo.toFixed(1)}% do previsto
                                  </p>
                                </div>
                              </div>
                              
                              <div>
                                <p className="text-sm text-slate-500 mb-1">Previsto Acumulado</p>
                                <p className="text-lg font-semibold text-slate-900">
                                  {new Intl.NumberFormat('pt-BR', { 
                                    style: 'currency', 
                                    currency: 'BRL' 
                                  }).format(stageData.previsto_acumulado)}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-slate-500 mb-1">Executado Acumulado</p>
                                <p className="text-lg font-semibold text-green-600">
                                  {new Intl.NumberFormat('pt-BR', { 
                                    style: 'currency', 
                                    currency: 'BRL' 
                                  }).format(stageData.executado_acumulado)}
                                </p>
                                <div className="mt-2">
                                  <div className="w-full bg-slate-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full ${
                                        percentExecutadoAcum >= 100 ? 'bg-green-500' : 
                                        percentExecutadoAcum >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.min(percentExecutadoAcum, 100)}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {percentExecutadoAcum.toFixed(1)}% do previsto
                                  </p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}

                    {sortedStages.length === 0 && (
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
          <div className="space-y-6">
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

            {/* Gráfico Previsto vs Realizado com Compensação */}
            {(() => {
              // Calcular dados para o gráfico mês a mês
              const budget = budgets.find(b => b.id === formData.orcamento_id);
              if (!budget || projectStages.length === 0) {
                return null;
              }

              // Obter todas as distribuições mensais de todas as etapas principais
              const mainStages = projectStages.filter(s => !s.parent_stage_id);
              
              // Calcular o número total de meses do cronograma
              let maxMes = 0;
              mainStages.forEach(stage => {
                if (stage.distribuicao_mensal && Array.isArray(stage.distribuicao_mensal)) {
                  stage.distribuicao_mensal.forEach(dist => {
                    if (dist.mes > maxMes) maxMes = dist.mes;
                  });
                }
              });

              if (maxMes === 0) return null;

              // Calcular valor total do orçamento por etapa
              const valorPorEtapa = {};
              mainStages.forEach(mainStage => {
                let valorTotal = 0;
                
                // Somar itens da etapa principal
                items.forEach(item => {
                  const itemStage = projectStages.find(s => s.id === item.stage_id);
                  if (!itemStage) return;
                  
                  let etapaPrincipal;
                  if (itemStage.parent_stage_id) {
                    etapaPrincipal = projectStages.find(s => s.id === itemStage.parent_stage_id);
                  } else {
                    etapaPrincipal = itemStage;
                  }
                  
                  if (etapaPrincipal && etapaPrincipal.id === mainStage.id) {
                    valorTotal += (item.quantidade_orcada || 0) * (item.custo_unitario || 0);
                  }
                });
                
                valorPorEtapa[mainStage.id] = valorTotal;
              });

              // Criar array de meses com previsto original
              const chartData = [];
              for (let mes = 1; mes <= maxMes; mes++) {
                let previstoMes = 0;
                
                mainStages.forEach(stage => {
                  if (stage.distribuicao_mensal && Array.isArray(stage.distribuicao_mensal)) {
                    const dist = stage.distribuicao_mensal.find(d => d.mes === mes);
                    if (dist) {
                      const valorEtapa = valorPorEtapa[stage.id] || 0;
                      previstoMes += (dist.percentual / 100) * valorEtapa;
                    }
                  }
                });

                chartData.push({
                  mes: `Mês ${mes}`,
                  mesNumero: mes,
                  previstoOriginal: previstoMes,
                  previsto: previstoMes,
                  realizado: 0
                });
              }

              // Preencher realizado até a medição atual
              // Buscar todas as medições anteriores + atual
              const measurementsPromise = base44.entities.Measurement.filter({ 
                obra_id: formData.obra_id,
                orcamento_id: formData.orcamento_id 
              });

              // Como não podemos usar await aqui, vamos usar uma abordagem síncrona
              // Assumindo que temos apenas a medição atual
              const medicaoAtual = formData.numero_medicao;
              
              // Calcular realizado acumulado até o mês atual
              let realizadoAcumulado = totals.totalAcumulado;
              
              // Distribuir o realizado proporcionalmente até o mês atual
              // (simplificação: assumindo que o acumulado foi distribuído uniformemente)
              if (medicaoAtual > 0 && medicaoAtual <= chartData.length) {
                chartData[medicaoAtual - 1].realizado = totals.totalPeriodo;
              }

              // Calcular compensação para meses futuros
              let compensacaoAcumulada = 0;
              for (let i = 0; i < chartData.length; i++) {
                const mes = chartData[i];
                
                if (mes.mesNumero <= medicaoAtual) {
                  // Para meses já executados, manter previsto original
                  continue;
                }
                
                // Para mês atual, calcular diferença
                if (mes.mesNumero === medicaoAtual + 1) {
                  const diferencaMesAnterior = chartData[medicaoAtual - 1].previsto - chartData[medicaoAtual - 1].realizado;
                  compensacaoAcumulada = diferencaMesAnterior;
                }
                
                // Distribuir compensação proporcionalmente nos meses futuros
                const mesesRestantes = chartData.length - medicaoAtual;
                if (mesesRestantes > 0) {
                  mes.previsto = mes.previstoOriginal + (compensacaoAcumulada / mesesRestantes);
                }
              }

              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Cronograma Físico-Financeiro: Previsto vs Realizado
                    </CardTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      Compensação automática de desvios nos meses subsequentes
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" />
                        <YAxis 
                          tickFormatter={(value) => 
                            new Intl.NumberFormat('pt-BR', { 
                              style: 'currency', 
                              currency: 'BRL',
                              notation: 'compact',
                              maximumFractionDigits: 0
                            }).format(value)
                          }
                        />
                        <Tooltip 
                          formatter={(value) => 
                            new Intl.NumberFormat('pt-BR', { 
                              style: 'currency', 
                              currency: 'BRL' 
                            }).format(value)
                          }
                        />
                        <Legend />
                        <Bar 
                          dataKey="previstoOriginal" 
                          fill="#94a3b8" 
                          name="Previsto Original"
                          opacity={0.5}
                        />
                        <Bar 
                          dataKey="previsto" 
                          fill="#3b82f6" 
                          name="Previsto Ajustado"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="realizado" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          name="Realizado"
                          dot={{ r: 6 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    
                    <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-slate-400 opacity-50"></div>
                        <span className="text-slate-600">Previsto Original</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-600"></div>
                        <span className="text-slate-600">Previsto Ajustado (com compensação)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-600"></div>
                        <span className="text-slate-600">Realizado</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}