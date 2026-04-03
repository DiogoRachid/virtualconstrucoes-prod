import { base44 } from './base44Client';

const createEntity = (tableName) => ({
  list: async (filters = {}) => {
    let query = base44.from(tableName).select('*');
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  get: async (id) => {
    const { data, error } = await base44.from(tableName).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  create: async (record) => {
    const { data, error } = await base44.from(tableName).insert(record).select().single();
    if (error) throw error;
    return data;
  },
  update: async (id, record) => {
    const { data, error } = await base44.from(tableName).update(record).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  delete: async (id) => {
    const { error } = await base44.from(tableName).delete().eq('id', id);
    if (error) throw error;
    return true;
  },
});

export const AccountPayable = createEntity('AccountPayable');
export const AccountReceivable = createEntity('AccountReceivable');
export const Administrador = createEntity('Administrador');
export const BankAccount = createEntity('BankAccount');
export const Benefit = createEntity('Benefit');
export const Budget = createEntity('Budget');
export const BudgetItem = createEntity('BudgetItem');
export const BudgetStage = createEntity('BudgetStage');
export const Client = createEntity('Client');
export const Colaborador = createEntity('Colaborador');
export const CompanySettings = createEntity('CompanySettings');
export const CompositionStaging = createEntity('CompositionStaging');
export const CostCenter = createEntity('CostCenter');
export const DiarioObra = createEntity('DiarioObra');
export const EconomicIndicators = createEntity('EconomicIndicators');
export const Employee = createEntity('Employee');
export const EmployeeBenefit = createEntity('EmployeeBenefit');
export const EmployeeContract = createEntity('EmployeeContract');
export const ImportLog = createEntity('ImportLog');
export const Input = createEntity('Input');
export const InputPurchaseHistory = createEntity('InputPurchaseHistory');
export const Investment = createEntity('Investment');
export const InvestmentHistory = createEntity('InvestmentHistory');
export const InvestmentTransaction = createEntity('InvestmentTrans
