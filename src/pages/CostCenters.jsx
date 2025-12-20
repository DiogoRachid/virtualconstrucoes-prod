import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PieChart, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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

const tipoLabels = {
  administrativo: 'Administrativo',
  obras: 'Obras',
  rh: 'Recursos Humanos',
  logistica: 'Logística',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  outros: 'Outros'
};

const tipoColors = {
  administrativo: 'bg-blue-100 text-blue-700',
  obras: 'bg-amber-100 text-amber-700',
  rh: 'bg-purple-100 text-purple-700',
  logistica: 'bg-cyan-100 text-cyan-700',
  comercial: 'bg-green-100 text-green-700',
  financeiro: 'bg-emerald-100 text-emerald-700',
  outros: 'bg-slate-100 text-slate-700'
};

export default function CostCenters() {
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: costCenters = [], isLoading } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CostCenter.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costCenters'] });
      setDeleteId(null);
    }
  });

  const filteredCenters = costCenters.filter(c => {
    const matchSearch = !search || 
      c.nome?.toLowerCase().includes(search.toLowerCase()) ||
      c.codigo?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = tipoFilter === 'all' || c.tipo === tipoFilter;
    return matchSearch && matchTipo;
  });

  const columns = [
    {
      header: 'Centro de Custo',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
            <PieChart className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.nome}</p>
            {row.codigo && <p className="text-sm text-slate-500">Código: {row.codigo}</p>}
          </div>
        </div>
      )
    },
    {
      header: 'Tipo',
      render: (row) => (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${tipoColors[row.tipo] || tipoColors.outros}`}>
          {tipoLabels[row.tipo] || row.tipo}
        </span>
      )
    },
    {
      header: 'Orçamento Mensal',
      render: (row) => (
        <span className="font-medium text-slate-900">
          {row.orcamento_mensal 
            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.orcamento_mensal)
            : '-'
          }
        </span>
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
              <Link to={createPageUrl(`CostCenterForm?id=${row.id}`)}>
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
        title="Centros de Custo"
        subtitle="Organize suas despesas e receitas por categoria"
        icon={PieChart}
        actionLabel="Novo Centro de Custo"
        onAction={() => window.location.href = createPageUrl('CostCenterForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome ou código..."
        filters={[
          {
            value: tipoFilter,
            onChange: setTipoFilter,
            placeholder: 'Tipo',
            options: Object.entries(tipoLabels).map(([value, label]) => ({ value, label }))
          }
        ]}
        onClearFilters={() => {
          setSearch('');
          setTipoFilter('all');
        }}
      />

      <DataTable
        columns={columns}
        data={filteredCenters}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={PieChart}
            title="Nenhum centro de custo cadastrado"
            description="Crie centros de custo para organizar suas despesas e receitas."
            actionLabel="Novo Centro de Custo"
            onAction={() => window.location.href = createPageUrl('CostCenterForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir centro de custo"
        description="Tem certeza que deseja excluir este centro de custo?"
      />
    </div>
  );
}