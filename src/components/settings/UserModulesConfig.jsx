import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MODULOS_COLABORADOR } from '@/pages/ColaboradorPortal';
import { Shield, HardHat, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const GRUPOS = [...new Set(MODULOS_COLABORADOR.map(m => m.group))];

export default function UserModulesConfig({ user, onClose }) {
  const queryClient = useQueryClient();
  const [tipoPortal, setTipoPortal] = useState(user.tipo_portal || 'administrador');
  const [modulosSelecionados, setModulosSelecionados] = useState(user.modulos_habilitados || []);
  const [expandedGroups, setExpandedGroups] = useState(GRUPOS);

  const saveMutation = useMutation({
    mutationFn: () => base44.entities.User.update(user.id, {
      tipo_portal: tipoPortal,
      modulos_habilitados: tipoPortal === 'colaborador' ? modulosSelecionados : []
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Acesso de ${user.full_name} atualizado`);
      onClose();
    }
  });

  const toggleModulo = (key) => {
    setModulosSelecionados(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleGroup = (group) => {
    const keys = MODULOS_COLABORADOR.filter(m => m.group === group).map(m => m.key);
    const allSelected = keys.every(k => modulosSelecionados.includes(k));
    if (allSelected) {
      setModulosSelecionados(prev => prev.filter(k => !keys.includes(k)));
    } else {
      setModulosSelecionados(prev => [...new Set([...prev, ...keys])]);
    }
  };

  const toggleGroupExpand = (group) => {
    setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  };

  return (
    <div className="space-y-5">
      {/* Tipo de Portal */}
      <div>
        <p className="text-sm font-medium text-slate-700 mb-3">Tipo de Portal</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'administrador', label: 'Administrador', icon: Shield, desc: 'Acesso total ao sistema', color: 'border-blue-500 bg-blue-50 text-blue-700' },
            { key: 'colaborador', label: 'Colaborador', icon: HardHat, desc: 'Acesso aos módulos selecionados', color: 'border-orange-400 bg-orange-50 text-orange-700' }
          ].map(op => (
            <button key={op.key} onClick={() => setTipoPortal(op.key)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${tipoPortal === op.key ? op.color : 'border-slate-200 hover:border-slate-300'}`}>
              <op.icon className="h-5 w-5 mb-2" />
              <p className="font-semibold text-sm">{op.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{op.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Módulos (só para colaborador) */}
      {tipoPortal === 'colaborador' && (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-3">
            Módulos Habilitados <span className="text-slate-400 font-normal">({modulosSelecionados.length} selecionados)</span>
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {GRUPOS.map(group => {
              const mods = MODULOS_COLABORADOR.filter(m => m.group === group);
              const allSelected = mods.every(m => modulosSelecionados.includes(m.key));
              const someSelected = mods.some(m => modulosSelecionados.includes(m.key));
              const expanded = expandedGroups.includes(group);

              return (
                <div key={group} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                    <button
                      onClick={() => toggleGroup(group)}
                      className={`flex items-center gap-2 text-sm font-semibold ${allSelected ? 'text-blue-600' : someSelected ? 'text-amber-600' : 'text-slate-600'}`}>
                      <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${allSelected ? 'bg-blue-600 border-blue-600' : someSelected ? 'bg-amber-400 border-amber-400' : 'border-slate-300'}`}>
                        {(allSelected || someSelected) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      {group}
                    </button>
                    <button onClick={() => toggleGroupExpand(group)} className="text-slate-400 hover:text-slate-600">
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                  {expanded && (
                    <div className="divide-y divide-slate-100">
                      {mods.map(m => (
                        <button key={m.key} onClick={() => toggleModulo(m.key)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
                          <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${modulosSelecionados.includes(m.key) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                            {modulosSelecionados.includes(m.key) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <m.icon className="h-4 w-4 text-slate-400" />
                          <span className="text-sm text-slate-700">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1 bg-blue-600 hover:bg-blue-700">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
          Salvar Acesso
        </Button>
      </div>
    </div>
  );
}