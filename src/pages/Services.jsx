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
      
      // Processar em lotes de 5 serviços
      const BATCH_SIZE = 5;
      const DELAY_BETWEEN_BATCHES = 5000; // 5 segundos
      const RATE_LIMIT_DELAY = 20000; // 20 segundos
      
      for (let i = 0; i < allServices.length; i += BATCH_SIZE) {
        const batch = allServices.slice(i, Math.min(i + BATCH_SIZE, allServices.length));
        
        // Processar sequencialmente cada item do lote
        for (const service of batch) {
          try {
            await Engine.recalculateService(service.id);
            setRecalcProgress({ current: i + batch.indexOf(service) + 1, total });
          } catch (error) {
            // Verificar se é rate limit
            if (error.message?.includes('rate limit') || error.status === 429) {
              toast.warning('Aguardando rate limit (20s)...');
              await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
              // Tentar novamente
              await Engine.recalculateService(service.id);
              setRecalcProgress({ current: i + batch.indexOf(service) + 1, total });
            } else {
              console.error('Erro ao recalcular serviço', service.id, error);
            }
          }
        }
        
        // Aguardar 5 segundos entre lotes (exceto no último)
        if (i + BATCH_SIZE < allServices.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
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

  const handleRecalculateSelected = async () => {
    const count = selectedIds.size;
    if (!confirm(`Recalcular ${count} serviços selecionados e suas composições?`)) return;
    
    setRecalculating(true);
    setRecalcProgress({ current: 0, total: count });
    
    try {
      // Buscar todos os serviços para ter acesso às composições
      const allServices = await Engine.fetchAll('Service');
      const allServiceItems = await Engine.fetchAll('ServiceItem');
      
      // Função para buscar recursivamente todos os serviços que compõem um serviço
      const getCompositionServices = (serviceId, visited = new Set()) => {
        if (visited.has(serviceId)) return visited;
        visited.add(serviceId);
        
        // Buscar itens que compõem este serviço
        const items = allServiceItems.filter(item => item.servico_id === serviceId && item.tipo === 'servico');
        
        // Para cada serviço que compõe este, buscar recursivamente
        items.forEach(item => {
          getCompositionServices(item.item_id, visited);
        });
        
        return visited;
      };
      
      // Coletar todos os serviços selecionados e suas composições
      const allServiceIds = new Set();
      Array.from(selectedIds).forEach(id => {
        const compositionIds = getCompositionServices(id);
        compositionIds.forEach(cid => allServiceIds.add(cid));
      });
      
      // Buscar os objetos completos e ordenar por nível
      const servicesToRecalc = allServices
        .filter(s => allServiceIds.has(s.id))
        .sort((a, b) => (a.nivel_max_dependencia || 0) - (b.nivel_max_dependencia || 0));
      
      const total = servicesToRecalc.length;
      setRecalcProgress({ current: 0, total });
      
      // Processar em lotes de 5 serviços
      const BATCH_SIZE = 5;
      const DELAY_BETWEEN_BATCHES = 5000; // 5 segundos
      const RATE_LIMIT_DELAY = 20000; // 20 segundos
      
      for (let i = 0; i < servicesToRecalc.length; i += BATCH_SIZE) {
        const batch = servicesToRecalc.slice(i, Math.min(i + BATCH_SIZE, servicesToRecalc.length));
        
        // Processar sequencialmente cada item do lote
        for (const service of batch) {
          try {
            await Engine.recalculateService(service.id);
            setRecalcProgress({ current: i + batch.indexOf(service) + 1, total });
          } catch (error) {
            // Verificar se é rate limit
            if (error.message?.includes('rate limit') || error.status === 429) {
              toast.warning('Aguardando rate limit (20s)...');
              await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
              // Tentar novamente
              await Engine.recalculateService(service.id);
              setRecalcProgress({ current: i + batch.indexOf(service) + 1, total });
            } else {
              console.error('Erro ao recalcular serviço', service.id, error);
            }
          }
        }
        
        // Aguardar 5 segundos entre lotes (exceto no último)
        if (i + BATCH_SIZE < servicesToRecalc.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
      
      toast.success(`${total} serviços recalculados (incluindo composições)!`);
      
      setSelectedIds(new Set());
      refetch();
    } catch (e) {
      toast.error("Erro ao recalcular");
      console.error(e);
    } finally {
      setRecalculating(false);
      setRecalcProgress({ current: 0, total: 0 });
    }
  };

  const handleRecalculateZero = async () => {
    setRecalculating(true);
    
    try {
      const allServices = await Engine.fetchAll('Service');
      const zeroServices = allServices.filter(s => !s.custo_total || s.custo_total === 0);
      const count = zeroServices.length;
      
      if (count === 0) {
        toast.info("Não há serviços com custo zerado");
        setRecalculating(false);
        return;
      }
      
      if (!confirm(`Recalcular ${count} serviços com custo zerado?`)) {
        setRecalculating(false);
        return;
      }
      
      setRecalcProgress({ current: 0, total: count });
      
      // Ordenar por nível
      zeroServices.sort((a, b) => (a.nivel_max_dependencia || 0) - (b.nivel_max_dependencia || 0));
      
      // Processar em lotes de 5 serviços
      const BATCH_SIZE = 5;
      const DELAY_BETWEEN_BATCHES = 5000; // 5 segundos
      const RATE_LIMIT_DELAY = 20000; // 20 segundos
      
      for (let i = 0; i < zeroServices.length; i += BATCH_SIZE) {
        const batch = zeroServices.slice(i, Math.min(i + BATCH_SIZE, zeroServices.length));
        
        // Processar sequencialmente cada item do lote
        for (const service of batch) {
          try {
            await Engine.recalculateService(service.id);
            setRecalcProgress({ current: i + batch.indexOf(service) + 1, total: count });
          } catch (error) {
            // Verificar se é rate limit
            if (error.message?.includes('rate limit') || error.status === 429) {
              toast.warning('Aguardando rate limit (20s)...');
              await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
              // Tentar novamente
              await Engine.recalculateService(service.id);
              setRecalcProgress({ current: i + batch.indexOf(service) + 1, total: count });
            } else {
              console.error('Erro ao recalcular serviço', service.id, error);
            }
          }
        }
        
        // Aguardar 5 segundos entre lotes (exceto no último)
        if (i + BATCH_SIZE < zeroServices.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
      
      toast.success(`${count} serviços zerados recalculados!`);
      
      refetch();
    } catch (e) {
      toast.error("Erro ao recalcular");
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
          <Button variant="outline" onClick={handleRecalculateSelected} disabled={recalculating || selectedIds.size === 0}>
              {recalculating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recalcular Selecionados ({selectedIds.size})
                </>
              )}
          </Button>
          <Button variant="outline" onClick={handleRecalculateZero} disabled={recalculating}>
              {recalculating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Recalcular Zerados
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