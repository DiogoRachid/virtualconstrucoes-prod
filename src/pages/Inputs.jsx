import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Package, Plus, Pencil, Trash2, MoreHorizontal, Calendar, Loader2, History } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

export default function Inputs() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [viewDataBase, setViewDataBase] = useState('');
  
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: 'UN', valor_unitario: 0, categoria: 'MATERIAL', fonte: 'PROPRIA' });

  const { data: inputs = [], isLoading, refetch } = useQuery({
    queryKey: ['inputs'],
    queryFn: () => base44.entities.Input.list()
  });

  const { data: allHistory = [] } = useQuery({
    queryKey: ['inputPriceHistory'],
    queryFn: () => base44.entities.InputPriceHistory.list(),
    enabled: true
  });

  // Mapa: insumo_id -> { data_base -> registro histórico }
  const historyMap = useMemo(() => {
    const map = new Map();
    for (const h of allHistory) {
      if (!map.has(h.insumo_id)) map.set(h.insumo_id, new Map());
      map.get(h.insumo_id).set(h.data_base, h);
    }
    return map;
  }, [allHistory]);

  const datasBase = useMemo(() => {
    const setDates = new Set([
      ...inputs.map(i => i.data_base).filter(Boolean),
      ...allHistory.map(h => h.data_base).filter(Boolean)
    ]);
    return [...setDates].sort((a, b) => {
      const [mA, yA] = a.split('/'); const [mB, yB] = b.split('/');
      return parseInt(yB) - parseInt(yA) || parseInt(mB) - parseInt(mA);
    });
  }, [inputs, allHistory]);

  // Aplica valores históricos se viewDataBase estiver selecionada
  const processedInputs = useMemo(() => {
    if (!viewDataBase) return inputs;
    return inputs.map(i => {
      const hist = historyMap.get(i.id)?.get(viewDataBase);
      if (hist) {
        return { ...i, valor_unitario: hist.valor_unitario, data_base: hist.data_base, _isHistorico: true };
      }
      return { ...i, _isHistorico: false };
    });
  }, [inputs, viewDataBase, historyMap]);

  const filtered = useMemo(() => {
    let result = processedInputs.filter(i => 
      (!search || i.descricao?.toLowerCase().includes(search.toLowerCase()) || i.codigo?.toLowerCase().includes(search.toLowerCase()))
    );

    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [processedInputs, search, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSave = async () => {
    try {
      if (editing) {
        // Salvar histórico antes de atualizar se data_base ou valor mudou
        const valorMudou = editing.valor_unitario !== form.valor_unitario;
        const dataMudou = editing.data_base !== form.data_base;
        if ((valorMudou || dataMudou) && editing.data_base && editing.valor_unitario > 0) {
          const dataBaseParaHistorico = dataMudou ? editing.data_base : editing.data_base;
          const existing = await base44.entities.InputPriceHistory.filter({ insumo_id: editing.id, data_base: dataBaseParaHistorico });
          if (existing.length === 0) {
            await base44.entities.InputPriceHistory.create({
              insumo_id: editing.id,
              codigo: editing.codigo,
              descricao: editing.descricao,
              unidade: editing.unidade,
              valor_unitario: editing.valor_unitario,
              data_base: dataBaseParaHistorico,
              categoria: editing.categoria,
              fonte: editing.fonte
            }).catch(() => {});
          }
        }
        await base44.entities.Input.update(editing.id, form);
        toast.success('Insumo atualizado');
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

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(s => s.id)));
    }
  };

  const toggleSelectOne = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBulkDeleteInputs = async () => {
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.size} insumos selecionados?`)) return;
    try {
      const ids = Array.from(selectedIds);
      let deletedCount = 0;
      for (let i = 0; i < ids.length; i+=50) {
        await Promise.all(ids.slice(i, i+50).map(id => base44.entities.Input.delete(id)));
        deletedCount += ids.slice(i, i+50).length;
      }
      toast.success(`${deletedCount} insumos excluídos.`);
      setSelectedIds(new Set());
      refetch();
    } catch(e) {
      toast.error("Erro ao excluir insumos.");
      console.error(e);
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkDate) return toast.error("Informe a data");
    if (!confirm(`Atualizar a Data Base de TODOS os insumos para ${bulkDate}? Os valores atuais serão salvos no histórico.`)) return;

    setBulkUpdating(true);
    try {
       const allInputs = await base44.entities.Input.list();
       const total = allInputs.length;

       // 1. Salvar histórico dos valores atuais antes de atualizar
       const inputsComDataBase = allInputs.filter(i => i.data_base && i.data_base !== bulkDate && i.valor_unitario > 0);
       for (let i = 0; i < inputsComDataBase.length; i += 50) {
         const chunk = inputsComDataBase.slice(i, i + 50);
         await Promise.all(chunk.map(async input => {
           const existing = await base44.entities.InputPriceHistory.filter({ insumo_id: input.id, data_base: input.data_base });
           if (existing.length === 0) {
             await base44.entities.InputPriceHistory.create({
               insumo_id: input.id,
               codigo: input.codigo,
               descricao: input.descricao,
               unidade: input.unidade,
               valor_unitario: input.valor_unitario,
               data_base: input.data_base,
               categoria: input.categoria,
               fonte: input.fonte
             }).catch(() => {});
           }
         }));
       }

       // 2. Atualizar data_base de todos os insumos
       for (let i = 0; i < total; i += 100) {
          const chunk = allInputs.slice(i, i + 100);
          await Promise.all(chunk.map(input => 
            base44.entities.Input.update(input.id, { data_base: bulkDate })
          ));
       }

       toast.success(`${total} insumos atualizados. Histórico salvo para ${inputsComDataBase.length} insumos.`);
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
    {
      header: (
        <Checkbox 
          checked={filtered.length > 0 && selectedIds.size === filtered.length}
          onCheckedChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      className: 'w-10',
      render: (row) => (
        <Checkbox 
          checked={selectedIds.has(row.id)}
          onCheckedChange={() => toggleSelectOne(row.id)}
          aria-label="Select row"
        />
      )
    },
    { header: 'Código', accessor: 'codigo', className: 'w-24 font-mono text-xs', sortable: true },
    { header: 'Descrição', accessor: 'descricao', sortable: true },
    { header: 'Unidade', accessor: 'unidade', className: 'w-16', sortable: true },
    { 
      header: 'Categoria', 
      accessor: 'categoria', 
      className: 'w-32',
      sortable: true,
      render: (row) => row.categoria === 'MAO_OBRA' ? 'Mão de Obra' : 'Material'
    },
    { 
      header: 'Valor Unitário', 
      accessor: 'valor_unitario', 
      className: 'text-right',
      sortable: true,
      render: r => (
        <span className={r._isHistorico ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}>
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor_unitario)}
        </span>
      )
    },
    { 
      header: 'Data Base', 
      accessor: 'data_base', 
      className: 'w-24 text-xs', 
      sortable: true,
      render: r => (
        <span className={r._isHistorico ? 'text-blue-600 dark:text-blue-400' : ''}>
          {r.data_base || '-'}
          {r._isHistorico && <History className="inline h-3 w-3 ml-1 opacity-70" />}
        </span>
      )
    },
    { header: 'Fonte', accessor: 'fonte', className: 'w-24 text-xs', sortable: true },
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
      
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
         <SearchFilter searchValue={search} onSearchChange={setSearch} placeholder="Buscar insumo..." />
         <div className="flex flex-wrap gap-2 items-center">
            {datasBase.length > 0 && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <Select value={viewDataBase} onValueChange={setViewDataBase}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Valores atuais" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Valores atuais</SelectItem>
                    {datasBase.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                {viewDataBase && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <History className="h-3 w-3" /> Histórico
                  </span>
                )}
              </div>
            )}
            {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={handleBulkDeleteInputs}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir ({selectedIds.size})
                </Button>
            )}
            <Button variant="outline" onClick={() => setOpenBulk(true)}>
                <Calendar className="mr-2 h-4 w-4" /> Alterar Data Base Global
            </Button>
         </div>
      </div>
      <DataTable 
        columns={columns} 
        data={filtered} 
        isLoading={isLoading} 
        onSort={handleSort}
        sortColumn={sortConfig.key}
        sortDirection={sortConfig.direction}
      />

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
          <DialogHeader>
            <DialogTitle>Atualizar Data Base Global dos Insumos</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-300 space-y-1">
               <p className="font-medium">📋 O que acontece ao confirmar:</p>
               <ul className="list-disc pl-4 space-y-1 text-xs">
                 <li>Os valores atuais dos insumos são <strong>salvos no histórico</strong> com a data-base atual</li>
                 <li>A data-base de todos os insumos é atualizada para a nova data</li>
                 <li>Após isso, acesse <strong>Serviços → Recalcular Todos</strong> para atualizar os custos das composições</li>
               </ul>
             </div>
             <div>
                <Label>Nova Data Base (MM/AAAA)</Label>
                <Input value={bulkDate} onChange={e => setBulkDate(e.target.value)} placeholder="Ex: 03/2026" />
             </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setOpenBulk(false)} disabled={bulkUpdating}>Cancelar</Button>
             <Button onClick={handleBulkUpdate} disabled={bulkUpdating}>
                {bulkUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {bulkUpdating ? 'Salvando histórico e atualizando...' : 'Confirmar Atualização'}
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}