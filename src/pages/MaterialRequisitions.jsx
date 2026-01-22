import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { FileInput, Plus, Pencil, Trash2, MoreHorizontal, Download } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/shared/DataTable';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportRequisitionToPDF } from '@/components/requisitions/RequisitionExporter';
import { toast } from "sonner";

export default function MaterialRequisitionsPage() {
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: requisitions = [], isLoading } = useQuery({
    queryKey: ['materialRequisitions'],
    queryFn: () => base44.entities.MaterialRequisition.list()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MaterialRequisition.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialRequisitions'] });
      setDeleteId(null);
      toast.success('Pedido excluído!');
    }
  });

  const handleExport = async (requisition) => {
    const itemsData = await base44.entities.MaterialRequisitionItem.filter({ requisicao_id: requisition.id });
    exportRequisitionToPDF(requisition, itemsData);
    toast.success('PDF exportado!');
  };

  const columns = [
    { 
      header: 'Pedido / Obra', 
      accessor: 'numero_pedido', 
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.numero_pedido}</p>
          <p className="text-xs text-slate-500">{row.obra_nome}</p>
        </div>
      )
    },
    { 
      header: 'Data', 
      accessor: 'data_pedido',
      className: 'w-28 text-center',
      render: (row) => row.data_pedido
    },
    { 
      header: 'Itens', 
      accessor: 'total_itens',
      className: 'w-20 text-center',
      render: (row) => row.total_itens
    },
    { 
      header: 'Status', 
      accessor: 'status',
      className: 'w-32',
      render: (row) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
          ${row.status === 'enviado' ? 'bg-blue-100 text-blue-800' : 
            row.status === 'recebido' ? 'bg-green-100 text-green-800' :
            row.status === 'rascunho' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800'}`}>
          {row.status}
        </span>
      )
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
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`MaterialRequisitionForm?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport(row)}>
              <Download className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteId(row.id)} className="text-red-600">
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
        title="Pedidos de Materiais"
        subtitle="Gerencie pedidos de materiais para as obras"
        icon={FileInput}
        actionLabel="Novo Pedido"
        onAction={() => window.location.href = createPageUrl('MaterialRequisitionForm')}
      />

      <DataTable
        columns={columns}
        data={requisitions}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={FileInput}
            title="Nenhum pedido registrado"
            description="Crie seu primeiro pedido de material para começar"
            actionLabel="Novo Pedido"
            onAction={() => window.location.href = createPageUrl('MaterialRequisitionForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Pedido"
        description="Tem certeza? Este pedido será removido permanentemente."
      />
    </div>
  );
}