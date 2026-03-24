import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Gift, Printer, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from '@/components/ui/PageHeader';

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Calcula dias úteis no mês (seg-sex)
function getDiasUteisMes(year, month) {
  const dias = new Date(year, month, 0).getDate();
  let uteis = 0;
  for (let i = 1; i <= dias; i++) {
    const dow = new Date(year, month - 1, i).getDay();
    if (dow !== 0 && dow !== 6) uteis++;
  }
  return uteis;
}

// Conta presença real (dias com horário registrado no mês para o colaborador)
function getDiasTrabalhados(records, year, month, empId) {
  return records.filter(r => {
    if (r.colaborador_id !== empId) return false;
    if (!r.data) return false;
    const [y, m] = r.data.split('-').map(Number);
    if (y !== year || m !== month) return false;
    return r.entrada && r.saida && !r.ocorrencia;
  }).length;
}

function getFaltas(records, year, month, empId) {
  return records.filter(r => {
    if (r.colaborador_id !== empId) return false;
    if (!r.data) return false;
    const [y, m] = r.data.split('-').map(Number);
    if (y !== year || m !== month) return false;
    return r.ocorrencia === 'falta' || r.ocorrencia === 'atestado';
  }).length;
}

function calcValorBeneficio(benefit, diasTrabalhados, faltas, diasUteisNoMes) {
  const valor = benefit.valor || 0;
  const regra = benefit.regra_calculo || 'fixo';

  if (regra === 'fixo') return valor;

  // Vale Compras: desconta proporcionalmente pelas faltas, base 30 dias
  if (regra === 'proporcional_faltas') {
    const diasPagos = Math.max(0, 30 - faltas);
    return (valor / 30) * diasPagos;
  }

  // Café da manhã: calculado sobre os dias de presença real (dias com entrada registrada)
  if (regra === 'por_dias_uteis') {
    if (diasUteisNoMes === 0) return 0;
    const valorDiario = valor / diasUteisNoMes;
    return valorDiario * diasTrabalhados;
  }

  return valor;
}

export default function BenefitReceipt() {
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const printRef = useRef();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ status: 'ativo' })
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ['employeeBenefits'],
    queryFn: () => base44.entities.EmployeeBenefit.list()
  });

  const { data: allBenefits = [] } = useQuery({
    queryKey: ['benefits'],
    queryFn: () => base44.entities.Benefit.list()
  });

  const { data: timeRecords = [] } = useQuery({
    queryKey: ['timeRecords'],
    queryFn: () => base44.entities.TimeRecord.list()
  });

  const { data: companySettingsList = [] } = useQuery({
    queryKey: ['companySettings'],
    queryFn: () => base44.entities.CompanySettings.list()
  });

  const companySettings = companySettingsList[0] || {};

  const selectedEmp = employees.find(e => e.id === selectedEmployee);
  const [year, month] = selectedMonth.split('-').map(Number);
  const mesLabel = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Benefícios vinculados ao colaborador
  const empAssignments = allAssignments.filter(a => a.colaborador_id === selectedEmployee && a.status === 'ativo');
  const diasUteis = getDiasUteisMes(year, month);
  const diasTrabalhados = getDiasTrabalhados(timeRecords, year, month, selectedEmployee);
  const faltas = getFaltas(timeRecords, year, month, selectedEmployee);

  const itens = empAssignments.map(a => {
    const benefit = allBenefits.find(b => b.id === a.beneficio_id);
    if (!benefit) return null;
    // Usa valor personalizado do vínculo ou valor padrão do benefício
    const benefitComValor = { ...benefit, valor: a.valor || benefit.valor };
    const valorCalculado = calcValorBeneficio(benefitComValor, diasTrabalhados, faltas, diasUteis);
    return {
      nome: benefit.nome,
      tipo: benefit.tipo,
      regra: benefit.regra_calculo || 'fixo',
      valorBase: a.valor || benefit.valor || 0,
      valorCalculado,
      obs: benefit.regra_calculo === 'proporcional_faltas'
        ? `Base 30 dias − ${faltas} falta(s)/atestado(s) = ${30 - faltas} dias pagos`
        : benefit.regra_calculo === 'por_dias_uteis'
        ? `${diasTrabalhados} presenças / ${diasUteis} dias úteis`
        : 'Valor fixo'
    };
  }).filter(Boolean);

  const totalBeneficios = itens.reduce((s, i) => s + i.valorCalculado, 0);

  const handlePrint = () => {
    const WinPrint = window.open('', '', 'width=900,height=650');
    WinPrint.document.write(`
      <html><head><title>Recibo de Benefícios</title>
      <style>
        body { font-family: Arial; padding: 24px; font-size: 12px; color: #1e293b; }
        h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
        .sub { text-align: center; color: #64748b; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 10px; }
        th { background: #1e3a5f; color: white; text-align: left; }
        .total { font-weight: bold; font-size: 14px; }
        .info { display: flex; gap: 32px; background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px; }
        .logo { text-align: center; margin-bottom: 8px; }
        .assinatura { margin-top: 48px; display: flex; justify-content: space-around; }
        .assinatura div { border-top: 1px solid #000; width: 180px; text-align: center; padding-top: 4px; font-size: 11px; }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `);
    WinPrint.document.close();
    WinPrint.focus();
    WinPrint.print();
    WinPrint.close();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recibo de Benefícios"
        subtitle="Cálculo e emissão de recibos de benefícios por frequência"
        icon={Gift}
        backUrl={createPageUrl('Benefits')}
      />

      <Card>
        <CardContent className="pt-4 flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-500 uppercase">Colaborador</label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.nome_completo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Mês</label>
            <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
          </div>
          {selectedEmployee && itens.length > 0 && (
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir Recibo
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedEmployee && selectedEmp && (
        <Card>
          <CardContent className="pt-6">
            <div ref={printRef}>
              {/* Cabeçalho */}
              <div className="logo text-center mb-4">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg"
                  alt="Logo"
                  className="h-12 mx-auto mb-2"
                />
                <h1 className="text-xl font-bold">RECIBO DE BENEFÍCIOS</h1>
                <p className="text-slate-500 text-sm sub">{mesLabel}</p>
              </div>

              {/* Info colaborador */}
              <div className="info grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm bg-slate-50 p-3 rounded-lg">
                <p><strong>Colaborador:</strong> {selectedEmp.nome_completo}</p>
                <p><strong>CPF:</strong> {selectedEmp.cpf}</p>
                <p><strong>Função:</strong> {selectedEmp.funcao}</p>
                <p><strong>Vínculo:</strong> {selectedEmp.tipo_vinculo?.toUpperCase()}</p>
              </div>

              {/* Resumo frequência */}
              <div className="grid grid-cols-3 gap-3 mb-4 text-sm text-center">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-blue-700">{diasUteis}</p>
                  <p className="text-slate-500 text-xs">Dias Úteis no Mês</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-emerald-700">{diasTrabalhados}</p>
                  <p className="text-slate-500 text-xs">Presenças Registradas</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-red-700">{faltas}</p>
                  <p className="text-slate-500 text-xs">Faltas / Atestados</p>
                </div>
              </div>

              {itens.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Nenhum benefício vinculado a este colaborador.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-700 text-white">
                          <th className="px-3 py-2 border text-left">Benefício</th>
                          <th className="px-3 py-2 border text-center">Regra</th>
                          <th className="px-3 py-2 border text-right">Valor Base</th>
                          <th className="px-3 py-2 border text-left">Cálculo</th>
                          <th className="px-3 py-2 border text-right">Valor a Pagar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="px-3 py-2 border font-medium">{item.nome}</td>
                            <td className="px-3 py-2 border text-center text-xs text-slate-500">
                              {item.regra === 'fixo' ? 'Fixo' : item.regra === 'proporcional_faltas' ? 'Prop. Faltas' : 'Por Presença'}
                            </td>
                            <td className="px-3 py-2 border text-right">{fmt(item.valorBase)}</td>
                            <td className="px-3 py-2 border text-xs text-slate-500">{item.obs}</td>
                            <td className="px-3 py-2 border text-right font-semibold text-emerald-700">{fmt(item.valorCalculado)}</td>
                          </tr>
                        ))}
                        <tr className="bg-emerald-50 font-bold total">
                          <td colSpan={4} className="px-3 py-3 border text-right">TOTAL BENEFÍCIOS</td>
                          <td className="px-3 py-3 border text-right text-emerald-700 text-base">{fmt(totalBeneficios)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="assinatura mt-12 flex justify-around">
                    <div className="text-center">
                      <div className="border-t border-black w-48 pt-2 mx-auto">
                        <p className="text-sm">Colaborador</p>
                        <p className="text-xs text-slate-500">{selectedEmp.nome_completo}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-black w-48 pt-2 mx-auto">
                        <p className="text-sm">Responsável RH</p>
                        <p className="text-xs text-slate-500">{companySettings.nome_empresa || ''}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}