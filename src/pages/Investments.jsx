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
    queryFn: () => base44.entities.InvestmentHistory.list('-data', 30) // Últimos 30 registros, ordem decrescente
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: (id) => base44.entities.InvestmentHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment_history'] });
      toast.success('Registro do histórico excluído');
    }
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.list()
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
  const loadIndicators = async () => {
      setLoadingIndicators(true);
      try {
        const data = await fetchEconomicIndicators();
        setIndicators(data);
        toast.success("Indicadores atualizados com sucesso");
      } catch (error) {
        console.error('Erro ao carregar indicadores:', error);
        toast.error("Erro ao atualizar indicadores");
      }
      setLoadingIndicators(false);
  };

  useEffect(() => {
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

  // Totais por conta (Instituição)
  const totalsByAccount = investments.reduce((acc, inv) => {
    const conta = inv.conta_bancaria_nome || 'Outros';
    const valor = inv.valor_atual || inv.valor_investido || 0;
    if (!acc[conta]) acc[conta] = 0;
    acc[conta] += valor;
    return acc;
  }, {});

  // Adicionar saldos de contas correntes ao gráfico por instituição
  bankAccounts.forEach(acc => {
    const nome = acc.nome || acc.banco || 'Conta';
    if (!totalsByAccount[nome]) totalsByAccount[nome] = 0;
    
    let saldo = acc.saldo_atual || 0;
    // Converter para BRL se necessário para o gráfico agregado
    if (acc.moeda === 'USD' && indicators?.dolar) {
      saldo = saldo * indicators.dolar;
    } else if (acc.moeda === 'EUR' && indicators?.euro) {
      saldo = saldo * indicators.euro;
    }
    
    totalsByAccount[nome] += saldo;
  });

  const totalsByAccountData = Object.entries(totalsByAccount)
    .map(([name, value]) => ({ name, value }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalInvestido = investments.reduce((sum, inv) => sum + (inv.valor_investido || 0), 0);
  const totalInvestimentos = investments.reduce((sum, inv) => sum + (inv.valor_atual || inv.valor_investido || 0), 0);
  
  const totalBankBalance = bankAccounts.reduce((sum, acc) => {
    let saldo = acc.saldo_atual || 0;
    if (acc.moeda === 'USD' && indicators?.dolar) {
      saldo = saldo * indicators.dolar;
    } else if (acc.moeda === 'EUR' && indicators?.euro) {
      saldo = saldo * indicators.euro;
    }
    return sum + saldo;
  }, 0);
  
  const totalAtual = totalInvestimentos + totalBankBalance;
  // Rentabilidade considera apenas investimentos para não distorcer com saldo em conta
  const totalRentabilidade = totalInvestimentos - totalInvestido;
  const rentabilidadePercent = totalInvestido > 0 ? ((totalInvestimentos / totalInvestido) - 1) * 100 : 0;

  // Cálculo de Variação Diária (comparado com o registro anterior mais recente)
  const sortedHistory = [...history].sort((a,b) => new Date(b.data) - new Date(a.data));
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  // Encontrar o último registro que não seja de hoje (para comparar o hoje real-time com o fechamento anterior)
  // Ou se hoje já foi salvo, compara com o anterior a ele.
  const previousRecord = sortedHistory.find(h => h.data < todayStr);
  const previousValue = previousRecord ? previousRecord.valor_total_atual : 0;
  const dailyDiffValue = previousValue > 0 ? totalAtual - previousValue : 0;
  const dailyDiffPercent = previousValue > 0 ? (dailyDiffValue / previousValue) * 100 : 0;

  const previousAssetsMap = React.useMemo(() => {
      if (!previousRecord || !previousRecord.detalhes || !previousRecord.detalhes.assets) return {};
      // Se detalhes.assets for array (formato novo) ou objeto (se houver formato antigo, mas defini como array no save)
      const assets = Array.isArray(previousRecord.detalhes.assets) ? previousRecord.detalhes.assets : [];
      return assets.reduce((acc, asset) => {
          acc[asset.id] = asset.valor_atual;
          return acc;
      }, {});
  }, [previousRecord]);


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
        detalhes: {
           categories: totalsByCategory,
           assets: investments.map(inv => ({
              id: inv.id,
              nome: inv.nome,
              ticker: inv.ticker,
              categoria: inv.categoria,
              quantidade: inv.quantidade,
              preco_medio: inv.preco_medio,
              cotacao_atual: inv.cotacao_atual,
              valor_atual: inv.valor_atual,
              valor_atual_usd: inv.valor_atual_usd,
              cotacao_atual_usd: inv.cotacao_atual_usd
           }))
        }
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

  const assetColumns = React.useMemo(() => {
    const allAssets = new Map(); // Map id -> name

    // Coletar todos os ativos únicos presentes no histórico
    sortedHistory.forEach(h => {
        if (h.detalhes?.assets && Array.isArray(h.detalhes.assets)) {
            h.detalhes.assets.forEach(a => {
                if (!allAssets.has(a.id)) {
                    allAssets.set(a.id, a.nome);
                }
            });
        }
    });

    return Array.from(allAssets.entries()).map(([id, nome]) => ({
        header: nome,
        className: 'min-w-[150px] text-right',
        cellClassName: 'text-right',
        render: (row) => {
            const asset = row.detalhes?.assets?.find(a => a.id === id);
            if (!asset) return <span className="text-slate-300">-</span>;
            return (
                <span className="text-sm">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(asset.valor_atual || 0)}
                </span>
            );
        }
    }));
  }, [sortedHistory]);

  const historyColumns = [
    {
      header: 'Data',
      className: 'min-w-[100px]',
      render: (row) => format(new Date(row.data), 'dd/MM/yyyy', { locale: ptBR })
    },
    {
      header: 'Total Investido',
      className: 'min-w-[140px]',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_total_investido || 0)
    },
    {
      header: 'Total Atual',
      className: 'min-w-[140px]',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_total_atual || 0)
    },
    {
      header: 'Rentabilidade',
      className: 'min-w-[140px]',
      render: (row) => {
         const isPositive = (row.rentabilidade_valor || 0) >= 0;
         return (
            <div className={`flex flex-col ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
               <span className="font-medium text-sm">
                  {isPositive ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.rentabilidade_valor || 0)}
               </span>
               <span className="text-xs">
                  {isPositive ? '+' : ''}{(row.rentabilidade_percentual || 0).toFixed(2)}%
               </span>
            </div>
         )
      }
    },
    ...assetColumns,
    {
      header: '',
      className: 'w-12 sticky right-0 bg-white shadow-[-5px_0_10px_-5px_rgba(0,0,0,0.1)]',
      render: (row) => (
        <Button 
           variant="ghost" 
           size="icon" 
           className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
           onClick={() => {
              if (confirm('Tem certeza que deseja excluir este registro do histórico?')) {
                 deleteHistoryMutation.mutate(row.id);
              }
           }}
        >
           <Trash2 className="h-4 w-4" />
        </Button>
      )
    }
  ];

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
      header: 'Variação Dia',
      render: (row) => {
          const prevValue = previousAssetsMap[row.id];
          if (prevValue === undefined) return <span className="text-slate-400 text-xs">-</span>;
          
          const currentValue = row.valor_atual || row.valor_investido || 0;
          const diff = currentValue - prevValue;
          const percent = prevValue > 0 ? (diff / prevValue) * 100 : 0;
          const isPos = diff >= 0;
          const isZero = Math.abs(diff) < 0.01;

          if (isZero) return <span className="text-slate-400 text-xs">-</span>;
          
          return (
             <div className={`flex flex-col ${isPos ? 'text-emerald-600' : 'text-red-600'}`}>
                <span className="font-medium text-sm">
                   {isPos ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff)}
                </span>
                <span className="text-xs">
                   {isPos ? '+' : ''}{percent.toFixed(2)}%
                </span>
             </div>
          );
      }
    },
    {
      header: 'Rentabilidade',
      render: (row) => {
        const isInternational = ['renda_variavel_int', 'crypto'].includes(row.categoria);
        let rentPercent = row.rentabilidade_percentual || 0;
        let rentValue = row.rentabilidade_valor || 0;
        let isUSD = false;

        // Cálculo específico para ativos internacionais em Dólar
        if (isInternational && row.valor_atual_usd > 0 && row.quantidade > 0 && row.preco_medio > 0) {
           const investidoUSD = row.quantidade * row.preco_medio;
           const atualUSD = row.valor_atual_usd;
           rentValue = atualUSD - investidoUSD;
           rentPercent = investidoUSD > 0 ? (rentValue / investidoUSD) * 100 : 0;
           isUSD = true;
        }

        const isPositive = rentPercent >= 0;
        
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="h-3 w-3 text-emerald-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              <span className={`font-semibold text-sm ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {isPositive ? '+' : ''}{rentPercent.toFixed(2)}%
              </span>
            </div>
            <span className={`text-xs ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}
              {isUSD 
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(rentValue)
                : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rentValue)
              }
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
            <div className="flex flex-col gap-1 text-sm text-slate-300 mb-4">
              <div className="flex justify-between">
                 <span>Investimentos:</span>
                 <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInvestimentos)}</span>
              </div>
              <div className="flex justify-between">
                 <span>Saldo em Conta:</span>
                 <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBankBalance)}</span>
              </div>
            </div>
            
            <div className="space-y-3 border-t border-slate-700 pt-3">
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

            {/* Variação Diária (vs Dia Anterior) */}
            <div className="mt-4 pt-3 border-t border-slate-700">
               <div className="flex items-center justify-between text-sm">
                 <span className="text-slate-400">Variação (vs Anterior)</span>
                 <div className={`flex items-center gap-1 font-semibold ${dailyDiffValue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {dailyDiffValue >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    <span>
                       {dailyDiffValue >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dailyDiffValue)}
                       <span className="text-xs ml-1 opacity-80">
                          ({dailyDiffValue >= 0 ? '+' : ''}{dailyDiffPercent.toFixed(2)}%)
                       </span>
                    </span>
                 </div>
               </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo de Alocação (Abas) */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
             <Tabs defaultValue="category" className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <CardTitle className="text-sm font-medium text-slate-500">Alocação de Ativos</CardTitle>
                  <TabsList className="h-8">
                    <TabsTrigger value="category" className="text-xs">Por Categoria</TabsTrigger>
                    <TabsTrigger value="account" className="text-xs">Por Conta/Instituição</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="category" className="mt-0">
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
                </TabsContent>

                <TabsContent value="account" className="mt-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {totalsByAccountData.map((item, index) => {
                      const percent = totalAtual > 0 ? (item.value / totalAtual) * 100 : 0;
                      return (
                        <div key={index} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-600">
                              <Building className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-medium text-slate-600 truncate" title={item.name}>{item.name}</span>
                          </div>
                          <p className="font-semibold text-slate-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                          </p>
                          <p className="text-xs text-slate-500">{percent.toFixed(1)}%</p>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
             </Tabs>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Conteúdo movido para dentro do TabsContent acima */}
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
              <Tabs defaultValue="chart">
                 <TabsList className="mb-4">
                    <TabsTrigger value="chart">Gráfico</TabsTrigger>
                    <TabsTrigger value="table">Tabela de Histórico</TabsTrigger>
                 </TabsList>
                 
                 <TabsContent value="chart">
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
                 </TabsContent>

                 <TabsContent value="table">
                    <DataTable 
                       columns={historyColumns}
                       data={sortedHistory}
                       emptyComponent={
                          <div className="p-8 text-center text-slate-500">
                             Nenhum histórico salvo.
                          </div>
                       }
                    />
                 </TabsContent>
              </Tabs>
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