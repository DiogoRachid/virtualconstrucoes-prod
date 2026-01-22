import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Calendar, Edit, Eye, FileText, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/shared/DataTable';
import SearchFilter from '@/components/shared/SearchFilter';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function Plannings() {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null });

  const queryClient = useQueryClient();

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => base44.entities.Budget.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Budget.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Orçamento excluído com sucesso');
      setDeleteConfirm({ open: false, id: null });
    },
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getStatusBadge = (status) => {
    const badges = {
      rascunho: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600' },
      aprovado: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
      revisado: { label: 'Revisado', color: 'bg-blue-100 text-blue-700' },
    };
    const badge = badges[status] || badges.rascunho;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const columns = [
    {
      key: 'obra',
      label: 'Obra / Descrição',
      render: (budget) => (
        <div className="flex flex-col">
          <span className="font-medium text-slate-900">{budget.obra_nome || 'Sem obra'}</span>
          <span className="text-xs text-slate-500">{budget.descricao}</span>
        </div>
      ),
    },
    {
      key: 'total',
      label: 'Valor Total',
      render: (budget) => (
        <div className="text-right font-medium">{formatCurrency(budget.total_final)}</div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (budget) => getStatusBadge(budget.status),
    },
    {
      key: 'actions',
      label: '',
      render: (budget) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              •••
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl('BudgetPlanner') + `?budgetId=${budget.id}`}>
              <Calendar className="h-4 w-4 mr-2" />
              Abrir Planejamento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl('BudgetForm') + `?id=${budget.id}`}>
              <Edit className="h-4 w-4 mr-2" />
              Editar Orçamento
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDeleteConfirm({ open: true, id: budget.id })}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const filteredBudgets = budgets.filter((budget) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      budget.obra_nome?.toLowerCase().includes(searchLower) ||
      budget.descricao?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
      <PageHeader
        title="Planejamento e Cronograma"
        subtitle="Gerencie o planejamento e cronograma dos orçamentos"
        icon={Calendar}
      />

      <div className="space-y-6">
        <SearchFilter
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Buscar por obra ou descrição..."
        />

        <DataTable
          columns={columns}
          data={filteredBudgets}
          isLoading={isLoading}
          emptyComponent={
            <EmptyState
              icon={Calendar}
              title="Nenhum orçamento encontrado"
              description="Crie um orçamento primeiro para acessar o planejamento"
              actionLabel="Criar Orçamento"
              onAction={() => window.location.href = createPageUrl('BudgetForm')}
            />
          }
        />
      </div>

      <DeleteConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        onConfirm={() => deleteMutation.mutate(deleteConfirm.id)}
        title="Excluir Orçamento?"
        description="Esta ação não pode ser desfeita. O orçamento e seu planejamento serão removidos permanentemente."
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}