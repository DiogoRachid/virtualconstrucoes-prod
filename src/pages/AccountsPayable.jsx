import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, MoreHorizontal, Pencil, Trash2, Eye, AlertTriangle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountsPayable() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [paymentDate, setPaymentDate] = useState('');
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accountsPayable'],
    queryFn: () => base44.entities.AccountPayable.list('-data_vencimento')
  });

  // Atualizar status de atrasados e voltar para em_aberto se vencimento for futuro
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    accounts.forEach(async (acc) => {
      const dueDate = new Date(acc.data_vencimento);
      dueDate.setHours(0, 0, 0, 0);
      
      if (acc.status === 'em_aberto' && isBefore(dueDate, today)) {
        await base44.entities.AccountPayable.update(acc.id, { status: 'atrasado' });
        queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      } else if (acc.status === 'atrasado' && (isAfter(dueDate, today) || dueDate.getTime() === today.getTime())) {
        await base44.entities.AccountPayable.update(acc.id, { status: 'em_aberto' });
        queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      }
    });
  }, [accounts]);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AccountPayable.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      setDeleteId(null);
    }
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, date }) => {
      const account = accounts.find(a => a.id === id);
      await base44.entities.AccountPayable.update(id, { 
        status: 'pago',
        data_pagamento: date
      });
      // Atualizar saldo da conta bancária
      if (account.conta_bancaria_id) {
        const [bankAccount] = await base44.entities.BankAccount.filter({ id: account.conta_bancaria_id });
        if (bankAccount) {
          await base44.entities.BankAccount.update(account.conta_bancaria_id, {
            saldo_atual: (bankAccount.saldo_atual || 0) - account.valor
          });
        }
      }
      // Registrar transação
      await base44.entities.Transaction.create({
        tipo: 'saida',
        descricao: account.descricao,
        valor: account.valor,
        data: date,
        conta_bancaria_id: account.conta_bancaria_id,
        conta_bancaria_nome: account.conta_bancaria_nome,
        centro_custo_id: account.centro_custo_id,
        centro_custo_nome: account.centro_custo_nome,
        fornecedor_id: account.fornecedor_id,
        conta_pagar_id: id,
        origem: 'baixa_automatica'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setPaymentDialog(null);
    }
  });

  const filteredAccounts = accounts.filter(a => {
    const matchSearch = !search || 
      a.descricao?.toLowerCase().includes(search.toLowerCase()) ||
      a.fornecedor_nome?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Alertas de vencimento próximo
  const upcomingPayments = accounts.filter(a => {
    if (a.status !== 'em_aberto') return false;
    const venc = new Date(a.data_vencimento);
    const today = new Date();
    return isAfter(venc, today) && isBefore(venc, addDays(today, 7));
  });

  const totalEmAberto = accounts
    .filter(a => a.status === 'em_aberto')
    .reduce((sum, a) => sum + (a.valor || 0), 0);

  const totalAtrasado = accounts
    .filter(a => a.status === 'atrasado')
    .reduce((sum, a) => sum + (a.valor || 0), 0);

  const columns = [
    {
      header: 'Descrição',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.descricao}</p>
          {row.fornecedor_nome && (
            <p className="text-sm text-slate-500">{row.fornecedor_nome}</p>
          )}
        </div>
      )
    },
    {
      header: 'Valor',
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor)}
        </span>
      )
    },
    {
      header: 'Vencimento',
      render: (row) => {
        const dateParts = row.data_vencimento ? row.data_vencimento.split('-') : [];
        const dateStr = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : row.data_vencimento;
        return (
          <span className={row.status === 'atrasado' ? 'text-red-600 font-medium' : ''}>
            {dateStr}
          </span>
        );
      }
    },
    {
      header: 'Centro de Custo',
      render: (row) => <span className="text-slate-600">{row.centro_custo_nome || '-'}</span>
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
            {(row.status === 'em_aberto' || row.status === 'atrasado') && (
              <DropdownMenuItem onClick={() => {
                setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
                setPaymentDialog(row);
              }}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Dar Baixa
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`AccountPayableForm?id=${row.id}`)} className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
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
        title="Contas a Pagar"
        subtitle="Gerencie suas contas e pagamentos"
        icon={ArrowDownCircle}
        actionLabel="Nova Conta"
        onAction={() => window.location.href = createPageUrl('AccountPayableForm')}
      />

      {/* Alertas */}
      {upcomingPayments.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">
              {upcomingPayments.length} conta(s) vencem nos próximos 7 dias
            </p>
            <p className="text-sm text-amber-600">
              Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                upcomingPayments.reduce((sum, a) => sum + (a.valor || 0), 0)
              )}
            </p>
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Em Aberto</p>
            <p className="text-2xl font-bold text-amber-600">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEmAberto)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Atrasado</p>
            <p className="text-2xl font-bold text-red-600">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAtrasado)}
            </p>
          </CardContent>
        </Card>
      </div>

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por descrição ou fornecedor..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'em_aberto', label: 'Em Aberto' },
              { value: 'pago', label: 'Pago' },
              { value: 'atrasado', label: 'Atrasado' },
              { value: 'cancelado', label: 'Cancelado' }
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
        data={filteredAccounts}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={ArrowDownCircle}
            title="Nenhuma conta a pagar"
            description="Comece cadastrando suas contas a pagar."
            actionLabel="Nova Conta"
            onAction={() => window.location.href = createPageUrl('AccountPayableForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir conta a pagar"
        description="Tem certeza que deseja excluir esta conta?"
      />

      {/* Dialog de baixa */}
      <Dialog open={!!paymentDialog} onOpenChange={() => setPaymentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar Baixa no Pagamento</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600 mb-4">
              Confirmar pagamento de{' '}
              <strong>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(paymentDialog?.valor || 0)}
              </strong>
              ?
            </p>
            <div>
              <Label htmlFor="paymentDate">Data do Pagamento</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => payMutation.mutate({ id: paymentDialog.id, date: paymentDate })}
              disabled={payMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}