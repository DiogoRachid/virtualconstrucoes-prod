import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Layers, Plus, Search, MoreHorizontal, Pencil, Trash2, Calendar, Loader2 } from 'lucide-react';
import { toast } from "sonner";
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
  const [openBulk, setOpenBulk] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const { data: services = [], isLoading, refetch } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list()
  });

  const filtered = services.filter(s => 
    !search || 
    s.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    s.codigo?.toLowerCase().includes(search.toLowerCase())
  );

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

  const columns = [
    { header: 'Código', accessor: 'codigo', className: 'w-24 font-mono text-xs' },
    { header: 'Descrição', accessor: 'descricao' },
    { header: 'Unidade', accessor: 'unidade', className: 'w-16' },
    { header: 'Data Base', accessor: 'data_base', className: 'w-24 text-xs' },
    { 
      header: 'Material', 
      accessor: 'custo_material', 
      className: 'text-right',
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_material)
    },
    { 
      header: 'Mão de Obra', 
      accessor: 'custo_mao_obra', 
      className: 'text-right',
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_mao_obra)
    },
    { 
      header: 'Total', 
      accessor: 'custo_total', 
      className: 'text-right font-bold',
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
        <Button variant="outline" onClick={() => setOpenBulk(true)}>
            <Calendar className="mr-2 h-4 w-4" /> Alterar Data Base Global
        </Button>
      </div>

      <DataTable
        columns={columns} 
        data={filtered} 
        isLoading={isLoading}
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