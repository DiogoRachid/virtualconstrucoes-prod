import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from 'lucide-react';

const CORES_OPCOES = [
  { label: 'Azul', value: 'bg-blue-50 text-blue-600' },
  { label: 'Violeta', value: 'bg-violet-50 text-violet-600' },
  { label: 'Laranja', value: 'bg-orange-50 text-orange-600' },
  { label: 'Ciano', value: 'bg-cyan-50 text-cyan-600' },
  { label: 'Verde', value: 'bg-emerald-50 text-emerald-600' },
  { label: 'Rosa', value: 'bg-rose-50 text-rose-600' },
  { label: 'Âmbar', value: 'bg-amber-50 text-amber-600' },
  { label: 'Índigo', value: 'bg-indigo-50 text-indigo-600' },
];

export default function SiteServicosEditor({ servicos, onChange }) {
  const update = (index, field, value) => {
    const updated = servicos.map((s, i) => i === index ? { ...s, [field]: value } : s);
    onChange(updated);
  };

  const add = () => {
    onChange([...servicos, { titulo: '', descricao: '', cor: 'bg-blue-50 text-blue-600' }]);
  };

  const remove = (index) => {
    onChange(servicos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {servicos.map((s, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">Card {i + 1}</span>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} className="text-red-500 hover:text-red-700 h-7 w-7">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={s.titulo || ''} onChange={e => update(i, 'titulo', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Cor do Ícone</Label>
              <select
                value={s.cor || s.color || 'bg-blue-50 text-blue-600'}
                onChange={e => update(i, 'cor', e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {CORES_OPCOES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea value={s.descricao || s.desc || ''} onChange={e => update(i, 'descricao', e.target.value)} className="mt-1 min-h-[60px] text-sm" />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="w-full border-dashed">
        <Plus className="h-4 w-4 mr-2" /> Adicionar Serviço
      </Button>
    </div>
  );
}