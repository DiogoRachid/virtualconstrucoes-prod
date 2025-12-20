import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, MoreHorizontal, Pencil, Trash2, Eye, Phone, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Suppliers() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setDeleteId(null);
    }
  });

  const filteredSuppliers = suppliers.filter(s => {
    const matchSearch = !search || 
      s.razao_social?.toLowerCase().includes(search.toLowerCase()) ||
      s.cnpj?.includes(search);
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    {
      header: 'Fornecedor',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.razao_social}</p>
            <p className="text-sm text-slate-500">{row.cnpj}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Tipo de Serviço',
      render: (row) => (
        <span className="text-slate-700">{row.tipo_servico || '-'}</span>
      )
    },
    {
      header: 'Contato',
      render: (row) => (
        <div className="space-y-1">
          {row.telefone && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Phone className="h-3.5 w-3.5" />
              {row.telefone}
            </div>
          )}
          {row.email && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Mail className="h-3.5 w-3.5" />
              {row.email}
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />
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
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`SupplierDetail?id=${row.id}`)} className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visualizar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`SupplierForm?id=${row.id}`)}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setDeleteId(row.id)}
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
        title="Fornecedores"
        subtitle="Gerencie seus fornecedores e prestadores de serviço"
        icon={Building2}
        actionLabel="Novo Fornecedor"
        onAction={() => window.location.href = createPageUrl('SupplierForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por razão social ou CNPJ..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'ativo', label: 'Ativo' },
              { value: 'inativo', label: 'Inativo' }
            ]
          }
        ]}
        onClearFilters={() => {
          setSearch('');
          setStatusFilter('all');
        }}
      />

      <DataTable
        columns={columns}
        data={filteredSuppliers}
        isLoading={isLoading}
        onRowClick={(row) => window.location.href = createPageUrl(`SupplierDetail?id=${row.id}`)}
        emptyComponent={
          <EmptyState
            icon={Building2}
            title="Nenhum fornecedor cadastrado"
            description="Comece cadastrando seu primeiro fornecedor para gerenciar pagamentos e documentos."
            actionLabel="Novo Fornecedor"
            onAction={() => window.location.href = createPageUrl('SupplierForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir fornecedor"
        description="Tem certeza que deseja excluir este fornecedor? Todo o histórico será perdido."
      />
    </div>
  );
}