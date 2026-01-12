import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, MoreHorizontal, Pencil, Trash2, Eye, AlertTriangle, CheckCircle, CalendarCheck, Loader2 } from 'lucide-react';
import { toast } from "sonner";
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
  const [monthFilter, setMonthFilter] = useState('all');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [deleteId, setDeleteId] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchPaymentDialog, setBatchPaymentDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accountsPayable'],
    queryFn: () => base44.entities.AccountPayable.list('data_vencimento')
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.list()
  });

  const adjustToBusinessDay = (dateStr) => {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) { // Domingo
      d.setDate(d.getDate() + 1);
    } else if (dayOfWeek === 6) { // Sábado
      d.setDate(d.getDate() + 2);
    }
    return d.toISOString().split('T')[0];
  };

  const fixExistingDatesMutation = useMutation({
    mutationFn: async () => {
      const allAccounts = await base44.entities.AccountPayable.list('', 10000);
      let fixed = 0;
      
      for (const acc of allAccounts) {
        const updates = {};
        let needsUpdate = false;

        if (acc.data_vencimento) {
          const adjusted = adjustToBusinessDay(acc.data_vencimento);
          if (adjusted !== acc.data_vencimento) {
            updates.data_vencimento = adjusted;
            needsUpdate = true;
          }
        }

        if (!acc.data_compra && acc.created_date) {
          updates.data_compra = acc.created_date.split('T')[0];
          needsUpdate = true;
        }

        if (needsUpdate) {
          await base44.entities.AccountPayable.update(acc.id, updates);
          fixed++;
        }
      }
      
      return fixed;
    },
    onSuccess: (fixed) => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      toast.success(`${fixed} contas corrigidas`);
    }
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

  const batchPayMutation = useMutation({
    mutationFn: async (date) => {
      const accountsToPay = accounts.filter(a => selectedIds.includes(a.id));
      
      for (const account of accountsToPay) {
        await base44.entities.AccountPayable.update(account.id, { 
          status: 'pago',
          data_pagamento: date
        });
        
        if (account.conta_bancaria_id) {
          const [bankAccount] = await base44.entities.BankAccount.filter({ id: account.conta_bancaria_id });
          if (bankAccount) {
            await base44.entities.BankAccount.update(account.conta_bancaria_id, {
              saldo_atual: (bankAccount.saldo_atual || 0) - account.valor
            });
          }
        }
        
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
          conta_pagar_id: account.id,
          origem: 'baixa_automatica'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setBatchPaymentDialog(false);
      setSelectedIds([]);
      toast.success('Pagamentos efetuados com sucesso');
    }
  });

  const filteredAccounts = React.useMemo(() => {
    let result = accounts.filter(a => {
      const matchSearch = !search || 
        a.descricao?.toLowerCase().includes(search.toLowerCase()) ||
        a.fornecedor_nome?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchCostCenter = costCenterFilter === 'all' || a.centro_custo_id === costCenterFilter;
      
      let matchMonth = true;
      if (monthFilter !== 'all' && a.data_vencimento) {
        const dueMonth = a.data_vencimento.substring(0, 7); // YYYY-MM
        matchMonth = dueMonth === monthFilter;
      }
      
      return matchSearch && matchStatus && matchMonth && matchCostCenter;
    });

    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [accounts, search, statusFilter, monthFilter, costCenterFilter, sortConfig]);

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

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllSelection = () => {
    const payableIds = filteredAccounts
      .filter(a => a.status === 'em_aberto' || a.status === 'atrasado')
      .map(a => a.id);
    
    if (selectedIds.length === payableIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(payableIds);
    }
  };

  const columns = [
    {
      header: (
        <input
          type="checkbox"
          onChange={toggleAllSelection}
          checked={selectedIds.length > 0 && selectedIds.length === filteredAccounts.filter(a => a.status === 'em_aberto' || a.status === 'atrasado').length}
          className="rounded"
        />
      ),
      className: 'w-12',
      render: (row) => (
        (row.status === 'em_aberto' || row.status === 'atrasado') ? (
          <input
            type="checkbox"
            checked={selectedIds.includes(row.id)}
            onChange={() => toggleSelection(row.id)}
            onClick={(e) => e.stopPropagation()}
            className="rounded"
          />
        ) : null
      )
    },
    {
      header: 'Descrição',
      accessor: 'descricao',
      sortable: true,
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
      accessor: 'valor',
      sortable: true,
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor)}
        </span>
      )
    },
    {
      header: 'Vencimento',
      accessor: 'data_vencimento',
      sortable: true,
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
      accessor: 'centro_custo_nome',
      sortable: true,
      render: (row) => <span className="text-slate-600">{row.centro_custo_nome || '-'}</span>
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

      <div className="mb-4 flex justify-between items-center">
        {selectedIds.length > 0 && (
          <Button
            onClick={() => {
              setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
              setBatchPaymentDialog(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Dar Baixa em {selectedIds.length} Selecionadas
          </Button>
        )}
        <div className="ml-auto">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fixExistingDatesMutation.mutate()}
            disabled={fixExistingDatesMutation.isPending}
          >
            <CalendarCheck className="h-4 w-4 mr-2" />
            {fixExistingDatesMutation.isPending ? 'Corrigindo...' : 'Corrigir Datas Existentes'}
          </Button>
        </div>
      </div>

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
          },
          {
            value: monthFilter,
            onChange: setMonthFilter,
            placeholder: 'Mês',
            options: Array.from(new Set(accounts.map(a => a.data_vencimento?.substring(0, 7)).filter(Boolean)))
              .sort()
              .reverse()
              .map(month => {
                const [year, m] = month.split('-');
                const monthName = new Date(year, parseInt(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                return { value: month, label: monthName.charAt(0).toUpperCase() + monthName.slice(1) };
              })
          },
          {
            value: costCenterFilter,
            onChange: setCostCenterFilter,
            placeholder: 'Centro de Custo',
            options: costCenters.map(c => ({ value: c.id, label: c.nome }))
          }
        ]}
        onClearFilters={() => {
          setSearch('');
          setStatusFilter('all');
          setMonthFilter('all');
          setCostCenterFilter('all');
        }}
      />

      <DataTable
        columns={columns}
        data={filteredAccounts}
        isLoading={isLoading}
        onSort={handleSort}
        sortColumn={sortConfig.key}
        sortDirection={sortConfig.direction}
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

      {/* Dialog de baixa individual */}
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

      {/* Dialog de baixa em lote */}
      <Dialog open={batchPaymentDialog} onOpenChange={setBatchPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar Baixa em Múltiplos Pagamentos</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600 mb-4">
              Confirmar pagamento de <strong>{selectedIds.length}</strong> contas no valor total de{' '}
              <strong>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  accounts.filter(a => selectedIds.includes(a.id)).reduce((sum, a) => sum + (a.valor || 0), 0)
                )}
              </strong>
              ?
            </p>
            <div>
              <Label htmlFor="batchPaymentDate">Data do Pagamento</Label>
              <Input
                id="batchPaymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchPaymentDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => batchPayMutation.mutate(paymentDate)}
              disabled={batchPayMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {batchPayMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Pagamentos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}