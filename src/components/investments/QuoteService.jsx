// Serviço para buscar cotações usando a API do LLM com contexto da internet
import { base44 } from '@/api/base44Client';

export async function fetchQuotes(tickers) {
  if (!tickers || tickers.length === 0) return {};

  const tickerList = tickers.join(', ');
  
  const response = await base44.integrations.Core.InvokeLLM({
    prompt: `Atue como um especialista de mercado financeiro.
    Sua missão é buscar a cotação ATUALIZADA (em tempo real ou fechamento mais recente) para os seguintes ativos: ${tickerList}.

    FONTES OBRIGATÓRIAS DE PESQUISA (Use a que tiver o dado mais recente):
    - Status Invest
    - Investing.com
    - TradingView
    - Google Finance
    - Yahoo Finance
    - InfoMoney
    - ADVFN

    REGRAS DE OURO PARA IDENTIFICAÇÃO DE MERCADO:
    
    1. ATIVOS DA BOLSA BRASILEIRA (B3) -> PREÇO EM REAIS (R$):
       - Identificados por finais numéricos: 3, 4, 5, 6, 11, 33, 34.
       - Exemplos: PETR4, VALE3, BITH11, QETH11, AAPL34, KISU11, IVVB11.
       - IMPORTANTE: 
         * AAPL34 é um BDR da Apple negociado no Brasil. O valor é em R$ (ex: ~R$ 60,00). NÃO confunda com a ação AAPL da NASDAQ (USD).
         * BITH11 e QETH11 são ETFs de Cripto na B3. Valor em R$.
         * KISU11 é FII. Valor em R$.

    2. CRIPTOMOEDAS GLOBAIS (BTC, ETH, SOL):
       - Busque o valor em REAIS (BRL) se possível (ex: Mercado Bitcoin, Binance BR).
       - Se não encontrar em BRL, retorne em USD.

    3. ATIVOS INTERNACIONAIS (Stocks/REITs originais):
       - Apenas se o ticker NÃO tiver número no final (ex: AAPL, MSFT, VOO, VNQ).
       - Valor em USD.

    Retorne um JSON estrito com:
    - ticker: código do ativo (ex: BTC, PETR4)
    - price: valor numérico do preço
    - currency: "BRL" ou "USD"
    - change_percent: variação do dia em % (ex: 1.5 ou -0.5)

    Retorne APENAS os dados encontrados.`,
    add_context_from_internet: true,
    response_json_schema: {
      type: "object",
      properties: {
        quotes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              price: { type: "number" },
              currency: { type: "string" },
              change_percent: { type: "number" }
            }
          }
        },
        exchange_rate_usd_brl: { type: "number" }
      }
    }
  });

  const result = {};
  if (response?.quotes) {
    response.quotes.forEach(q => {
      result[q.ticker.toUpperCase()] = {
        price: q.price,
        currency: q.currency,
        change_percent: q.change_percent
      };
    });
  }
  
  // Guardar taxa de câmbio se disponível
  if (response?.exchange_rate_usd_brl) {
    result['USD_BRL'] = { price: response.exchange_rate_usd_brl, currency: 'BRL' };
  }

  return result;
}

export async function fetchSingleQuote(ticker, categoria) {
  const response = await base44.integrations.Core.InvokeLLM({
    prompt: `Busque a cotação mais recente para o ativo financeiro: "${ticker}".
    
    FONTES SUGERIDAS: Status Invest, Investing.com, TradingView, Google Finance.

    REGRAS DE CONTEXTO:
    - Se o ticker terminar em 3, 4, 11, 33, 34 (ex: AAPL34, BITH11, KISU11):
      * É um ativo do Brasil (B3).
      * O preço DEVE ser em BRL (Reais).
      * Cuidado com BDRs (ex: AAPL34): Preço é em Reais, diferente da ação original em Dólar.
    
    - Se for Cripto (BTC, ETH): Tente BRL.
    
    - Se for Stock Americana (AAPL, TSLA): USD.

    Retorne um JSON com:
    - price: preço atual (numérico)
    - currency: "BRL" ou "USD"
    - change_percent: variação % do dia
    - name: nome completo do ativo`,
    add_context_from_internet: true,
    response_json_schema: {
      type: "object",
      properties: {
        price: { type: "number" },
        currency: { type: "string" },
        change_percent: { type: "number" },
        name: { type: "string" }
      }
    }
  });

  return response;
}

export async function fetchEconomicIndicators() {
  const response = await base44.integrations.Core.InvokeLLM({
    prompt: `Busque os indicadores econômicos atuais do Brasil:
    - Taxa SELIC atual
    - CDI atual (taxa anual)
    - IPCA acumulado 12 meses
    - IGP-M acumulado 12 meses
    - Cotação do Dólar (USD/BRL)
    - Cotação do Euro (EUR/BRL)
    - IBOVESPA pontos e variação do dia`,
    add_context_from_internet: true,
    response_json_schema: {
      type: "object",
      properties: {
        selic: { type: "number" },
        cdi: { type: "number" },
        ipca: { type: "number" },
        igpm: { type: "number" },
        dolar: { type: "number" },
        euro: { type: "number" },
        ibovespa: { type: "number" },
        ibovespa_change: { type: "number" }
      }
    }
  });

  return response;
}