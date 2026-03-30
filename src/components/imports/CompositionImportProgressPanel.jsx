import React, { useEffect, useRef, useState } from 'react';
import { XCircle, Loader2, Clock, Link2, SkipForward, CheckCircle2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

const formatTime = (seconds) => {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
};

const PHASE_NAMES = {
  parsing:     'Analisando',
  loading:     'Carregando',
  resolving:   'Resolvendo',
  linking:     'Vinculando',
  calculating: 'Calculando',
  done:        'Concluído',
  error:       'Erro',
};

export default function CompositionImportProgressPanel({ phase, progress, startTime, totals, log }) {
  const listRef = useRef(null);
  const [now, setNow] = useState(Date.now());

  // Atualiza o relógio a cada segundo
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll para última linha do log
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [log?.length]);

  const elapsed = startTime ? (now - startTime) / 1000 : 0;
  const pct = progress.percent || 0;

  // Tempo estimado: baseado em velocidade média (elapsed / pct concluído)
  let eta = null;
  if (pct > 5 && pct < 100 && elapsed > 2) {
    const totalEstimated = elapsed / (pct / 100);
    eta = totalEstimated - elapsed;
  }

  const { parsed = 0, skipped = 0, newServices = 0, newInputs = 0, links = 0, duplicates = 0, errors = 0, calculated = 0, retries = 0 } = totals || {};
  const isDone = phase === 'done';

  return (
    <div className="border rounded-xl bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`text-white px-4 py-3 flex items-center justify-between ${isDone ? 'bg-green-600' : 'bg-purple-600'}`}>
        <div className="flex items-center gap-2">
          {isDone
            ? <CheckCircle2 className="h-4 w-4" />
            : <Loader2 className="h-4 w-4 animate-spin" />
          }
          <span className="font-semibold text-sm">
            {isDone ? 'Importação concluída!' : 'Importando composições...'}
          </span>
        </div>
        <div className="text-purple-100 text-xs flex items-center gap-4">
          {/* Tempo decorrido */}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(elapsed) || '0s'}
          </span>
          {/* Tempo estimado */}
          {eta && (
            <span className="flex items-center gap-1 bg-white/20 rounded px-2 py-0.5">
              ~{formatTime(eta)} restante
            </span>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="px-4 py-2 border-b bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <Progress value={pct} className="flex-1 h-2.5" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-10 text-right">{pct}%</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-slate-500">{progress.message}</span>
          <span className="text-xs text-slate-400 font-medium">{PHASE_NAMES[phase] || phase || 'Iniciando'}</span>
        </div>
      </div>

      {/* Contadores */}
      <div className="px-4 py-2 border-b flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium bg-white dark:bg-slate-900">
        {parsed > 0 && <span className="text-slate-600">{parsed.toLocaleString('pt-BR')} linhas</span>}
        {skipped > 0 && <span className="text-slate-400"><SkipForward className="inline h-3 w-3 mr-0.5" />{skipped.toLocaleString('pt-BR')} ignoradas</span>}
        {newServices > 0 && <span className="text-purple-600">+{newServices} serviços</span>}
        {newInputs > 0 && <span className="text-blue-600">+{newInputs} insumos</span>}
        {links > 0 && <span className="text-green-600"><Link2 className="inline h-3 w-3 mr-0.5" />{links.toLocaleString('pt-BR')} vínculos</span>}
        {duplicates > 0 && <span className="text-amber-500">{duplicates.toLocaleString('pt-BR')} duplic.</span>}
        {calculated > 0 && <span className="text-orange-500">{calculated} calc.</span>}
        {retries > 0 && <span className="text-amber-600">↺ {retries} retentativas</span>}
        {errors > 0 && <span className="text-red-600"><XCircle className="inline h-3 w-3 mr-0.5" />{errors} erros</span>}
      </div>

      {/* Log de atividade */}
      <div ref={listRef} className="max-h-72 overflow-y-auto font-mono text-xs p-3 space-y-0.5 bg-slate-950 text-slate-200">
        {(log || []).map((entry, i) => (
          <div
            key={i}
            className={`flex gap-2 items-start leading-relaxed ${
              entry.type === 'error'   ? 'text-red-400' :
              entry.type === 'warn'    ? 'text-amber-400' :
              entry.type === 'retry'   ? 'text-amber-300' :
              entry.type === 'success' ? 'text-green-400' :
              entry.type === 'phase'   ? 'text-purple-300 font-bold' :
              'text-slate-400'
            }`}
          >
            <span className="text-slate-600 shrink-0 w-6 text-right select-none">{i + 1}</span>
            <span className="break-all">{entry.msg}</span>
          </div>
        ))}
        {(!log || log.length === 0) && (
          <div className="text-slate-600 text-center py-6">Aguardando início...</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 flex justify-between">
        <span>Decorrido: <strong>{formatTime(elapsed) || '0s'}</strong></span>
        {eta && <span>Estimado: ~<strong>{formatTime(eta)}</strong></span>}
        {isDone && <span className="text-green-600 font-medium">✓ Finalizado</span>}
      </div>
    </div>
  );
}