import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, ArrowUpDown, Save } from 'lucide-react';

export default function ScheduleEditor({ budget, stages, items, onChange, onSave, isSaving }) {
  const [months, setMonths] = useState(12);
  const [schedule, setSchedule] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: 'ordem', direction: 'asc' });

  useEffect(() => {
    // Inicializar schedule com as etapas (carregando de distribuicao_mensal se existir)
    const initialSchedule = {};
    stages.forEach(stage => {
      if (stage.distribuicao_mensal && stage.distribuicao_mensal.length > 0) {
        // Carregar dados salvos
        const percentages = Array(months).fill(0);
        stage.distribuicao_mensal.forEach(d => {
          if (d.mes >= 1 && d.mes <= months) {
            percentages[d.mes - 1] = d.percentual || 0;
          }
        });
        initialSchedule[stage.id] = {
          percentages,
          total: percentages.reduce((sum, p) => sum + p, 0)
        };
      } else {
        initialSchedule[stage.id] = {
          percentages: Array(months).fill(0),
          total: 0
        };
      }
    });
    setSchedule(initialSchedule);
  }, [stages, months]);

  const handlePercentageChange = (stageId, monthIndex, value) => {
    const newSchedule = { ...schedule };
    const percentage = parseFloat(value) || 0;
    
    newSchedule[stageId].percentages[monthIndex] = percentage;
    newSchedule[stageId].total = newSchedule[stageId].percentages.reduce((sum, p) => sum + p, 0);
    
    if (newSchedule[stageId].total > 100) {
      toast.error(`A etapa não pode ultrapassar 100% de execução`);
      return;
    }
    
    setSchedule(newSchedule);
    onChange && onChange(newSchedule, months);
  };

  const handleMonthsChange = (value) => {
    const newMonths = parseInt(value) || 12;
    setMonths(newMonths);
    
    // Reajustar arrays de percentuais
    const newSchedule = { ...schedule };
    Object.keys(newSchedule).forEach(stageId => {
      const current = newSchedule[stageId].percentages;
      if (current.length > newMonths) {
        newSchedule[stageId].percentages = current.slice(0, newMonths);
      } else {
        newSchedule[stageId].percentages = [...current, ...Array(newMonths - current.length).fill(0)];
      }
      newSchedule[stageId].total = newSchedule[stageId].percentages.reduce((sum, p) => sum + p, 0);
    });
    setSchedule(newSchedule);
    onChange && onChange(newSchedule, newMonths);
  };

  // Calcular valor da etapa incluindo subetapas recursivamente
  const getStageValue = (stageId) => {
    // Valor direto da etapa
    let value = items
      .filter(item => item.stage_id === stageId)
      .reduce((sum, item) => sum + (item.subtotal || 0), 0);
    
    // Adicionar valores das subetapas
    const subStages = stages.filter(s => s.parent_stage_id === stageId);
    subStages.forEach(subStage => {
      value += getStageValue(subStage.id);
    });
    
    return value;
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSave = () => {
    if (onSave) {
      onSave(schedule, months);
    }
  };

  const getMonthlyValue = (stageId, monthIndex) => {
    const stageValue = getStageValue(stageId);
    const percentage = schedule[stageId]?.percentages[monthIndex] || 0;
    return (stageValue * percentage) / 100;
  };

  const getCumulativeValue = (stageId, monthIndex) => {
    const stageValue = getStageValue(stageId);
    const cumulativePercentage = schedule[stageId]?.percentages
      .slice(0, monthIndex + 1)
      .reduce((sum, p) => sum + p, 0) || 0;
    return (stageValue * cumulativePercentage) / 100;
  };

  const getTotalMonthly = (monthIndex) => {
    return mainStages.reduce((sum, stage) => sum + getMonthlyValue(stage.id, monthIndex), 0);
  };

  const getTotalCumulative = (monthIndex) => {
    return mainStages.reduce((sum, stage) => sum + getCumulativeValue(stage.id, monthIndex), 0);
  };

  const getCumulativePercentage = (monthIndex) => {
    const totalBudget = budget?.total_final || 0;
    if (totalBudget === 0) return 0;
    return (getTotalCumulative(monthIndex) / totalBudget) * 100;
  };

  // Filtrar e ordenar etapas principais (sem parent_stage_id) com valor > 0
  const mainStages = stages
    .filter(stage => !stage.parent_stage_id && getStageValue(stage.id) > 0)
    .sort((a, b) => {
      if (sortConfig.key === 'nome') {
        return sortConfig.direction === 'asc' 
          ? a.nome.localeCompare(b.nome)
          : b.nome.localeCompare(a.nome);
      }
      if (sortConfig.key === 'valor') {
        const valueA = getStageValue(a.id);
        const valueB = getStageValue(b.id);
        return sortConfig.direction === 'asc' ? valueA - valueB : valueB - valueA;
      }
      // ordem padrão
      return sortConfig.direction === 'asc' 
        ? (a.ordem || 0) - (b.ordem || 0)
        : (b.ordem || 0) - (a.ordem || 0);
    });

  const renderStageRow = (stage, level = 0) => {
    const stageValue = getStageValue(stage.id);
    const stageData = schedule[stage.id];
    const isComplete = stageData?.total === 100;
    const isOverLimit = stageData?.total > 100;

    return (
      <TableRow key={stage.id}>
        <TableCell className="font-medium sticky left-0 bg-white z-10">
          {stage.nome}
        </TableCell>
        <TableCell className="text-right text-sm">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stageValue)}
        </TableCell>
        {Array.from({ length: months }).map((_, idx) => (
          <TableCell key={idx} className="p-1">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={stageData?.percentages[idx]?.toFixed(2) || '0.00'}
              onChange={(e) => handlePercentageChange(stage.id, idx, e.target.value)}
              className="h-8 w-16 text-xs text-center"
            />
          </TableCell>
        ))}
        <TableCell className={`text-right font-bold ${isOverLimit ? 'text-red-600' : isComplete ? 'text-green-600' : 'text-slate-600'}`}>
          {stageData?.total.toFixed(2)}%
          {isOverLimit && <AlertCircle className="inline h-4 w-4 ml-1" />}
        </TableCell>
      </TableRow>
    );
  };

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
                Defina os percentuais de execução mensais para cada etapa
              </div>
            </div>
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-white z-10 min-w-[200px]">
                    <Button variant="ghost" onClick={() => handleSort('nome')} className="h-8 px-2 gap-1">
                      Etapa
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right min-w-[120px]">
                    <Button variant="ghost" onClick={() => handleSort('valor')} className="h-8 px-2 gap-1 ml-auto">
                      Valor Total
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  {Array.from({ length: months }).map((_, idx) => (
                    <TableHead key={idx} className="text-center min-w-[80px]">
                      Mês {idx + 1}
                    </TableHead>
                  ))}
                  <TableHead className="text-right min-w-[80px]">Total %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mainStages.map(stage => renderStageRow(stage))}
                
                {/* Linha de Totais Mensais */}
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

                {/* Linha de Totais Acumulados */}
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

                {/* Linha de Percentual Acumulado */}
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