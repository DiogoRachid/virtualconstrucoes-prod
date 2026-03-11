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
  const [previousMeasurements, setPreviousMeasurements] = useState([]);
  const [budgetItemsData, setBudgetItemsData] = useState([]);
  const [historicMeasurementData, setHistoricMeasurementData] = useState({});
  const [isLoadingHistoric, setIsLoadingHistoric] = useState(false);

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

  // Carregar medições anteriores e seus items de uma só vez
  useEffect(() => {
    const loadPreviousMeasurementsWithItems = async () => {
      if (!formData.obra_id || !formData.orcamento_id) {
        setPreviousMeasurements([]);
        setHistoricMeasurementData({});
        setIsLoadingHistoric(false);
        return;
      }

      setIsLoadingHistoric(true);
      
      try {
        // Buscar todas as medições
        const allMeasurements = await base44.entities.Measurement.filter({ 
          obra_id: formData.obra_id,
          orcamento_id: formData.orcamento_id
        });
        
        // Ordenar por número de medição
        const sortedMeasurements = allMeasurements.sort((a, b) => a.numero_medicao - b.numero_medicao);
        setPreviousMeasurements(sortedMeasurements);
        
        // Buscar todos os items de todas as medições de uma vez
        const mesAtual = formData.numero_medicao || 1;
        const histMap = {};
        
        if (mesAtual > 1) {
          const previousMeds = sortedMeasurements.filter(m => m.numero_medicao < mesAtual);

          // Carregar etapas diretamente aqui para garantir que estejam disponíveis
          const stages = await base44.entities.ProjectStage.filter({ orcamento_id: formData.orcamento_id });
          if (stages.length > 0) {
            setProjectStages(stages);
          }
          const stagesToUse = stages.length > 0 ? stages : projectStages;
          
          for (const prevMed of previousMeds) {
            const itemsFromMed = await base44.entities.MeasurementItem.filter({ 
              medicao_id: prevMed.id
            });
            
            const prevMainStages = stagesToUse.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);
            
            prevMainStages.forEach((mainStage, mainIdx) => {
              const mainStageItems = itemsFromMed.filter(i => i.stage_id === mainStage.id);
              mainStageItems.forEach((item, itemIdx) => {
                const itemNumber = `${mainIdx + 1}.${itemIdx + 1}`;
                const key = `${itemNumber}_${prevMed.numero_medicao}`;
                histMap[key] = item.quantidade_executada_periodo || 0;
              });
              
              const subStages = stagesToUse.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
              subStages.forEach((subStage, subIdx) => {
                const subStageItems = itemsFromMed.filter(i => i.stage_id === subStage.id);
                subStageItems.forEach((item, itemIdx) => {
                  const itemNumber = `${mainIdx + 1}.${subIdx + 1}.${itemIdx + 1}`;
                  const key = `${itemNumber}_${prevMed.numero_medicao}`;
                  histMap[key] = item.quantidade_executada_periodo || 0;
                });
              });
            });
          }
        }
        
        setHistoricMeasurementData(histMap);
        console.log('Dados históricos carregados:', histMap);
      } catch (error) {
        console.error('Erro ao carregar medições:', error);
      } finally {
        setIsLoadingHistoric(false);
      }
    };
    
    loadPreviousMeasurementsWithItems();
  }, [formData.obra_id, formData.orcamento_id, formData.numero_medicao]);

  // Carregar custos do orçamento para planilha
  useEffect(() => {
    const loadBudgetItemsCosts = async () => {
      if (formData.orcamento_id) {
        const budgetItems = await base44.entities.BudgetItem.filter({ 
          orcamento_id: formData.orcamento_id 
        });
        setBudgetItemsData(budgetItems);
      }
    };
    loadBudgetItemsCosts();
  }, [formData.orcamento_id]);

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
        // Buscar pela numeração hierárquica: mesmo stage_id E mesmo servico_id
        const lastItem = lastItems.find(li => 
          li.servico_id === item.servico_id && li.stage_id === item.stage_id
        );
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
          custo_unitario_material: item.custo_unitario_material || 0,
          custo_unitario_mao_obra: item.custo_unitario_mao_obra || 0,
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
          <TabsTrigger value="planilha" disabled={!formData.orcamento_id}>
            Planilha de Medição
          </TabsTrigger>
          <TabsTrigger value="curvas" disabled={!formData.orcamento_id}>
            Curva S
          </TabsTrigger>
          <TabsTrigger value="cronograma" disabled={!formData.orcamento_id}>
            Cronograma
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
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 border text-left">Nº</th>
                      <th className="px-2 py-2 border text-left">Código</th>
                      <th className="px-2 py-2 border text-left">Descrição</th>
                      <th className="px-2 py-2 border text-center">Un</th>
                      <th className="px-2 py-2 border text-right">Qtd. Orçada</th>
                      <th className="px-2 py-2 border text-right bg-blue-50">Qtd. Exec. Período</th>
                      <th className="px-2 py-2 border text-right">Qtd. Exec. Acum.</th>
                      <th className="px-2 py-2 border text-right">Saldo</th>
                      <th className="px-2 py-2 border text-right">Valor Período</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageHierarchy.map((stage, stageIdx) => {
                      if (stage.level === 0 && !hasItemsInHierarchy(stage.id)) return null;
                      if (stage.level > 0 && stage.items.length === 0) return null;
                      
                      return (
                        <React.Fragment key={stage.id}>
                          <tr className={`bg-slate-100 font-semibold ${stage.level === 0 ? 'text-base' : 'text-sm'}`}>
                            <td className="px-2 py-2 border" colSpan="9" style={{ paddingLeft: `${stage.level * 20 + 8}px` }}>
                              {stage.number} {stage.nome}
                            </td>
                          </tr>
                          {stage.items.map((item, itemIdx) => {
                            const itemId = item.id || items.indexOf(item);
                            const hasExceeded = item.quantidade_executada_acumulada > item.quantidade_orcada;
                            const itemNumber = `${stage.number}.${itemIdx + 1}`;
                            
                            return (
                              <tr key={itemId} className={`hover:bg-slate-50 ${hasExceeded ? 'bg-red-50' : ''}`}>
                                <td className="px-2 py-1 border text-xs text-slate-500">{itemNumber}</td>
                                <td className="px-2 py-1 border text-xs">{item.codigo}</td>
                                <td className="px-2 py-1 border text-xs">{item.descricao}</td>
                                <td className="px-2 py-1 border text-center text-xs">{item.unidade}</td>
                                <td className="px-2 py-1 border text-right text-xs font-medium">
                                  {(item.quantidade_orcada || 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-1 border bg-blue-50">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={editableQuantities[itemId] || 0}
                                    onChange={(e) => handleQuantityChange(itemId, e.target.value)}
                                    className="w-24 text-right text-xs"
                                  />
                                </td>
                                <td className="px-2 py-1 border text-right text-xs font-semibold text-blue-600">
                                  {(item.quantidade_executada_acumulada || 0).toFixed(2)}
                                </td>
                                <td className={`px-2 py-1 border text-right text-xs font-medium ${
                                  item.saldo_a_executar < 0 ? 'text-red-600' : 'text-slate-700'
                                }`}>
                                  {(item.saldo_a_executar || 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-1 border text-right text-xs font-medium">
                                  {new Intl.NumberFormat('pt-BR', { 
                                    style: 'currency', 
                                    currency: 'BRL' 
                                  }).format(item.valor_executado_periodo || 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

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

        <TabsContent value="planilha">
          <Card>
            <CardHeader>
              <CardTitle>Planilha Detalhada de Medição</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                // Criar mapa de custos por serviço
                const costMap = {};
                budgetItemsData.forEach(bi => {
                  costMap[bi.servico_id] = {
                    material: bi.custo_unitario_material || 0,
                    mao_obra: bi.custo_unitario_mao_obra || 0
                  };
                });
                
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-3 py-2 text-left border">Código</th>
                          <th className="px-3 py-2 text-left border">Descrição</th>
                          <th className="px-3 py-2 text-center border">Un</th>
                          <th className="px-3 py-2 text-right border">Qtd. Orçada</th>
                          <th className="px-3 py-2 text-right border bg-blue-50">Qtd. Medida</th>
                          <th className="px-3 py-2 text-right border">Saldo a Medir</th>
                          <th className="px-3 py-2 text-right border">Material (R$)</th>
                          <th className="px-3 py-2 text-right border">Mão de Obra (R$)</th>
                          <th className="px-3 py-2 text-right border">Total Direto (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageHierarchy.map(stage => {
                          if (stage.level === 0 && !hasItemsInHierarchy(stage.id)) return null;
                          if (stage.level > 0 && stage.items.length === 0) return null;
                          
                          return (
                            <React.Fragment key={stage.id}>
                              <tr className="bg-slate-50 font-semibold">
                                <td colSpan="9" className="px-3 py-2 border" style={{ paddingLeft: `${stage.level * 20 + 12}px` }}>
                                  {stage.number} {stage.nome}
                                </td>
                              </tr>
                              {stage.items.map((item, itemIdx) => {
                                const itemId = item.id || items.indexOf(item);
                                const qtdMedida = parseFloat(editableQuantities[itemId] || 0);
                                const costs = costMap[item.servico_id] || { material: 0, mao_obra: 0 };
                                const valorMaterial = qtdMedida * costs.material;
                                const valorMaoObra = qtdMedida * costs.mao_obra;
                                const totalDireto = valorMaterial + valorMaoObra;
                                const itemNumber = `${stage.number}.${itemIdx + 1}`;
                                
                                return (
                                  <tr key={itemId} className="border-b hover:bg-slate-50">
                                    <td className="px-3 py-2 border">
                                      <div className="text-xs text-slate-400">{itemNumber}</div>
                                      <div className="text-slate-600">{item.codigo}</div>
                                    </td>
                                    <td className="px-3 py-2 border">{item.descricao}</td>
                                    <td className="px-3 py-2 text-center border">{item.unidade}</td>
                                    <td className="px-3 py-2 text-right border font-medium">
                                      {(item.quantidade_orcada || 0).toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 border bg-blue-50">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editableQuantities[itemId] || 0}
                                        onChange={(e) => handleQuantityChange(itemId, e.target.value)}
                                        className="w-24 text-right"
                                      />
                                    </td>
                                    <td className={`px-3 py-2 text-right border font-medium ${
                                      item.saldo_a_executar < 0 ? 'text-red-600' : 'text-slate-700'
                                    }`}>
                                      {(item.saldo_a_executar || 0).toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 text-right border">
                                      {new Intl.NumberFormat('pt-BR', { 
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      }).format(valorMaterial)}
                                    </td>
                                    <td className="px-3 py-2 text-right border">
                                      {new Intl.NumberFormat('pt-BR', { 
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      }).format(valorMaoObra)}
                                    </td>
                                    <td className="px-3 py-2 text-right border font-semibold">
                                      {new Intl.NumberFormat('pt-BR', { 
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      }).format(totalDireto)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-200 font-bold">
                        <tr>
                          <td colSpan="6" className="px-3 py-3 text-right border">TOTAL DIRETO:</td>
                          <td className="px-3 py-3 text-right border">
                            {(() => {
                              const totalMaterial = items.reduce((sum, item) => {
                                const itemId = item.id || items.indexOf(item);
                                const qtd = parseFloat(editableQuantities[itemId] || 0);
                                const costs = costMap[item.servico_id] || { material: 0 };
                                return sum + (qtd * costs.material);
                              }, 0);
                              return new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(totalMaterial);
                            })()}
                          </td>
                          <td className="px-3 py-3 text-right border">
                            {(() => {
                              const totalMaoObra = items.reduce((sum, item) => {
                                const itemId = item.id || items.indexOf(item);
                                const qtd = parseFloat(editableQuantities[itemId] || 0);
                                const costs = costMap[item.servico_id] || { mao_obra: 0 };
                                return sum + (qtd * costs.mao_obra);
                              }, 0);
                              return new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(totalMaoObra);
                            })()}
                          </td>
                          <td className="px-3 py-3 text-right border">
                            {(() => {
                              const totalDireto = items.reduce((sum, item) => {
                                const itemId = item.id || items.indexOf(item);
                                const qtd = parseFloat(editableQuantities[itemId] || 0);
                                const costs = costMap[item.servico_id] || { material: 0, mao_obra: 0 };
                                return sum + (qtd * (costs.material + costs.mao_obra));
                              }, 0);
                              return new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(totalDireto);
                            })()}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan="6" className="px-3 py-3 text-right border">BDI ({(() => {
                            const budget = budgets.find(b => b.id === formData.orcamento_id);
                            return budget?.bdi_padrao || 30;
                          })()}%):</td>
                          <td colSpan="3" className="px-3 py-3 text-right border">
                            {(() => {
                              const totalDireto = items.reduce((sum, item) => {
                                const itemId = item.id || items.indexOf(item);
                                const qtd = parseFloat(editableQuantities[itemId] || 0);
                                const costs = costMap[item.servico_id] || { material: 0, mao_obra: 0 };
                                return sum + (qtd * (costs.material + costs.mao_obra));
                              }, 0);
                              const budget = budgets.find(b => b.id === formData.orcamento_id);
                              const bdiPercentual = budget?.bdi_padrao || 30;
                              const valorBdi = totalDireto * (bdiPercentual / 100);
                              return new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(valorBdi);
                            })()}
                          </td>
                        </tr>
                        <tr className="text-lg">
                          <td colSpan="6" className="px-3 py-3 text-right border">TOTAL COM BDI:</td>
                          <td colSpan="3" className="px-3 py-3 text-right border text-blue-600">
                            {(() => {
                              const totalDireto = items.reduce((sum, item) => {
                                const itemId = item.id || items.indexOf(item);
                                const qtd = parseFloat(editableQuantities[itemId] || 0);
                                const costs = costMap[item.servico_id] || { material: 0, mao_obra: 0 };
                                return sum + (qtd * (costs.material + costs.mao_obra));
                              }, 0);
                              const budget = budgets.find(b => b.id === formData.orcamento_id);
                              const bdiPercentual = budget?.bdi_padrao || 30;
                              const totalComBdi = totalDireto * (1 + bdiPercentual / 100);
                              return new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(totalComBdi);
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curvas">
          <Card>
            <CardHeader>
              <CardTitle>Curva S: Planejamento vs Execução</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const budget = budgets.find(b => b.id === formData.orcamento_id);
                const totalMeses = budget?.duracao_meses || 12;
                const mesAtual = formData.numero_medicao || 1;
                
                // Buscar todas as medições até agora
                const medicoesAteAgora = previousMeasurements
                  .filter(m => m.numero_medicao <= mesAtual)
                  .sort((a, b) => a.numero_medicao - b.numero_medicao);
                
                // Curva planejada: usar distribuição mensal do planejamento (sem cálculo adicional)
                const curvaPlaneada = [];
                const distribuicoes = scheduleData || [];
                
                for (let mes = 1; mes <= totalMeses; mes++) {
                  const valorAcumulado = distribuicoes
                    .filter(d => d.mes <= mes)
                    .reduce((sum, d) => sum + (d.valor_mes || 0), 0);
                  
                  const percentual = budget?.total_final ? (valorAcumulado / budget.total_final) * 100 : 0;
                  
                  curvaPlaneada.push({
                    mes,
                    planejado: percentual
                  });
                }
                
                // Calcular curva executada (baseada nas medições acumuladas)
                const curvaExecutada = [];
                let acumuladoExecucao = 0;
                
                for (let mes = 1; mes <= totalMeses; mes++) {
                  const medicaoMes = medicoesAteAgora.find(m => m.numero_medicao === mes);
                  
                  if (medicaoMes) {
                    acumuladoExecucao = medicaoMes.valor_total_acumulado || 0;
                  }
                  
                  const percentualExec = budget?.total_final ? (acumuladoExecucao / budget.total_final) * 100 : 0;
                  
                  curvaExecutada.push({
                    mes,
                    executado: mes <= mesAtual ? percentualExec : null
                  });
                }
                
                // Combinar dados
                const chartData = [];
                for (let mes = 1; mes <= totalMeses; mes++) {
                  chartData.push({
                    mes: `M${mes}`,
                    planejado: curvaPlaneada[mes - 1]?.planejado || 0,
                    executado: curvaExecutada[mes - 1]?.executado
                  });
                }
                
                const execucaoAcumulada = acumuladoExecucao;
                const planejamantoAcumulado = curvaPlaneada[mesAtual - 1]?.planejado || 0;
                const valorTotalOrcamento = budget?.total_final || 0;
                const planejadoValor = (planejamantoAcumulado / 100) * valorTotalOrcamento;
                const diferenca = execucaoAcumulada - planejadoValor;
                
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-slate-500">Planejado (Mês {mesAtual})</p>
                          <p className="text-2xl font-bold text-slate-900">
                            {planejamantoAcumulado.toFixed(1)}%
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-slate-500">Executado (Mês {mesAtual})</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {((execucaoAcumulada / valorTotalOrcamento) * 100).toFixed(1)}%
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-slate-500">Diferença</p>
                          <p className={`text-2xl font-bold ${diferenca >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {diferenca >= 0 ? '+' : ''}{((diferenca / valorTotalOrcamento) * 100).toFixed(1)}%
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" />
                        <YAxis label={{ value: '% Execução', angle: -90, position: 'insideLeft' }} />
                        <Tooltip />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="planejado" 
                          stroke="#64748b" 
                          strokeWidth={2}
                          name="Planejado"
                          dot={false}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="executado" 
                          stroke="#2563eb" 
                          strokeWidth={3}
                          name="Executado"
                          connectNulls={false}
                          dot={{ r: 5 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <h4 className="font-semibold mb-2">Interpretação:</h4>
                      <ul className="text-sm space-y-1 text-slate-600">
                        <li><span className="font-medium text-slate-700">Planejado:</span> Curva S do planejamento original</li>
                        <li><span className="font-medium text-blue-600">Executado:</span> Progresso real baseado nas medições acumuladas</li>
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cronograma">
          <Card>
            <CardHeader>
              <CardTitle>Cronograma de Medições</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                if (!formData.orcamento_id) {
                  return (
                    <div className="text-center py-12 text-slate-500">
                      <p className="text-lg mb-2">Selecione um orçamento</p>
                    </div>
                  );
                }
                
                if (isLoadingHistoric) {
                  return (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  );
                }
                
                const budget = budgets.find(b => b.id === formData.orcamento_id);
                const bdiPercentual = budget?.bdi_padrao || 30;
                const mesAtual = formData.numero_medicao || 1;
                
                // Criar mapa de custos unitários
                const costMap = {};
                budgetItemsData.forEach(bi => {
                  costMap[bi.servico_id] = {
                    material: bi.custo_unitario_material || 0,
                    mao_obra: bi.custo_unitario_mao_obra || 0
                  };
                });
                
                // Montar dados por serviço com hierarquia incluindo etapas
                const servicosData = [];
                stageHierarchy.forEach(stage => {
                  if (stage.level === 0 && !hasItemsInHierarchy(stage.id)) return;
                  if (stage.level > 0 && stage.items.length === 0) return;
                  
                  // Adicionar linha de etapa (macro serviço)
                  servicosData.push({
                    isStage: true,
                    numero: stage.number,
                    nome: stage.nome,
                    level: stage.level
                  });
                  
                  // Adicionar itens da etapa
                  stage.items.forEach((item, itemIdx) => {
                    const costs = costMap[item.servico_id] || { material: 0, mao_obra: 0 };
                    const itemNumber = `${stage.number}.${itemIdx + 1}`;
                    
                    // Buscar distribuição planejada do cronograma
                    const distribuicaoPlanejada = {};
                    scheduleData.forEach(dist => {
                      if (dist.servico_id === item.servico_id && dist.project_stage_id === item.stage_id) {
                        distribuicaoPlanejada[dist.mes] = dist.quantidade || 0;
                      }
                    });
                    
                    // Calcular para cada medição até a atual
                    const medicoes = [];
                    let qtdAcumulada = 0;
                    
                    // Buscar todas as medições anteriores deste item
                    for (let numMed = 1; numMed <= mesAtual; numMed++) {
                      let qtdExecutada = 0;
                      
                      if (numMed === mesAtual) {
                        // Medição atual
                        qtdExecutada = item.quantidade_executada_periodo || 0;
                      } else {
                        // Medições anteriores - buscar do histórico
                        const key = `${itemNumber}_${numMed}`;
                        qtdExecutada = historicMeasurementData[key] || 0;
                      }
                      
                      qtdAcumulada += qtdExecutada;
                      const valorMaterial = qtdExecutada * costs.material;
                      const valorMaoObra = qtdExecutada * costs.mao_obra;
                      const qtdAMedir = (item.quantidade_orcada || 0) - qtdAcumulada;
                      
                      // Quantidade prevista ajustada para este mês
                      let qtdPrevistaAjustada = distribuicaoPlanejada[numMed] || 0;
                      
                      // Se não há mais saldo, prevista = 0
                      if (qtdAMedir <= 0) {
                        qtdPrevistaAjustada = 0;
                      } else if (numMed > 1) {
                        // Ajustar com base na diferença do mês anterior
                        const medAnterior = medicoes[numMed - 2];
                        if (medAnterior) {
                          const diferencaAnterior = medAnterior.qtdExecutada - medAnterior.qtdPrevista;
                          // Redistribuir a diferença
                          qtdPrevistaAjustada = Math.max(0, qtdPrevistaAjustada - diferencaAnterior);
                        }
                      }
                      
                      medicoes.push({
                        numero: numMed,
                        qtdPrevista: qtdPrevistaAjustada,
                        qtdExecutada,
                        valorMaterial,
                        valorMaoObra,
                        qtdAcumulada,
                        qtdAMedir
                      });
                    }
                    
                    servicosData.push({
                      isStage: false,
                      numero: itemNumber,
                      codigo: item.codigo,
                      descricao: item.descricao,
                      unidade: item.unidade,
                      quantidadeOrcada: item.quantidade_orcada || 0,
                      valorMaterialUnitario: costs.material,
                      valorMaoObraUnitario: costs.mao_obra,
                      medicoes
                    });
                  });
                });
                
                // Calcular totais por medição
                const totaisPorMedicao = [];
                for (let numMed = 1; numMed <= mesAtual; numMed++) {
                  let totalMaterial = 0;
                  let totalMaoObra = 0;
                  
                  servicosData.forEach(s => {
                    if (!s.isStage && s.medicoes) {
                      const med = s.medicoes.find(m => m.numero === numMed);
                      if (med) {
                        totalMaterial += med.valorMaterial;
                        totalMaoObra += med.valorMaoObra;
                      }
                    }
                  });
                  
                  const subtotal = totalMaterial + totalMaoObra;
                  const valorBdi = subtotal * (bdiPercentual / 100);
                  const totalComBdi = subtotal + valorBdi;
                  
                  totaisPorMedicao.push({
                    numero: numMed,
                    totalMaterial,
                    totalMaoObra,
                    subtotal,
                    valorBdi,
                    totalComBdi
                  });
                }


                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 border text-left" rowSpan="2">Nº</th>
                          <th className="px-2 py-2 border text-left" rowSpan="2">Código</th>
                          <th className="px-2 py-2 border text-left" rowSpan="2">Descrição</th>
                          <th className="px-2 py-2 border text-center" rowSpan="2">Un</th>
                          <th className="px-2 py-2 border text-right" rowSpan="2">Mat. Unit.</th>
                          <th className="px-2 py-2 border text-right" rowSpan="2">M.O. Unit.</th>
                          <th className="px-2 py-2 border text-right" rowSpan="2">Qtd Prev.</th>
                          {totaisPorMedicao.map(t => (
                            <th key={t.numero} className="px-2 py-2 border text-center bg-blue-50" colSpan="5">
                              Medição {t.numero}
                            </th>
                          ))}
                          <th className="px-2 py-2 border text-center bg-green-100" colSpan="4">
                            Acumulado
                          </th>
                          </tr>
                          <tr>
                          {totaisPorMedicao.map(t => (
                            <React.Fragment key={t.numero}>
                              <th className="px-2 py-1 border text-right text-xs bg-blue-50">Qtd Exec.</th>
                              <th className="px-2 py-1 border text-right text-xs bg-blue-50">Vlr Mat.</th>
                              <th className="px-2 py-1 border text-right text-xs bg-blue-50">Vlr M.O.</th>
                              <th className="px-2 py-1 border text-right text-xs bg-blue-50">Qtd Acum.</th>
                              <th className="px-2 py-1 border text-right text-xs bg-blue-50">Qtd a Medir</th>
                            </React.Fragment>
                          ))}
                          <th className="px-2 py-1 border text-right text-xs bg-green-100">Qtd Acum.</th>
                          <th className="px-2 py-1 border text-right text-xs bg-green-100">Vlr Mat.</th>
                          <th className="px-2 py-1 border text-right text-xs bg-green-100">Vlr M.O.</th>
                          <th className="px-2 py-1 border text-right text-xs bg-green-100">Qtd a Medir</th>
                          </tr>
                      </thead>
                      <tbody>
                        {servicosData.map((servico, idx) => {
                          if (servico.isStage) {
                            // Linha de etapa (macro serviço)
                            return (
                              <tr key={idx} className={`bg-slate-100 font-semibold ${servico.level === 0 ? 'text-base' : 'text-sm'}`}>
                                <td className="px-2 py-2 border" colSpan={7 + (totaisPorMedicao.length * 5)} style={{ paddingLeft: `${servico.level * 20 + 8}px` }}>
                                  {servico.numero} {servico.nome}
                                </td>
                              </tr>
                            );
                          } else {
                            // Linha de serviço
                            return (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-2 py-1 border text-xs text-slate-500">{servico.numero}</td>
                                <td className="px-2 py-1 border text-xs">{servico.codigo}</td>
                                <td className="px-2 py-1 border text-xs">{servico.descricao}</td>
                                <td className="px-2 py-1 border text-center text-xs">{servico.unidade}</td>
                                <td className="px-2 py-1 border text-right text-xs">
                                  {servico.valorMaterialUnitario.toFixed(2)}
                                </td>
                                <td className="px-2 py-1 border text-right text-xs">
                                  {servico.valorMaoObraUnitario.toFixed(2)}
                                </td>
                                <td className="px-2 py-1 border text-right text-xs font-medium">
                                  {(servico.quantidadeOrcada || 0).toFixed(2)}
                                </td>
                                {servico.medicoes.map(med => (
                                  <React.Fragment key={med.numero}>
                                    <td className="px-2 py-1 border text-right text-xs bg-blue-50 font-semibold">
                                      {med.qtdExecutada.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1 border text-right text-xs bg-blue-50">
                                      {med.valorMaterial.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1 border text-right text-xs bg-blue-50">
                                      {med.valorMaoObra.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1 border text-right text-xs bg-blue-50 font-medium">
                                      {med.qtdAcumulada.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1 border text-right text-xs bg-blue-50">
                                      {med.qtdAMedir.toFixed(2)}
                                    </td>
                                  </React.Fragment>
                                ))}
                              </tr>
                            );
                          }
                        })}
                        
                        <tr className="bg-slate-200 font-bold">
                          <td colSpan="7" className="px-2 py-2 border text-right">SUBTOTAL MATERIAL:</td>
                          {totaisPorMedicao.map(t => (
                            <React.Fragment key={`mat-${t.numero}`}>
                              <td className="px-2 py-2 border"></td>
                              <td className="px-2 py-2 border text-right" colSpan="2">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.totalMaterial)}
                              </td>
                              <td className="px-2 py-2 border" colSpan="2"></td>
                            </React.Fragment>
                          ))}
                        </tr>
                        
                        <tr className="bg-slate-200 font-bold">
                          <td colSpan="7" className="px-2 py-2 border text-right">SUBTOTAL MÃO DE OBRA:</td>
                          {totaisPorMedicao.map(t => (
                            <React.Fragment key={`mo-${t.numero}`}>
                              <td className="px-2 py-2 border"></td>
                              <td className="px-2 py-2 border text-right" colSpan="2">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.totalMaoObra)}
                              </td>
                              <td className="px-2 py-2 border" colSpan="2"></td>
                            </React.Fragment>
                          ))}
                        </tr>
                        
                        <tr className="bg-slate-200 font-bold">
                          <td colSpan="7" className="px-2 py-2 border text-right">BDI ({bdiPercentual}%):</td>
                          {totaisPorMedicao.map(t => (
                            <React.Fragment key={`bdi-${t.numero}`}>
                              <td className="px-2 py-2 border"></td>
                              <td className="px-2 py-2 border text-right" colSpan="2">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valorBdi)}
                              </td>
                              <td className="px-2 py-2 border" colSpan="2"></td>
                            </React.Fragment>
                          ))}
                        </tr>
                        
                        <tr className="bg-slate-300 font-bold text-blue-700">
                          <td colSpan="7" className="px-2 py-2 border text-right">TOTAL COM BDI:</td>
                          {totaisPorMedicao.map(t => (
                            <React.Fragment key={`total-${t.numero}`}>
                              <td className="px-2 py-2 border"></td>
                              <td className="px-2 py-2 border text-right" colSpan="2">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.totalComBdi)}
                              </td>
                              <td className="px-2 py-2 border" colSpan="2"></td>
                            </React.Fragment>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>
    </div>
  );
}