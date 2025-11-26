import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Users, Plus, Search, MoreVertical, Eye, Pencil, Trash2, UserCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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

const vinculoLabels = {
  clt: 'CLT',
  pj: 'PJ',
  terceirizado: 'Terceirizado'
};

export default function Employees() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vinculoFilter, setVinculoFilter] = useState('all');
  const [deleteItem, setDeleteItem] = useState(null);
  const queryClient = useQueryClient();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Employee.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setDeleteItem(null);
    }
  });

  const filteredEmployees = employees.filter(emp => {
    const matchSearch = emp.nome_completo?.toLowerCase().includes(search.toLowerCase()) ||
                       emp.cpf?.includes(search) ||
                       emp.funcao?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || emp.status === statusFilter;
    const matchVinculo = vinculoFilter === 'all' || emp.tipo_vinculo === vinculoFilter;
    return matchSearch && matchStatus && matchVinculo;
  });

  const columns = [
    {
      header: 'Colaborador',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.foto_url ? (
            <img src={row.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <UserCircle className="h-6 w-6 text-blue-600" />
            </div>
          )}
          <div>
            <p className="font-medium text-slate-900">{row.nome_completo}</p>
            <p className="text-sm text-slate-500">{row.cpf}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Função',
      render: (row) => (
        <div>
          <p className="font-medium">{row.funcao || '-'}</p>
          <p className="text-sm text-slate-500">{vinculoLabels[row.tipo_vinculo]}</p>
        </div>
      )
    },
    {
      header: 'Contato',
      render: (row) => (
        <div>
          <p className="text-sm">{row.telefone || '-'}</p>
          <p className="text-sm text-slate-500">{row.email || '-'}</p>
        </div>
      )
    },
    {
      header: 'Obra/Equipe',
      render: (row) => (
        <div>
          <p className="text-sm">{row.obra_nome || '-'}</p>
          <p className="text-sm text-slate-500">{row.equipe_nome || '-'}</p>
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
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`EmployeeDetail?id=${row.id}`)}>
                <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`EmployeeForm?id=${row.id}`)}>
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
        title="Colaboradores"
        subtitle="Gestão de funcionários e terceiros"
        icon={Users}
        actionLabel="Novo Colaborador"
        onAction={() => window.location.href = createPageUrl('EmployeeForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome, CPF ou função..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'ativo', label: 'Ativo' },
              { value: 'inativo', label: 'Inativo' }
            ]
          },
          {
            value: vinculoFilter,
            onChange: setVinculoFilter,
            placeholder: 'Vínculo',
            options: [
              { value: 'clt', label: 'CLT' },
              { value: 'pj', label: 'PJ' },
              { value: 'terceirizado', label: 'Terceirizado' }
            ]
          }
        ]}
        onClearFilters={() => {
          setStatusFilter('all');
          setVinculoFilter('all');
        }}
      />

      <DataTable
        columns={columns}
        data={filteredEmployees}
        isLoading={isLoading}
        onRowClick={(row) => window.location.href = createPageUrl(`EmployeeDetail?id=${row.id}`)}
        emptyComponent={
          <EmptyState
            icon={Users}
            title="Nenhum colaborador cadastrado"
            description="Comece cadastrando os colaboradores da empresa."
            actionLabel="Novo Colaborador"
            onAction={() => window.location.href = createPageUrl('EmployeeForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        onConfirm={() => deleteMutation.mutate(deleteItem?.id)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Colaborador"
        description={`Tem certeza que deseja excluir ${deleteItem?.nome_completo}? Esta ação não pode ser desfeita.`}
      />
    </div>
  );
}