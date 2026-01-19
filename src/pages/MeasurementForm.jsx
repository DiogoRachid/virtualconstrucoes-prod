import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, FileText, FileSpreadsheet, BarChart3 } from "lucide-react";
import { format } from 'date-fns';
import MeasurementChart from "@/components/measurements/MeasurementChart";
import { exportMeasurementToPDF, exportMeasurementToExcel } from "@/components/measurements/MeasurementExporter";

export default function MeasurementFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const measurementId = searchParams.get('id');
  const budgetIdFromUrl = searchParams.get('budgetId');

  const [measurement, setMeasurement] = useState({
    numero_medicao: 1,
    mes_referencia: 1,
    status: 'rascunho'
  });
  const [items, setItems] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [stages, setStages] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [allMeasurements, setAllMeasurements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBudgets();
    if (measurementId) {
      loadMeasurement();
    } else if (budgetIdFromUrl) {
      loadBudgetData(budgetIdFromUrl);
    }
  }, [measurementId, budgetIdFromUrl]);

  const loadBudgets = async () => {
    const data = await base44.entities.Budget.list();
    setBudgets(data);
  };

  const loadMeasurement = async () => {
    setLoading(true);
    const data = await base44.entities.Measurement.filter({ id: measurementId }).then(r => r[0]);
    if (data) {
      setMeasurement(data);
      
      const measurementItems = await base44.entities.MeasurementItem.filter({ medicao_id: measurementId });
      setItems(measurementItems);
      
      if (data.orcamento_id) {
        await loadBudgetData(data.orcamento_id);
      }
    }
    setLoading(false);
  };

  const loadBudgetData = async (budgetId) => {
    const budget = await base44.entities.Budget.filter({ id: budgetId }).then(r => r[0]);
    if (!budget) return;

    // Carregar medições existentes para este orçamento
    const existingMeasurements = await base44.entities.Measurement.filter({ orcamento_id: budgetId });
    setAllMeasurements(existingMeasurements);
    
    // Determinar próximo número de medição
    if (!measurementId && existingMeasurements.length > 0) {
      const maxNum = Math.max(...existingMeasurements.map(m => m.numero_medicao || 0));
      setMeasurement(prev => ({ 
        ...prev, 
        numero_medicao: maxNum + 1,
        orcamento_id: budgetId,
        orcamento_nome: budget.descricao,
        obra_id: budget.obra_id,
        obra_nome: budget.obra_nome
      }));
    } else if (!measurementId) {
      setMeasurement(prev => ({
        ...prev,
        orcamento_id: budgetId,
        orcamento_nome: budget.descricao,
        obra_id: budget.obra_id,
        obra_nome: budget.obra_nome
      }));
    }

    // Carregar itens do orçamento
    const budgetItemsData = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
    setBudgetItems(budgetItemsData);

    // Carregar etapas
    const stagesData = await base44.entities.BudgetStage.filter({ orcamento_id: budgetId });
    setStages(stagesData.sort((a, b) => a.ordem - b.ordem));

    // Carregar cronograma
    const scheduleData = await base44.entities.ServiceMonthlyDistribution.filter({ orcamento_id: budgetId });
    setSchedule(scheduleData);

    // Se não houver itens de medição ainda, inicializar
    if (!measurementId) {
      initializeItems(budgetItemsData, scheduleData, budget);
    }
  };

  const initializeItems = (budgetItemsData, scheduleData, budget) => {
    const mesRef = measurement.mes_referencia || 1;
    
    const initialItems = budgetItemsData.map(budgetItem => {
      // Buscar quantidade prevista para o mês
      const scheduleItem = scheduleData.find(s => 
        s.budget_item_id === budgetItem.id && s.mes === mesRef
      );
      
      const qtdPrevista = scheduleItem ? (scheduleItem.percentual_mes / 100) * budgetItem.quantidade : 0;
      
      return {
        orcamento_item_id: budgetItem.id,
        stage_id: budgetItem.stage_id,
        stage_nome: stages.find(s => s.id === budgetItem.stage_id)?.nome || '',
        codigo: budgetItem.codigo,
        descricao: budgetItem.descricao,
        unidade: budgetItem.unidade,
        quantidade_orcamento: budgetItem.quantidade,
        quantidade_prevista_mes: qtdPrevista,
        quantidade_executada: 0,
        quantidade_acumulada: 0,
        valor_unitario: budgetItem.custo_com_bdi_unitario || 0,
        valor_executado: 0,
        percentual_executado: 0
      };
    });
    
    setItems(initialItems);
  };

  const handleBudgetChange = (budgetId) => {
    if (!budgetId) return;
    loadBudgetData(budgetId);
  };

  const handleMesReferenciaChange = (mes) => {
    setMeasurement(prev => ({ ...prev, mes_referencia: parseInt(mes) }));
    
    // Recalcular quantidades previstas
    if (budgetItems.length > 0 && schedule.length > 0) {
      const updatedItems = items.map(item => {
        const scheduleItem = schedule.find(s => 
          s.budget_item_id === item.orcamento_item_id && s.mes === parseInt(mes)
        );
        
        const qtdPrevista = scheduleItem ? 
          (scheduleItem.percentual_mes / 100) * item.quantidade_orcamento : 0;
        
        return {
          ...item,
          quantidade_prevista_mes: qtdPrevista
        };
      });
      
      setItems(updatedItems);
    }
  };

  const handleQuantityChange = (index, value) => {
    const newItems = [...items];
    const qtdExec = parseFloat(value) || 0;
    
    newItems[index].quantidade_executada = qtdExec;
    newItems[index].valor_executado = qtdExec * newItems[index].valor_unitario;
    newItems[index].percentual_executado = newItems[index].quantidade_orcamento > 0 ?
      (qtdExec / newItems[index].quantidade_orcamento) * 100 : 0;
    
    setItems(newItems);
  };

  const calculateTotals = () => {
    const totalExecutado = items.reduce((sum, item) => sum + (item.valor_executado || 0), 0);
    
    // Calcular total previsto para o mês
    const totalPrevisto = items.reduce((sum, item) => 
      sum + ((item.quantidade_prevista_mes || 0) * (item.valor_unitario || 0)), 0
    );
    
    return { totalExecutado, totalPrevisto };
  };

  const handleSave = async () => {
    if (!measurement.orcamento_id) {
      alert('Selecione um orçamento');
      return;
    }

    setLoading(true);
    try {
      const { totalExecutado, totalPrevisto } = calculateTotals();
      
      // Buscar total do orçamento para calcular percentual
      const budget = await base44.entities.Budget.filter({ id: measurement.orcamento_id }).then(r => r[0]);
      const percentualExec = budget?.total_final ? (totalExecutado / budget.total_final) * 100 : 0;
      
      const measurementData = {
        ...measurement,
        total_executado: totalExecutado,
        total_previsto: totalPrevisto,
        percentual_executado: percentualExec
      };

      let savedMeasurement;
      if (measurementId) {
        await base44.entities.Measurement.update(measurementId, measurementData);
        savedMeasurement = { ...measurementData, id: measurementId };
        
        // Atualizar itens
        for (const item of items) {
          if (item.id) {
            await base44.entities.MeasurementItem.update(item.id, item);
          }
        }
      } else {
        savedMeasurement = await base44.entities.Measurement.create(measurementData);
        
        // Criar itens
        for (const item of items) {
          await base44.entities.MeasurementItem.create({
            ...item,
            medicao_id: savedMeasurement.id
          });
        }
      }

      alert('Medição salva com sucesso!');
      navigate(createPageUrl('Measurements'));
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar medição');
    }
    setLoading(false);
  };

  const { totalExecutado, totalPrevisto } = calculateTotals();

  return (
    <div className="space-y-6">
      <PageHeader
        title={measurementId ? `Medição Nº ${measurement.numero_medicao}` : 'Nova Medição'}
        backUrl={createPageUrl('Measurements')}
      />

      <Card>
        <CardHeader>
          <CardTitle>Dados da Medição</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Orçamento *</Label>
              <select
                value={measurement.orcamento_id || ''}
                onChange={(e) => handleBudgetChange(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                disabled={!!measurementId}
              >
                <option value="">Selecione...</option>
                {budgets.map(b => (
                  <option key={b.id} value={b.id}>{b.descricao}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Número da Medição</Label>
              <Input
                type="number"
                value={measurement.numero_medicao || ''}
                onChange={(e) => setMeasurement({ ...measurement, numero_medicao: parseInt(e.target.value) })}
                disabled={!!measurementId}
              />
            </div>

            <div>
              <Label>Mês de Referência *</Label>
              <Input
                type="number"
                min="1"
                value={measurement.mes_referencia || ''}
                onChange={(e) => handleMesReferenciaChange(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Data Início</Label>
              <Input
                type="date"
                value={measurement.data_inicio || ''}
                onChange={(e) => setMeasurement({ ...measurement, data_inicio: e.target.value })}
              />
            </div>

            <div>
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={measurement.data_fim || ''}
                onChange={(e) => setMeasurement({ ...measurement, data_fim: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={measurement.descricao || ''}
              onChange={(e) => setMeasurement({ ...measurement, descricao: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label>Status</Label>
            <select
              value={measurement.status || 'rascunho'}
              onChange={(e) => setMeasurement({ ...measurement, status: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="rascunho">Rascunho</option>
              <option value="aprovada">Aprovada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="items">Itens da Medição</TabsTrigger>
          <TabsTrigger value="charts">Gráficos Comparativos</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Itens Medidos</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportMeasurementToPDF(measurement, items, stages)}
                  disabled={items.length === 0}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportMeasurementToExcel(measurement, items, stages)}
                  disabled={items.length === 0}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-20">Unid.</TableHead>
                      <TableHead className="text-right w-24">Qtd Orç.</TableHead>
                      <TableHead className="text-right w-24">Qtd Prev.</TableHead>
                      <TableHead className="text-right w-32">Qtd Exec.</TableHead>
                      <TableHead className="text-right w-28">Valor Unit.</TableHead>
                      <TableHead className="text-right w-32">Valor Exec.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                        <TableCell className="text-sm">{item.descricao}</TableCell>
                        <TableCell className="text-xs">{item.unidade}</TableCell>
                        <TableCell className="text-right text-sm">
                          {(Number(item.quantidade_orcamento) || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-blue-600">
                          {(Number(item.quantidade_prevista_mes) || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.quantidade_executada || ''}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            className="w-28 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_unitario || 0)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_executado || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-6 flex justify-end">
                <div className="w-96 space-y-2 bg-slate-50 p-4 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Total Previsto:</span>
                    <span className="font-medium text-blue-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPrevisto)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total Executado:</span>
                    <span className="text-green-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExecutado)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts">
          <MeasurementChart
            measurements={allMeasurements}
            schedule={schedule}
            budget={budgets.find(b => b.id === measurement.orcamento_id)}
          />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate(createPageUrl('Measurements'))}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Salvando...' : 'Salvar Medição'}
        </Button>
      </div>
    </div>
  );
}