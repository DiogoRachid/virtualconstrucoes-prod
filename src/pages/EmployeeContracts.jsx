import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { FileSignature, Plus, MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/shared/DataTable';
import SearchFilter from '@/components/shared/SearchFilter';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import moment from 'moment';

const tipoLabels = {
  clt: 'CLT',
  pj: 'PJ',
  terceirizado: 'Terceirizado',
  temporario: 'Temporário',
  estagio: 'Estágio'
};

const statusLabels = {
  vigente: 'Vigente',
  encerrado: 'Encerrado',
  renovado: 'Renovado',
  rescindido: 'Rescindido'
};

export default function EmployeeContracts() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteItem, setDeleteItem] = useState(null);
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => base44.entities.EmployeeContract.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EmployeeContract.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setDeleteItem(null);
    }
  });

  const filteredContracts = contracts.filter(c => {
    const matchSearch = c.colaborador_nome?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    {
      header: 'Colaborador',
      render: (row) => (
        <div>
          <p className="font-medium">{row.colaborador_nome}</p>
          <p className="text-sm text-slate-500">{tipoLabels[row.tipo_contrato]}</p>
        </div>
      )
    },
    {
      header: 'Período',
      render: (row) => (
        <div>
          <p>{moment(row.data_inicio).format('DD/MM/YYYY')}</p>
          <p className="text-sm text-slate-500">
            {row.data_fim ? `até ${moment(row.data_fim).format('DD/MM/YYYY')}` : 'Indeterminado'}
          </p>
        </div>
      )
    },
    {
      header: 'Salário',
      render: (row) => row.salario 
        ? `R$ ${row.salario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '-'
    },
    {
      header: 'Carga Horária',
      render: (row) => row.carga_horaria ? `${row.carga_horaria}h/semana` : '-'
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
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`ContractForm?id=${row.id}`)}>
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-red-600"
              onClick={() => setDeleteItem(row)}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos de Trabalho"
        subtitle="Gestão de contratos dos colaboradores"
        icon={FileSignature}
        actionLabel="Novo Contrato"
        onAction={() => window.location.href = createPageUrl('ContractForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por colaborador..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'vigente', label: 'Vigente' },
              { value: 'encerrado', label: 'Encerrado' },
              { value: 'renovado', label: 'Renovado' },
              { value: 'rescindido', label: 'Rescindido' }
            ]
          }
        ]}
        onClearFilters={() => setStatusFilter('all')}
      />

      <DataTable
        columns={columns}
        data={filteredContracts}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={FileSignature}
            title="Nenhum contrato cadastrado"
            description="Cadastre contratos de trabalho dos colaboradores."
            actionLabel="Novo Contrato"
            onAction={() => window.location.href = createPageUrl('ContractForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        onConfirm={() => deleteMutation.mutate(deleteItem?.id)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Contrato"
        description="Tem certeza que deseja excluir este contrato?"
      />
    </div>
  );
}