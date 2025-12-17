import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  Pencil,
  RefreshCw,
  PiggyBank,
  LineChart,
  Globe,
  Building,
  Bitcoin,
  Calendar,
  Percent,
  DollarSign,
  FileText,
  ExternalLink,
  Plus,
  Trash2,
  MoreHorizontal
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DataTable from '@/components/shared/DataTable';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { toast } from "sonner";
import { fetchSingleQuote } from '@/components/investments/QuoteService';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const CATEGORY_CONFIG = {
  renda_fixa: { label: 'Renda Fixa', icon: PiggyBank, color: 'bg-blue-500' },
  renda_variavel_br: { label: 'Renda Variável BR', icon: LineChart, color: 'bg-emerald-500' },
  renda_variavel_int: { label: 'Renda Variável INT', icon: Globe, color: 'bg-purple-500' },
  fundos: { label: 'Fundos', icon: Building, color: 'bg-amber-500' },
  crypto: { label: 'Criptomoedas', icon: Bitcoin, color: 'bg-orange-500' }
};

const TIPO_OPERACAO_LABELS = {
  compra: 'Compra',
  venda: 'Venda',
  dividendo: 'Dividendo',
  jcp: 'JCP',
  rendimento: 'Rendimento',
  amortizacao: 'Amortização',
  split: 'Split',
  grupamento: 'Grupamento'
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  if (typeof dateString === 'string' && dateString.length === 10 && dateString.includes('-')) {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  }
  return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
};

export default function InvestmentDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const investmentId = urlParams.get('id');
  const queryClient = useQueryClient();

  const [isUpdating, setIsUpdating] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [deleteTransactionId, setDeleteTransactionId] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [newTransaction, setNewTransaction] = useState({
    tipo_operacao: 'compra',
    quantidade: '',
    preco_unitario: '',
    valor_total: '',
    data_operacao: format(new Date(), 'yyyy-MM-dd'),
    taxas: '',
    observacoes: '',
    conta_id: 'none'
  });

  const { data: investment, isLoading } = useQuery({
    queryKey: ['investment', investmentId],
    queryFn: () => base44.entities.Investment.filter({ id: investmentId }).then(res => res[0])
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['investmentTransactions', investmentId],
    queryFn: () => base44.entities.InvestmentTransaction.filter({ investimento_id: investmentId }, '-data_operacao'),
    enabled: !!investmentId
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.list()
  });

  const updateQuote = async () => {
    if (!investment?.ticker || !investment?.categoria) {
      toast.error('Este investimento não possui ticker para atualização');
      return;
    }

    setIsUpdating(true);
    try {
      const quote = await fetchSingleQuote(investment.ticker, investment.categoria);
      if (quote?.price) {
        let cotacaoBRL = quote.price;
        let cotacaoUSD = null;
        let valorAtualUSD = null;
        
        // Se é ativo internacional ou crypto, guardar valor em USD e converter para BRL
        if (quote.currency === 'USD' && ['renda_variavel_int', 'crypto'].includes(investment.categoria)) {
          // Buscar taxa de câmbio atual
          const indicatorsRes = await base44.integrations.Core.InvokeLLM({
            prompt: 'Qual a cotação atual do dólar (USD/BRL)?',
            add_context_from_internet: true,
            response_json_schema: {
              type: "object",
              properties: { dolar: { type: "number" } }
            }
          });
          const usdBrl = indicatorsRes?.dolar || 5.0;
          
          cotacaoUSD = quote.price;
          cotacaoBRL = quote.price * usdBrl;
          valorAtualUSD = investment.quantidade ? investment.quantidade * cotacaoUSD : cotacaoUSD;
        } else {
           // Se veio em BRL mas é crypto/intl, calcular o USD reverso
           if (['renda_variavel_int', 'crypto'].includes(investment.categoria)) {
              // Buscar taxa se não tivermos
              const indicatorsRes = await base44.integrations.Core.InvokeLLM({
                prompt: 'Qual a cotação atual do dólar (USD/BRL)?',
                add_context_from_internet: true,
                response_json_schema: {
                  type: "object",
                  properties: { dolar: { type: "number" } }
                }
              });
              const usdBrl = indicatorsRes?.dolar || 5.0;
              
              cotacaoUSD = cotacaoBRL / usdBrl;
              valorAtualUSD = investment.quantidade ? investment.quantidade * cotacaoUSD : cotacaoUSD;
           }
        }

        const valorAtual = investment.quantidade ? investment.quantidade * cotacaoBRL : cotacaoBRL;
        const rentabilidadeValor = valorAtual - (investment.valor_investido || 0);
        const rentabilidadePercent = investment.valor_investido ? ((valorAtual / investment.valor_investido) - 1) * 100 : 0;

        await base44.entities.Investment.update(investmentId, {
          cotacao_atual: cotacaoBRL,
          cotacao_atual_usd: cotacaoUSD,
          valor_atual: valorAtual,
          valor_atual_usd: valorAtualUSD,
          rentabilidade_valor: rentabilidadeValor,
          rentabilidade_percentual: rentabilidadePercent,
          ultima_atualizacao: new Date().toISOString()
        });

        queryClient.invalidateQueries({ queryKey: ['investment', investmentId] });
        toast.success('Cotação atualizada!');
      } else {
        toast.error('Não foi possível obter a cotação');
      }
    } catch (error) {
      toast.error('Erro ao atualizar cotação');
    }
    setIsUpdating(false);
  };

  const createTransactionMutation = useMutation({
    mutationFn: async (data) => {
      const valor = parseFloat(data.valor_total);
      
      // Criar transação do investimento
      await base44.entities.InvestmentTransaction.create({
        ...data,
        investimento_id: investmentId,
        investimento_nome: investment?.nome,
        quantidade: data.quantidade ? parseFloat(data.quantidade) : null,
        preco_unitario: data.preco_unitario ? parseFloat(data.preco_unitario) : null,
        valor_total: valor,
        taxas: data.taxas ? parseFloat(data.taxas) : 0
      });

      // Atualizar valor atual se for rendimento
      if (['rendimento', 'dividendo', 'jcp'].includes(data.tipo_operacao)) {
        const novoValorAtual = (investment.valor_atual || 0) + valor;
        await base44.entities.Investment.update(investmentId, {
          valor_atual: novoValorAtual,
          ultima_atualizacao: new Date().toISOString()
        });
      }

      // Atualizar conta bancária se selecionada
      if (data.conta_id && data.conta_id !== 'none') {
        const conta = bankAccounts.find(c => c.id === data.conta_id);
        if (conta) {
          const isEntrada = ['venda', 'dividendo', 'jcp', 'rendimento', 'amortizacao'].includes(data.tipo_operacao);
          const novoSaldo = isEntrada 
            ? (conta.saldo_atual || 0) + valor 
            : (conta.saldo_atual || 0) - valor;
          
          await base44.entities.BankAccount.update(conta.id, { saldo_atual: novoSaldo });
          
          await base44.entities.Transaction.create({
            tipo: isEntrada ? 'entrada' : 'saida',
            descricao: `${TIPO_OPERACAO_LABELS[data.tipo_operacao]} - ${investment.nome}`,
            valor: valor,
            data: data.data_operacao,
            conta_bancaria_id: conta.id,
            conta_bancaria_nome: conta.nome,
            origem: 'manual',
            conciliado: true
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investmentTransactions', investmentId] });
      queryClient.invalidateQueries({ queryKey: ['investment', investmentId] });
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setShowTransactionDialog(false);
      resetForm();
      toast.success('Operação registrada com sucesso!');
    }
  });

  const updateTransactionMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await base44.entities.InvestmentTransaction.update(id, {
        ...data,
        quantidade: data.quantidade ? parseFloat(data.quantidade) : null,
        preco_unitario: data.preco_unitario ? parseFloat(data.preco_unitario) : null,
        valor_total: parseFloat(data.valor_total),
        taxas: data.taxas ? parseFloat(data.taxas) : 0
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investmentTransactions', investmentId] });
      setShowTransactionDialog(false);
      resetForm();
      toast.success('Operação atualizada!');
    }
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: (id) => base44.entities.InvestmentTransaction.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investmentTransactions', investmentId] });
      setDeleteTransactionId(null);
      toast.success('Operação excluída');
    }
  });

  const resetForm = () => {
    setNewTransaction({
      tipo_operacao: 'compra',
      quantidade: '',
      preco_unitario: '',
      valor_total: '',
      data_operacao: format(new Date(), 'yyyy-MM-dd'),
      taxas: '',
      observacoes: '',
      conta_id: 'none'
    });
    setEditingTransaction(null);
  };

  const handleEditTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setNewTransaction({
      tipo_operacao: transaction.tipo_operacao,
      quantidade: transaction.quantidade || '',
      preco_unitario: transaction.preco_unitario || '',
      valor_total: transaction.valor_total || '',
      data_operacao: transaction.data_operacao,
      taxas: transaction.taxas || '',
      observacoes: transaction.observacoes || '',
      conta_id: 'none' // Não editamos a conta na edição para simplificar
    });
    setShowTransactionDialog(true);
  };

  const handleSave = () => {
    if (editingTransaction) {
      updateTransactionMutation.mutate({ id: editingTransaction.id, data: newTransaction });
    } else {
      createTransactionMutation.mutate(newTransaction);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!investment) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Investimento não encontrado"
        description="O investimento que você está procurando não existe."
        actionLabel="Voltar para Investimentos"
        onAction={() => window.location.href = createPageUrl('Investments')}
      />
    );
  }

  const config = CATEGORY_CONFIG[investment.categoria];
  const Icon = config?.icon || TrendingUp;
  const rentabilidade = investment.rentabilidade_percentual || 0;
  const isPositive = rentabilidade >= 0;

  const transactionColumns = [
    {
      header: 'Data',
      render: (row) => formatDate(row.data_operacao)
    },
    {
      header: 'Operação',
      render: (row) => (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
          ['compra', 'dividendo', 'jcp', 'rendimento'].includes(row.tipo_operacao) 
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {TIPO_OPERACAO_LABELS[row.tipo_operacao] || row.tipo_operacao}
        </span>
      )
    },
    {
      header: 'Quantidade',
      render: (row) => row.quantidade?.toLocaleString('pt-BR') || '-'
    },
    {
      header: 'Preço Unit.',
      render: (row) => row.preco_unitario 
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.preco_unitario)
        : '-'
    },
    {
      header: 'Valor Total',
      render: (row) => (
        <span className="font-medium">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_total)}
        </span>
      )
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
            <DropdownMenuItem onClick={() => handleEditTransaction(row)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteTransactionId(row.id)} className="text-red-600">
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
        title={investment.nome}
        subtitle={investment.ticker || investment.tipo}
        icon={Icon}
        backUrl={createPageUrl('Investments')}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <StatusBadge status={investment.status} />
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config?.color || 'bg-slate-500'} bg-opacity-20 ${config?.color?.replace('bg-', 'text-') || 'text-slate-600'}`}>
          {config?.label || investment.categoria}
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
          {investment.tipo}
        </span>
      </div>

      <div className="flex gap-3 mb-8">
        <Button
          onClick={() => window.location.href = createPageUrl(`InvestmentForm?id=${investmentId}`)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </Button>
        {investment.ticker && (
          <Button variant="outline" onClick={updateQuote} disabled={isUpdating}>
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Atualizar Cotação
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowTransactionDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar Operação
        </Button>
      </div>

      {/* Cards de Valores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Valor Investido</p>
                <p className="text-xl font-bold text-slate-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investment.valor_investido || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Valor Atual</p>
                <p className="text-xl font-bold text-slate-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investment.valor_atual || investment.valor_investido || 0)}
                </p>
                {['renda_variavel_int', 'crypto'].includes(investment.categoria) && investment.valor_atual_usd > 0 && (
                  <p className="text-sm text-slate-500">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(investment.valor_atual_usd)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl ${isPositive ? 'bg-emerald-100' : 'bg-red-100'} flex items-center justify-center`}>
                {isPositive ? (
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-slate-500">Rentabilidade</p>
                <p className={`text-xl font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isPositive ? '+' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investment.rentabilidade_valor || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl ${isPositive ? 'bg-emerald-100' : 'bg-red-100'} flex items-center justify-center`}>
                <Percent className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Variação %</p>
                <p className={`text-xl font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isPositive ? '+' : ''}{rentabilidade.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="history">Histórico de Operações</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalhes do Ativo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {investment.ticker && (
                  <div>
                    <p className="text-sm text-slate-500">Ticker</p>
                    <p className="font-medium">{investment.ticker}</p>
                  </div>
                )}
                {investment.instituicao && (
                  <div>
                    <p className="text-sm text-slate-500">Instituição</p>
                    <p className="font-medium">{investment.instituicao}</p>
                  </div>
                )}
                {investment.quantidade && (
                  <div>
                    <p className="text-sm text-slate-500">Quantidade</p>
                    <p className="font-medium">{investment.quantidade.toLocaleString('pt-BR')}</p>
                  </div>
                )}
                {investment.preco_medio && (
                  <div>
                    <p className="text-sm text-slate-500">Preço Médio</p>
                    <p className="font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investment.preco_medio)}
                    </p>
                  </div>
                )}
                {investment.cotacao_atual && (
                  <div>
                    <p className="text-sm text-slate-500">Cotação Atual</p>
                    <p className="font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investment.cotacao_atual)}
                    </p>
                    {['renda_variavel_int', 'crypto'].includes(investment.categoria) && investment.cotacao_atual_usd > 0 && (
                      <p className="text-sm text-slate-500">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(investment.cotacao_atual_usd)}
                      </p>
                    )}
                  </div>
                )}
                {investment.ultima_atualizacao && (
                  <div>
                    <p className="text-sm text-slate-500">Última Atualização</p>
                    <p className="font-medium text-slate-600">
                      {format(new Date(investment.ultima_atualizacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {investment.categoria === 'renda_fixa' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Condições</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {investment.taxa_rendimento && (
                    <div>
                      <p className="text-sm text-slate-500">Taxa de Rendimento</p>
                      <p className="font-medium">{investment.taxa_rendimento}</p>
                    </div>
                  )}
                  {investment.indexador && investment.indexador !== 'nenhum' && (
                    <div>
                      <p className="text-sm text-slate-500">Indexador</p>
                      <p className="font-medium uppercase">{investment.indexador}</p>
                    </div>
                  )}
                  {investment.liquidez && (
                    <div>
                      <p className="text-sm text-slate-500">Liquidez</p>
                      <p className="font-medium capitalize">{investment.liquidez.replace('_', ' ')}</p>
                    </div>
                  )}
                  {investment.data_vencimento && (
                    <div>
                      <p className="text-sm text-slate-500">Data de Vencimento</p>
                      <p className="font-medium">{formatDate(investment.data_vencimento)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-slate-400" />
                  Datas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {investment.data_aplicacao && (
                  <div>
                    <p className="text-sm text-slate-500">Data da Aplicação</p>
                    <p className="font-medium">{formatDate(investment.data_aplicacao)}</p>
                  </div>
                )}
                {investment.created_date && (
                  <div>
                    <p className="text-sm text-slate-500">Cadastrado em</p>
                    <p className="font-medium">{format(new Date(investment.created_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {investment.observacoes && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-700 whitespace-pre-wrap">{investment.observacoes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <DataTable
            columns={transactionColumns}
            data={transactions}
            emptyComponent={
              <EmptyState
                icon={TrendingUp}
                title="Nenhuma operação registrada"
                description="Registre compras, vendas, dividendos e outras operações."
                actionLabel="Registrar Operação"
                onAction={() => setShowTransactionDialog(true)}
              />
            }
          />
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardContent className="pt-6">
              {investment.documentos?.length > 0 ? (
                <div className="space-y-3">
                  {investment.documentos.map((doc, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{doc.nome}</p>
                          {doc.data_upload && (
                            <p className="text-sm text-slate-500">
                              {format(new Date(doc.data_upload), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                      </div>
                      <a 
                        href={doc.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        <ExternalLink className="h-5 w-5 text-slate-500" />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Nenhum documento anexado"
                  description="Adicione documentos editando o investimento."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Nova Operação */}
      <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTransaction ? 'Editar Operação' : 'Registrar Operação'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo de Operação *</Label>
              <Select
                value={newTransaction.tipo_operacao}
                onValueChange={(v) => setNewTransaction(prev => ({ ...prev, tipo_operacao: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compra">Compra</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="dividendo">Dividendo</SelectItem>
                  <SelectItem value="jcp">JCP</SelectItem>
                  <SelectItem value="rendimento">Rendimento</SelectItem>
                  <SelectItem value="amortizacao">Amortização</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={newTransaction.data_operacao}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, data_operacao: e.target.value }))}
                className="mt-1.5"
              />
            </div>

            {['compra', 'venda'].includes(newTransaction.tipo_operacao) && (
              <>
                <div>
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    step="0.00000001"
                    value={newTransaction.quantidade}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, quantidade: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Preço Unitário</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newTransaction.preco_unitario}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, preco_unitario: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
              </>
            )}

            <div>
              <Label>Valor Total *</Label>
              <Input
                type="number"
                step="0.01"
                value={newTransaction.valor_total}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, valor_total: e.target.value }))}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Taxas</Label>
              <Input
                type="number"
                step="0.01"
                value={newTransaction.taxas}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, taxas: e.target.value }))}
                className="mt-1.5"
              />
            </div>

            {!editingTransaction && (
              <div className="pt-2 border-t">
                <Label>Vincular Conta Bancária (Opcional)</Label>
                <Select
                  value={newTransaction.conta_id}
                  onValueChange={(v) => setNewTransaction(prev => ({ ...prev, conta_id: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione uma conta..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não vincular</SelectItem>
                    {bankAccounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.nome} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.saldo_atual || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  Ao selecionar uma conta, o saldo será atualizado automaticamente e uma transação será criada.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransactionDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={createTransactionMutation.isPending || updateTransactionMutation.isPending || !newTransaction.valor_total}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {(createTransactionMutation.isPending || updateTransactionMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTransactionId}
        onOpenChange={() => setDeleteTransactionId(null)}
        onConfirm={() => deleteTransactionMutation.mutate(deleteTransactionId)}
        isDeleting={deleteTransactionMutation.isPending}
        title="Excluir operação"
        description="Tem certeza que deseja excluir esta operação? O saldo da conta vinculada (se houver) NÃO será revertido automaticamente."
      />
    </div>
  );
}