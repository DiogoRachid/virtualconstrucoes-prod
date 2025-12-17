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
import { fetchEconomicIndicators } from '@/components/investments/QuoteService';
import BatchUpdateQuotesDialog from '@/components/investments/BatchUpdateQuotesDialog';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { Calendar as CalendarIcon, Save } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

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
  const [showBatchUpdate, setShowBatchUpdate] = useState(false);
  const [indicators, setIndicators] = useState(null);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const queryClient = useQueryClient();

  const { data: investments = [], isLoading } = useQuery({
    queryKey: ['investments'],
    queryFn: () => base44.entities.Investment.filter({ status: 'ativo' }, '-created_date')
  });

  const { data: history = [] } = useQuery({
    queryKey: ['investment_history'],
    queryFn: () => base44.entities.InvestmentHistory.list('data', 30) // Últimos 30 registros
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

  // Removida atualização automática de cotações em favor da manual

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

  // Histórico de Evolução
  const [historyDate, setHistoryDate] = useState(new Date());

  const handleSaveHistory = async () => {
    try {
      const dateStr = format(historyDate, 'yyyy-MM-dd');
      
      // Verificar se já existe registro na data
      const existing = await base44.entities.InvestmentHistory.filter({ data: dateStr });
      if (existing && existing.length > 0) {
         if (!confirm(`Já existe um histórico salvo para ${format(historyDate, 'dd/MM/yyyy')}. Deseja sobrescrever?`)) {
            return;
         }
         await base44.entities.InvestmentHistory.delete(existing[0].id);
      }

      await base44.entities.InvestmentHistory.create({
        data: dateStr,
        valor_total_investido: totalInvestido,
        valor_total_atual: totalAtual,
        rentabilidade_valor: totalRentabilidade,
        rentabilidade_percentual: rentabilidadePercent,
        detalhes: totalsByCategory // Salva o snapshot das categorias
      });

      queryClient.invalidateQueries({ queryKey: ['investment_history'] });
      toast.success(`Histórico salvo para ${format(historyDate, 'dd/MM/yyyy')}`);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar histórico");
    }
  };

  // Dados para o gráfico de evolução (ordena cronologicamente)
  const evolutionData = [...history].sort((a,b) => new Date(a.data) - new Date(b.data)).map(h => ({
     data: format(new Date(h.data), 'dd/MM'),
     total: h.valor_total_atual,
     investido: h.valor_total_investido
  }));

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
      render: (row) => {
        const isInternational = ['renda_variavel_int', 'crypto'].includes(row.categoria);
        const cotacaoUSD = row.cotacao_atual_usd;
        const valorAtualUSD = row.valor_atual_usd;
        
        return (
          <div>
            <span className="font-medium text-slate-900">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_atual || row.valor_investido || 0)}
            </span>
            {isInternational && valorAtualUSD > 0 && (
              <p className="text-xs text-slate-500">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(valorAtualUSD)}
              </p>
            )}
          </div>
        );
      }
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

      {/* Dashboard de Investimentos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Patrimônio Total */}
        <Card className="md:col-span-1 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0 shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">Patrimônio Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-1">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAtual)}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300 mb-6">
              <span>Investido: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInvestido)}</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Rentabilidade R$</span>
                <span className={`font-semibold ${totalRentabilidade >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalRentabilidade >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRentabilidade)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Rentabilidade %</span>
                <span className={`font-semibold ${rentabilidadePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {rentabilidadePercent >= 0 ? '+' : ''}{rentabilidadePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo por Categoria */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-500">Alocação por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Object.keys(CATEGORY_CONFIG).map(cat => {
                const totalCat = investments
                  .filter(inv => inv.categoria === cat)
                  .reduce((sum, inv) => sum + (inv.valor_atual || inv.valor_investido || 0), 0);
                
                if (totalCat === 0) return null;
                
                const config = CATEGORY_CONFIG[cat];
                const Icon = config.icon;
                const percent = totalAtual > 0 ? (totalCat / totalAtual) * 100 : 0;

                return (
                  <div key={cat} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg ${config.color} bg-opacity-10`}>
                        <Icon className={`h-4 w-4 ${config.color.replace('bg-', 'text-')}`} />
                      </div>
                      <span className="text-xs font-medium text-slate-600 truncate">{config.label}</span>
                    </div>
                    <p className="font-semibold text-slate-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCat)}
                    </p>
                    <p className="text-xs text-slate-500">{percent.toFixed(1)}%</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolução Patrimonial & Ações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
           <CardHeader className="flex flex-row items-center justify-between pb-2">
             <CardTitle className="text-lg">Evolução Patrimonial</CardTitle>
             <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {historyDate ? format(historyDate, 'dd/MM') : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={historyDate}
                      onSelect={setHistoryDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button size="sm" onClick={handleSaveHistory} className="bg-slate-900 text-white hover:bg-slate-800">
                   <Save className="mr-2 h-4 w-4" />
                   Salvar Histórico
                </Button>
             </div>
           </CardHeader>
           <CardContent>
              {evolutionData.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={evolutionData}>
                      <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="data" />
                      <YAxis 
                        tickFormatter={(value) => 
                          new Intl.NumberFormat('pt-BR', { 
                            notation: "compact", 
                            compactDisplay: "short" 
                          }).format(value)
                        } 
                      />
                      <Tooltip 
                         formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="total" 
                        name="Patrimônio Total"
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorTotal)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="investido" 
                        name="Total Investido"
                        stroke="#94a3b8" 
                        fill="transparent" 
                        strokeDasharray="5 5"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex flex-col items-center justify-center text-slate-500 bg-slate-50 rounded-lg">
                   <LineChart className="h-10 w-10 mb-2 opacity-50" />
                   <p>Nenhum histórico registrado.</p>
                   <p className="text-sm">Salve o histórico para acompanhar a evolução.</p>
                </div>
              )}
           </CardContent>
        </Card>

        <div className="space-y-6">
           {/* Carteira por Categoria (Pie) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Alocação</CardTitle>
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
                  Nenhum investimento
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={() => setShowBatchUpdate(true)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Atualizar Valores (Manual)
              </Button>
            </CardContent>
          </Card>

          {/* Mini Filtro */}
           <Card>
             <CardContent className="pt-6">
                <Tabs defaultValue="all" onValueChange={setCategoryFilter}>
                  <TabsList className="w-full grid grid-cols-2 h-auto">
                    <TabsTrigger value="all">Geral</TabsTrigger>
                    <TabsTrigger value="renda_variavel_br">Ações BR</TabsTrigger>
                    <TabsTrigger value="renda_variavel_int">Exterior</TabsTrigger>
                    <TabsTrigger value="crypto">Crypto</TabsTrigger>
                    <TabsTrigger value="fundos">Fundos</TabsTrigger>
                    <TabsTrigger value="renda_fixa">Renda Fixa</TabsTrigger>
                  </TabsList>
                </Tabs>
             </CardContent>
           </Card>
        </div>
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

      <BatchUpdateQuotesDialog 
        open={showBatchUpdate} 
        onOpenChange={setShowBatchUpdate}
        investments={filteredInvestments.length > 0 ? filteredInvestments : investments}
      />
    </div>
  );
}