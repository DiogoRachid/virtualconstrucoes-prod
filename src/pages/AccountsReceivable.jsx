import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, MoreHorizontal, Pencil, Trash2, AlertTriangle, CheckCircle, Send } from 'lucide-react';
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
import { toast } from "sonner";

export default function AccountsReceivable() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [receiveDialog, setReceiveDialog] = useState(null);
  const [receiveDate, setReceiveDate] = useState('');
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accountsReceivable'],
    queryFn: () => base44.entities.AccountReceivable.list('-data_vencimento')
  });

  // Atualizar status de atrasados
  useEffect(() => {
    const today = new Date();
    accounts.forEach(async (acc) => {
      if (acc.status === 'em_aberto' && isBefore(new Date(acc.data_vencimento), today)) {
        await base44.entities.AccountReceivable.update(acc.id, { status: 'atrasado' });
        queryClient.invalidateQueries({ queryKey: ['accountsReceivable'] });
      }
    });
  }, [accounts]);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AccountReceivable.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsReceivable'] });
      setDeleteId(null);
    }
  });

  const receiveMutation = useMutation({
    mutationFn: async ({ id, date }) => {
      const account = accounts.find(a => a.id === id);
      await base44.entities.AccountReceivable.update(id, { 
        status: 'recebido',
        data_recebimento: date
      });
      // Atualizar saldo da conta bancária
      if (account.conta_bancaria_id) {
        const [bankAccount] = await base44.entities.BankAccount.filter({ id: account.conta_bancaria_id });
        if (bankAccount) {
          await base44.entities.BankAccount.update(account.conta_bancaria_id, {
            saldo_atual: (bankAccount.saldo_atual || 0) + account.valor
          });
        }
      }
      // Registrar transação
      await base44.entities.Transaction.create({
        tipo: 'entrada',
        descricao: account.descricao,
        valor: account.valor,
        data: date,
        conta_bancaria_id: account.conta_bancaria_id,
        conta_bancaria_nome: account.conta_bancaria_nome,
        centro_custo_id: account.centro_custo_id,
        centro_custo_nome: account.centro_custo_nome,
        cliente_id: account.cliente_id,
        conta_receber_id: id,
        origem: 'baixa_automatica'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsReceivable'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setReceiveDialog(null);
    }
  });

  const sendReminder = async (account) => {
    // Simular envio de lembrete
    toast.success(`Lembrete enviado para ${account.cliente_nome || 'cliente'}`);
  };

  const filteredAccounts = accounts.filter(a => {
    const matchSearch = !search || 
      a.descricao?.toLowerCase().includes(search.toLowerCase()) ||
      a.cliente_nome?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Alertas de vencimento próximo
  const upcomingReceivables = accounts.filter(a => {
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
          {row.cliente_nome && (
            <p className="text-sm text-slate-500">{row.cliente_nome}</p>
          )}
        </div>
      )
    },
    {
      header: 'Valor',
      render: (row) => (
        <span className="font-semibold text-emerald-600">
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
              <>
                <DropdownMenuItem onClick={() => {
                  setReceiveDate(format(new Date(), 'yyyy-MM-dd'));
                  setReceiveDialog(row);
                }}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Registrar Recebimento
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendReminder(row)}>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Lembrete
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`AccountReceivableForm?id=${row.id}`)} className="flex items-center gap-2">
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
        title="Contas a Receber"
        subtitle="Gerencie seus recebimentos"
        icon={ArrowUpCircle}
        actionLabel="Nova Conta"
        onAction={() => window.location.href = createPageUrl('AccountReceivableForm')}
      />

      {/* Alertas */}
      {upcomingReceivables.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-800">
              {upcomingReceivables.length} recebimento(s) previsto(s) para os próximos 7 dias
            </p>
            <p className="text-sm text-blue-600">
              Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                upcomingReceivables.reduce((sum, a) => sum + (a.valor || 0), 0)
              )}
            </p>
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">A Receber</p>
            <p className="text-2xl font-bold text-emerald-600">
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
        placeholder="Buscar por descrição ou cliente..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'em_aberto', label: 'Em Aberto' },
              { value: 'recebido', label: 'Recebido' },
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
            icon={ArrowUpCircle}
            title="Nenhuma conta a receber"
            description="Comece cadastrando suas contas a receber."
            actionLabel="Nova Conta"
            onAction={() => window.location.href = createPageUrl('AccountReceivableForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir conta a receber"
        description="Tem certeza que deseja excluir esta conta?"
      />

      {/* Dialog de recebimento */}
      <Dialog open={!!receiveDialog} onOpenChange={() => setReceiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600 mb-4">
              Confirmar recebimento de{' '}
              <strong>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receiveDialog?.valor || 0)}
              </strong>
              ?
            </p>
            <div>
              <Label htmlFor="receiveDate">Data do Recebimento</Label>
              <Input
                id="receiveDate"
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialog(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => receiveMutation.mutate({ id: receiveDialog.id, date: receiveDate })}
              disabled={receiveMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Confirmar Recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}