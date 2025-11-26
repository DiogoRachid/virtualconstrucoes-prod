// Serviço para buscar cotações usando a API do LLM com contexto da internet
import { base44 } from '@/api/base44Client';

export async function fetchQuotes(tickers) {
  if (!tickers || tickers.length === 0) return {};

  const tickerList = tickers.join(', ');
  
  const response = await base44.integrations.Core.InvokeLLM({
    prompt: `Busque as cotações atuais dos seguintes ativos financeiros: ${tickerList}. 
    
    Para cada ativo, retorne:
    - ticker: código do ativo
    - price: preço atual em sua moeda original (BRL para ativos brasileiros, USD para internacionais e crypto)
    - currency: moeda do preço (BRL ou USD)
    - change_percent: variação percentual do dia
    
    Atenção:
    - Para ações brasileiras (terminadas em números como PETR4, VALE3), busque na B3
    - Para ações internacionais (AAPL, MSFT, etc), busque no mercado americano
    - Para criptomoedas (BTC, ETH, etc), busque o preço em USD
    - Para FIIs brasileiros, busque na B3
    - Para ETFs brasileiros (BOVA11, IVVB11), busque na B3
    - Para BDRs (terminados em 34 ou 35), busque na B3
    
    Retorne APENAS os dados encontrados. Se não encontrar algum ativo, omita-o da resposta.`,
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
  let context = '';
  
  switch (categoria) {
    case 'renda_variavel_br':
      context = 'ação ou FII brasileiro na B3';
      break;
    case 'renda_variavel_int':
      context = 'ação americana no mercado dos EUA';
      break;
    case 'crypto':
      context = 'criptomoeda';
      break;
    case 'fundos':
      context = 'fundo de investimento ou ETF';
      break;
    default:
      context = 'ativo financeiro';
  }

  const response = await base44.integrations.Core.InvokeLLM({
    prompt: `Busque a cotação atual do ${context} com ticker/código "${ticker}".
    
    Retorne:
    - price: preço atual
    - currency: moeda (BRL ou USD)
    - change_percent: variação percentual do dia
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