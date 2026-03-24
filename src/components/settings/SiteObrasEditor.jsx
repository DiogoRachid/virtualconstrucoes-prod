import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from 'lucide-react';

export default function SiteObrasEditor({ obras, onChange }) {
  const update = (index, field, value) => {
    const updated = obras.map((o, i) => i === index ? { ...o, [field]: value } : o);
    onChange(updated);
  };

  const add = () => {
    onChange([...obras, { nome: '', local: '', tipo: '', status: 'Entregue', img: '' }]);
  };

  const remove = (index) => {
    onChange(obras.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {obras.map((o, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">Obra {i + 1}</span>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} className="text-red-500 hover:text-red-700 h-7 w-7">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Nome da Obra</Label>
              <Input value={o.nome || ''} onChange={e => update(i, 'nome', e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Local (cidade – UF)</Label>
              <Input value={o.local || ''} onChange={e => update(i, 'local', e.target.value)} placeholder="Ex: Londrina – PR" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Tipo / Categoria</Label>
              <Input value={o.tipo || ''} onChange={e => update(i, 'tipo', e.target.value)} placeholder="Ex: Obra Pública – Saúde" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={o.status || 'Entregue'} onValueChange={v => update(i, 'status', v)}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Entregue">Entregue</SelectItem>
                  <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                  <SelectItem value="Planejado">Planejado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">URL da Imagem</Label>
              <Input value={o.img || ''} onChange={e => update(i, 'img', e.target.value)} placeholder="https://..." className="mt-1 h-8 text-sm" />
            </div>
          </div>
          {o.img && (
            <img src={o.img} alt={o.nome} className="h-24 w-full object-cover rounded-lg mt-1" />
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="w-full border-dashed">
        <Plus className="h-4 w-4 mr-2" /> Adicionar Obra
      </Button>
    </div>
  );
}