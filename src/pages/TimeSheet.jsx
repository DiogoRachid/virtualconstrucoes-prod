import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { FileText, Printer, AlertTriangle, Save } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from '@/components/ui/PageHeader';
import { toast } from 'sonner';

const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_MAP = {
  'SEGUNDA': 1, 'TERÇA': 2, 'QUARTA': 3, 'QUINTA': 4, 'SEXTA': 5, 'SÁBADO': 6, 'DOMINGO': 0
};

function calcHoras(entrada, saida, saidaAlmoco, retornoAlmoco) {
  if (!entrada || !saida) return 0;
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let total = toMin(saida) - toMin(entrada);
  if (saidaAlmoco && retornoAlmoco) total -= (toMin(retornoAlmoco) - toMin(saidaAlmoco));
  return Math.max(0, Math.round(total) / 60);
}

export default function TimeSheet() {
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [editedRecords, setEditedRecords] = useState({});
  const printRef = useRef();
  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ status: 'ativo' })
  });

  const { data: allRecords = [] } = useQuery({
    queryKey: ['timeRecords'],
    queryFn: () => base44.entities.TimeRecord.list()
  });

  const selectedEmp = employees.find(e => e.id === selectedEmployee);

  // Horário padrão do cadastro do funcionário
  const getHorarioPadrao = (dayOfWeek) => {
    if (!selectedEmp?.horario_trabalho) return null;
    const horario = selectedEmp.horario_trabalho.find(h => DIAS_SEMANA_MAP[h.dia] === dayOfWeek);
    if (!horario || horario.entrada === '-') return null;
    return horario;
  };

  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month - 1, i);
      const dow = date.getDay();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const existing = allRecords.find(r => r.colaborador_id === selectedEmployee && r.data === dateStr);
      days.push({ date: dateStr, dayOfWeek: dow, dayNumber: i, isWeekend: dow === 0 || dow === 6, record: existing });
    }
    return days;
  };

  const days = getDaysInMonth();

  const getFieldValue = (day, field) => {
    const key = `${day.date}_${field}`;
    if (editedRecords[key] !== undefined) return editedRecords[key];
    if (day.record) return day.record[field] || '';
    // Pré-preencher com horário padrão
    const padrao = getHorarioPadrao(day.dayOfWeek);
    if (padrao && !day.isWeekend) {
      if (field === 'entrada') return padrao.entrada || '';
      if (field === 'saida_almoco') return padrao.saida_almoco || '';
      if (field === 'retorno_almoco') return padrao.volta_almoco || '';
      if (field === 'saida') return padrao.saida || '';
    }
    return '';
  };

  const setField = (dateStr, field, value) => {
    setEditedRecords(prev => ({ ...prev, [`${dateStr}_${field}`]: value }));
  };

  // Verificar se foi marcado manualmente como falta ou atestado
  const getTipoOcorrencia = (day) => {
    const key = `${day.date}_ocorrencia`;
    if (editedRecords[key] !== undefined) return editedRecords[key];
    if (day.record?.ocorrencia) return day.record.ocorrencia;
    return '';
  };

  // Verificar se é falta (dia útil sem registro e sem horário preenchido, ou marcado como falta)
  const isFalta = (day) => {
    if (day.isWeekend) return false;
    const ocorrencia = getTipoOcorrencia(day);
    if (ocorrencia === 'falta') return true;
    if (ocorrencia === 'atestado') return false;
    const entrada = getFieldValue(day, 'entrada');
    const saida = getFieldValue(day, 'saida');
    return !entrada && !saida;
  };

  const isAtestado = (day) => getTipoOcorrencia(day) === 'atestado';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const promises = [];
      for (const day of days) {
        const entrada = getFieldValue(day, 'entrada');
        const saida = getFieldValue(day, 'saida');
        const saida_almoco = getFieldValue(day, 'saida_almoco');
        const retorno_almoco = getFieldValue(day, 'retorno_almoco');
        const obs = getFieldValue(day, 'observacoes');

        // Só salva se tiver alguma edição neste dia
        const hasEdits = ['entrada','saida','saida_almoco','retorno_almoco','observacoes','ocorrencia'].some(
          f => editedRecords[`${day.date}_${f}`] !== undefined
        );
        if (!hasEdits) continue;

        const horas = calcHoras(entrada, saida, saida_almoco, retorno_almoco);
        const ocorrencia = getTipoOcorrencia(day);
        const payload = {
          colaborador_id: selectedEmployee,
          colaborador_nome: selectedEmp?.nome_completo || '',
          data: day.date,
          entrada: ocorrencia ? '' : entrada,
          saida: ocorrencia ? '' : saida,
          saida_almoco: ocorrencia ? '' : saida_almoco,
          retorno_almoco: ocorrencia ? '' : retorno_almoco,
          horas_trabalhadas: ocorrencia ? 0 : horas,
          tipo_registro: 'manual',
          status: 'aprovado',
          ocorrencia,
          observacoes: obs || ''
        };

        if (day.record) {
          promises.push(base44.entities.TimeRecord.update(day.record.id, payload));
        } else {
          promises.push(base44.entities.TimeRecord.create(payload));
        }
      }
      return Promise.all(promises);
    },
    onSuccess: (results) => {
      toast.success(`${results.length} registro(s) salvos!`);
      setEditedRecords({});
      queryClient.invalidateQueries({ queryKey: ['timeRecords'] });
    },
    onError: () => toast.error('Erro ao salvar registros')
  });

  const totalHoras = days.reduce((sum, day) => {
    const entrada = getFieldValue(day, 'entrada');
    const saida = getFieldValue(day, 'saida');
    const sa = getFieldValue(day, 'saida_almoco');
    const ra = getFieldValue(day, 'retorno_almoco');
    return sum + calcHoras(entrada, saida, sa, ra);
  }, 0);

  const totalFaltas = days.filter(d => !d.isWeekend && isFalta(d)).length;
  const diasTrabalhados = days.filter(d => {
    const e = getFieldValue(d, 'entrada'); const s = getFieldValue(d, 'saida');
    return e && s;
  }).length;

  const handlePrint = () => {
    const printContent = printRef.current;
    const WinPrint = window.open('', '', 'width=900,height=650');
    WinPrint.document.write(`
      <html><head><title>Folha de Ponto - ${selectedEmp?.nome_completo}</title>
      <style>
        body { font-family: Arial; padding: 20px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: center; }
        th { background: #1e3a5f; color: white; }
        .falta { background: #fff0f0; color: #c00; }
        .fim-semana { background: #f5f5f5; color: #999; }
        .header { text-align: center; margin-bottom: 16px; }
        .assinatura { margin-top: 40px; display: flex; justify-content: space-between; }
        .assinatura div { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 4px; }
      </style></head><body>
      ${printContent.innerHTML}
      </body></html>
    `);
    WinPrint.document.close(); WinPrint.focus(); WinPrint.print(); WinPrint.close();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folha de Ponto"
        subtitle="Geração e edição da folha de ponto mensal"
        icon={FileText}
        backUrl={createPageUrl('TimeRecords')}
      />

      <Card>
        <CardContent className="pt-4 flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase">Colaborador</label>
            <Select value={selectedEmployee} onValueChange={v => { setSelectedEmployee(v); setEditedRecords({}); }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.nome_completo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Mês</label>
            <Input type="month" value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setEditedRecords({}); }} />
          </div>
          {selectedEmployee && (
            <>
              <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Imprimir</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || Object.keys(editedRecords).length === 0}>
                <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {selectedEmployee && selectedEmp && (
        <Card>
          <CardContent className="pt-6">
            <div ref={printRef}>
              {/* Cabeçalho */}
              <div className="header text-center mb-4">
                <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg" alt="Logo" className="h-14 mx-auto mb-2" />
                <h1 className="text-xl font-bold">FOLHA DE PONTO</h1>
                <p className="text-slate-500 text-sm">{new Date(selectedMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm bg-slate-50 p-3 rounded-lg">
                <p><strong>Colaborador:</strong> {selectedEmp.nome_completo}</p>
                <p><strong>CPF:</strong> {selectedEmp.cpf}</p>
                <p><strong>Função:</strong> {selectedEmp.funcao}</p>
                <p><strong>Vínculo:</strong> {selectedEmp.tipo_vinculo?.toUpperCase()}</p>
              </div>

              {/* Aviso horário padrão */}
              {selectedEmp.horario_trabalho?.length > 0 && (
                <div className="mb-3 flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded">
                  <AlertTriangle className="h-3 w-3" />
                  Horário padrão do cadastro pré-preenchido. Edite as exceções e faltas manualmente. Células em vermelho = falta.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-700 text-white">
                      <th className="px-2 py-2 border">Dia</th>
                      <th className="px-2 py-2 border">Dia Sem.</th>
                      <th className="px-2 py-2 border">Entrada</th>
                      <th className="px-2 py-2 border">Saída Almoço</th>
                      <th className="px-2 py-2 border">Retorno</th>
                      <th className="px-2 py-2 border">Saída</th>
                      <th className="px-2 py-2 border">Total Horas</th>
                      <th className="px-2 py-2 border">Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(day => {
                      const falta = isFalta(day);
                      const entrada = getFieldValue(day, 'entrada');
                      const saida = getFieldValue(day, 'saida');
                      const sa = getFieldValue(day, 'saida_almoco');
                      const ra = getFieldValue(day, 'retorno_almoco');
                      const horas = calcHoras(entrada, saida, sa, ra);
                      const rowClass = day.isWeekend ? 'bg-slate-100 text-slate-400' : falta ? 'bg-red-50' : '';

                      return (
                        <tr key={day.date} className={rowClass}>
                          <td className="px-2 py-1 border text-center font-medium">{day.dayNumber}</td>
                          <td className="px-2 py-1 border text-center">{DIAS_PT[day.dayOfWeek]}</td>
                          {day.isWeekend ? (
                            <td colSpan={5} className="px-2 py-1 border text-center text-slate-400">—</td>
                          ) : (
                            <>
                              {['entrada', 'saida_almoco', 'retorno_almoco', 'saida'].map(field => (
                                <td key={field} className="px-1 py-1 border">
                                  <Input
                                    type="time"
                                    value={getFieldValue(day, field)}
                                    onChange={e => setField(day.date, field, e.target.value)}
                                    className="h-6 text-xs px-1 w-full border-0 bg-transparent focus:bg-white focus:border focus:rounded"
                                  />
                                </td>
                              ))}
                              <td className={`px-2 py-1 border text-center font-medium ${falta ? 'text-red-600 font-bold' : ''}`}>
                                {falta ? 'FALTA' : horas > 0 ? `${horas.toFixed(1)}h` : '-'}
                              </td>
                            </>
                          )}
                          <td className="px-1 py-1 border">
                            <Input
                              value={getFieldValue(day, 'observacoes')}
                              onChange={e => setField(day.date, 'observacoes', e.target.value)}
                              className="h-6 text-xs px-1 w-full border-0 bg-transparent focus:bg-white focus:border focus:rounded"
                              placeholder={falta && !day.isWeekend ? 'Motivo...' : ''}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="summary mt-4 p-4 bg-blue-50 rounded-lg grid grid-cols-3 gap-4 text-sm">
                <p><strong>Dias Trabalhados:</strong> {diasTrabalhados}</p>
                <p><strong>Total de Horas:</strong> {totalHoras.toFixed(2)}h</p>
                <p className={totalFaltas > 0 ? 'text-red-600 font-semibold' : ''}><strong>Faltas:</strong> {totalFaltas}</p>
              </div>

              <div className="assinatura mt-12 flex justify-between">
                <div className="text-center"><div className="border-t border-black w-48 pt-2"><p className="text-sm">Colaborador</p></div></div>
                <div className="text-center"><div className="border-t border-black w-48 pt-2"><p className="text-sm">Gestor Responsável</p></div></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}