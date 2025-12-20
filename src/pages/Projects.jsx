import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardHat, MoreHorizontal, Pencil, Trash2, Eye, Calendar, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

export default function Projects() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [deleteId, setDeleteId] = useState(null);
  const [sortColumn, setSortColumn] = useState('nome');
  const [sortDirection, setSortDirection] = useState('asc');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Project.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteId(null);
    }
  });

  const filteredProjects = projects.filter(p => {
    const matchSearch = !search || 
      p.nome?.toLowerCase().includes(search.toLowerCase()) ||
      p.endereco?.toLowerCase().includes(search.toLowerCase());
    
    let matchStatus = true;
    if (statusFilter === 'active') {
      matchStatus = p.status !== 'concluida' && p.status !== 'cancelada';
    } else if (statusFilter !== 'all') {
      matchStatus = p.status === statusFilter;
    }
    
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (!sortColumn) return 0;
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const columns = [
    {
      header: 'Obra',
      accessor: 'nome',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <HardHat className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.nome}</p>
            {row.endereco && (
              <p className="text-sm text-slate-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {row.endereco}
              </p>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Período',
      accessor: 'data_inicio',
      sortable: true,
      render: (row) => (
        <div className="text-sm">
          {row.data_inicio && (
            <div className="flex items-center gap-1 text-slate-600">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(row.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}
              {row.data_previsao && (
                <span> - {format(new Date(row.data_previsao), 'dd/MM/yyyy', { locale: ptBR })}</span>
              )}
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Valor do Contrato',
      accessor: 'valor_contrato',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-slate-900">
          {row.valor_contrato 
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_contrato)
            : '-'
          }
        </span>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
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
              <Link to={createPageUrl(`ProjectDetail?id=${row.id}`)} className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visualizar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`ProjectForm?id=${row.id}`)}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={(e) => {
                e.stopPropagation();
                setDeleteId(row.id);
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
        title="Obras"
        subtitle="Gerencie suas obras e projetos"
        icon={HardHat}
        actionLabel="Nova Obra"
        onAction={() => window.location.href = createPageUrl('ProjectForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome ou endereço..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'active', label: 'Ativas (Em Andamento/Planejamento)' },
              { value: 'all', label: 'Todas' },
              { value: 'planejamento', label: 'Planejamento' },
              { value: 'em_andamento', label: 'Em Andamento' },
              { value: 'pausada', label: 'Pausada' },
              { value: 'concluida', label: 'Concluída' },
              { value: 'cancelada', label: 'Cancelada' }
            ]
          }
        ]}
        onClearFilters={() => {
          setSearch('');
          setStatusFilter('active');
        }}
      />

      <DataTable
        columns={columns}
        data={filteredProjects}
        isLoading={isLoading}
        onRowClick={(row) => window.location.href = createPageUrl(`ProjectDetail?id=${row.id}`)}
        onSort={handleSort}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        emptyComponent={
          <EmptyState
            icon={HardHat}
            title="Nenhuma obra cadastrada"
            description="Comece cadastrando sua primeira obra para gerenciar projetos."
            actionLabel="Nova Obra"
            onAction={() => window.location.href = createPageUrl('ProjectForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir obra"
        description="Tem certeza que deseja excluir esta obra? Todo o histórico será perdido."
      />
    </div>
  );
}