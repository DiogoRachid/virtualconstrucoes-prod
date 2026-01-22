import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, ArrowUpDown, Save, FileSpreadsheet, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { exportScheduleXLSX, exportSchedulePDF } from './ScheduleExporter';

export default function ScheduleEditor({ budget, stages, items, onChange, onSave, isSaving }) {
  const [months, setMonths] = useState(budget?.duracao_meses || 12);
  const [serviceSchedule, setServiceSchedule] = useState({});
  const [expandedStages, setExpandedStages] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: 'ordem', direction: 'asc' });

  // Atualizar duração quando o budget carregar
  useEffect(() => {
    if (budget?.duracao_meses && budget.duracao_meses !== months) {
      setMonths(budget.duracao_meses);
    }
  }, [budget?.duracao_meses]);

  useEffect(() => {
    // Inicializar schedule com cada item (usando ID único por item, não por serviço)
    setServiceSchedule(prevSchedule => {
      const newSchedule = { ...prevSchedule };
      
      items.forEach(item => {
        if (item.servico_id) {
          // Usar item.id como chave única para cada linha de serviço
          const itemKey = item.id;
          
          if (!newSchedule[itemKey]) {
            newSchedule[itemKey] = {
              percentages: Array(months).fill(0),
              total: 0
            };
          } else {
            // Ajustar tamanho do array se months mudou
            const current = newSchedule[itemKey].percentages;
            if (current.length > months) {
              newSchedule[itemKey].percentages = current.slice(0, months);
            } else if (current.length < months) {
              newSchedule[itemKey].percentages = [...current, ...Array(months - current.length).fill(0)];
            }
            // Recalcular total
            newSchedule[itemKey].total = newSchedule[itemKey].percentages.reduce((sum, p) => sum + p, 0);
          }
        }
      });
      
      return newSchedule;
    });
  }, [items, months]);

  const toggleStageExpanded = (stageId) => {
    const newExpanded = new Set(expandedStages);
    if (newExpanded.has(stageId)) {
      newExpanded.delete(stageId);
    } else {
      newExpanded.add(stageId);
    }
    setExpandedStages(newExpanded);
  };

  // Buscar serviços de uma etapa filtrando itens pelo stage_id
  const getStageServices = (stageId) => {
    return items
      .filter(item => item.stage_id === stageId)
      .map(item => item.servico_id)
      .filter(Boolean);
  };

  const handleServicePercentageChange = (itemId, monthIndex, value) => {
    const percentage = parseFloat(value) || 0;
    
    setServiceSchedule(prevSchedule => {
      const newSchedule = { ...prevSchedule };
      
      if (!newSchedule[itemId]) {
        newSchedule[itemId] = {
          percentages: Array(months).fill(0),
          total: 0
        };
      }
      
      // Clone o array de percentages para evitar mutações
      newSchedule[itemId] = {
        percentages: [...newSchedule[itemId].percentages],
        total: newSchedule[itemId].total
      };
      
      newSchedule[itemId].percentages[monthIndex] = percentage;
      newSchedule[itemId].total = newSchedule[itemId].percentages.reduce((sum, p) => sum + p, 0);
      
      if (newSchedule[itemId].total > 100) {
        toast.error(`O item não pode ultrapassar 100% de execução`);
        return prevSchedule;
      }
      
      onChange && onChange(newSchedule, months);
      return newSchedule;
    });
  };

  const handleMonthsChange = (value) => {
    const newMonths = parseInt(value) || 12;
    setMonths(newMonths);
    
    // Reajustar arrays de percentuais dos serviços
    const newSchedule = {};
    Object.keys(serviceSchedule).forEach(serviceId => {
      const current = serviceSchedule[serviceId].percentages;
      let newPercentages;
      if (current.length > newMonths) {
        newPercentages = current.slice(0, newMonths);
      } else {
        newPercentages = [...current, ...Array(newMonths - current.length).fill(0)];
      }
      newSchedule[serviceId] = {
        percentages: newPercentages,
        total: newPercentages.reduce((sum, p) => sum + p, 0)
      };
    });
    setServiceSchedule(newSchedule);
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
      onSave(serviceSchedule, months);
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

  const getTotalMonthlyByService = (monthIndex) => {
    return items.reduce((sum, item) => {
      const servicePercentage = serviceSchedule[item.servico_id]?.percentages[monthIndex] || 0;
      return sum + ((item.subtotal || 0) * servicePercentage) / 100;
    }, 0);
  };

  const getTotalCumulativeByService = (monthIndex) => {
    return items.reduce((sum, item) => {
      const cumulativePercentage = serviceSchedule[item.servico_id]?.percentages
        .slice(0, monthIndex + 1)
        .reduce((s, p) => s + p, 0) || 0;
      return sum + ((item.subtotal || 0) * cumulativePercentage) / 100;
    }, 0);
  };

  const getCumulativePercentageByService = (monthIndex) => {
    const totalBudget = budget?.total_final || 0;
    if (totalBudget === 0) return 0;
    return (getTotalCumulativeByService(monthIndex) / totalBudget) * 100;
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
    const isExpanded = expandedStages.has(stage.id);
    const stageServices = getStageServices(stage.id);
    const stageServiceItems = items.filter(i => stageServices.includes(i.servico_id));
    const subStages = stages.filter(s => s.parent_stage_id === stage.id);
    const hasContent = stageServiceItems.length > 0 || subStages.length > 0;
    const paddingLeft = level * 12;

    return (
      <React.Fragment key={stage.id}>
        <TableRow className="font-medium" style={{ backgroundColor: level === 0 ? '#f1f5f9' : '#fafafa' }}>
          <TableCell className="sticky left-0 z-10" style={{ backgroundColor: level === 0 ? '#f1f5f9' : '#fafafa', paddingLeft: `${16 + paddingLeft}px` }}>
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
              <span>{stage.nome}</span>
            </div>
          </TableCell>
          <TableCell className="text-right text-sm">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stageValue)}
          </TableCell>
          {Array.from({ length: months }).map((_, idx) => (
            <TableCell key={idx} className="p-1"></TableCell>
          ))}
          <TableCell></TableCell>
        </TableRow>
        
        {isExpanded && stageServiceItems.length > 0 && stageServiceItems.map(service => {
          const itemData = serviceSchedule[service.id];
          const isServiceComplete = itemData?.total === 100;
          const isServiceOverLimit = itemData?.total > 100;
          
          return (
            <TableRow key={`item-${service.id}`} className="bg-white">
              <TableCell className="sticky left-0 bg-white z-10 text-sm" style={{ paddingLeft: `${32 + paddingLeft}px` }}>
                {service.descricao || 'Sem descrição'}
              </TableCell>
              <TableCell className="text-right text-sm">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.subtotal || 0)}
              </TableCell>
              {Array.from({ length: months }).map((_, idx) => (
                <TableCell key={idx} className="p-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={itemData?.percentages[idx]?.toFixed(2) || '0.00'}
                    onChange={(e) => handleServicePercentageChange(service.id, idx, e.target.value)}
                    className="h-8 w-16 text-xs text-center"
                  />
                </TableCell>
              ))}
              <TableCell className={`text-right font-bold text-sm ${isServiceOverLimit ? 'text-red-600' : isServiceComplete ? 'text-green-600' : 'text-slate-600'}`}>
                {itemData?.total.toFixed(2)}%
                {isServiceOverLimit && <AlertCircle className="inline h-4 w-4 ml-1" />}
              </TableCell>
            </TableRow>
          );
        })}

        {isExpanded && subStages.length > 0 && subStages.map(subStage => renderStageRow(subStage, level + 1))}
      </React.Fragment>
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
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={async () => {
                  const result = await exportScheduleXLSX(schedule, stages, items, months, budget);
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
                  const result = await exportSchedulePDF(schedule, stages, items, months, budget);
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
                     {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getTotalMonthlyByService(idx))}
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
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getTotalCumulativeByService(idx))}
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
                      {getCumulativePercentageByService(idx).toFixed(2)}%
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