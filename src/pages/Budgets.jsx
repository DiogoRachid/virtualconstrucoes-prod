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
  FileSpreadsheet,
  FileText,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { exportBudgetPDF, exportBudgetXLSX } from '@/components/budgets/BudgetExporter';
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

  const duplicateMutation = useMutation({
    mutationFn: async (budgetId) => {
      // Buscar orçamento original
      const originalBudget = budgets.find(b => b.id === budgetId);
      if (!originalBudget) throw new Error('Orçamento não encontrado');

      // Buscar itens, etapas e cronograma do orçamento original
      const [items, stages, schedules] = await Promise.all([
        base44.entities.BudgetItem.filter({ orcamento_id: budgetId }),
        base44.entities.BudgetStage.filter({ orcamento_id: budgetId }),
        base44.entities.ServiceMonthlyDistribution.filter({ orcamento_id: budgetId })
      ]);

      // Criar novo orçamento (cópia)
      const newBudget = await base44.entities.Budget.create({
        ...originalBudget,
        id: undefined,
        descricao: `${originalBudget.descricao} (Cópia)`,
        versao: (originalBudget.versao || 1) + 1,
        status: 'rascunho',
        created_date: undefined,
        updated_date: undefined
      });

      // Duplicar etapas
      const stageMapping = {};
      for (const stage of stages) {
        const newStage = await base44.entities.BudgetStage.create({
          ...stage,
          id: undefined,
          orcamento_id: newBudget.id,
          created_date: undefined,
          updated_date: undefined
        });
        stageMapping[stage.id] = newStage.id;
      }

      // Duplicar itens
      const itemsToCreate = items.map(item => ({
        ...item,
        id: undefined,
        orcamento_id: newBudget.id,
        stage_id: item.stage_id ? stageMapping[item.stage_id] : null,
        created_date: undefined,
        updated_date: undefined
      }));

      if (itemsToCreate.length > 0) {
        await base44.entities.BudgetItem.bulkCreate(itemsToCreate);
      }

      // Duplicar cronograma
      const schedulesToCreate = schedules.map(schedule => ({
        ...schedule,
        id: undefined,
        orcamento_id: newBudget.id,
        stage_id: schedule.stage_id ? stageMapping[schedule.stage_id] : null,
        created_date: undefined,
        updated_date: undefined
      }));

      if (schedulesToCreate.length > 0) {
        await base44.entities.ServiceMonthlyDistribution.bulkCreate(schedulesToCreate);
      }

      return newBudget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Orçamento duplicado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao duplicar orçamento');
    }
  });

  const updateDateMutation = useMutation({
    mutationFn: async (budgetId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) throw new Error('Orçamento não encontrado');

      // Buscar todos os itens do orçamento
      const items = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
      
      // Atualizar data_referencia do orçamento
      const today = new Date().toISOString().split('T')[0];
      await base44.entities.Budget.update(budgetId, {
        data_referencia: today
      });

      // Buscar custos atualizados dos serviços
      const serviceIds = [...new Set(items.map(item => item.servico_id).filter(Boolean))];
      const services = await Promise.all(
        serviceIds.map(id => base44.entities.Service.filter({ id }))
      );
      
      const serviceMap = {};
      services.flat().forEach(s => {
        serviceMap[s.id] = s;
      });

      // Atualizar custos dos itens
      for (const item of items) {
        if (item.servico_id && serviceMap[item.servico_id]) {
          const service = serviceMap[item.servico_id];
          await base44.entities.BudgetItem.update(item.id, {
            custo_unitario_material: service.custo_material || 0,
            custo_unitario_mao_obra: service.custo_mao_obra || 0,
            custo_unitario_total: service.custo_total || 0,
            custo_direto_total: (service.custo_total || 0) * item.quantidade,
            custo_com_bdi_unitario: (service.custo_total || 0) * (1 + (item.bdi_percentual || 0) / 100),
            subtotal: (service.custo_total || 0) * item.quantidade * (1 + (item.bdi_percentual || 0) / 100)
          });
        }
      }

      return budgetId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toast.success('Orçamento atualizado para data base atual!');
    },
    onError: () => {
      toast.error('Erro ao atualizar orçamento');
    }
  });

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

            <DropdownMenuItem onClick={async () => {
              const result = await exportBudgetXLSX(row.id);
              if (result.success) toast.success(result.message);
              else toast.error(result.message);
            }}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar XLSX
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              const result = await exportBudgetPDF(row.id);
              if (result.success) toast.success(result.message);
              else toast.error(result.message);
            }}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => duplicateMutation.mutate(row.id)}
              disabled={duplicateMutation.isPending}
            >
              {duplicateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => updateDateMutation.mutate(row.id)}
              disabled={updateDateMutation.isPending}
            >
              {updateDateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Atualizar Data Base
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