/**
 * base44Client.js — Substituto do SDK Base44 usando Supabase
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

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
  if (!text) return [];
  const parsed = JSON.parse(text);
  // Garante sempre retornar array para listagens
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  return [];
}

// ─── Filter params ────────────────────────────────────────────────────────────

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

// ─── Entity proxy ─────────────────────────────────────────────────────────────

function createEntityProxy(tableName) {
  return {
    async list(options = {}) {
      const params = { select: '*' };
      if (options.limit) params.limit = options.limit;
      if (options.offset) params.offset = options.offset;
      if (options.order_by) {
        const [col, dir] = options.order_by.split(' ');
        params.order = `${col}.${dir || 'asc'}`;
      }
      const result = await supabaseRequest('GET', tableName, null, params);
      return Array.isArray(result) ? result : [];
    },

    async filter(filters = {}, options = {}) {
      const params = buildFilterParams(filters);
      if (options.limit) params.limit = options.limit;
      if (options.offset) params.offset = options.offset;
      if (options.order_by) {
        const [col, dir] = options.order_by.split(' ');
        params.order = `${col}.${dir || 'asc'}`;
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
      try {
        const user = JSON.parse(raw);
        return { data: { session: { user } } };
      } catch(e) {}
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
