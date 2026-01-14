import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { TrendingUp, Loader2, Search } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DocumentUploader from '@/components/shared/DocumentUploader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { fetchSingleQuote } from '@/components/investments/QuoteService';

const TIPOS_POR_CATEGORIA = {
  renda_fixa: ['CDB', 'LCI', 'LCA', 'LC', 'Debêntures', 'CRI', 'CRA', 'Tesouro Selic', 'Tesouro IPCA+', 'Tesouro Prefixado', 'Poupança'],
  renda_variavel_br: ['Ação', 'FII', 'ETF', 'BDR'],
  renda_variavel_int: ['Stock', 'ETF', 'REIT'],
  fundos: ['Fundo RF', 'Fundo Multimercado', 'Fundo Ações', 'Fundo Imobiliário', 'Fundo Cambial', 'Previdência'],
  crypto: ['Bitcoin', 'Ethereum', 'Altcoin', 'Stablecoin', 'DeFi Token', 'NFT']
};

const INDEXADORES = [
  { value: 'cdi', label: 'CDI' },
  { value: 'ipca', label: 'IPCA' },
  { value: 'prefixado', label: 'Prefixado' },
  { value: 'selic', label: 'SELIC' },
  { value: 'igpm', label: 'IGP-M' },
  { value: 'dolar', label: 'Dólar' },
  { value: 'nenhum', label: 'Nenhum' }
];

export default function InvestmentForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const investmentId = urlParams.get('id');
  const isEdit = !!investmentId;

  const [formData, setFormData] = useState({
    nome: '',
    categoria: '',
    tipo: '',
    ticker: '',
    instituicao: '',
    moeda: 'BRL',
    quantidade: '',
    preco_medio: '',
    preco_medio_usd: '',
    valor_investido: '',
    valor_investido_usd: '',
    cotacao_atual: '',
    cotacao_atual_usd: '',
    valor_atual: '',
    valor_atual_usd: '',
    data_aplicacao: '',
    data_vencimento: '',
    taxa_rendimento: '',
    indexador: 'nenhum',
    liquidez: 'diaria',
    conta_bancaria_id: '',
    conta_bancaria_nome: '',
    status: 'ativo',
    observacoes: '',
    documentos: []
  });

  const [searchingQuote, setSearchingQuote] = useState(false);
  const [cotacaoDolar, setCotacaoDolar] = useState(5.0);
  const [loadingDolar, setLoadingDolar] = useState(false);

  // Buscar cotação do dólar ao carregar
  useEffect(() => {
    const fetchDolar = async () => {
      setLoadingDolar(true);
      try {
        const response = await base44.integrations.Core.InvokeLLM({
          prompt: 'Qual a cotação atual do dólar comercial (USD/BRL)?',
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: { dolar: { type: "number" } }
          }
        });
        if (response?.dolar) {
          setCotacaoDolar(response.dolar);
        }
      } catch (error) {
        console.error('Erro ao buscar dólar:', error);
      }
      setLoadingDolar(false);
    };
    fetchDolar();
  }, []);

  const { data: investment, isLoading } = useQuery({
    queryKey: ['investment', investmentId],
    queryFn: () => base44.entities.Investment.filter({ id: investmentId }).then(res => res[0]),
    enabled: isEdit
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.list()
  });

  useEffect(() => {
    if (investment) {
      // Detectar moeda baseado nos valores salvos
      const temValorUSD = investment.valor_investido_usd > 0 || investment.cotacao_atual_usd > 0;
      const isInternacional = ['renda_variavel_int', 'crypto'].includes(investment.categoria);
      
      setFormData({
        nome: investment.nome || '',
        categoria: investment.categoria || '',
        tipo: investment.tipo || '',
        ticker: investment.ticker || '',
        instituicao: investment.instituicao || '',
        moeda: (isInternacional && temValorUSD) ? 'USD' : 'BRL',
        quantidade: investment.quantidade || '',
        preco_medio: investment.preco_medio || '',
        preco_medio_usd: investment.preco_medio_usd || '',
        valor_investido: investment.valor_investido || '',
        valor_investido_usd: investment.valor_investido_usd || '',
        cotacao_atual: investment.cotacao_atual || '',
        cotacao_atual_usd: investment.cotacao_atual_usd || '',
        valor_atual: investment.valor_atual || '',
        valor_atual_usd: investment.valor_atual_usd || '',
        data_aplicacao: investment.data_aplicacao || '',
        data_vencimento: investment.data_vencimento || '',
        taxa_rendimento: investment.taxa_rendimento || '',
        indexador: investment.indexador || 'nenhum',
        liquidez: investment.liquidez || 'diaria',
        conta_bancaria_id: investment.conta_bancaria_id || '',
        conta_bancaria_nome: investment.conta_bancaria_nome || '',
        status: investment.status || 'ativo',
        observacoes: investment.observacoes || '',
        documentos: investment.documentos || []
      });
    }
  }, [investment]);

  const isUSD = formData.moeda === 'USD';
  const isInternacional = ['renda_variavel_int', 'crypto'].includes(formData.categoria);

  // Calcular valor investido automaticamente
  useEffect(() => {
    if (formData.quantidade && formData.preco_medio) {
      const valor = parseFloat(formData.quantidade) * parseFloat(formData.preco_medio);
      if (isUSD && isInternacional) {
        const valorBRL = valor * cotacaoDolar;
        setFormData(prev => ({ 
          ...prev, 
          valor_investido_usd: valor.toFixed(2),
          valor_investido: valorBRL.toFixed(2)
        }));
      } else {
        setFormData(prev => ({ ...prev, valor_investido: valor.toFixed(2) }));
      }
    }
  }, [formData.quantidade, formData.preco_medio, isUSD, isInternacional, cotacaoDolar]);

  // Calcular valor atual automaticamente
  useEffect(() => {
    if (formData.quantidade && formData.cotacao_atual) {
      const valor = parseFloat(formData.quantidade) * parseFloat(formData.cotacao_atual);
      if (isUSD && isInternacional) {
        const valorBRL = valor * cotacaoDolar;
        setFormData(prev => ({ 
          ...prev, 
          valor_atual_usd: valor.toFixed(2),
          valor_atual: valorBRL.toFixed(2)
        }));
      } else {
        setFormData(prev => ({ ...prev, valor_atual: valor.toFixed(2) }));
      }
    }
  }, [formData.quantidade, formData.cotacao_atual, isUSD, isInternacional, cotacaoDolar]);

  // Atualizar cotação USD quando muda
  useEffect(() => {
    if (isUSD && isInternacional && formData.cotacao_atual) {
      const cotacaoUSD = parseFloat(formData.cotacao_atual);
      setFormData(prev => ({ ...prev, cotacao_atual_usd: cotacaoUSD }));
    }
  }, [formData.cotacao_atual, isUSD, isInternacional]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const valorInvestido = parseFloat(data.valor_investido) || 0;
      const valorAtual = parseFloat(data.valor_atual) || valorInvestido;
      const rentabilidadeValor = valorAtual - valorInvestido;
      const rentabilidadePercent = valorInvestido > 0 ? ((valorAtual / valorInvestido) - 1) * 100 : 0;

      const isUSDMoeda = data.moeda === 'USD';
      const isIntl = ['renda_variavel_int', 'crypto'].includes(data.categoria);

      const payload = {
        ...data,
        quantidade: data.quantidade ? parseFloat(data.quantidade) : null,
        preco_medio: data.preco_medio ? parseFloat(data.preco_medio) : null,
        preco_medio_usd: (isUSDMoeda && isIntl && data.preco_medio) ? parseFloat(data.preco_medio) : null,
        valor_investido: valorInvestido,
        valor_investido_usd: (isUSDMoeda && isIntl) ? parseFloat(data.valor_investido_usd) || null : null,
        cotacao_atual: data.cotacao_atual ? parseFloat(data.cotacao_atual) : null,
        cotacao_atual_usd: (isUSDMoeda && isIntl && data.cotacao_atual) ? parseFloat(data.cotacao_atual) : null,
        valor_atual: valorAtual,
        valor_atual_usd: (isUSDMoeda && isIntl) ? parseFloat(data.valor_atual_usd) || null : null,
        rentabilidade_valor: rentabilidadeValor,
        rentabilidade_percentual: rentabilidadePercent,
        ultima_atualizacao: new Date().toISOString()
      };

      // Remover campo moeda do payload (não existe na entidade)
      delete payload.moeda;

      if (isEdit) {
        return base44.entities.Investment.update(investmentId, payload);
      }
      return base44.entities.Investment.create(payload);
    },
    onSuccess: () => {
      window.location.href = createPageUrl('Investments');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCategoryChange = (value) => {
    const isIntl = ['renda_variavel_int', 'crypto'].includes(value);
    setFormData(prev => ({
      ...prev,
      categoria: value,
      tipo: '',
      indexador: value === 'renda_fixa' ? 'cdi' : 'nenhum',
      moeda: isIntl ? 'USD' : 'BRL'
    }));
  };

  const handleBankAccountChange = (id) => {
    const account = bankAccounts.find(a => a.id === id);
    setFormData(prev => ({
      ...prev,
      conta_bancaria_id: id,
      conta_bancaria_nome: account?.nome || ''
    }));
  };

  const searchQuote = async () => {
    if (!formData.ticker || !formData.categoria) {
      toast.error('Informe o ticker e a categoria primeiro');
      return;
    }

    setSearchingQuote(true);
    try {
      const quote = await fetchSingleQuote(formData.ticker, formData.categoria);
      if (quote?.price) {
        setFormData(prev => ({
          ...prev,
          cotacao_atual: quote.price.toString(),
          nome: prev.nome || quote.name || prev.ticker
        }));
        toast.success('Cotação encontrada!');
      } else {
        toast.error('Cotação não encontrada');
      }
    } catch (error) {
      toast.error('Erro ao buscar cotação');
    }
    setSearchingQuote(false);
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const tiposDisponiveis = formData.categoria ? TIPOS_POR_CATEGORIA[formData.categoria] || [] : [];
  const isRendaFixa = formData.categoria === 'renda_fixa';
  const needsTicker = ['renda_variavel_br', 'renda_variavel_int', 'crypto', 'fundos'].includes(formData.categoria);
  const showMoeda = ['renda_variavel_int', 'crypto'].includes(formData.categoria);

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar Investimento' : 'Novo Investimento'}
        subtitle={isEdit ? 'Atualize os dados do investimento' : 'Cadastre um novo investimento'}
        icon={TrendingUp}
        backUrl={createPageUrl('Investments')}
      />

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="space-y-6">
          {/* Classificação */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Classificação</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Categoria *</Label>
                <Select value={formData.categoria} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="renda_fixa">Renda Fixa</SelectItem>
                    <SelectItem value="renda_variavel_br">Renda Variável Brasil</SelectItem>
                    <SelectItem value="renda_variavel_int">Renda Variável Internacional</SelectItem>
                    <SelectItem value="fundos">Fundos de Investimento</SelectItem>
                    <SelectItem value="crypto">Criptomoedas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipo *</Label>
                <Select 
                  value={formData.tipo} 
                  onValueChange={(v) => handleChange('tipo', v)}
                  disabled={!formData.categoria}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposDisponiveis.map(tipo => (
                      <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Identificação */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Identificação</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label>Nome do Investimento *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  required
                  placeholder="Ex: CDB Banco XYZ, PETR4, Bitcoin"
                  className="mt-1.5"
                />
              </div>

              {needsTicker && (
                <div>
                  <Label>Ticker / Código</Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input
                      value={formData.ticker}
                      onChange={(e) => handleChange('ticker', e.target.value.toUpperCase())}
                      placeholder="Ex: PETR4, AAPL, BTC"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={searchQuote}
                      disabled={searchingQuote}
                    >
                      {searchingQuote ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <Label>Instituição / Corretora</Label>
                <Input
                  value={formData.instituicao}
                  onChange={(e) => handleChange('instituicao', e.target.value)}
                  placeholder="Ex: XP, BTG, Nubank"
                  className="mt-1.5"
                />
              </div>

              {showMoeda && (
                <div>
                  <Label>Moeda do Ativo</Label>
                  <Select value={formData.moeda} onValueChange={(v) => handleChange('moeda', v)}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">Dólar (USD)</SelectItem>
                      <SelectItem value="BRL">Real (BRL)</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.moeda === 'USD' && (
                    <p className="text-xs text-slate-500 mt-1">
                      Cotação do dólar: R$ {cotacaoDolar.toFixed(2)} {loadingDolar && '(atualizando...)'}
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label>Conta Bancária Vinculada</Label>
                <Select value={formData.conta_bancaria_id} onValueChange={handleBankAccountChange}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="resgatado">Resgatado</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Valores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Valores e Quantidades</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {needsTicker && (
                <>
                  <div>
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      step="0.00000001"
                      value={formData.quantidade}
                      onChange={(e) => handleChange('quantidade', e.target.value)}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label>Preço Médio {isUSD && isInternacional ? '(USD)' : ''}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.preco_medio}
                      onChange={(e) => handleChange('preco_medio', e.target.value)}
                      className="mt-1.5"
                    />
                    {isUSD && isInternacional && formData.preco_medio && (
                      <p className="text-xs text-emerald-600 mt-1">
                        ≈ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(formData.preco_medio) * cotacaoDolar)}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div>
                <Label>Valor Investido {isUSD && isInternacional ? '(USD)' : ''} *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={isUSD && isInternacional ? formData.valor_investido_usd : formData.valor_investido}
                  onChange={(e) => {
                    if (isUSD && isInternacional) {
                      const valorUSD = e.target.value;
                      const valorBRL = parseFloat(valorUSD || 0) * cotacaoDolar;
                      setFormData(prev => ({ 
                        ...prev, 
                        valor_investido_usd: valorUSD,
                        valor_investido: valorBRL.toFixed(2)
                      }));
                    } else {
                      handleChange('valor_investido', e.target.value);
                    }
                  }}
                  required
                  className="mt-1.5"
                />
                {isUSD && isInternacional && formData.valor_investido && (
                  <p className="text-xs text-emerald-600 mt-1">
                    ≈ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.valor_investido)}
                  </p>
                )}
              </div>

              {needsTicker && (
                <>
                  <div>
                    <Label>Cotação Atual {isUSD && isInternacional ? '(USD)' : ''}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.cotacao_atual}
                      onChange={(e) => handleChange('cotacao_atual', e.target.value)}
                      className="mt-1.5"
                    />
                    {isUSD && isInternacional && formData.cotacao_atual && (
                      <p className="text-xs text-emerald-600 mt-1">
                        ≈ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(formData.cotacao_atual) * cotacaoDolar)}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Valor Atual {isUSD && isInternacional ? '(USD)' : ''}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={isUSD && isInternacional ? formData.valor_atual_usd : formData.valor_atual}
                      onChange={(e) => {
                        if (isUSD && isInternacional) {
                          const valorUSD = e.target.value;
                          const valorBRL = parseFloat(valorUSD || 0) * cotacaoDolar;
                          setFormData(prev => ({ 
                            ...prev, 
                            valor_atual_usd: valorUSD,
                            valor_atual: valorBRL.toFixed(2)
                          }));
                        } else {
                          handleChange('valor_atual', e.target.value);
                        }
                      }}
                      className="mt-1.5"
                    />
                    {isUSD && isInternacional && formData.valor_atual && (
                      <p className="text-xs text-emerald-600 mt-1">
                        ≈ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.valor_atual)}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Renda Fixa */}
          {isRendaFixa && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Condições (Renda Fixa)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Indexador</Label>
                  <Select value={formData.indexador} onValueChange={(v) => handleChange('indexador', v)}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDEXADORES.map(idx => (
                        <SelectItem key={idx.value} value={idx.value}>{idx.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Taxa de Rendimento</Label>
                  <Input
                    value={formData.taxa_rendimento}
                    onChange={(e) => handleChange('taxa_rendimento', e.target.value)}
                    placeholder="Ex: 100% CDI, IPCA+5%"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Liquidez</Label>
                  <Select value={formData.liquidez} onValueChange={(v) => handleChange('liquidez', v)}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Diária</SelectItem>
                      <SelectItem value="d1">D+1</SelectItem>
                      <SelectItem value="d30">D+30</SelectItem>
                      <SelectItem value="vencimento">No Vencimento</SelectItem>
                      <SelectItem value="mercado">Mercado Secundário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Datas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Data da Aplicação</Label>
                <Input
                  type="date"
                  value={formData.data_aplicacao}
                  onChange={(e) => handleChange('data_aplicacao', e.target.value)}
                  className="mt-1.5"
                />
              </div>

              {isRendaFixa && (
                <div>
                  <Label>Data de Vencimento</Label>
                  <Input
                    type="date"
                    value={formData.data_vencimento}
                    onChange={(e) => handleChange('data_vencimento', e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documentos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documentos</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUploader
                documents={formData.documentos}
                onChange={(docs) => handleChange('documentos', docs)}
              />
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => handleChange('observacoes', e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Salvar Alterações' : 'Cadastrar Investimento'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('Investments')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}