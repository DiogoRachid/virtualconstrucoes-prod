import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { DatabaseBackup, Download, Upload, CheckSquare, Square, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';

const MODULES = [
  { key: 'Employee',            label: 'Colaboradores',           group: 'RH' },
  { key: 'EmployeeContract',    label: 'Contratos',               group: 'RH' },
  { key: 'Payroll',             label: 'Folha de Pagamento',       group: 'RH' },
  { key: 'TimeRecord',          label: 'Frequência',              group: 'RH' },
  { key: 'Team',                label: 'Equipes',                 group: 'RH' },
  { key: 'Benefit',             label: 'Benefícios',              group: 'RH' },
  { key: 'EmployeeBenefit',     label: 'Benefícios por Colaborador', group: 'RH' },

  { key: 'Project',             label: 'Obras',                   group: 'Obras' },
  { key: 'Budget',              label: 'Orçamentos',              group: 'Obras' },
  { key: 'BudgetItem',          label: 'Itens de Orçamento',      group: 'Obras' },
  { key: 'BudgetStage',         label: 'Etapas (padrão)',         group: 'Obras' },
  { key: 'ProjectStage',        label: 'Etapas do Projeto',       group: 'Obras' },
  { key: 'Measurement',         label: 'Medições',                group: 'Obras' },
  { key: 'MeasurementItem',     label: 'Itens de Medição',        group: 'Obras' },
  { key: 'DiarioObra',          label: 'Diário de Obra',          group: 'Obras' },

  { key: 'Supplier',            label: 'Fornecedores',            group: 'Cadastros' },
  { key: 'Client',              label: 'Clientes',                group: 'Cadastros' },
  { key: 'CostCenter',          label: 'Centros de Custo',        group: 'Cadastros' },
  { key: 'Input',               label: 'Insumos',                 group: 'Cadastros' },
  { key: 'Service',             label: 'Serviços (Composições)',  group: 'Cadastros' },
  { key: 'ServiceItem',         label: 'Itens de Serviço',        group: 'Cadastros' },

  { key: 'AccountPayable',      label: 'Contas a Pagar',          group: 'Financeiro' },
  { key: 'AccountReceivable',   label: 'Contas a Receber',        group: 'Financeiro' },
  { key: 'Transaction',         label: 'Transações',              group: 'Financeiro' },
  { key: 'BankAccount',         label: 'Contas Bancárias',        group: 'Financeiro' },
  { key: 'Invoice',             label: 'Notas Fiscais',           group: 'Financeiro' },
  { key: 'InvoiceItem',         label: 'Itens de Nota Fiscal',    group: 'Financeiro' },

  { key: 'Investment',          label: 'Investimentos',           group: 'Investimentos' },
  { key: 'InvestmentTransaction', label: 'Transações de Investimento', group: 'Investimentos' },
  { key: 'InvestmentHistory',   label: 'Histórico de Investimentos', group: 'Investimentos' },
  { key: 'EconomicIndicators',  label: 'Indicadores Econômicos',  group: 'Investimentos' },

  { key: 'MaterialRequisition', label: 'Pedidos de Material',     group: 'Compras' },
  { key: 'MaterialRequisitionItem', label: 'Itens de Pedido',     group: 'Compras' },
  { key: 'InputPurchaseHistory', label: 'Histórico de Compras',   group: 'Compras' },

  { key: 'CompanySettings',     label: 'Configurações da Empresa', group: 'Sistema' },
  { key: 'VersionHistory',      label: 'Histórico de Versões',    group: 'Sistema' },
  { key: 'ServiceMonthlyDistribution', label: 'Distribuição Mensal de Serviços', group: 'Sistema' },
  { key: 'ImportLog',           label: 'Logs de Importação',      group: 'Sistema' },

  { key: 'CompositionStaging',  label: 'Composições (Rascunho)',  group: 'Obras' },

  { key: 'Administrador',       label: 'Administradores (Portal)', group: 'Acesso' },
  { key: 'Colaborador',         label: 'Colaboradores (Portal)',   group: 'Acesso' },
  ];

const GROUPS = [...new Set(MODULES.map(m => m.group))];

export default function Backup() {
  const [selected, setSelected] = useState(new Set(MODULES.map(m => m.key)));
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState([]);
  const [restoreProgress, setRestoreProgress] = useState([]);

  const toggleAll = () => {
    if (selected.size === MODULES.length) setSelected(new Set());
    else setSelected(new Set(MODULES.map(m => m.key)));
  };

  const toggleGroup = (group) => {
    const groupKeys = MODULES.filter(m => m.group === group).map(m => m.key);
    const allSelected = groupKeys.every(k => selected.has(k));
    const next = new Set(selected);
    if (allSelected) groupKeys.forEach(k => next.delete(k));
    else groupKeys.forEach(k => next.add(k));
    setSelected(next);
  };

  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const handleBackup = async () => {
    if (selected.size === 0) { toast.error('Selecione ao menos um módulo'); return; }
    setLoading(true);
    setProgress([]);
    const backup = { version: '1.0', created_at: new Date().toISOString(), modules: {} };

    for (const mod of MODULES.filter(m => selected.has(m.key))) {
      setProgress(p => [...p, { key: mod.key, label: mod.label, status: 'loading' }]);
      try {
        const data = await base44.entities[mod.key].list();
        backup.modules[mod.key] = data;
        setProgress(p => p.map(x => x.key === mod.key ? { ...x, status: 'ok', count: data.length } : x));
      } catch {
        backup.modules[mod.key] = [];
        setProgress(p => p.map(x => x.key === mod.key ? { ...x, status: 'error' } : x));
      }
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
    toast.success('Backup gerado com sucesso!');
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const confirmed = window.confirm(
      'ATENÇÃO: A restauração irá SUBSTITUIR todos os dados dos módulos presentes no arquivo de backup. Esta ação não pode ser desfeita. Deseja continuar?'
    );
    if (!confirmed) return;

    setRestoring(true);
    setRestoreProgress([]);

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.modules) { toast.error('Arquivo de backup inválido'); setRestoring(false); return; }

      for (const [key, records] of Object.entries(backup.modules)) {
        const mod = MODULES.find(m => m.key === key);
        const label = mod?.label || key;
        setRestoreProgress(p => [...p, { key, label, status: 'loading' }]);

        try {
          // Deletar registros existentes
          const existing = await base44.entities[key].list();
          for (const rec of existing) {
            await base44.entities[key].delete(rec.id);
          }
          // Recriar registros do backup (sem id/created_date/updated_date/created_by)
          for (const rec of records) {
            const { id, created_date, updated_date, created_by, ...data } = rec;
            await base44.entities[key].create(data);
          }
          setRestoreProgress(p => p.map(x => x.key === key ? { ...x, status: 'ok', count: records.length } : x));
        } catch {
          setRestoreProgress(p => p.map(x => x.key === key ? { ...x, status: 'error' } : x));
        }
      }
      toast.success('Restauração concluída!');
    } catch {
      toast.error('Erro ao ler o arquivo de backup');
    }
    setRestoring(false);
  };

  const CheckIcon = ({ checked }) => checked
    ? <CheckSquare className="h-4 w-4 text-blue-600" />
    : <Square className="h-4 w-4 text-slate-400" />;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Backup e Restauração"
        subtitle="Exporte os dados do sistema em JSON e restaure quando necessário"
        icon={DatabaseBackup}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Seleção de módulos */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Selecionar Módulos</CardTitle>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <CheckIcon checked={selected.size === MODULES.length} />
                {selected.size === MODULES.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {GROUPS.map(group => {
                const groupMods = MODULES.filter(m => m.group === group);
                const allSel = groupMods.every(m => selected.has(m.key));
                const someSel = groupMods.some(m => selected.has(m.key));
                return (
                  <div key={group}>
                    <button
                      onClick={() => toggleGroup(group)}
                      className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2 hover:text-blue-600"
                    >
                      <CheckIcon checked={allSel} />
                      {group}
                      {someSel && !allSel && <span className="text-xs text-slate-400 font-normal">(parcial)</span>}
                    </button>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-1 pl-5">
                      {groupMods.map(mod => (
                        <button
                          key={mod.key}
                          onClick={() => toggle(mod.key)}
                          className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg transition-colors text-left ${
                            selected.has(mod.key)
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <CheckIcon checked={selected.has(mod.key)} />
                          {mod.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Ações */}
        <div className="space-y-4">
          {/* Fazer Backup */}
          <Card className="border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                <Download className="h-4 w-4" /> Fazer Backup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500 mb-4">
                Exporta os dados dos módulos selecionados em um arquivo JSON para download.
              </p>
              <p className="text-xs font-semibold text-slate-600 mb-3">
                {selected.size} módulo(s) selecionado(s)
              </p>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleBackup}
                disabled={loading || selected.size === 0}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {loading ? 'Gerando backup...' : 'Baixar Backup'}
              </Button>

              {/* Progresso do backup */}
              {progress.length > 0 && (
                <div className="mt-4 space-y-1 max-h-60 overflow-y-auto">
                  {progress.map(p => (
                    <div key={p.key} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                      <span className="text-slate-600">{p.label}</span>
                      <span className={`flex items-center gap-1 font-medium ${
                        p.status === 'ok' ? 'text-green-600' :
                        p.status === 'error' ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {p.status === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {p.status === 'ok' && <><CheckCircle2 className="h-3 w-3" />{p.count} reg.</>}
                        {p.status === 'error' && <><AlertTriangle className="h-3 w-3" />erro</>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Restaurar Backup */}
          <Card className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                <Upload className="h-4 w-4" /> Restaurar Backup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>Atenção: a restauração substitui os dados existentes dos módulos presentes no arquivo.</span>
              </div>
              <label className={`flex items-center justify-center gap-2 w-full h-9 px-4 rounded-md text-sm font-medium border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 cursor-pointer transition-colors ${restoring ? 'opacity-50 pointer-events-none' : ''}`}>
                {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {restoring ? 'Restaurando...' : 'Selecionar arquivo .json'}
                <input type="file" accept=".json" className="hidden" onChange={handleRestore} disabled={restoring} />
              </label>

              {/* Progresso da restauração */}
              {restoreProgress.length > 0 && (
                <div className="mt-4 space-y-1 max-h-60 overflow-y-auto">
                  {restoreProgress.map(p => (
                    <div key={p.key} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                      <span className="text-slate-600">{p.label}</span>
                      <span className={`flex items-center gap-1 font-medium ${
                        p.status === 'ok' ? 'text-green-600' :
                        p.status === 'error' ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {p.status === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {p.status === 'ok' && <><CheckCircle2 className="h-3 w-3" />{p.count} reg.</>}
                        {p.status === 'error' && <><AlertTriangle className="h-3 w-3" />erro</>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}