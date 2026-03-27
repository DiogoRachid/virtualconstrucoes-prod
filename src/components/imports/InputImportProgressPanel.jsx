import React, { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, Plus, RefreshCw, SkipForward } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

const formatTime = (seconds) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
};

const ACTION_LABEL = {
  create:   { label: 'NOVO',       color: 'text-green-600',  bg: 'bg-green-50' },
  update:   { label: 'ATUALIZAR',  color: 'text-blue-600',   bg: 'bg-blue-50' },
  samebase: { label: 'RE-IMP',     color: 'text-amber-600',  bg: 'bg-amber-50' },
  skip:     { label: 'IGNORADO',   color: 'text-slate-400',  bg: '' },
  error:    { label: 'ERRO',       color: 'text-red-600',    bg: 'bg-red-50' },
  pending:  { label: '...',        color: 'text-slate-300',  bg: '' },
  running:  { label: '▶',          color: 'text-blue-500',   bg: 'bg-blue-50' },
};

export default function InputImportProgressPanel({ rows, startTime, totals }) {
  const listRef = useRef(null);

  const done = rows.filter(r => r.status && r.status !== 'pending' && r.status !== 'running').length;
  const total = rows.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
  const avgPerItem = done > 0 ? elapsed / done : 0;
  const remaining = avgPerItem * (total - done);

  // Auto-scroll para linha ativa
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [done]);

  const created  = totals?.created  ?? rows.filter(r => r.status === 'create').length;
  const updated  = totals?.updated  ?? rows.filter(r => r.status === 'update').length;
  const samebase = totals?.samebase ?? rows.filter(r => r.status === 'samebase').length;
  const errors   = totals?.errors   ?? rows.filter(r => r.status === 'error').length;

  return (
    <div className="border rounded-xl bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-semibold text-sm">Importando insumos...</span>
        </div>
        <div className="text-blue-100 text-xs flex items-center gap-3">
          <span>{done}/{total} processados</span>
          {done > 0 && remaining > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{formatTime(remaining)} restantes
            </span>
          )}
        </div>
      </div>

      {/* Barra de progresso + tempo */}
      <div className="px-4 py-2 border-b bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <Progress value={percent} className="flex-1 h-2" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-10 text-right">{percent}%</span>
        </div>
        {elapsed > 0 && (
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>Decorrido: {formatTime(elapsed)}</span>
            <span>{avgPerItem > 0 ? `~${(avgPerItem * 1000).toFixed(0)}ms/insumo` : ''}</span>
          </div>
        )}
      </div>

      {/* Contadores rápidos */}
      <div className="px-4 py-2 border-b flex gap-4 text-xs font-medium bg-white dark:bg-slate-900">
        <span className="text-green-600 flex items-center gap-1"><Plus className="h-3 w-3" />{created} criados</span>
        <span className="text-blue-600 flex items-center gap-1"><RefreshCw className="h-3 w-3" />{updated} atualizados</span>
        <span className="text-amber-600 flex items-center gap-1"><SkipForward className="h-3 w-3" />{samebase} re-imp.</span>
        {errors > 0 && <span className="text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" />{errors} erros</span>}
      </div>

      {/* Tabela estilo planilha */}
      <div ref={listRef} className="max-h-72 overflow-y-auto font-mono text-xs">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs">
            <tr>
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left w-28">Código</th>
              <th className="px-2 py-1.5 text-left">Descrição</th>
              <th className="px-2 py-1.5 text-right w-24">Valor</th>
              <th className="px-2 py-1.5 text-center w-20">Ação</th>
              <th className="px-2 py-1.5 text-center w-16">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isRunning = row.status === 'running';
              const isDone = row.status && row.status !== 'pending' && row.status !== 'running';
              const isError = row.status === 'error';
              const actionInfo = ACTION_LABEL[row.status || 'pending'] || ACTION_LABEL.pending;

              return (
                <tr
                  key={idx}
                  data-active={isRunning}
                  className={`border-b transition-colors ${
                    isRunning ? 'bg-blue-50 dark:bg-blue-950/40' :
                    isError   ? 'bg-red-50 dark:bg-red-950/30' :
                    isDone    ? 'bg-white dark:bg-slate-900' :
                    'bg-slate-50/50 dark:bg-slate-900/50 opacity-40'
                  }`}
                >
                  <td className="px-2 py-1 text-slate-400">{idx + 1}</td>
                  <td className="px-2 py-1 text-slate-600 dark:text-slate-300 font-semibold">{row.codigo}</td>
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                    {isRunning && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-pulse" />}
                    {row.descricao}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-600 dark:text-slate-300">
                    {isDone || isRunning
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_unitario || 0)
                      : '-'}
                  </td>
                  <td className={`px-2 py-1 text-center font-semibold ${actionInfo.color}`}>
                    {row.action ? (ACTION_LABEL[row.action]?.label || '-') : '-'}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {isError ? (
                      <span title={row.errorMsg}>
                        <XCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />
                      </span>
                    ) : isRunning ? (
                      <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin mx-auto" />
                    ) : isDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 flex justify-between">
        <span>✓ {done} processados</span>
        <span>⏳ {total - done} pendentes</span>
        <span>Total: {total}</span>
      </div>
    </div>
  );
}