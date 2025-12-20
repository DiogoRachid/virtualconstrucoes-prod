import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, MoreHorizontal, Pencil, Trash2, Eye, Phone, Mail } from 'lucide-react';
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

export default function Clients() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Client.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setDeleteId(null);
    }
  });

  const filteredClients = clients.filter(c => {
    const matchSearch = !search || 
      c.nome?.toLowerCase().includes(search.toLowerCase()) ||
      c.documento?.includes(search);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    {
      header: 'Cliente',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
            {row.nome?.[0]?.toUpperCase() || 'C'}
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.nome}</p>
            <p className="text-sm text-slate-500">{row.tipo_documento}: {row.documento}</p>
          </div>
        </div>
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
      header: 'Obras',
      render: (row) => (
        <span className="text-slate-700">
          {row.obras_vinculadas?.length || 0} obra(s)
        </span>
      )
    },
    {
      header: 'Status',
      render: (row) => <StatusBadge status={row.status || 'ativo'} />
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
              <Link to={createPageUrl(`ClientDetail?id=${row.id}`)} className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visualizar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`ClientForm?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
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
        title="Clientes"
        subtitle="Gerencie seus clientes e contratos"
        icon={Users}
        actionLabel="Novo Cliente"
        onAction={() => window.location.href = createPageUrl('ClientForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome ou documento..."
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
        data={filteredClients}
        isLoading={isLoading}
        onRowClick={(row) => window.location.href = createPageUrl(`ClientDetail?id=${row.id}`)}
        emptyComponent={
          <EmptyState
            icon={Users}
            title="Nenhum cliente cadastrado"
            description="Comece cadastrando seu primeiro cliente para gerenciar obras e recebimentos."
            actionLabel="Novo Cliente"
            onAction={() => window.location.href = createPageUrl('ClientForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir cliente"
        description="Tem certeza que deseja excluir este cliente? Todo o histórico será perdido."
      />
    </div>
  );
}