import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Package, Plus, Pencil, Trash2, MoreHorizontal, Calendar, Loader2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

export default function Inputs() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: 'UN', valor_unitario: 0, categoria: 'MATERIAL', fonte: 'PROPRIA' });

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

  const handleBulkUpdate = async () => {
    if (!bulkDate) return toast.error("Informe a data");
    if (!confirm(`Atualizar a Data Base de TODOS os insumos para ${bulkDate}?`)) return;

    setBulkUpdating(true);
    try {
       const allInputs = await Engine.fetchAll('Input');
       const total = allInputs.length;
       const updates = allInputs.map(i => ({
          id: i.id,
          data: { data_base: bulkDate }
       }));

       for (let i = 0; i < total; i += 100) {
          const chunk = updates.slice(i, i + 100);
          await Promise.all(chunk.map(u => base44.entities.Input.update(u.id, u.data)));
       }

       toast.success(`${total} insumos atualizados.`);
       setOpenBulk(false);
       refetch();
    } catch (e) {
       toast.error("Erro ao atualizar em massa");
       console.error(e);
    } finally {
       setBulkUpdating(false);
    }
  };

  const columns = [
    { header: 'Código', accessor: 'codigo', className: 'w-24 font-mono text-xs' },
    { header: 'Descrição', accessor: 'descricao' },
    { header: 'Unidade', accessor: 'unidade', className: 'w-16' },
    { 
      header: 'Categoria', 
      accessor: 'categoria', 
      className: 'w-32',
      render: (row) => row.categoria === 'MAO_OBRA' ? 'Mão de Obra' : 'Material'
    },
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
        onAction={() => { setEditing(null); setForm({ codigo: '', descricao: '', unidade: 'UN', valor_unitario: 0, categoria: 'MATERIAL', fonte: 'PROPRIA' }); setOpen(true); }}
      />
      
      <div className="flex justify-between items-center mb-4">
         <SearchFilter searchValue={search} onSearchChange={setSearch} placeholder="Buscar insumo..." />
         <Button variant="outline" onClick={() => setOpenBulk(true)}>
            <Calendar className="mr-2 h-4 w-4" /> Alterar Data Base Global
         </Button>
      </div>
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
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm({...form, categoria: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MATERIAL">Material</SelectItem>
                    <SelectItem value="MAO_OBRA">Mão de Obra</SelectItem>
                  </SelectContent>
                </Select>
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

      <Dialog open={openBulk} onOpenChange={setOpenBulk}>
        <DialogContent>
          <DialogHeader><DialogTitle>Atualização em Massa</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
             <p className="text-sm text-slate-500">
                Isso alterará a Data Base de <strong>TODOS</strong> os insumos cadastrados.
                Essa ação não pode ser desfeita.
             </p>
             <div>
                <Label>Nova Data Base (MM/AAAA)</Label>
                <Input value={bulkDate} onChange={e => setBulkDate(e.target.value)} placeholder="Ex: 10/2025" />
             </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setOpenBulk(false)} disabled={bulkUpdating}>Cancelar</Button>
             <Button onClick={handleBulkUpdate} disabled={bulkUpdating}>
                {bulkUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {bulkUpdating ? 'Atualizando...' : 'Confirmar Atualização'}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}