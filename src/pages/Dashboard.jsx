import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  Building2,
  Users,
  HardHat,
  Receipt,
  Bell,
  FileSignature,
  Palmtree,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from '@/components/ui/StatusBadge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Dashboard() {
  console.log('BASE44 ENTITIES:', base44.entities);
  const { data: bankAccounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.list()
  });

  // Queries para cálculo de totais (sem limite de 50)
  const { data: allPayables = [] } = useQuery({
    queryKey: ['allAccountsPayable'],
    queryFn: () => base44.entities.AccountPayable.filter(
      { status: { $in: ['em_aberto', 'atrasado'] } },
      'data_vencimento',
      1000
    )
  });

  const { data: allReceivables = [] } = useQuery({
    queryKey: ['allAccountsReceivable'],
    queryFn: () => base44.entities.AccountReceivable.filter(
      { status: { $in: ['em_aberto', 'atrasado'] } },
      'data_vencimento',
      1000
    )
  });

  // Queries para as listas de "Próximos" (pode manter limite menor se quiser otimizar render, mas já usamos os dados acima)
  const payables = allPayables.slice(0, 50); 
  const receivables = allReceivables.slice(0, 50);
  const loadingPayables = false;
  const loadingReceivables = false;

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-data')
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list()
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.list()
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => base44.entities.EmployeeContract.list()
  });

  // Alertas de RH
  const today = new Date();
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const in60 = new Date(today); in60.setDate(in60.getDate() + 60);

  const alertasContratoExp = contracts.filter(c => {
    if (!c.data_fim_experiencia) return false;
    const fim = new Date(c.data_fim_experiencia + 'T00:00:00');
    return fim >= today && fim <= in30 && c.status === 'vigente';
  });
  const alertasProrrogacao = contracts.filter(c => {
    if (!c.prorrogacao_experiencia) return false;
    const fim = new Date(c.prorrogacao_experiencia + 'T00:00:00');
    return fim >= today && fim <= in30 && c.status === 'vigente';
  });
  const alertasFerias = contracts.filter(c => {
    if (!c.ferias_proximas) return false;
    const ferias = new Date(c.ferias_proximas + 'T00:00:00');
    return ferias >= today && ferias <= in60 && c.status === 'vigente';
  });

  // Próximos vencimentos de contratos de experiência (todos nos próximos 90 dias)
  const in90 = new Date(today); in90.setDate(in90.getDate() + 90);
  const vencimentosExp = contracts
    .filter(c => c.status === 'vigente' && (c.data_fim_experiencia || c.prorrogacao_experiencia))
    .map(c => {
      const datas = [];
      if (c.data_fim_experiencia) {
        const d = new Date(c.data_fim_experiencia + 'T00:00:00');
        if (d >= today && d <= in90) datas.push({ contrato: c, data: d, tipo: '1ª Experiência' });
      }
      if (c.prorrogacao_experiencia) {
        const d = new Date(c.prorrogacao_experiencia + 'T00:00:00');
        if (d >= today && d <= in90) datas.push({ contrato: c, data: d, tipo: 'Prorrogação' });
      }
      return datas;
    })
    .flat()
    .sort((a, b) => a.data - b.data);

  const diffDias = (d) => Math.ceil((d - today) / (1000 * 60 * 60 * 24));

  // Cálculos
  const totalSaldo = bankAccounts.reduce((sum, acc) => sum + (acc.saldo_atual || 0), 0);
  
  const totalAPagar = allPayables
    .filter(p => p.status === 'em_aberto' || p.status === 'atrasado')
    .reduce((sum, p) => sum + (p.valor || 0), 0);
  
  const totalAReceber = allReceivables
    .filter(r => r.status === 'em_aberto' || r.status === 'atrasado')
    .reduce((sum, r) => sum + (r.valor || 0), 0);

  const contasAtrasadasPagar = allPayables.filter(p => p.status === 'atrasado').length;
  const contasAtrasadasReceber = allReceivables.filter(r => r.status === 'atrasado').length;

  // Dados para gráfico de fluxo
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), 5 - i);
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    
    const entradas = transactions
      .filter(t => t.tipo === 'entrada' && new Date(t.data) >= monthStart && new Date(t.data) <= monthEnd)
      .reduce((sum, t) => sum + (t.valor || 0), 0);
    
    const saidas = transactions
      .filter(t => t.tipo === 'saida' && new Date(t.data) >= monthStart && new Date(t.data) <= monthEnd)
      .reduce((sum, t) => sum + (t.valor || 0), 0);

    return {
      mes: format(date, 'MMM', { locale: ptBR }),
      entradas,
      saidas
    };
  });

  // Dados para gráfico de despesas por centro de custo
  const despesasPorCC = costCenters.map(cc => {
    const total = transactions
      .filter(t => t.tipo === 'saida' && t.centro_custo_id === cc.id)
      .reduce((sum, t) => sum + (t.valor || 0), 0);
    return { name: cc.nome, value: total };
  }).filter(d => d.value > 0);

  const isLoading = loadingAccounts || loadingPayables || loadingReceivables;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
          <LayoutDashboard className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Financeiro</h1>
          <p className="text-slate-500">Visão geral do módulo financeiro</p>
        </div>
      </div>

      {/* Cards Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Saldo Total</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32 bg-blue-400/50" />
                ) : (
                  <p className="text-2xl font-bold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaldo)}
                  </p>
                )}
              </div>
              <Wallet className="h-10 w-10 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm">A Receber</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <p className="text-2xl font-bold text-emerald-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAReceber)}
                  </p>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <ArrowUpCircle className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            {contasAtrasadasReceber > 0 && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {contasAtrasadasReceber} atrasada(s)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm">A Pagar</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <p className="text-2xl font-bold text-red-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAPagar)}
                  </p>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <ArrowDownCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
            {contasAtrasadasPagar > 0 && (
              <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {contasAtrasadasPagar} atrasada(s)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm">Saldo Previsto</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <p className={`text-2xl font-bold ${totalSaldo + totalAReceber - totalAPagar >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaldo + totalAReceber - totalAPagar)}
                  </p>
                )}
              </div>
              <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Fluxo de Caixa - Últimos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last6Months}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                  />
                  <Area type="monotone" dataKey="entradas" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Entradas" />
                  <Area type="monotone" dataKey="saidas" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Saídas" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Despesas por Centro de Custo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {despesasPorCC.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={despesasPorCC}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {despesasPorCC.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Nenhuma despesa registrada
                </div>
              )}
            </div>
            {despesasPorCC.length > 0 && (
              <div className="mt-4 space-y-2">
                {despesasPorCC.slice(0, 4).map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-slate-600 truncate">{item.name}</span>
                    </div>
                    <span className="font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Atalhos e Estatísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => window.location.href = createPageUrl('Suppliers')}
        >
          <CardContent className="pt-6 text-center">
            <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{suppliers.length}</p>
            <p className="text-sm text-slate-500">Fornecedores</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => window.location.href = createPageUrl('Clients')}
        >
          <CardContent className="pt-6 text-center">
            <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center mx-auto mb-3">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{clients.length}</p>
            <p className="text-sm text-slate-500">Clientes</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => window.location.href = createPageUrl('Projects')}
        >
          <CardContent className="pt-6 text-center">
            <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
              <HardHat className="h-6 w-6 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{projects.filter(p => p.status === 'em_andamento').length}</p>
            <p className="text-sm text-slate-500">Obras Ativas</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => window.location.href = createPageUrl('Transactions')}
        >
          <CardContent className="pt-6 text-center">
            <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Receipt className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{transactions.length}</p>
            <p className="text-sm text-slate-500">Transações</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas de RH */}
      {(alertasContratoExp.length > 0 || alertasProrrogacao.length > 0 || alertasFerias.length > 0) && (
        <Card className="border-amber-300 bg-amber-50 mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-800 text-base">
              <Bell className="h-5 w-5" /> Alertas de RH
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertasContratoExp.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-amber-200">
                <FileSignature className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">{c.colaborador_nome}</span>
                  <span className="text-amber-700 ml-2">— Fim do contrato de experiência em {new Date(c.data_fim_experiencia + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
                <Button variant="ghost" size="sm" className="text-amber-700 text-xs" onClick={() => window.location.href = createPageUrl('EmployeeContracts')}>Ver</Button>
              </div>
            ))}
            {alertasProrrogacao.map(c => (
              <div key={`prorr-${c.id}`} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-amber-200">
                <FileSignature className="h-4 w-4 text-orange-600 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">{c.colaborador_nome}</span>
                  <span className="text-orange-700 ml-2">— Fim da prorrogação de experiência em {new Date(c.prorrogacao_experiencia + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
                <Button variant="ghost" size="sm" className="text-orange-700 text-xs" onClick={() => window.location.href = createPageUrl('EmployeeContracts')}>Ver</Button>
              </div>
            ))}
            {alertasFerias.map(c => (
              <div key={`ferias-${c.id}`} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-blue-200">
                <AlertTriangle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">{c.colaborador_nome}</span>
                  <span className="text-blue-700 ml-2">— Férias previstas em {new Date(c.ferias_proximas + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
                <Button variant="ghost" size="sm" className="text-blue-700 text-xs" onClick={() => window.location.href = createPageUrl('EmployeeContracts')}>Ver</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vencimentos de Contratos de Experiência */}
      {vencimentosExp.length > 0 && (
        <Card className="border-purple-200 mb-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-purple-800 text-base">
              <Clock className="h-5 w-5 text-purple-600" /> Próximos Vencimentos — Contratos de Experiência
            </CardTitle>
            <Button variant="ghost" size="sm" className="text-purple-700 text-xs" onClick={() => window.location.href = createPageUrl('EmployeeContracts')}>
              Ver contratos
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vencimentosExp.slice(0, 6).map((item, i) => {
                const dias = diffDias(item.data);
                const urgente = dias <= 7;
                const proximo = dias <= 15;
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${urgente ? 'bg-red-50 border-red-200' : proximo ? 'bg-amber-50 border-amber-200' : 'bg-purple-50 border-purple-100'}`}>
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${urgente ? 'bg-red-100 text-red-700' : proximo ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                      {dias}d
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm truncate">{item.contrato.colaborador_nome}</p>
                      <p className={`text-xs ${urgente ? 'text-red-600' : proximo ? 'text-amber-600' : 'text-purple-600'}`}>
                        {item.tipo} — {item.data.toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contas Próximas do Vencimento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Próximos Pagamentos</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => window.location.href = createPageUrl('AccountsPayable')}
            >
              Ver todos
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {payables
                .filter(p => p.status === 'em_aberto' || p.status === 'atrasado')
                .slice(0, 5)
                .map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{p.descricao}</p>
                      <p className="text-sm text-slate-500">
                        Vence em {format(new Date(p.data_vencimento + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-red-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor)}
                      </p>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              {payables.filter(p => p.status === 'em_aberto' || p.status === 'atrasado').length === 0 && (
                <p className="text-slate-500 text-center py-4">Nenhuma conta pendente</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Próximos Recebimentos</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => window.location.href = createPageUrl('AccountsReceivable')}
            >
              Ver todos
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {receivables
                .filter(r => r.status === 'em_aberto' || r.status === 'atrasado')
                .slice(0, 5)
                .map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 truncate">{r.descricao}</p>
                      <p className="text-sm text-slate-500">
                        Previsto para {format(new Date(r.data_vencimento + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-emerald-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor)}
                      </p>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))}
              {receivables.filter(r => r.status === 'em_aberto' || r.status === 'atrasado').length === 0 && (
                <p className="text-slate-500 text-center py-4">Nenhum recebimento pendente</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
