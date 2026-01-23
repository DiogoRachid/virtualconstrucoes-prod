import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, Save, FileSpreadsheet, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { exportScheduleXLSX, exportSchedulePDF } from './ScheduleExporter';

export default function ScheduleEditor({ budget, stages, items, onSave, isSaving }) {
  const [months, setMonths] = useState(budget?.duracao_meses || 12);
  const [itemPercentages, setItemPercentages] = useState({});
  const [expandedStages, setExpandedStages] = useState(new Set());

  // Carregar percentuais salvos e expandir todas as etapas
  useEffect(() => {
    if (!items || items.length === 0) return;

    const loadedPercentages = {};

    // Carregar percentuais para cada item
    items.forEach(item => {
      const stage = stages.find(s => s.id === item.stage_id);
      
      if (stage?.distribuicao_mensal && Array.isArray(stage.distribuicao_mensal)) {
        const percentages = Array(months).fill(0);
        
        stage.distribuicao_mensal.forEach(d => {
          if (d.mes >= 1 && d.mes <= months) {
            percentages[d.mes - 1] = d.percentual || 0;
          }
        });
        
        loadedPercentages[item.id] = percentages;
      } else {
        loadedPercentages[item.id] = Array(months).fill(0);
      }
    });

    setItemPercentages(loadedPercentages);
    
    // Expandir todas as etapas
    if (stages && stages.length > 0) {
      setExpandedStages(new Set(stages.map(s => s.id)));
    }
  }, [stages, items, months]);

  const handleMonthsChange = (newMonths) => {
    const monthCount = parseInt(newMonths) || 12;
    setMonths(monthCount);

    // Ajustar arrays de percentuais
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
    onSave?.({ itemPercentages, months });
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
    return getStageItems(stageId).reduce((sum, item) => sum + (item.subtotal || 0), 0);
  };

  // Mostrar TODAS as etapas principais (sem filtro de valor)
  const mainStages = stages.filter(stage => !stage.parent_stage_id);
  
  // Ordenar etapas por ordem
  const sortedStages = [...mainStages].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  const renderStageRow = (stage, level = 0, parentNumber = '') => {
    const stageValue = getStageValue(stage.id);
    const isExpanded = expandedStages.has(stage.id);
    const stageItems = getStageItems(stage.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const subStages = stages.filter(s => s.parent_stage_id === stage.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const hasContent = stageItems.length > 0 || subStages.length > 0;
    const paddingLeft = level * 12;
    const stageNumber = parentNumber ? `${parentNumber}.${stage.ordem || 0}` : `${stage.ordem || 0}`;

    return (
      <React.Fragment key={stage.id}>
        <TableRow className="font-medium bg-slate-50">
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
          {Array.from({ length: months }).map((_, idx) => (
            <TableCell key={idx} className="p-1 text-center text-xs text-slate-600">-</TableCell>
          ))}
          <TableCell className="text-right"></TableCell>
        </TableRow>
        
        {isExpanded && stageItems.map((item, itemIdx) => {
          const percentages = itemPercentages[item.id] || Array(months).fill(0);
          const total = getItemTotal(item.id);
          const isComplete = total === 100;
          const isOverLimit = total > 100;
          const itemNumber = `${stageNumber}.${itemIdx + 1}`;

                  return (
                    <TableRow key={item.id} className="bg-white">
                      <TableCell className="sticky left-0 bg-white z-10 text-sm" style={{ paddingLeft: `${32 + paddingLeft}px` }}>
                        <span className="font-mono text-xs text-blue-600 mr-2">{itemNumber}</span>
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
        })}

        {isExpanded && subStages.map(subStage => renderStageRow(subStage, level + 1, stageNumber))}
      </React.Fragment>
    );
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
                <Label>Duração do Projeto (meses):</Label>
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
                Exportar XLSX
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
                Exportar PDF
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
                    Salvar Cronograma
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
                {sortedStages.map(stage => renderStageRow(stage))}
                
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