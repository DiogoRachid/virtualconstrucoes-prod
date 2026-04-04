/**
 * base44Client.js — Substituto do SDK Base44 usando Supabase
 * Suporta: $in, $gte, $lte, $ne, ordenação como string, limit como 3º parâmetro
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function supabaseRequest(method, path, body = null, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

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
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && !parsed.code) return [parsed];
  return [];
}

// ─── Converter filtros Base44 → PostgREST ─────────────────────────────────────
// Suporta: valor simples, { $in: [] }, { $gte: x }, { $lte: x }, { $ne: x }

function buildFilterParams(filters = {}) {
  const params = { select: '*' };
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      params[key] = 'is.null';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Operadores Base44: $in, $gte, $lte, $ne, $gt, $lt
      if (value.$in !== undefined) {
        params[key] = `in.(${value.$in.join(',')})`;
      } else if (value.$gte !== undefined) {
        params[key] = `gte.${value.$gte}`;
      } else if (value.$lte !== undefined) {
        params[key] = `lte.${value.$lte}`;
      } else if (value.$gt !== undefined) {
        params[key] = `gt.${value.$gt}`;
      } else if (value.$lt !== undefined) {
        params[key] = `lt.${value.$lt}`;
      } else if (value.$ne !== undefined) {
        params[key] = `neq.${value.$ne}`;
      }
    } else if (Array.isArray(value)) {
      params[key] = `in.(${value.join(',')})`;
    } else {
      params[key] = `eq.${value}`;
    }
  });
  return params;
}

// ─── Converter ordenação Base44 → PostgREST ───────────────────────────────────
// Base44: '-data' = order by data DESC, 'nome' = order by nome ASC

function parseOrder(orderStr) {
  if (!orderStr || typeof orderStr !== 'string') return null;
  const desc = orderStr.startsWith('-');
  const col = desc ? orderStr.slice(1) : orderStr;
  return `${col}.${desc ? 'desc' : 'asc'}`;
}

// ─── Entity proxy ─────────────────────────────────────────────────────────────

function createEntityProxy(tableName) {
  return {
    // list(options) ou list(orderStr) ou list(orderStr, limit)
    async list(optionsOrOrder = {}, limit = null) {
      const params = { select: '*' };

      if (typeof optionsOrOrder === 'string') {
        // Base44 style: list('-data') ou list('-data', 50)
        const order = parseOrder(optionsOrOrder);
        if (order) params.order = order;
        if (limit) params.limit = limit;
      } else {
        const options = optionsOrOrder || {};
        if (options.limit) params.limit = options.limit;
        if (options.offset) params.offset = options.offset;
        if (options.order_by) {
          params.order = parseOrder(options.order_by) || options.order_by;
        }
      }

      const result = await supabaseRequest('GET', tableName, null, params);
      return Array.isArray(result) ? result : [];
    },

    // filter(filters, orderOrOptions, limit)
    async filter(filters = {}, orderOrOptions = {}, limit = null) {
      const params = buildFilterParams(filters);

      if (typeof orderOrOptions === 'string') {
        // Base44 style: filter({...}, 'data_vencimento', 1000)
        const order = parseOrder(orderOrOptions);
        if (order) params.order = order;
        if (limit) params.limit = limit;
      } else {
        const options = orderOrOptions || {};
        if (options.limit) params.limit = options.limit;
        if (options.offset) params.offset = options.offset;
        if (options.order_by) {
          params.order = parseOrder(options.order_by) || options.order_by;
        }
      }

      const result = await supabaseRequest('GET', tableName, null, params);
      return Array.isArray(result) ? result : [];
    },

    async get(id) {
      const results = await supabaseRequest('GET', tableName, null, {
        select: '*',
        id: `eq.${id}`,
        limit: 1,
      });
      return Array.isArray(results) ? (results[0] || null) : null;
    },

    async create(data) {
      if (!data.id) {
        data.id = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      }
      if (!data.created_date) data.created_date = new Date().toISOString();
      if (!data.updated_date) data.updated_date = new Date().toISOString();
      const results = await supabaseRequest('POST', tableName, data);
      return Array.isArray(results) ? results[0] : results;
    },

    async update(id, data) {
      data.updated_date = new Date().toISOString();
      const results = await supabaseRequest('PATCH', tableName, data, {
        id: `eq.${id}`,
        select: '*',
      });
      return Array.isArray(results) ? results[0] : results;
    },

    async delete(id) {
      await supabaseRequest('DELETE', tableName, null, { id: `eq.${id}` });
      return { success: true };
    },
  };
}

// ─── Tabelas ──────────────────────────────────────────────────────────────────

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

// ─── Auth stub ────────────────────────────────────────────────────────────────

const SESSION_KEY = 'portal_admin_auth';
const authListeners = [];

const auth = {
  async getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try { return { data: { session: { user: JSON.parse(raw) } } }; } catch(e) {}
    }
    return { data: { session: null } };
  },

  onAuthStateChange(callback) {
    authListeners.push(callback);
    const raw = sessionStorage.getItem(SESSION_KEY);
    const session = raw ? { user: JSON.parse(raw) } : null;
    setTimeout(() => callback('INITIAL_SESSION', session), 0);
    const subscription = {
      unsubscribe() {
        const idx = authListeners.indexOf(callback);
        if (idx > -1) authListeners.splice(idx, 1);
      }
    };
    return { data: { subscription } };
  },

  async signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    authListeners.forEach(cb => cb('SIGNED_OUT', null));
  },

  async login() { return null; },
  async getUser() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const base44 = { entities, auth };
export default base44;
