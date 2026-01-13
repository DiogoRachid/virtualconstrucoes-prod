import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Layers, Plus, Search, MoreHorizontal, Pencil, Trash2, Calendar, Loader2, RefreshCw } from 'lucide-react';
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as Engine from '@/components/logic/CompositionEngine';
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

export default function Services() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [openBulk, setOpenBulk] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState({ current: 0, total: 0 });

  const { data: services = [], isLoading, refetch } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list()
  });

  const filtered = React.useMemo(() => {
    let result = services.filter(s => 
      !search || 
      s.descricao?.toLowerCase().includes(search.toLowerCase()) ||
      s.codigo?.toLowerCase().includes(search.toLowerCase())
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
  }, [services, search, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
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

  const handleBulkDeleteServices = async () => {
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.size} serviços selecionados?`)) return;
    try {
      const ids = Array.from(selectedIds);
      let deletedCount = 0;
      for (let i = 0; i < ids.length; i+=50) {
        await Promise.all(ids.slice(i, i+50).map(id => base44.entities.Service.delete(id)));
        deletedCount += ids.slice(i, i+50).length;
      }
      toast.success(`${deletedCount} serviços excluídos.`);
      setSelectedIds(new Set());
      refetch();
    } catch(e) {
      toast.error("Erro ao excluir serviços.");
      console.error(e);
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkDate) return toast.error("Informe a data");
    if (!confirm(`Atualizar a Data Base de TODOS os serviços para ${bulkDate}?`)) return;

    setBulkUpdating(true);
    try {
       const allServices = await Engine.fetchAll('Service');
       const total = allServices.length;
       const updates = allServices.map(s => ({
          id: s.id,
          data: { data_base: bulkDate }
       }));

       for (let i = 0; i < total; i += 100) {
          const chunk = updates.slice(i, i + 100);
          await Promise.all(chunk.map(u => base44.entities.Service.update(u.id, u.data)));
       }

       toast.success(`${total} serviços atualizados.`);
       setOpenBulk(false);
       window.location.reload(); 
    } catch (e) {
       toast.error("Erro ao atualizar em massa");
       console.error(e);
    } finally {
       setBulkUpdating(false);
    }
  };

  const handleRecalculateAll = async () => {
    if (!confirm('Recalcular TODOS os custos de serviços? Isso pode demorar alguns minutos.')) return;
    
    setRecalculating(true);
    setRecalcProgress({ current: 0, total: 0 });
    
    try {
      // Buscar todos os serviços
      const allServices = await Engine.fetchAll('Service');
      const total = allServices.length;
      setRecalcProgress({ current: 0, total });
      
      // Ordenar por nível de dependência (bottom-up)
      allServices.sort((a, b) => (a.nivel_max_dependencia || 0) - (b.nivel_max_dependencia || 0));
      
      // Recalcular cada um
      for (let i = 0; i < allServices.length; i++) {
        await Engine.recalculateService(allServices[i].id);
        setRecalcProgress({ current: i + 1, total });
      }
      
      toast.success(`${total} serviços recalculados com sucesso!`);
      refetch();
    } catch (e) {
      toast.error("Erro ao recalcular serviços");
      console.error(e);
    } finally {
      setRecalculating(false);
      setRecalcProgress({ current: 0, total: 0 });
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
    { header: 'Data Base', accessor: 'data_base', className: 'w-24 text-xs', sortable: true },
    { 
      header: 'Material', 
      accessor: 'custo_material', 
      className: 'text-right',
      sortable: true,
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_material)
    },
    { 
      header: 'Mão de Obra', 
      accessor: 'custo_mao_obra', 
      className: 'text-right',
      sortable: true,
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_mao_obra)
    },
    { 
      header: 'Total', 
      accessor: 'custo_total', 
      className: 'text-right font-bold',
      sortable: true,
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_total)
    },
    {
      header: '',
      className: 'w-12',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`ServiceEditor?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar Composição
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={async () => {
                if(confirm('Excluir serviço?')) {
                  await base44.entities.Service.delete(row.id);
                  window.location.reload();
                }
              }} 
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div>
      <PageHeader 
        title="Serviços" 
        subtitle="Banco de composições" 
        icon={Layers}
        actionLabel="Novo Serviço"
        onAction={() => window.location.href = createPageUrl('ServiceEditor')}
      />

      <div className="flex justify-between items-center mb-4">
        <SearchFilter 
          searchValue={search} 
          onSearchChange={setSearch} 
          placeholder="Buscar serviço..." 
        />
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
             <Button variant="destructive" onClick={handleBulkDeleteServices}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir ({selectedIds.size})
             </Button>
          )}
          <Button variant="outline" onClick={handleRecalculateAll} disabled={recalculating}>
              {recalculating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recalculando {recalcProgress.current}/{recalcProgress.total}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recalcular Todos
                </>
              )}
          </Button>
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
        emptyComponent={
          <EmptyState 
            title="Nenhum serviço" 
            description="Cadastre composições." 
            actionLabel="Novo" 
            onAction={() => window.location.href = createPageUrl('ServiceEditor')} 
          />
        } 
      />

      <Dialog open={openBulk} onOpenChange={setOpenBulk}>
        <DialogContent>
          <DialogHeader><DialogTitle>Atualização em Massa</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
             <p className="text-sm text-slate-500">
                Isso alterará a Data Base de <strong>TODOS</strong> os serviços.
                <br/>Nota: Se você recalcular uma composição depois, a data base poderá ser revertida para a data dos insumos.
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