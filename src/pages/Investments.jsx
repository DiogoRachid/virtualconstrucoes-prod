import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Wallet,
  PiggyBank,
  LineChart,
  Bitcoin,
  Globe,
  Building,
  Loader2,
  AlertCircle
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { fetchQuotes, fetchEconomicIndicators } from '@/components/investments/QuoteService';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

const CATEGORY_CONFIG = {
  renda_fixa: { label: 'Renda Fixa', icon: PiggyBank, color: 'bg-blue-500' },
  renda_variavel_br: { label: 'Renda Variável BR', icon: LineChart, color: 'bg-emerald-500' },
  renda_variavel_int: { label: 'Renda Variável INT', icon: Globe, color: 'bg-purple-500' },
  fundos: { label: 'Fundos', icon: Building, color: 'bg-amber-500' },
  crypto: { label: 'Criptomoedas', icon: Bitcoin, color: 'bg-orange-500' }
};

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f97316'];

export default function Investments() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [isUpdatingQuotes, setIsUpdatingQuotes] = useState(false);
  const [indicators, setIndicators] = useState(null);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const queryClient = useQueryClient();

  const { data: investments = [], isLoading } = useQuery({
    queryKey: ['investments'],
    queryFn: () => base44.entities.Investment.filter({ status: 'ativo' }, '-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Investment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      setDeleteId(null);
      toast.success('Investimento excluído');
    }
  });

  // Carregar indicadores econômicos
  useEffect(() => {
    const loadIndicators = async () => {
      setLoadingIndicators(true);
      try {
        const data = await fetchEconomicIndicators();
        setIndicators(data);
      } catch (error) {
        console.error('Erro ao carregar indicadores:', error);
      }
      setLoadingIndicators(false);
    };
    loadIndicators();
  }, []);

  // Atualizar cotações
  const updateQuotes = async () => {
    setIsUpdatingQuotes(true);
    try {
      const tickersToUpdate = investments
        .filter(inv => inv.ticker && ['renda_variavel_br', 'renda_variavel_int', 'crypto', 'fundos'].includes(inv.categoria))
        .map(inv => inv.ticker);

      if (tickersToUpdate.length === 0) {
        toast.info('Nenhum ativo com ticker para atualizar');
        setIsUpdatingQuotes(false);
        return;
      }

      const quotes = await fetchQuotes(tickersToUpdate);
      const usdBrl = quotes['USD_BRL']?.price || 5.0;

      for (const inv of investments) {
        if (inv.ticker && quotes[inv.ticker.toUpperCase()]) {
          const quote = quotes[inv.ticker.toUpperCase()];
          let cotacao = quote.price;

          // Converter USD para BRL se necessário
          if (quote.currency === 'USD' && ['renda_variavel_int', 'crypto'].includes(inv.categoria)) {
            cotacao = quote.price * usdBrl;
          }

          const valorAtual = inv.quantidade ? inv.quantidade * cotacao : cotacao;
          const rentabilidadeValor = valorAtual - (inv.valor_investido || 0);
          const rentabilidadePercent = inv.valor_investido ? ((valorAtual / inv.valor_investido) - 1) * 100 : 0;

          await base44.entities.Investment.update(inv.id, {
            cotacao_atual: cotacao,
            valor_atual: valorAtual,
            rentabilidade_valor: rentabilidadeValor,
            rentabilidade_percentual: rentabilidadePercent,
            ultima_atualizacao: new Date().toISOString()
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['investments'] });
      toast.success('Cotações atualizadas com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar cotações:', error);
      toast.error('Erro ao atualizar cotações');
    }
    setIsUpdatingQuotes(false);
  };

  const filteredInvestments = investments.filter(inv => {
    const matchSearch = !search || 
      inv.nome?.toLowerCase().includes(search.toLowerCase()) ||
      inv.ticker?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || inv.categoria === categoryFilter;
    return matchSearch && matchCategory;
  });

  // Totais por categoria
  const totalsByCategory = Object.keys(CATEGORY_CONFIG).map(cat => {
    const total = investments
      .filter(inv => inv.categoria === cat)
      .reduce((sum, inv) => sum + (inv.valor_atual || inv.valor_investido || 0), 0);
    return { name: CATEGORY_CONFIG[cat].label, value: total, categoria: cat };
  }).filter(c => c.value > 0);

  const totalInvestido = investments.reduce((sum, inv) => sum + (inv.valor_investido || 0), 0);
  const totalAtual = investments.reduce((sum, inv) => sum + (inv.valor_atual || inv.valor_investido || 0), 0);
  const totalRentabilidade = totalAtual - totalInvestido;
  const rentabilidadePercent = totalInvestido > 0 ? ((totalAtual / totalInvestido) - 1) * 100 : 0;

  const columns = [
    {
      header: 'Investimento',
      render: (row) => {
        const config = CATEGORY_CONFIG[row.categoria];
        const Icon = config?.icon || Wallet;
        return (
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${config?.color || 'bg-slate-500'} bg-opacity-20 flex items-center justify-center flex-shrink-0`}>
              <Icon className={`h-5 w-5 ${config?.color?.replace('bg-', 'text-') || 'text-slate-600'}`} />
            </div>
            <div>
              <p className="font-medium text-slate-900">{row.nome}</p>
              <p className="text-sm text-slate-500">{row.ticker || row.tipo}</p>
            </div>
          </div>
        );
      }
    },
    {
      header: 'Tipo',
      render: (row) => (
        <span className="text-slate-700">{row.tipo}</span>
      )
    },
    {
      header: 'Valor Investido',
      render: (row) => (
        <span className="font-medium text-slate-900">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_investido || 0)}
        </span>
      )
    },
    {
      header: 'Valor Atual',
      render: (row) => (
        <span className="font-medium text-slate-900">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_atual || row.valor_investido || 0)}
        </span>
      )
    },
    {
      header: 'Rentabilidade',
      render: (row) => {
        const rent = row.rentabilidade_percentual || 0;
        const isPositive = rent >= 0;
        return (
          <div className="flex items-center gap-1">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {rent >= 0 ? '+' : ''}{rent.toFixed(2)}%
            </span>
          </div>
        );
      }
    },
    {
      header: '',
      className: 'w-12',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`InvestmentDetail?id=${row.id}`)}>
              <Eye className="h-4 w-4 mr-2" />
              Visualizar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`InvestmentForm?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteId(row.id)} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Investimentos"
        subtitle="Gerencie sua carteira de investimentos"
        icon={TrendingUp}
        actionLabel="Novo Investimento"
        onAction={() => window.location.href = createPageUrl('InvestmentForm')}
      />

      {/* Indicadores Econômicos */}
      {indicators && (
        <div className="mb-6 p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-slate-700">Indicadores do Mercado</h3>
            {loadingIndicators && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
            <div>
              <p className="text-slate-500">SELIC</p>
              <p className="font-semibold">{indicators.selic?.toFixed(2)}% a.a.</p>
            </div>
            <div>
              <p className="text-slate-500">CDI</p>
              <p className="font-semibold">{indicators.cdi?.toFixed(2)}% a.a.</p>
            </div>
            <div>
              <p className="text-slate-500">IPCA 12m</p>
              <p className="font-semibold">{indicators.ipca?.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-slate-500">Dólar</p>
              <p className="font-semibold">R$ {indicators.dolar?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-slate-500">Euro</p>
              <p className="font-semibold">R$ {indicators.euro?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-slate-500">IBOVESPA</p>
              <p className="font-semibold">{indicators.ibovespa?.toLocaleString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-slate-500">IBOV Var.</p>
              <p className={`font-semibold ${(indicators.ibovespa_change || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {(indicators.ibovespa_change || 0) >= 0 ? '+' : ''}{indicators.ibovespa_change?.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="pt-6">
            <p className="text-blue-100 text-sm">Total Investido</p>
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInvestido)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Patrimônio Atual</p>
            <p className="text-2xl font-bold text-slate-900">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAtual)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Rentabilidade Total</p>
            <p className={`text-2xl font-bold ${totalRentabilidade >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalRentabilidade >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRentabilidade)}
            </p>
            <p className={`text-sm ${rentabilidadePercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {rentabilidadePercent >= 0 ? '+' : ''}{rentabilidadePercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Ativos</p>
            <p className="text-2xl font-bold text-slate-900">{investments.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico e Ações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Carteira por Categoria</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={updateQuotes}
              disabled={isUpdatingQuotes}
            >
              {isUpdatingQuotes ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Atualizar Cotações
            </Button>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" onValueChange={setCategoryFilter}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">Todos</TabsTrigger>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <TabsTrigger key={key} value={key}>{config.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Alocação</CardTitle>
          </CardHeader>
          <CardContent>
            {totalsByCategory.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={totalsByCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {totalsByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
                Nenhum investimento cadastrado
              </div>
            )}
            <div className="mt-4 space-y-2">
              {totalsByCategory.map((item, index) => (
                <div key={item.categoria} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-slate-600">{item.name}</span>
                  </div>
                  <span className="font-medium">
                    {((item.value / totalAtual) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Tabela */}
      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome ou ticker..."
        onClearFilters={() => {
          setSearch('');
          setCategoryFilter('all');
        }}
      />

      <DataTable
        columns={columns}
        data={filteredInvestments}
        isLoading={isLoading}
        onRowClick={(row) => window.location.href = createPageUrl(`InvestmentDetail?id=${row.id}`)}
        emptyComponent={
          <EmptyState
            icon={TrendingUp}
            title="Nenhum investimento cadastrado"
            description="Comece cadastrando seus investimentos para acompanhar sua carteira."
            actionLabel="Novo Investimento"
            onAction={() => window.location.href = createPageUrl('InvestmentForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir investimento"
        description="Tem certeza que deseja excluir este investimento? Todo o histórico será perdido."
      />
    </div>
  );
}