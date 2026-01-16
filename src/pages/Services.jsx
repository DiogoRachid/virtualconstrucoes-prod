import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Layers, Plus, Search, MoreHorizontal, Pencil, Trash2, Calendar, Loader2, RefreshCw, ListChecks } from 'lucide-react';
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
import QueueManager from '@/components/services/QueueManager';

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
  const [processing, setProcessing] = useState(false);
  const [queueStatus, setQueueStatus] = useState(null);
  const [queueManagerOpen, setQueueManagerOpen] = useState(false);

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
    if (!confirm('Adicionar TODOS os serviços à fila de recálculo?')) return;
    
    setRecalculating(true);
    
    try {
      const allServices = await Engine.fetchAll('Service');
      const total = allServices.length;
      
      // Adicionar todos os serviços à fila de recálculo
      for (const service of allServices) {
        await base44.entities.RecalculationQueue.create({
          service_id: service.id,
          priority: service.nivel_max_dependencia || 0,
          status: 'pending'
        });
      }
      
      toast.success(`${total} serviços adicionados à fila!`);
      
      refetch();
    } catch (e) {
      toast.error("Erro ao adicionar à fila");
      console.error(e);
    } finally {
      setRecalculating(false);
    }
  };

  const handleRecalculateSelected = async () => {
    const count = selectedIds.size;
    if (!confirm(`Adicionar ${count} serviços selecionados à fila de recálculo?`)) return;
    
    setRecalculating(true);
    
    try {
      const allServices = await Engine.fetchAll('Service');
      
      // Adicionar serviços selecionados à fila
      for (const serviceId of selectedIds) {
        const service = allServices.find(s => s.id === serviceId);
        if (service) {
          await base44.entities.RecalculationQueue.create({
            service_id: service.id,
            priority: service.nivel_max_dependencia || 0,
            status: 'pending'
          });
        }
      }
      
      toast.success(`${count} serviços adicionados à fila!`);
      
      setSelectedIds(new Set());
      refetch();
    } catch (e) {
      toast.error("Erro ao adicionar à fila");
      console.error(e);
    } finally {
      setRecalculating(false);
    }
  };

  const handleProcessQueue = async () => {
    setProcessing(true);
    
    try {
      let pendingItems = await base44.entities.RecalculationQueue.filter({ status: 'pending' });
      
      if (pendingItems.length === 0) {
        toast.info('Nenhum item na fila para processar');
        setProcessing(false);
        return;
      }

      const initialTotal = pendingItems.length;
      let currentProcessed = 0;
      let currentFailed = 0;
      let iterationCount = 0;
      const maxIterations = 1000;

      setQueueStatus({ total: initialTotal, processed: 0, failed: 0 });
      
      // Processar fila continuamente enquanto houver itens pendentes
      while (pendingItems.length > 0 && iterationCount < maxIterations) {
        iterationCount++;
        
        const result = await base44.functions.invoke('processRecalculationQueue', {});

        if (result.data.processed > 0 || result.data.failed > 0) {
          currentProcessed += result.data.processed;
          currentFailed += result.data.failed || 0;
        }
        
        // Sempre re-consultar o banco de dados para obter os itens pendentes mais atualizados
        pendingItems = await base44.entities.RecalculationQueue.filter({ status: 'pending' });
        
        setQueueStatus({
          total: initialTotal,
          processed: currentProcessed,
          failed: currentFailed,
          remaining: pendingItems.length
        });

        // Aguardar 2 segundos antes da próxima iteração
        if (pendingItems.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log(`Iteração ${iterationCount}: ${pendingItems.length} itens pendentes, ${currentProcessed} processados, ${currentFailed} falharam`);
      }
      
      if (iterationCount >= maxIterations) {
        toast.warning(`Processamento pausado após ${maxIterations} iterações. Execute novamente se necessário.`);
      } else {
        toast.success(`Processamento concluído! ${currentProcessed} processados, ${currentFailed} falharam.`);
      }
      
      refetch();
    } catch (e) {
      toast.error("Erro ao processar fila");
      console.error(e);
    } finally {
      setProcessing(false);
      setQueueStatus(null);
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
      
      if (!confirm(`Adicionar ${count} serviços zerados à fila de recálculo?`)) {
        setRecalculating(false);
        return;
      }
      
      // Adicionar serviços zerados à fila
      for (const service of zeroServices) {
        await base44.entities.RecalculationQueue.create({
          service_id: service.id,
          priority: service.nivel_max_dependencia || 0,
          status: 'pending'
        });
      }
      
      toast.success(`${count} serviços zerados adicionados à fila!`);
      
      refetch();
    } catch (e) {
      toast.error("Erro ao adicionar à fila");
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
          <Button onClick={handleProcessQueue} disabled={processing} className="bg-blue-600 hover:bg-blue-700">
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {queueStatus ? `Processando ${queueStatus.processed}/${queueStatus.total} (${queueStatus.remaining} restantes)` : 'Processando...'}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Processar Fila
                </>
              )}
          </Button>
          <Button variant="outline" onClick={() => setQueueManagerOpen(true)}>
              <ListChecks className="mr-2 h-4 w-4" />
              Gerenciar Fila
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

      <QueueManager open={queueManagerOpen} onOpenChange={setQueueManagerOpen} />
    </div>
  );
}