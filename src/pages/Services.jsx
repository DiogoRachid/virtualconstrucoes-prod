import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Layers, MoreHorizontal, Pencil, Trash2, RefreshCw, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [recalculating, setRecalculating] = useState(false);
  const [dataBaseFiltro, setDataBaseFiltro] = useState('');

  const { data: services = [], isLoading, refetch } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list()
  });

  const datasBase = useMemo(() => {
    const set = new Set(services.map(s => s.data_base).filter(Boolean));
    return [...set].sort((a, b) => {
      const [mA, yA] = a.split('/'); const [mB, yB] = b.split('/');
      return parseInt(yB) - parseInt(yA) || parseInt(mB) - parseInt(mA);
    });
  }, [services]);

  const filtered = useMemo(() => {
    let result = services.filter(s => 
      (!search || s.descricao?.toLowerCase().includes(search.toLowerCase()) || s.codigo?.toLowerCase().includes(search.toLowerCase())) &&
      (!dataBaseFiltro || s.data_base === dataBaseFiltro)
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

  const handleBulkDelete = async () => {
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.size} serviços selecionados?`)) return;
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i+=50) {
        await Promise.all(ids.slice(i, i+50).map(id => base44.entities.Service.delete(id)));
      }
      toast.success(`${ids.length} serviços excluídos.`);
      setSelectedIds(new Set());
      refetch();
    } catch(e) {
      toast.error("Erro ao excluir serviços.");
      console.error(e);
    }
  };

  const handleRecalculateSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error('Selecione ao menos um serviço');
      return;
    }

    setRecalculating(true);
    try {
      const ids = Array.from(selectedIds);
      await Engine.recalculateMultipleServices(ids, (current, total) => {
        toast.loading(`Recalculando ${current}/${total}...`, { id: 'recalc' });
      });
      toast.success('Serviços recalculados!', { id: 'recalc' });
      setSelectedIds(new Set());
      refetch();
    } catch (e) {
      toast.error('Erro ao recalcular');
      console.error(e);
    } finally {
      setRecalculating(false);
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
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_material || 0)
    },
    { 
      header: 'Mão de Obra', 
      accessor: 'custo_mao_obra', 
      className: 'text-right',
      sortable: true,
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_mao_obra || 0)
    },
    { 
      header: 'Total', 
      accessor: 'custo_total', 
      className: 'text-right font-bold',
      sortable: true,
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_total || 0)
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
                  refetch();
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <SearchFilter 
          searchValue={search} 
          onSearchChange={setSearch} 
          placeholder="Buscar serviço..." 
        />
        <div className="flex flex-wrap gap-2 items-center">
          {datasBase.length > 0 && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" />
              <Select value={dataBaseFiltro} onValueChange={setDataBaseFiltro}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Todas as datas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Todas as datas</SelectItem>
                  {datasBase.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
            {selectedIds.size > 0 && (
              <>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Excluir ({selectedIds.size})</span>
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleRecalculateSelected}
                  disabled={recalculating}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <RefreshCw className={`h-4 w-4 sm:mr-2 ${recalculating ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Recalcular ({selectedIds.size})</span>
                </Button>
              </>
            )}
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


    </div>
  );
}