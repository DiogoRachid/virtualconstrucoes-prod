import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Package, Plus, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

export default function Inputs() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: 'UN', valor_unitario: 0, fonte: 'PROPRIA' });

  const { data: inputs = [], isLoading, refetch } = useQuery({
    queryKey: ['inputs'],
    queryFn: () => base44.entities.Input.list()
  });

  const filtered = inputs.filter(i => 
    !search || 
    i.descricao?.toLowerCase().includes(search.toLowerCase()) || 
    i.codigo?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    try {
      if (editing) {
        await base44.entities.Input.update(editing.id, form);
        toast.success('Insumo atualizado');
        // PROMPT 3: UPDATE CASCATA
        toast.info('Recalculando dependentes...');
        await Engine.updateDependents('INSUMO', editing.id);
        toast.success('Dependentes atualizados');
      } else {
        await base44.entities.Input.create(form);
        toast.success('Insumo criado');
      }
      setOpen(false);
      refetch();
    } catch(e) {
      toast.error('Erro ao salvar');
    }
  };

  const handleEdit = (item) => {
    setEditing(item);
    setForm(item);
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if(confirm('Excluir insumo?')) {
      await base44.entities.Input.delete(id);
      refetch();
    }
  };

  const columns = [
    { header: 'Código', accessor: 'codigo', className: 'w-24 font-mono text-xs' },
    { header: 'Descrição', accessor: 'descricao' },
    { header: 'Unidade', accessor: 'unidade', className: 'w-16' },
    { 
      header: 'Valor Unitário', 
      accessor: 'valor_unitario', 
      className: 'text-right',
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor_unitario)
    },
    { header: 'Data Base', accessor: 'data_base', className: 'w-24 text-xs' },
    { header: 'Fonte', accessor: 'fonte', className: 'w-24 text-xs' },
    {
      header: '',
      className: 'w-12',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete(row.id)} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div>
      <PageHeader 
        title="Insumos" 
        subtitle="Banco de materiais e mão de obra" 
        icon={Package}
        actionLabel="Novo Insumo"
        onAction={() => { setEditing(null); setForm({ codigo: '', descricao: '', unidade: 'UN', valor_unitario: 0, fonte: 'PROPRIA' }); setOpen(true); }}
      />
      <SearchFilter searchValue={search} onSearchChange={setSearch} placeholder="Buscar insumo..." />
      <DataTable columns={columns} data={filtered} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} Insumo</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-1">
                <Label>Código</Label>
                <Input value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} />
              </div>
              <div className="col-span-3">
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
               <div>
                <Label>Unidade</Label>
                <Input value={form.unidade} onChange={e => setForm({...form, unidade: e.target.value})} />
              </div>
               <div>
                <Label>Valor Unit.</Label>
                <Input type="number" value={form.valor_unitario} onChange={e => setForm({...form, valor_unitario: parseFloat(e.target.value)})} />
              </div>
              <div>
                <Label>Data Base</Label>
                <Input value={form.data_base} onChange={e => setForm({...form, data_base: e.target.value})} placeholder="MM/AAAA" />
              </div>
               <div>
                <Label>Fonte</Label>
                <Input value={form.fonte} onChange={e => setForm({...form, fonte: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}