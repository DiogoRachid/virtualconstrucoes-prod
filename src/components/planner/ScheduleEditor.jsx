import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, Save, FileSpreadsheet, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { exportScheduleXLSX, exportSchedulePDF } from './ScheduleExporter';
import { base44 } from '@/api/base44Client';

export default function ScheduleEditor({ budget, stages, items, onSave, isSaving }) {
  const [months, setMonths] = useState(budget?.duracao_meses || 12);
  const [itemPercentages, setItemPercentages] = useState({});
  const [expandedStages, setExpandedStages] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!budget?.id || !items || items.length === 0) {
        setLoading(false);
        return;
      }

      try {
        // Buscar distribuições salvas
        const distributions = await base44.entities.ServiceMonthlyDistribution.filter({
          orcamento_id: budget.id
        });

        const loaded = {};
        
        // Inicializar todos os itens com array vazio
        items.forEach(item => {
          loaded[item.id] = Array(months).fill(0);
        });

        // Preencher com dados salvos - usar budget_item_id para evitar duplicação
        distributions.forEach(dist => {
          if (dist.budget_item_id && dist.mes >= 1 && dist.mes <= months) {
            // Usar o ID do item do orçamento diretamente
            if (loaded[dist.budget_item_id]) {
              loaded[dist.budget_item_id][dist.mes - 1] = dist.percentual || 0;
            }
          }
        });

        setItemPercentages(loaded);
        setExpandedStages(new Set(stages.map(s => s.id)));
      } catch (error) {
        console.error('Erro ao carregar distribuições:', error);
        toast.error('Erro ao carregar dados salvos');
      }
      
      setLoading(false);
    }

    loadData();
  }, [budget?.id, items, stages, months]);

  const handleMonthsChange = (newMonths) => {
    const monthCount = parseInt(newMonths) || 12;
    setMonths(monthCount);

    const adjusted = {};
    Object.keys(itemPercentages).forEach(itemId => {
      const current = itemPercentages[itemId] || [];
      if (current.length > monthCount) {
        adjusted[itemId] = current.slice(0, monthCount);
      } else {
        adjusted[itemId] = [...current, ...Array(monthCount - current.length).fill(0)];
      }
    });
    setItemPercentages(adjusted);
  };

  const handlePercentageChange = (itemId, monthIndex, value) => {
    const percentage = parseFloat(value) || 0;
    
    setItemPercentages(prev => {
      const current = prev[itemId] || Array(months).fill(0);
      const updated = [...current];
      updated[monthIndex] = percentage;
      
      const total = updated.reduce((sum, p) => sum + p, 0);
      
      if (total > 100) {
        toast.error('O total não pode ultrapassar 100%');
        return prev;
      }
      
      return { ...prev, [itemId]: updated };
    });
  };

  const getItemTotal = (itemId) => {
    const percentages = itemPercentages[itemId] || [];
    return percentages.reduce((sum, p) => sum + p, 0);
  };

  const handleSave = () => {
    onSave({ itemPercentages, months });
  };

  const toggleStageExpanded = (stageId) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  const getStageItems = (stageId) => {
    return items.filter(item => item.stage_id === stageId);
  };

  const getStageValue = (stageId) => {
    const directItems = getStageItems(stageId);
    const directValue = directItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    
    // Somar valores das subetapas
    const subStages = stages.filter(s => s.parent_stage_id === stageId);
    const subStagesValue = subStages.reduce((sum, subStage) => sum + getStageValue(subStage.id), 0);
    
    return directValue + subStagesValue;
  };

  const getStageMonthlyValue = (stageId, monthIndex) => {
    const directItems = getStageItems(stageId);
    let monthlyValue = directItems.reduce((sum, item) => {
      const percentages = itemPercentages[item.id] || [];
      const percentage = percentages[monthIndex] || 0;
      return sum + ((item.subtotal || 0) * percentage) / 100;
    }, 0);
    
    // Somar valores mensais das subetapas
    const subStages = stages.filter(s => s.parent_stage_id === stageId);
    const subStagesMonthlyValue = subStages.reduce((sum, subStage) => sum + getStageMonthlyValue(subStage.id, monthIndex), 0);
    
    return monthlyValue + subStagesMonthlyValue;
  };

  const mainStages = stages.filter(stage => !stage.parent_stage_id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const renderStageRow = (stage, level = 0, parentNumber = '', stageIndex = 0) => {
    const stageValue = getStageValue(stage.id);
    const isExpanded = expandedStages.has(stage.id);
    const stageItems = getStageItems(stage.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const subStages = stages.filter(s => s.parent_stage_id === stage.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const hasContent = stageItems.length > 0 || subStages.length > 0;
    const paddingLeft = level * 12;
    const stageNumber = parentNumber ? `${parentNumber}.${stageIndex + 1}` : `${stageIndex + 1}`;

    const rows = [];

    // Linha da etapa
    rows.push(
      <TableRow key={`stage-${stage.id}`} className="font-medium bg-slate-50">
        <TableCell className="sticky left-0 z-10 bg-slate-50" style={{ paddingLeft: `${16 + paddingLeft}px` }}>
          <div className="flex items-center gap-2">
            {hasContent && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0"
                onClick={() => toggleStageExpanded(stage.id)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            {!hasContent && <div className="w-6"></div>}
            <span className="font-mono text-xs text-slate-500 mr-2">{stageNumber}</span>
            <span>{stage.nome}</span>
          </div>
        </TableCell>
        <TableCell className="text-right text-sm">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stageValue)}
        </TableCell>
        {Array.from({ length: months }).map((_, idx) => {
          const monthValue = getStageMonthlyValue(stage.id, idx);
          const monthPercentage = stageValue > 0 ? (monthValue / stageValue) * 100 : 0;
          return (
            <TableCell key={idx} className="p-1 text-center text-xs">
              {monthValue > 0 ? (
                <div className="space-y-0.5">
                  <div className="text-slate-900 font-medium">{monthPercentage.toFixed(1)}%</div>
                  <div className="text-slate-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(monthValue)}</div>
                </div>
              ) : '-'}
            </TableCell>
          );
        })}
        <TableCell className="text-right"></TableCell>
      </TableRow>
    );

    // Itens da etapa
    if (isExpanded) {
      stageItems.forEach((item, itemIdx) => {
        const percentages = itemPercentages[item.id] || Array(months).fill(0);
        const total = getItemTotal(item.id);
        const isComplete = total === 100;
        const isOverLimit = total > 100;
        const itemNumber = `${stageNumber}.${itemIdx + 1}`;

        rows.push(
          <TableRow key={item.id} className="bg-white">
            <TableCell className="sticky left-0 bg-white z-10 text-sm" style={{ paddingLeft: `${32 + paddingLeft}px` }}>
              <span className="font-mono text-xs text-blue-600 mr-2">{itemNumber}</span>
              <span className="font-mono text-xs text-slate-500 mr-2">{item.codigo}</span>
              {item.descricao || 'Sem descrição'}
            </TableCell>
            <TableCell className="text-right text-sm">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal || 0)}
            </TableCell>
            {Array.from({ length: months }).map((_, monthIdx) => (
              <TableCell key={monthIdx} className="p-1">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={percentages[monthIdx]?.toFixed(2) || '0.00'}
                  onChange={(e) => handlePercentageChange(item.id, monthIdx, e.target.value)}
                  className="h-8 w-16 text-xs text-center"
                />
              </TableCell>
            ))}
            <TableCell className={`text-right font-bold text-sm ${isOverLimit ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-slate-600'}`}>
              {total.toFixed(2)}%
              {isOverLimit && <AlertCircle className="inline h-4 w-4 ml-1" />}
            </TableCell>
          </TableRow>
        );
      });

      // Subetapas
      subStages.forEach((subStage, subIdx) => {
        const subRows = renderStageRow(subStage, level + 1, stageNumber, subIdx);
        rows.push(...subRows);
      });
    }

    return rows;
  };

  const getTotalMonthly = (monthIndex) => {
    return items.reduce((sum, item) => {
      const percentages = itemPercentages[item.id] || [];
      const percentage = percentages[monthIndex] || 0;
      return sum + ((item.subtotal || 0) * percentage) / 100;
    }, 0);
  };

  const getTotalCumulative = (monthIndex) => {
    return items.reduce((sum, item) => {
      const percentages = itemPercentages[item.id] || [];
      const cumulative = percentages.slice(0, monthIndex + 1).reduce((s, p) => s + p, 0);
      return sum + ((item.subtotal || 0) * cumulative) / 100;
    }, 0);
  };

  const getCumulativePercentage = (monthIndex) => {
    const totalBudget = budget?.total_final || 0;
    if (totalBudget === 0) return 0;
    return (getTotalCumulative(monthIndex) / totalBudget) * 100;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-slate-500">Carregando cronograma...</p>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-slate-500">Nenhum serviço encontrado neste orçamento.</p>
          <p className="text-sm text-slate-400 mt-2">Adicione serviços ao orçamento primeiro.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração do Cronograma</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label>Duração (meses):</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={months}
                  onChange={(e) => handleMonthsChange(e.target.value)}
                  className="w-20"
                />
              </div>
              <div className="text-sm text-slate-500">
                {items.length} serviços • {stages.length} etapas
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={async () => {
                  const result = await exportScheduleXLSX(itemPercentages, stages, items, months, budget);
                  if (result.success) toast.success(result.message);
                  else toast.error(result.message);
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                XLSX
              </Button>
              <Button 
                variant="outline"
                onClick={async () => {
                  const result = await exportSchedulePDF(itemPercentages, stages, items, months, budget);
                  if (result.success) toast.success(result.message);
                  else toast.error(result.message);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10 min-w-[300px]">Etapa / Serviço</TableHead>
                  <TableHead className="text-right min-w-[120px]">Valor Total</TableHead>
                  {Array.from({ length: months }).map((_, idx) => (
                    <TableHead key={idx} className="text-center min-w-[80px]">Mês {idx + 1}</TableHead>
                  ))}
                  <TableHead className="text-right min-w-[80px]">Total %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mainStages.map((stage, idx) => renderStageRow(stage, 0, '', idx))}
                
                <TableRow className="bg-slate-100 font-bold border-t-2">
                  <TableCell className="sticky left-0 bg-slate-100 z-10">TOTAL MENSAL</TableCell>
                  <TableCell className="text-right">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budget?.total_final || 0)}
                  </TableCell>
                  {Array.from({ length: months }).map((_, idx) => (
                    <TableCell key={idx} className="text-center text-xs">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getTotalMonthly(idx))}
                    </TableCell>
                  ))}
                  <TableCell></TableCell>
                </TableRow>

                <TableRow className="bg-slate-200 font-bold">
                  <TableCell className="sticky left-0 bg-slate-200 z-10">ACUMULADO</TableCell>
                  <TableCell></TableCell>
                  {Array.from({ length: months }).map((_, idx) => (
                    <TableCell key={idx} className="text-center text-xs">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getTotalCumulative(idx))}
                    </TableCell>
                  ))}
                  <TableCell></TableCell>
                </TableRow>

                <TableRow className="bg-blue-100 font-bold">
                  <TableCell className="sticky left-0 bg-blue-100 z-10">% ACUMULADO</TableCell>
                  <TableCell></TableCell>
                  {Array.from({ length: months }).map((_, idx) => (
                    <TableCell key={idx} className="text-center text-xs text-blue-900">
                      {getCumulativePercentage(idx).toFixed(2)}%
                    </TableCell>
                  ))}
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}