import React, { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

const formatTime = (seconds) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
};

export default function RecalcProgressPanel({ items, current, total, startTime }) {
  const listRef = useRef(null);

  // Auto-scroll para o item atual
  useEffect(() => {
    if (listRef.current && current > 0) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [current]);

  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
  const avgPerItem = current > 0 ? elapsed / current : 0;
  const remaining = avgPerItem * (total - current);

  return (
    <div className="border rounded-xl bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-semibold text-sm">Recalculando serviços...</span>
        </div>
        <div className="text-blue-100 text-xs flex items-center gap-3">
          <span>{current}/{total} concluídos</span>
          {current > 0 && remaining > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{formatTime(remaining)} restantes
            </span>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="px-4 py-2 border-b bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <Progress value={percent} className="flex-1 h-2" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-10 text-right">{percent}%</span>
        </div>
        {elapsed > 0 && (
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>Decorrido: {formatTime(elapsed)}</span>
            <span>{avgPerItem > 0 ? `~${(avgPerItem * 1000).toFixed(0)}ms/serviço` : ''}</span>
          </div>
        )}
      </div>

      {/* Lista de itens — estilo planilha */}
      <div ref={listRef} className="max-h-64 overflow-y-auto font-mono text-xs">
        <table className="w-full">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs">
            <tr>
              <th className="px-3 py-1.5 text-left w-8">#</th>
              <th className="px-3 py-1.5 text-left w-24">Código</th>
              <th className="px-3 py-1.5 text-left">Descrição</th>
              <th className="px-3 py-1.5 text-right w-24">Custo Total</th>
              <th className="px-3 py-1.5 text-center w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const isActive = idx === current && current < total;
              const isDone = idx < current;
              const isPending = idx > current;

              return (
                <tr
                  key={item.id}
                  data-active={isActive}
                  className={`border-b transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/40'
                      : isDone
                      ? 'bg-white dark:bg-slate-900'
                      : 'bg-slate-50/50 dark:bg-slate-900/50 opacity-50'
                  }`}
                >
                  <td className="px-3 py-1.5 text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{item.codigo || '-'}</td>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 truncate max-w-xs">
                    {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-pulse" />}
                    {item.descricao || '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">
                    {isDone && item._newTotal != null
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item._newTotal)
                      : isDone
                      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_total || 0)
                      : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {isDone ? (
                      item._error
                        ? <XCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                    ) : isActive ? (
                      <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin mx-auto" />
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

      {/* Footer resumo */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 flex justify-between">
        <span>✓ {current} processados</span>
        <span>⏳ {total - current} pendentes</span>
        <span>Total: {total}</span>
      </div>
    </div>
  );
}