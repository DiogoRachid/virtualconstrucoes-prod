import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import {
  Calculator,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2,
  Copy,
  FileText,
  Printer,
  Calendar
} from 'lucide-react';
import { printBudget } from '@/components/budgets/BudgetPrinter';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from 'date-fns';
import { toast } from "sonner";

export default function Budgets() {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => base44.entities.Budget.list()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Budget.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      setDeleteId(null);
      toast.success('Orçamento excluído!');
    }
  });

  const duplicateBudget = async (budget) => {
    // TODO: Implement duplication logic (deep copy of budget and items)
    // For now just alert
    toast.info('Funcionalidade de duplicação será implementada em breve.');
  };

  const filteredBudgets = budgets.filter(b => 
    !search || 
    b.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    b.obra_nome?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { header: 'Obra / Descrição', accessor: 'descricao', render: (row) => (
      <div>
        <p className="font-medium text-slate-900">{row.descricao}</p>
        <p className="text-xs text-slate-500">{row.obra_nome}</p>
      </div>
    )},
    { header: 'Versão', accessor: 'versao', className: 'w-20 text-center' },
    { 
      header: 'Total', 
      accessor: 'total_final',
      className: 'text-right font-bold',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.total_final)
    },
    { 
      header: 'Status', 
      accessor: 'status',
      className: 'w-32',
      render: (row) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
          ${row.status === 'aprovado' ? 'bg-green-100 text-green-800' : 
            row.status === 'rascunho' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {row.status}
        </span>
      )
    },
    { 
      header: 'Data', 
      accessor: 'created_date',
      className: 'w-32 text-right',
      render: (row) => row.created_date ? format(new Date(row.created_date), 'dd/MM/yyyy') : '-'
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
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`BudgetForm?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`ProjectSchedule?budgetId=${row.id}`)}>
              <Calendar className="h-4 w-4 mr-2" />
              Planejamento e Cronograma
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => printBudget(row.id)}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateBudget(row)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
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
        title="Orçamentos"
        subtitle="Gerenciamento de orçamentos de obras"
        icon={Calculator}
        actionLabel="Novo Orçamento"
        onAction={() => window.location.href = createPageUrl('BudgetForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar orçamento..."
      />

      <DataTable
        columns={columns}
        data={filteredBudgets}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={Calculator}
            title="Nenhum orçamento encontrado"
            description="Crie seu primeiro orçamento para começar."
            actionLabel="Novo Orçamento"
            onAction={() => window.location.href = createPageUrl('BudgetForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Orçamento"
        description="Tem certeza? Todo o histórico de itens deste orçamento será perdido."
      />
    </div>
  );
}