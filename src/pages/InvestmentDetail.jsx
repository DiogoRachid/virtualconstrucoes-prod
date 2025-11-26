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
  Plus
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DataTable from '@/components/shared/DataTable';
import { toast } from "sonner";
import { fetchSingleQuote } from '@/components/investments/QuoteService';
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

export default function InvestmentDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const investmentId = urlParams.get('id');
  const queryClient = useQueryClient();

  const [isUpdating, setIsUpdating] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    tipo_operacao: 'compra',
    quantidade: '',
    preco_unitario: '',
    valor_total: '',
    data_operacao: format(new Date(), 'yyyy-MM-dd'),
    taxas: '',
    observacoes: ''
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
    mutationFn: (data) => base44.entities.InvestmentTransaction.create({
      ...data,
      investimento_id: investmentId,
      investimento_nome: investment?.nome,
      quantidade: data.quantidade ? parseFloat(data.quantidade) : null,
      preco_unitario: data.preco_unitario ? parseFloat(data.preco_unitario) : null,
      valor_total: parseFloat(data.valor_total),
      taxas: data.taxas ? parseFloat(data.taxas) : 0
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investmentTransactions', investmentId] });
      setShowTransactionDialog(false);
      setNewTransaction({
        tipo_operacao: 'compra',
        quantidade: '',
        preco_unitario: '',
        valor_total: '',
        data_operacao: format(new Date(), 'yyyy-MM-dd'),
        taxas: '',
        observacoes: ''
      });
      toast.success('Operação registrada!');
    }
  });

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
      render: (row) => format(new Date(row.data_operacao), 'dd/MM/yyyy', { locale: ptBR })
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
                      <p className="font-medium">{format(new Date(investment.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })}</p>
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
                    <p className="font-medium">{format(new Date(investment.data_aplicacao), 'dd/MM/yyyy', { locale: ptBR })}</p>
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
            <DialogTitle>Registrar Operação</DialogTitle>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransactionDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => createTransactionMutation.mutate(newTransaction)}
              disabled={createTransactionMutation.isPending || !newTransaction.valor_total}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createTransactionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}