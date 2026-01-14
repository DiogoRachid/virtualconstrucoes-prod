import React, { useState, useEffect, useMemo } from 'react';
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
  AlertCircle,
  Settings
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
  crypto: { label: 'Criptomoedas', icon: Bitcoin, color: 'bg-orange-500' },
  saldo_conta: { label: 'Saldo em Conta', icon: Wallet, color: 'bg-slate-500' }
};

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f97316'];

export default function Investments() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'valor_atual', direction: 'desc' });
  const [deleteId, setDeleteId] = useState(null);
  const [showBatchUpdate, setShowBatchUpdate] = useState(false);
  const [indicators, setIndicators] = useState(null);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const [showAjusteDialog, setShowAjusteDialog] = useState(false);
  const queryClient = useQueryClient();

  // Ajuste de rentabilidade inicial (salvo no localStorage)
  const [rentabilidadeAjuste, setRentabilidadeAjuste] = useState(() => {
    const saved = localStorage.getItem('rentabilidade_ajuste_inicial');
    return saved ? parseFloat(saved) : 0;
  });
  const [tempAjuste, setTempAjuste] = useState(rentabilidadeAjuste);

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

  // Carregar indicadores econômicos (Prioriza banco de dados, fallback para API se vazio)
  const loadIndicators = async () => {
      setLoadingIndicators(true);
      try {
        // Tenta buscar do banco primeiro
        const dbIndicators = await base44.entities.EconomicIndicators.list('-data_referencia', 1);
        
        if (dbIndicators && dbIndicators.length > 0) {
            setIndicators(dbIndicators[0]);
        } else {
            // Se não tiver no banco, busca da API
            const data = await fetchEconomicIndicators();
            setIndicators(data);
            
            // Salva no banco para persistência futura
            if (data) {
                await base44.entities.EconomicIndicators.create({
                    dolar: data.dolar,
                    euro: data.euro,
                    ibovespa: data.ibovespa,
                    selic: data.selic,
                    cdi: data.cdi,
                    ipca: data.ipca,
                    data_referencia: new Date().toISOString()
                });
            }
        }
      } catch (error) {
        console.error('Erro ao carregar indicadores:', error);
      }
      setLoadingIndicators(false);
  };

  // Escuta invalidação de query para recarregar
  useEffect(() => {
    loadIndicators();
  }, [queryClient.getQueryState(['economic_indicators'])]); // Recarrega se a query for invalidada

  // Removida atualização automática de cotações em favor da manual

  // Preparar contas bancárias como ativos
  const bankAccountAssets = useMemo(() => {
    return bankAccounts.map(acc => {
      let saldo = acc.saldo_atual || 0;
      let valorUSD = 0;
      
      // Converter para BRL para visualização unificada se necessário
      // Mas manter o valor original para exibição detalhada se for moeda estrangeira
      if (acc.moeda === 'USD' && indicators?.dolar) {
        valorUSD = saldo;
        saldo = saldo * indicators.dolar;
      } else if (acc.moeda === 'EUR' && indicators?.euro) {
        // Apenas aproximação para BRL
        saldo = saldo * indicators.euro;
      }

      return {
        id: `acc_${acc.id}`,
        originalId: acc.id,
        isAccount: true,
        nome: acc.nome,
        ticker: 'SALDO',
        categoria: 'saldo_conta',
        tipo: acc.tipo === 'corrente' ? 'Conta Corrente' : (acc.tipo === 'poupanca' ? 'Poupança' : 'Conta'),
        instituicao: acc.banco,
        conta_bancaria_nome: acc.banco,
        valor_investido: saldo, // Considera o saldo atual como valor base
        valor_atual: saldo,
        valor_atual_usd: valorUSD,
        cotacao_atual_usd: 0,
        rentabilidade_percentual: 0,
        rentabilidade_valor: 0
      };
    });
  }, [bankAccounts, indicators]);

  const filteredInvestments = useMemo(() => {
    const allAssets = [...investments, ...bankAccountAssets];
    
    let filtered = allAssets.filter(inv => {
      const matchSearch = !search || 
        inv.nome?.toLowerCase().includes(search.toLowerCase()) ||
        inv.ticker?.toLowerCase().includes(search.toLowerCase());
      
      const matchCategory = categoryFilter === 'all' || inv.categoria === categoryFilter;
      
      return matchSearch && matchCategory;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Handle specific cases or nulls
        if (sortConfig.key === 'instituicao') {
          valA = a.instituicao || a.conta_bancaria_nome || '';
          valB = b.instituicao || b.conta_bancaria_nome || '';
        } else if (sortConfig.key === 'rentabilidade') {
           valA = a.rentabilidade_percentual || 0;
           valB = b.rentabilidade_percentual || 0;
        } else {
           // Default fallback for numbers to be 0 if null/undefined
           if (typeof valA === 'number' || typeof valB === 'number') {
              valA = valA || 0;
              valB = valB || 0;
           } else {
              valA = (valA || '').toString().toLowerCase();
              valB = (valB || '').toString().toLowerCase();
           }
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
       // Default sort if no key (by value descending)
       filtered.sort((a, b) => (b.valor_atual || 0) - (a.valor_atual || 0));
    }

    return filtered;
  }, [investments, bankAccountAssets, search, categoryFilter, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

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
  // Rentabilidade considera apenas investimentos + ajuste inicial
  const totalRentabilidade = (totalInvestimentos - totalInvestido) + rentabilidadeAjuste;
  const rentabilidadePercent = totalInvestido > 0 ? (((totalInvestimentos + rentabilidadeAjuste) / totalInvestido) - 1) * 100 : 0;

  // Totais por categoria
  const totalsByCategory = useMemo(() => {
    const list = Object.keys(CATEGORY_CONFIG).map(cat => {
      const total = investments
        .filter(inv => inv.categoria === cat)
        .reduce((sum, inv) => sum + (inv.valor_atual || inv.valor_investido || 0), 0);
      return { 
        name: CATEGORY_CONFIG[cat].label, 
        value: total, 
        categoria: cat,
        ...CATEGORY_CONFIG[cat]
      };
    }).filter(c => c.value > 0);

    // Adicionar Saldo em Conta
    if (totalBankBalance > 0) {
      list.push({
        name: 'Saldo em Conta',
        value: totalBankBalance,
        categoria: 'saldo',
        label: 'Saldo em Conta',
        icon: Wallet,
        color: 'bg-slate-500'
      });
    }

    return list.sort((a, b) => b.value - a.value);
  }, [investments, totalBankBalance]);

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

  // Totais por Carteira Personalizada (Novo Demonstrativo)
  const totalsByCustomPortfolio = useMemo(() => {
    let xpAcoes = 0;
    let btc = 0;
    let dolar = 0;
    let empresas = 0;
    let pf = 0;
    let xpFixa = 0;

    // Processar Investimentos
    investments.forEach(inv => {
      const val = inv.valor_atual || inv.valor_investido || 0;
      const inst = (inv.instituicao || '').toLowerCase();
      const cat = inv.categoria;
      const ticker = (inv.ticker || '').toUpperCase();

      if (ticker === 'BTC' || ticker.includes('BITCOIN') || cat === 'crypto') {
        btc += val;
      } else if (cat === 'renda_variavel_int') {
        dolar += val;
      } else if (inst.includes('xp')) {
        if (cat === 'renda_variavel_br' || cat === 'acoes') {
          xpAcoes += val;
        } else if (cat === 'renda_fixa' || cat === 'fundos') {
          xpFixa += val;
        } else {
           // Fallback for XP if category unclear, default to Fixa or Acoes? 
           // Assuming Fixa for safety or check type
           xpFixa += val; 
        }
      } else if (inst.includes('itaú') || inst.includes('itau')) {
         // Ativos no Itaú Silvio -> PF
         pf += val;
      } else {
         // Outros ativos?
      }
    });

    // Processar Contas Bancárias
    bankAccounts.forEach(acc => {
      let saldo = acc.saldo_atual || 0;
      if (acc.moeda === 'USD' && indicators?.dolar) saldo *= indicators.dolar;
      else if (acc.moeda === 'EUR' && indicators?.euro) saldo *= indicators.euro;

      const nome = (acc.nome || '').toLowerCase();
      const banco = (acc.banco || '').toLowerCase();

      if (nome.includes('empresa') || banco.includes('empresa')) {
        empresas += saldo;
      } else if (nome.includes('silvio') || banco.includes('itaú') || banco.includes('itau')) {
        // Itaú Silvio -> PF
        pf += saldo;
      } else {
         // Outros saldos -> PF (default?)
         pf += saldo;
      }
    });

    return [
      { name: 'XP Ações', value: xpAcoes },
      { name: 'BTC', value: btc },
      { name: 'Dólar', value: dolar },
      { name: 'Empresas', value: empresas },
      { name: 'Pessoa Física', value: pf },
      { name: 'XP Fixa', value: xpFixa },
    ].filter(i => i.value > 0).sort((a,b) => b.value - a.value);

  }, [investments, bankAccounts, indicators]);



  // Fetch transações para incluir no cálculo de variação
  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-data')
  });

  // Cálculo de Variação Diária (comparado com o registro anterior mais recente)
  const sortedHistory = [...history].sort((a,b) => new Date(b.data) - new Date(a.data));
  
  // Pre-processar histórico para incluir diffs e despesas do dia
  const historyWithDiffs = useMemo(() => {
      return sortedHistory.map((item, index) => {
          const prevItem = sortedHistory[index + 1];
          const prevTotal = prevItem ? prevItem.valor_total_atual : 0;
          
          // Buscar transações do dia do registro
          const dayTransactions = transactions.filter(t => t.data === item.data);
          const dayExpenses = dayTransactions.filter(t => t.tipo === 'saida').reduce((sum, t) => sum + (t.valor || 0), 0);
          // Recebimentos apenas de contas a receber (com conta_receber_id)
          const dayIncome = dayTransactions.filter(t => t.tipo === 'entrada' && t.conta_receber_id).reduce((sum, t) => sum + (t.valor || 0), 0);
          
          // Variação Real = (Valor Atual - Valor Anterior) + Despesas - Recebimentos de Contas a Receber
          const diffValue = prevTotal > 0 ? (item.valor_total_atual - prevTotal) + dayExpenses - dayIncome : 0;
          const diffPercent = prevTotal > 0 ? (diffValue / prevTotal) * 100 : 0;
          
          return { ...item, diffValue, diffPercent, prevTotal, dayExpenses, dayIncome, dayTransactions };
      });
  }, [sortedHistory, transactions]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const previousRecord = sortedHistory.find(h => h.data < todayStr);
  const previousValue = previousRecord ? previousRecord.valor_total_atual : 0;
  
  // Transações de hoje
  const todayExpenses = transactions
    .filter(t => t.tipo === 'saida' && t.data === todayStr)
    .reduce((sum, t) => sum + (t.valor || 0), 0);
  // Recebimentos apenas de contas a receber
  const todayIncome = transactions
    .filter(t => t.tipo === 'entrada' && t.conta_receber_id && t.data === todayStr)
    .reduce((sum, t) => sum + (t.valor || 0), 0);
  
  const dailyDiffValue = previousValue > 0 ? (totalAtual - previousValue) + todayExpenses - todayIncome : 0;
  const dailyDiffPercent = previousValue > 0 ? (dailyDiffValue / previousValue) * 100 : 0;

  const previousAssetsMap = useMemo(() => {
      if (!previousRecord || !previousRecord.detalhes || !previousRecord.detalhes.assets) return {};
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
     // Adicionar T00:00:00 para garantir que seja interpretado como hora local e não UTC
     data: format(new Date(h.data.includes('T') ? h.data : h.data + 'T00:00:00'), 'dd/MM'),
     total: h.valor_total_atual,
     investido: h.valor_total_investido
  }));

  const assetColumns = useMemo(() => {
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
      render: (row) => format(new Date(row.data.includes('T') ? row.data : row.data + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
    },
    {
      header: 'Total Investido',
      className: 'min-w-[140px]',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_total_investido || 0)
    },
    {
      header: 'Total Atual (Dia)',
      className: 'min-w-[140px]',
      render: (row) => (
         <span className="font-bold text-slate-700">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_total_atual || 0)}
         </span>
      )
    },
    {
      header: 'Variação vs Anterior',
      className: 'min-w-[200px]',
      render: (row) => {
         const { diffValue, diffPercent, prevTotal, dayExpenses, dayIncome } = row;
         if (!prevTotal) return <span className="text-slate-300 text-xs">-</span>;
         
         const isPos = diffValue >= 0;
         const isZero = Math.abs(diffValue) < 0.01;
         
         if (isZero) return <span className="text-slate-400 text-xs">-</span>;

         return (
            <div className={`flex flex-col ${isPos ? 'text-emerald-600' : 'text-red-600'}`}>
               <span className="font-medium text-sm">
                  {isPos ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diffValue)}
               </span>
               <span className="text-xs">
                  {isPos ? '+' : ''}{diffPercent.toFixed(2)}%
               </span>
               {(dayExpenses > 0 || dayIncome > 0) && (
                  <span className="text-xs text-slate-500 mt-0.5">
                     {dayExpenses > 0 && `(+ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dayExpenses)} desp.)`}
                     {dayExpenses > 0 && dayIncome > 0 && ' '}
                     {dayIncome > 0 && `(- ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dayIncome)} receb.)`}
                  </span>
               )}
            </div>
         );
      }
    },
    {
      header: 'Rentabilidade Acum.',
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
      accessor: 'nome',
      sortable: true,
      className: 'min-w-[200px]',
      render: (row) => {
        const config = CATEGORY_CONFIG[row.categoria];
        const Icon = config?.icon || Wallet;
        return (
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${config?.color || 'bg-slate-500'} bg-opacity-20 flex items-center justify-center flex-shrink-0`}>
              <Icon className={`h-5 w-5 ${config?.color?.replace('bg-', 'text-') || 'text-slate-600'}`} />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-slate-900 truncate">{row.nome}</p>
              <p className="text-sm text-slate-500 truncate">{row.ticker || row.tipo}</p>
            </div>
          </div>
        );
      }
    },
    {
      header: 'Tipo',
      accessor: 'tipo',
      sortable: true,
      className: 'hidden md:table-cell min-w-[120px]',
      cellClassName: 'hidden md:table-cell',
      render: (row) => (
        <span className="text-slate-700">{row.tipo}</span>
      )
    },
    {
      header: 'Instituição',
      accessor: 'instituicao',
      sortable: true,
      className: 'hidden lg:table-cell min-w-[140px]',
      cellClassName: 'hidden lg:table-cell',
      render: (row) => (
        <span className="text-slate-700 text-sm truncate block max-w-[140px]">
          {row.instituicao || row.conta_bancaria_nome || '-'}
        </span>
      )
    },
    {
      header: 'Valor Investido',
      accessor: 'valor_investido',
      sortable: true,
      className: 'hidden sm:table-cell min-w-[140px]',
      cellClassName: 'hidden sm:table-cell',
      render: (row) => (
        <span className="font-medium text-slate-900">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_investido || 0)}
        </span>
      )
    },
    {
      header: 'Valor Atual',
      accessor: 'valor_atual',
      sortable: true,
      className: 'min-w-[140px]',
      render: (row) => {
        // Removed 'crypto' from isInternational to not show USD
        const isInternational = ['renda_variavel_int'].includes(row.categoria);
        const isCrypto = row.categoria === 'crypto';
        const cotacaoUSD = row.cotacao_atual_usd;
        const valorAtualUSD = row.valor_atual_usd;

        return (
          <div className="min-w-0">
            <span className="font-medium text-slate-900 block truncate">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_atual || row.valor_investido || 0)}
            </span>
            {isInternational && valorAtualUSD > 0 && (
              <p className="text-xs text-slate-500 truncate">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(valorAtualUSD)}
              </p>
            )}
            {isCrypto && (
               <p className="text-xs text-slate-500 truncate">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.cotacao_atual || 0)} / un
               </p>
            )}
          </div>
        );
      }
      },

    {
      header: 'Rentabilidade',
      accessor: 'rentabilidade', // Custom sort key logic
      sortable: true,
      className: 'hidden md:table-cell min-w-[140px]',
      cellClassName: 'hidden md:table-cell',
      render: (row) => {
        if (row.isAccount) {
          return <span className="text-slate-400 text-sm">-</span>;
        }

        const valorAtual = row.valor_atual || row.valor_investido || 0;
        const valorInvestido = row.valor_investido || 0;
        
        let rentValue = valorAtual - valorInvestido;
        let rentPercent = valorInvestido > 0 ? (rentValue / valorInvestido) * 100 : 0;

        const isPositive = rentValue >= 0;

        return (
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="h-3 w-3 text-emerald-600 flex-shrink-0" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600 flex-shrink-0" />
              )}
              <span className={`font-semibold text-sm ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {isPositive ? '+' : ''}{rentPercent.toFixed(2)}%
              </span>
            </div>
            <span className={`text-xs truncate ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {isPositive ? '+' : ''}
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rentValue)}
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
            {row.isAccount ? (
              <>
                <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`BankAccountDetail?accountId=${row.originalId}`)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Visualizar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`BankAccountForm?id=${row.originalId}`)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
              </>
            ) : (
              <>
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
              </>
            )}
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



      {/* Dashboard de Investimentos - KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0 shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3 opacity-10">
                <Wallet className="w-16 h-16" />
             </div>
             <CardHeader className="pb-2 relative z-10">
                <CardTitle className="text-xs font-medium text-slate-300 uppercase tracking-wider">Patrimônio Total</CardTitle>
             </CardHeader>
             <CardContent className="relative z-10">
                <div className="text-2xl font-bold">
                   {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAtual)}
                </div>
                <div className="mt-2 text-xs flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                     {dailyDiffValue >= 0 ? (
                        <span className="text-emerald-400 flex items-center bg-emerald-400/10 px-1.5 py-0.5 rounded">
                           <TrendingUp className="h-3 w-3 mr-1" />
                           +{dailyDiffPercent.toFixed(2)}%
                        </span>
                     ) : (
                        <span className="text-red-400 flex items-center bg-red-400/10 px-1.5 py-0.5 rounded">
                           <TrendingDown className="h-3 w-3 mr-1" />
                           {dailyDiffPercent.toFixed(2)}%
                        </span>
                     )}
                     <span className="text-slate-400">vs dia anterior</span>
                     </div>
                     {(todayExpenses > 0 || todayIncome > 0) && (
                     <span className="text-slate-400">
                        {todayExpenses > 0 && `(+ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(todayExpenses)} desp.)`}
                        {todayExpenses > 0 && todayIncome > 0 && ' '}
                        {todayIncome > 0 && `(- ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(todayIncome)} receb.)`}
                     </span>
                     )}
                </div>
             </CardContent>
          </Card>

          <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Investido</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                   {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalInvestimentos)}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                   Total aplicado em ativos
                </div>
             </CardContent>
          </Card>

          <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">Saldo em Conta</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                   {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBankBalance)}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                   Disponível em contas
                </div>
             </CardContent>
          </Card>

          <Card>
             <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wider">Rentabilidade Geral</CardTitle>
             </CardHeader>
             <CardContent>
                <div className={`text-2xl font-bold ${totalRentabilidade >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                   {totalRentabilidade >= 0 ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRentabilidade)}
                </div>
                <div className="mt-2 text-xs flex items-center gap-1">
                   <span className={`flex items-center px-1.5 py-0.5 rounded ${totalRentabilidade >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {totalRentabilidade >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                      {rentabilidadePercent.toFixed(2)}%
                   </span>
                   <span className="text-slate-500">rentabilidade acumulada</span>
                </div>
             </CardContent>
          </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-1">
           <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Alocação de Ativos</CardTitle>
           </CardHeader>
           <CardContent>
             <Tabs defaultValue="category" className="w-full">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="category" className="flex-1 text-xs">Categoria</TabsTrigger>
                  <TabsTrigger value="account" className="flex-1 text-xs">Instituição</TabsTrigger>
                  <TabsTrigger value="custom" className="flex-1 text-xs">Estratégia</TabsTrigger>
                </TabsList>

                <TabsContent value="category" className="mt-0 space-y-3">
                    {totalsByCategory.map(item => {
                      const Icon = item.icon;
                      const percent = totalAtual > 0 ? (item.value / totalAtual) * 100 : 0;

                      return (
                        <div key={item.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${item.color} bg-opacity-10`}>
                              <Icon className={`h-4 w-4 ${item.color.replace('bg-', 'text-')}`} />
                            </div>
                            <div className="flex flex-col">
                               <span className="text-sm font-medium text-slate-700">{item.label}</span>
                               <span className="text-xs text-slate-400">{percent.toFixed(1)}%</span>
                            </div>
                          </div>
                          <span className="font-semibold text-slate-900 text-sm">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                          </span>
                        </div>
                      );
                    })}
                </TabsContent>

                <TabsContent value="account" className="mt-0 space-y-3">
                    {totalsByAccountData.map((item, index) => {
                      const percent = totalAtual > 0 ? (item.value / totalAtual) * 100 : 0;
                      return (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                              <Building className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                               <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]" title={item.name}>{item.name}</span>
                               <span className="text-xs text-slate-400">{percent.toFixed(1)}%</span>
                            </div>
                          </div>
                          <span className="font-semibold text-slate-900 text-sm">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                          </span>
                        </div>
                      );
                    })}
                </TabsContent>

                <TabsContent value="custom" className="mt-0 space-y-3">
                    {totalsByCustomPortfolio.map((item, index) => {
                      const percent = totalAtual > 0 ? (item.value / totalAtual) * 100 : 0;
                      return (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                              <LineChart className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                               <span className="text-sm font-medium text-slate-700 truncate max-w-[120px]" title={item.name}>{item.name}</span>
                               <span className="text-xs text-slate-400">{percent.toFixed(1)}%</span>
                            </div>
                          </div>
                          <span className="font-semibold text-slate-900 text-sm">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                          </span>
                        </div>
                      );
                    })}
                </TabsContent>
             </Tabs>
             
             <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
               <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowBatchUpdate(true)}
               >
                  <Pencil className="h-4 w-4 mr-2" />
                  Atualizar Cotações Manualmente
               </Button>
               <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setTempAjuste(rentabilidadeAjuste);
                    setShowAjusteDialog(true);
                  }}
               >
                  <Settings className="h-4 w-4 mr-2" />
                  Ajustar Rentabilidade
               </Button>
             </div>
           </CardContent>
        </Card>

        {/* Gráfico de Evolução (Agora ao lado da alocação) */}
        <Card className="lg:col-span-2 flex flex-col">
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
           <CardContent className="flex-1 min-h-[400px]">
               <Tabs defaultValue="chart" className="h-full flex flex-col">
                  <TabsList className="mb-4 w-fit">
                     <TabsTrigger value="chart">Gráfico</TabsTrigger>
                     <TabsTrigger value="table">Tabela de Histórico</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="chart" className="flex-1">
                     {evolutionData.length > 0 ? (
                       <div className="h-full w-full min-h-[300px]">
                         <ResponsiveContainer width="100%" height="100%">
                           <AreaChart data={evolutionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                             <defs>
                               <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                 <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                               </linearGradient>
                             </defs>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                             <XAxis dataKey="data" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                             <YAxis 
                               stroke="#64748b" 
                               fontSize={12}
                               tickLine={false} 
                               axisLine={false}
                               tickFormatter={(value) => 
                                 new Intl.NumberFormat('pt-BR', { 
                                   notation: "compact", 
                                   compactDisplay: "short" 
                                 }).format(value)
                               } 
                             />
                             <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                             />
                             <Area 
                               type="monotone" 
                               dataKey="total" 
                               name="Patrimônio Total"
                               stroke="#3b82f6" 
                               strokeWidth={2}
                               fillOpacity={1} 
                               fill="url(#colorTotal)" 
                             />
                             <Area 
                               type="monotone" 
                               dataKey="investido" 
                               name="Total Investido"
                               stroke="#94a3b8" 
                               strokeWidth={2}
                               fill="transparent" 
                               strokeDasharray="5 5"
                             />
                           </AreaChart>
                         </ResponsiveContainer>
                       </div>
                     ) : (
                       <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-slate-50 rounded-lg">
                          <LineChart className="h-10 w-10 mb-2 opacity-50" />
                          <p>Nenhum histórico registrado.</p>
                       </div>
                     )}
                  </TabsContent>

                  <TabsContent value="table" className="flex-1 overflow-x-auto">
                     <DataTable 
                        columns={historyColumns}
                        data={historyWithDiffs}
                        emptyComponent={
                           <div className="p-8 text-center text-slate-500">
                              Nenhum histórico salvo.
                           </div>
                        }
                     />

                     {/* Seção de Transações do Dia */}
                     {historyWithDiffs.length > 0 && historyWithDiffs[0].dayTransactions?.length > 0 && (
                        <div className="mt-6 border-t pt-4">
                           <h4 className="text-sm font-semibold text-slate-700 mb-3">
                              Despesas do dia {format(new Date(historyWithDiffs[0].data + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                           </h4>
                           <div className="space-y-2">
                              {historyWithDiffs[0].dayTransactions.map(t => (
                                 <div key={t.id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg text-sm">
                                    <span className="text-slate-700">{t.descricao}</span>
                                    <span className="font-medium text-red-600">
                                       {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}
                                    </span>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                  </TabsContent>
               </Tabs>
           </CardContent>
        </Card>
      </div>

      {/* Evolução Patrimonial & Ações */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="space-y-6 lg:col-span-3">
           {/* Carteira por Categoria (Pie) - Removido */}

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
                    <TabsTrigger value="saldo_conta">Saldos</TabsTrigger>
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
        onRowClick={(row) => {
           if (row.isAccount) return; // Prevent navigation here if handled by menu, or allow if desired
           window.location.href = createPageUrl(`InvestmentDetail?id=${row.id}`);
        }}
        onSort={handleSort}
        sortColumn={sortConfig.key}
        sortDirection={sortConfig.direction}
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

      {/* Dialog de Ajuste de Rentabilidade */}
      <Dialog open={showAjusteDialog} onOpenChange={setShowAjusteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Rentabilidade Inicial</DialogTitle>
            <DialogDescription>
              Informe o valor da rentabilidade já acumulada anteriormente para ajustar o cálculo total
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Rentabilidade Inicial (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={tempAjuste}
              onChange={(e) => setTempAjuste(parseFloat(e.target.value) || 0)}
              className="mt-2"
              placeholder="0.00"
            />
            <p className="text-xs text-slate-500 mt-2">
              Este valor será somado à rentabilidade atual para mostrar o total acumulado
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAjusteDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setRentabilidadeAjuste(tempAjuste);
                localStorage.setItem('rentabilidade_ajuste_inicial', tempAjuste.toString());
                setShowAjusteDialog(false);
                toast.success('Ajuste salvo');
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}