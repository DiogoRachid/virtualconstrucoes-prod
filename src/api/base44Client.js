/**
 * base44Client.js — Substituto do SDK Base44 usando Supabase
 *
 * INSTRUÇÕES DE INSTALAÇÃO:
 * 1. Substitua o arquivo src/api/base44Client.js do seu projeto por este arquivo
 * 2. No Vercel, adicione as variáveis de ambiente:
 *      VITE_SUPABASE_URL  = https://ufqmavnvoyusocehnadz.supabase.co
 *      VITE_SUPABASE_ANON_KEY = (chave anon/public do Supabase → Settings → API)
 * 3. Faça um novo deploy no Vercel (push para o GitHub)
 *
 * Este arquivo imita 100% a interface do base44 SDK original:
 *   base44.entities.NomeTabela.list()
 *   base44.entities.NomeTabela.filter({ campo: valor })
 *   base44.entities.NomeTabela.get(id)
 *   base44.entities.NomeTabela.create(dados)
 *   base44.entities.NomeTabela.update(id, dados)
 *   base44.entities.NomeTabela.delete(id)
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '[base44Client] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados.\n' +
    'Adicione essas variáveis no Vercel em Settings → Environment Variables.'
  );
}

// ─── HTTP helper ────────────────────────────────────────────────────────────

async function supabaseRequest(method, path, body = null, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase error ${res.status}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ─── Parse filter objects into PostgREST query params ───────────────────────

function buildFilterParams(filters = {}) {
  const params = { select: '*' };
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      params[key] = 'is.null';
    } else if (Array.isArray(value)) {
      params[key] = `in.(${value.join(',')})`;
    } else {
      params[key] = `eq.${value}`;
    }
  });
  return params;
}

// ─── Entity proxy factory ────────────────────────────────────────────────────

function createEntityProxy(tableName) {
  return {
    /** Retorna todos os registros */
    async list(options = {}) {
      const params = { select: '*' };
      if (options.limit) params.limit = options.limit;
      if (options.offset) params.offset = options.offset;
      if (options.order_by) {
        const [col, dir] = options.order_by.split(' ');
        params.order = `${col}.${dir || 'asc'}`;
      }
      return await supabaseRequest('GET', tableName, null, params);
    },

    /** Filtra registros por campos exatos */
    async filter(filters = {}, options = {}) {
      const params = buildFilterParams(filters);
      if (options.limit) params.limit = options.limit;
      if (options.offset) params.offset = options.offset;
      if (options.order_by) {
        const [col, dir] = options.order_by.split(' ');
        params.order = `${col}.${dir || 'asc'}`;
      }
      return await supabaseRequest('GET', tableName, null, params);
    },

    /** Busca um registro pelo id */
    async get(id) {
      const results = await supabaseRequest('GET', tableName, null, {
        select: '*',
        id: `eq.${id}`,
        limit: 1,
      });
      return results[0] || null;
    },

    /** Cria um novo registro */
    async create(data) {
      // Gera id único se não fornecido
      if (!data.id) {
        data.id = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      }
      if (!data.created_date) data.created_date = new Date().toISOString();
      if (!data.updated_date) data.updated_date = new Date().toISOString();

      const results = await supabaseRequest('POST', tableName, data);
      return Array.isArray(results) ? results[0] : results;
    },

    /** Atualiza um registro pelo id */
    async update(id, data) {
      data.updated_date = new Date().toISOString();
      const results = await supabaseRequest('PATCH', tableName, data, {
        id: `eq.${id}`,
        select: '*',
      });
      return Array.isArray(results) ? results[0] : results;
    },

    /** Remove um registro pelo id */
    async delete(id) {
      await supabaseRequest('DELETE', tableName, null, { id: `eq.${id}` });
      return { success: true };
    },
  };
}

// ─── Tabelas do sistema ──────────────────────────────────────────────────────

const TABLE_NAMES = [
  'Employee', 'EmployeeContract', 'Payroll', 'TimeRecord', 'Team',
  'Benefit', 'EmployeeBenefit', 'Project', 'Budget', 'BudgetItem',
  'BudgetStage', 'ProjectStage', 'Measurement', 'MeasurementItem',
  'DiarioObra', 'Supplier', 'Client', 'CostCenter', 'Input', 'Service',
  'ServiceItem', 'AccountPayable', 'AccountReceivable', 'Transaction',
  'BankAccount', 'Invoice', 'InvoiceItem', 'Investment',
  'InvestmentTransaction', 'InvestmentHistory', 'EconomicIndicators',
  'MaterialRequisition', 'MaterialRequisitionItem', 'InputPurchaseHistory',
  'CompanySettings', 'VersionHistory', 'ServiceMonthlyDistribution',
  'ImportLog', 'CompositionStaging', 'Administrador', 'Colaborador',
];

const entities = {};
TABLE_NAMES.forEach(name => {
  entities[name] = createEntityProxy(name);
});

// ─── Export com mesma interface do base44 SDK original ───────────────────────

export const base44 = {
  entities,
  // Stub de auth — o sistema usa sessionStorage, não auth do Supabase
  auth: {
    async login() { return null; },
    async logout() { return null; },
    async getUser() { return null; },
  },
};

// Exportação default para compatibilidade
export default base44;
