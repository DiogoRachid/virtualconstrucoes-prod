import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { DollarSign, Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Tabela INSS 2024 (simplificada)
function calcINSS(salario) {
  if (salario <= 1412) return salario * 0.075;
  if (salario <= 2666.68) return salario * 0.09;
  if (salario <= 4000.03) return salario * 0.12;
  if (salario <= 7786.02) return salario * 0.14;
  return 908.85; // teto
}

// Tabela IRRF 2024
function calcIRRF(baseCalculo) {
  if (baseCalculo <= 2259.20) return 0;
  if (baseCalculo <= 2826.65) return baseCalculo * 0.075 - 169.44;
  if (baseCalculo <= 3751.05) return baseCalculo * 0.15 - 381.44;
  if (baseCalculo <= 4664.68) return baseCalculo * 0.225 - 662.77;
  return baseCalculo * 0.275 - 896.00;
}

const EMPTY_ROW = (emp) => ({
  colaborador_id: emp.id,
  colaborador_nome: emp.nome_completo,
  obra_id: emp.obra_id || '',
  obra_nome: emp.obra_nome || '',
  dias_trabalhados: 22,
  horas_trabalhadas: 0,
  faltas: 0,
  salario_base: emp.salario || 0,
  horas_extras_50: 0,
  horas_extras_100: 0,
  valor_horas_extras: 0,
  adicional_noturno: 0,
  insalubridade: 0,
  periculosidade: 0,
  vale_transporte: emp.vale_transporte ? (emp.salario || 0) * 0.06 : 0,
  vale_compras: emp.vale_compras || 0,
  cafe_manha: 0,
  adiantamento: 0,
  outros_proventos: 0,
  outros_proventos_desc: '',
  inss: 0,
  irrf: 0,
  fgts: 0,
  desconto_vt: emp.vale_transporte ? (emp.salario || 0) * 0.06 : 0,
  desconto_faltas: 0,
  desconto_atrasos: 0,
  outros_descontos: 0,
  outros_descontos_desc: '',
  total_proventos: 0,
  total_descontos: 0,
  valor_bruto: emp.salario || 0,
  valor_liquido: 0
});

function calcTotais(row) {
  const tipo_salario = row._tipo_salario || 'mensal';
  const salarioBase = parseFloat(row.salario_base) || 0;
  const diasTrab = parseFloat(row.dias_trabalhados) || 0;
  const faltas = parseFloat(row.faltas) || 0;
  const horasExtras50 = parseFloat(row.horas_extras_50) || 0;
  const horasExtras100 = parseFloat(row.horas_extras_100) || 0;

  // Valor hora
  const valorHora = tipo_salario === 'hora' ? salarioBase : salarioBase / 220;
  const salarioProporcional = tipo_salario === 'hora' ? salarioBase * (diasTrab * 8) : salarioBase;

  // Horas extras
  const valorHE = (horasExtras50 * valorHora * 1.5) + (horasExtras100 * valorHora * 2);

  const proventos = salarioProporcional
    + (parseFloat(row.adicional_noturno) || 0)
    + (parseFloat(row.insalubridade) || 0)
    + (parseFloat(row.periculosidade) || 0)
    + valorHE
    + (parseFloat(row.vale_transporte) || 0)
    + (parseFloat(row.vale_compras) || 0)
    + (parseFloat(row.cafe_manha) || 0)
    + (parseFloat(row.outros_proventos) || 0);

  const valorBruto = salarioProporcional + valorHE
    + (parseFloat(row.adicional_noturno) || 0)
    + (parseFloat(row.insalubridade) || 0)
    + (parseFloat(row.periculosidade) || 0);

  const inss = parseFloat(row.inss) !== 0 ? parseFloat(row.inss) || 0 : Math.round(calcINSS(valorBruto) * 100) / 100;
  const baseIRRF = valorBruto - inss;
  const irrf = parseFloat(row.irrf) !== 0 ? parseFloat(row.irrf) || 0 : Math.round(Math.max(0, calcIRRF(baseIRRF)) * 100) / 100;
  const fgts = parseFloat(row.fgts) !== 0 ? parseFloat(row.fgts) || 0 : Math.round(valorBruto * 0.08 * 100) / 100;

  const descontoFaltas = faltas > 0 ? (salarioBase / 30) * faltas : 0;
  const totalDescontos = inss + irrf
    + (parseFloat(row.desconto_vt) || 0)
    + descontoFaltas
    + (parseFloat(row.desconto_atrasos) || 0)
    + (parseFloat(row.adiantamento) || 0)
    + (parseFloat(row.outros_descontos) || 0);

  const liquido = proventos - totalDescontos;

  return {
    valor_horas_extras: Math.round(valorHE * 100) / 100,
    total_proventos: Math.round(proventos * 100) / 100,
    inss, irrf, fgts,
    desconto_faltas: Math.round(descontoFaltas * 100) / 100,
    total_descontos: Math.round(totalDescontos * 100) / 100,
    valor_bruto: Math.round(valorBruto * 100) / 100,
    valor_liquido: Math.round(Math.max(0, liquido) * 100) / 100
  };
}

const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function PayrollForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const payrollId = urlParams.get('id');
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`;

  const [mesReferencia, setMesReferencia] = useState(currentMonth);
  const [dataPagamento, setDataPagamento] = useState(today);
  const [rows, setRows] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState('all');
  const [centroCustoId, setCentroCustoId] = useState('');
  const [centroCustoNome, setCentroCustoNome] = useState('');

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => base44.entities.Employee.filter({ status: 'ativo' }) });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list() });
  const { data: costCenters = [] } = useQuery({ queryKey: ['costCenters'], queryFn: () => base44.entities.CostCenter.list() });
  const { data: bankAccounts = [] } = useQuery({ queryKey: ['bankAccounts'], queryFn: () => base44.entities.BankAccount.list() });
  const { data: existingPayroll } = useQuery({
    queryKey: ['payroll', payrollId],
    queryFn: async () => (await base44.entities.Payroll.filter({ id: payrollId }))[0],
    enabled: !!payrollId
  });

  useEffect(() => {
    if (employees.length && rows.length === 0 && !payrollId) {
      const empsToLoad = selectedEmpId === 'all' ? employees : employees.filter(e => e.id === selectedEmpId);
      setRows(empsToLoad.map(emp => ({ ...EMPTY_ROW(emp), _tipo_salario: emp.tipo_salario || 'mensal' })));
    }
  }, [employees]);

  useEffect(() => {
    if (existingPayroll) {
      setMesReferencia(existingPayroll.mes_referencia || currentMonth);
      setDataPagamento(existingPayroll.data_pagamento || today);
      setCentroCustoId(existingPayroll.centro_custo_id || '');
      setCentroCustoNome(existingPayroll.centro_custo_nome || '');
      setRows([{ ...existingPayroll }]);
    }
  }, [existingPayroll]);

  const setRow = (idx, field, value) => {
    setRows(prev => {
      const updated = prev.map((r, i) => {
        if (i !== idx) return r;
        const newRow = { ...r, [field]: value };
        const calcs = calcTotais(newRow);
        return { ...newRow, ...calcs };
      });
      return updated;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const itauEmpresas = bankAccounts.find(a => a.nome?.toLowerCase().includes('itaú') || a.nome?.toLowerCase().includes('itau'));
      const promises = rows.filter(r => parseFloat(r.salario_base) > 0).map(async (row) => {
        const calcs = calcTotais(row);
        const payload = {
          ...row, ...calcs,
          mes_referencia: mesReferencia,
          data_pagamento: dataPagamento,
          status: payrollId ? (existingPayroll?.status || 'pendente') : 'pendente',
          centro_custo_id: centroCustoId,
          centro_custo_nome: centroCustoNome
        };
        delete payload._tipo_salario;

        if (payrollId) {
          return base44.entities.Payroll.update(payrollId, payload);
        }
        const payroll = await base44.entities.Payroll.create(payload);
        await base44.entities.AccountPayable.create({
          descricao: `Folha - ${row.colaborador_nome} - ${mesReferencia}`,
          valor: calcs.valor_liquido,
          data_vencimento: dataPagamento,
          data_compra: today,
          conta_bancaria_id: itauEmpresas?.id || '',
          conta_bancaria_nome: itauEmpresas?.nome || '',
          status: 'em_aberto',
          forma_pagamento: 'transferencia',
          centro_custo_id: centroCustoId,
          centro_custo_nome: centroCustoNome,
          obra_id: row.obra_id || '',
          obra_nome: row.obra_nome || ''
        });
        return payroll;
      });
      return Promise.all(promises);
    },
    onSuccess: (r) => { toast.success(`${r.length} holerite(s) lançado(s)!`); queryClient.invalidateQueries({ queryKey: ['payrolls'] }); window.location.href = createPageUrl('Payrolls'); },
    onError: () => toast.error('Erro ao salvar folha')
  });

  const totalLiquido = rows.reduce((s, r) => s + (calcTotais(r).valor_liquido || 0), 0);

  const F = ({ label, children }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{label}</span>
      {children}
    </div>
  );

  const numInput = (idx, field, label, className = '') => (
    <F label={label}>
      <Input type="number" step="0.01" value={rows[idx]?.[field] ?? 0}
        onChange={e => setRow(idx, field, parseFloat(e.target.value) || 0)}
        className={`h-7 text-xs text-right ${className}`} />
    </F>
  );

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={payrollId ? 'Editar Holerite' : 'Lançar Folha de Pagamento'}
        subtitle="Proventos, descontos e valor líquido por colaborador"
        icon={DollarSign}
        backUrl={createPageUrl('Payrolls')}
      />

      {/* Dados Gerais */}
      <Card>
        <CardHeader><CardTitle>Dados Gerais</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Mês de Referência *</Label>
            <Input value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} placeholder="MM/YYYY" />
          </div>
          <div>
            <Label>Data de Pagamento *</Label>
            <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
          </div>
          <div>
            <Label>Centro de Custo</Label>
            <Select value={centroCustoId} onValueChange={v => { const cc = costCenters.find(c => c.id === v); setCentroCustoId(v); setCentroCustoNome(cc?.nome || ''); }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {costCenters.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!payrollId && (
            <div>
              <Label>Colaborador</Label>
              <Select value={selectedEmpId} onValueChange={v => {
                setSelectedEmpId(v);
                const emps = v === 'all' ? employees : employees.filter(e => e.id === v);
                setRows(emps.map(emp => ({ ...EMPTY_ROW(emp), _tipo_salario: emp.tipo_salario || 'mensal' })));
              }}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os colaboradores</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome_completo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Planilha de holerites */}
      {rows.map((row, idx) => {
        const calcs = calcTotais(row);
        return (
          <Card key={idx} className="border-l-4 border-l-blue-500">
            <CardHeader className="py-3 px-5 bg-slate-50 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{row.colaborador_nome}</CardTitle>
                <p className="text-xs text-slate-500">Salário base: {fmtBRL(row.salario_base)} {row._tipo_salario === 'hora' ? '/h' : '/mês'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Valor Líquido</p>
                <p className="text-lg font-bold text-blue-700">{fmtBRL(calcs.valor_liquido)}</p>
              </div>
            </CardHeader>
            <CardContent className="pt-4 pb-5 px-5 space-y-5">
              {/* Frequência */}
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase mb-2">Frequência</p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {numInput(idx, 'dias_trabalhados', 'Dias Trabalhados')}
                  {numInput(idx, 'horas_trabalhadas', 'Horas Trabalhadas')}
                  {numInput(idx, 'faltas', 'Faltas', 'text-red-600')}
                  {numInput(idx, 'horas_extras_50', 'HE 50%')}
                  {numInput(idx, 'horas_extras_100', 'HE 100%')}
                  <F label="Obra">
                    <Select value={row.obra_id || ''} onValueChange={v => { const p = projects.find(x => x.id === v); setRow(idx, 'obra_id', v); setRow(idx, 'obra_nome', p?.nome || ''); }}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </F>
                </div>
              </div>

              {/* Proventos */}
              <div>
                <p className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>Proventos
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <F label="Salário Base"><p className="text-xs font-semibold h-7 flex items-center px-2 bg-slate-50 rounded border">{fmtBRL(row.salario_base)}</p></F>
                  <F label="HE (calculado)"><p className="text-xs font-semibold h-7 flex items-center px-2 bg-green-50 rounded border">{fmtBRL(calcs.valor_horas_extras)}</p></F>
                  {numInput(idx, 'adicional_noturno', 'Adicional Noturno')}
                  {numInput(idx, 'insalubridade', 'Insalubridade')}
                  {numInput(idx, 'periculosidade', 'Periculosidade')}
                  {numInput(idx, 'vale_transporte', 'Vale Transporte')}
                  {numInput(idx, 'vale_compras', 'Vale Compras')}
                  {numInput(idx, 'cafe_manha', 'Café da Manhã')}
                  {numInput(idx, 'outros_proventos', 'Outros Proventos')}
                  <F label="Descrição Outros">
                    <Input value={row.outros_proventos_desc || ''} onChange={e => setRow(idx, 'outros_proventos_desc', e.target.value)} className="h-7 text-xs" placeholder="Descreva..." />
                  </F>
                </div>
                <div className="mt-2 text-right">
                  <span className="text-sm font-bold text-green-700">Total Proventos: {fmtBRL(calcs.total_proventos)}</span>
                </div>
              </div>

              {/* Descontos */}
              <div>
                <p className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>Descontos
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <F label="INSS (auto)">
                    <Input type="number" step="0.01" value={row.inss !== 0 ? row.inss : calcs.inss}
                      onChange={e => setRow(idx, 'inss', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-right bg-red-50" />
                  </F>
                  <F label="IRRF (auto)">
                    <Input type="number" step="0.01" value={row.irrf !== 0 ? row.irrf : calcs.irrf}
                      onChange={e => setRow(idx, 'irrf', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-right bg-red-50" />
                  </F>
                  <F label="FGTS (auto)">
                    <Input type="number" step="0.01" value={row.fgts !== 0 ? row.fgts : calcs.fgts}
                      onChange={e => setRow(idx, 'fgts', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs text-right bg-orange-50" />
                  </F>
                  {numInput(idx, 'desconto_vt', 'Desc. Vale Transporte (6%)', 'bg-red-50')}
                  <F label="Desc. Faltas (auto)"><p className="text-xs font-semibold h-7 flex items-center px-2 bg-red-50 rounded border text-red-700">{fmtBRL(calcs.desconto_faltas)}</p></F>
                  {numInput(idx, 'desconto_atrasos', 'Desc. Atrasos', 'bg-red-50')}
                  {numInput(idx, 'adiantamento', 'Adiantamento', 'bg-red-50')}
                  {numInput(idx, 'outros_descontos', 'Outros Descontos', 'bg-red-50')}
                  <F label="Descrição Outros">
                    <Input value={row.outros_descontos_desc || ''} onChange={e => setRow(idx, 'outros_descontos_desc', e.target.value)} className="h-7 text-xs" placeholder="Descreva..." />
                  </F>
                </div>
                <div className="mt-2 text-right">
                  <span className="text-sm font-bold text-red-700">Total Descontos: {fmtBRL(calcs.total_descontos)}</span>
                </div>
              </div>

              {/* Resumo */}
              <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-3 gap-4 text-sm border">
                <div><p className="text-slate-500">Valor Bruto</p><p className="font-bold">{fmtBRL(calcs.valor_bruto)}</p></div>
                <div><p className="text-slate-500">Total Descontos</p><p className="font-bold text-red-600">- {fmtBRL(calcs.total_descontos)}</p></div>
                <div><p className="text-slate-500">Valor Líquido</p><p className="font-bold text-blue-700 text-lg">{fmtBRL(calcs.valor_liquido)}</p></div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Rodapé total */}
      {rows.length > 1 && (
        <div className="flex justify-end">
          <div className="bg-blue-600 text-white rounded-xl px-6 py-3">
            <p className="text-sm opacity-80">Total Líquido da Folha</p>
            <p className="text-2xl font-bold">{fmtBRL(totalLiquido)}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => window.location.href = createPageUrl('Payrolls')}>Cancelar</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Save className="h-4 w-4 mr-2" />Lançar Folha
        </Button>
      </div>
    </div>
  );
}