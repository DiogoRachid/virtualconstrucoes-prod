// Serviço para buscar cotações usando a API do LLM com contexto da internet
import { base44 } from '@/api/base44Client';

export async function fetchQuotes(tickers) {
  if (!tickers || tickers.length === 0) return {};

  const tickerList = tickers.join(', ');
  
  const response = await base44.integrations.Core.InvokeLLM({
    prompt: `Atue como um especialista financeiro. Utilize fontes confiáveis (Google Finance, Yahoo Finance) para buscar as cotações mais recentes dos ativos: ${tickerList}.

    REGRAS CRÍTICAS DE CONTEXTO (B3 vs EXTERIOR):
    
    1. ATIVOS B3 (BRASIL) - PREÇO OBRIGATÓRIO EM BRL:
       - Qualquer ticker terminando em 11 (ETFs/FIIs), 34 (BDRs), 3, 4, 6 (Ações).
       - Exemplos Citados: BITH11, QETH11, KISU11, AAPL34, BOVA11, IVVB11.
       - AAPL34 é BDR da Apple no Brasil -> Preço em BRL (~R$ 60-100). NÃO confundir com AAPL (USD).
       - BITH11/QETH11 são ETFs de Cripto na B3 -> Preço em BRL.
       - Dica: Busque adicionando ".SA" (ex: BITH11.SA, AAPL34.SA).

    2. CRIPTOMOEDAS PURAS (BTC, ETH):
       - Priorize BRL. Se só achar USD, ok.

    3. ATIVOS EUA (AAPL, MSFT, VOO):
       - Apenas se NÃO tiver final 34/11.
       - Preço em USD.

    Retorne um JSON com:
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
    prompt: `Atue como um especialista financeiro. Busque a cotação mais recente do ativo "${ticker}" em fontes confiáveis.
    
    REGRA DE OURO B3 (BRASIL):
    - Se o ticker termina em 11, 33, 34, 3, 4, 6 (ex: BITH11, QETH11, AAPL34, KISU11):
    - É um ativo negociado na B3 (Brasil).
    - O PREÇO DEVE SER EM BRL (Reais).
    - Tente buscar com o sufixo .SA (ex: ${ticker}.SA).
    
    Outros casos:
    - Cripto pura (BTC): Priorize BRL.
    - Stocks EUA (AAPL, VOO): USD.

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