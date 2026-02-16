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
  const [statusFilter, setStatusFilter] = useState('em_aberto');
  const [monthFilter, setMonthFilter] = useState('all');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [workFilter, setWorkFilter] = useState('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
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

  // Remover atualização automática de status que causa loops infinitos
  // O status pode ser atualizado manualmente quando necessário

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // Primeiro, excluir transações vinculadas
      const linkedTransactions = await base44.entities.Transaction.filter({ conta_pagar_id: id });
      for (const transaction of linkedTransactions) {
        await base44.entities.Transaction.delete(transaction.id);
      }
      // Depois, excluir a conta
      await base44.entities.AccountPayable.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Conta excluída');
      setDeleteId(null);
    },
    onError: (error) => {
      console.error('Erro ao excluir:', error);
      toast.error(`Erro ao excluir conta: ${error.message || 'Erro desconhecido'}`);
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
          const novoSaldo = Math.round((Number(bankAccount.saldo_atual || 0) - Number(account.valor || 0)) * 100) / 100;
          await base44.entities.BankAccount.update(account.conta_bancaria_id, {
            saldo_atual: novoSaldo
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
      toast.success('Pagamento efetuado');
      setPaymentDialog(null);
    },
    onError: (error) => {
      console.error('Erro ao efetuar pagamento:', error);
      toast.error('Erro ao efetuar pagamento');
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
            const novoSaldo = Math.round((Number(bankAccount.saldo_atual || 0) - Number(account.valor || 0)) * 100) / 100;
            await base44.entities.BankAccount.update(account.conta_bancaria_id, {
              saldo_atual: novoSaldo
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
        a.fornecedor_nome?.toLowerCase().includes(search.toLowerCase()) ||
        a.numero_documento?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      const matchCostCenter = costCenterFilter === 'all' || a.centro_custo_id === costCenterFilter;
      const matchWork = workFilter === 'all' || a.obra_id === workFilter;
      
      let matchMonth = true;
      if (monthFilter !== 'all' && a.data_vencimento) {
        const dueMonth = a.data_vencimento.substring(0, 7); // YYYY-MM
        matchMonth = dueMonth === monthFilter;
      }

      let matchDateRange = true;
      if (startDateFilter && a.data_vencimento) {
        matchDateRange = matchDateRange && a.data_vencimento >= startDateFilter;
      }
      if (endDateFilter && a.data_vencimento) {
        matchDateRange = matchDateRange && a.data_vencimento <= endDateFilter;
      }
      
      return matchSearch && matchStatus && matchMonth && matchCostCenter && matchWork && matchDateRange;
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
  }, [accounts, search, statusFilter, monthFilter, costCenterFilter, workFilter, startDateFilter, endDateFilter, sortConfig]);

  // Alertas de vencimento próximo
  const upcomingPayments = accounts.filter(a => {
    if (a.status !== 'em_aberto') return false;
    const venc = new Date(a.data_vencimento);
    const today = new Date();
    const tomorrow = addDays(today, 1);
    return isAfter(venc, today) && isBefore(venc, addDays(today, 7));
  });

  const totalEmAberto = accounts
    .filter(a => a.status === 'em_aberto')
    .reduce((sum, a) => sum + Number(a.valor || 0), 0);

  const totalAtrasado = accounts
    .filter(a => a.status === 'atrasado')
    .reduce((sum, a) => sum + Number(a.valor || 0), 0);

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
    const allIds = filteredAccounts.map(a => a.id);
    
    if (selectedIds.length === allIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const selectedTotal = React.useMemo(() => {
    return accounts
      .filter(a => selectedIds.includes(a.id))
      .reduce((sum, a) => sum + Number(a.valor || 0), 0);
  }, [accounts, selectedIds]);

  const columns = [
    {
      header: (
        <input
          type="checkbox"
          onChange={toggleAllSelection}
          checked={selectedIds.length > 0 && selectedIds.length === filteredAccounts.length}
          className="rounded"
        />
      ),
      className: 'w-12',
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.id)}
          onChange={() => toggleSelection(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="rounded"
        />
      )
    },
    {
      header: 'Descrição',
      accessor: 'descricao',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.descricao}</p>
          <div className="flex gap-2 text-xs text-slate-500">
            {row.fornecedor_nome && <span>{row.fornecedor_nome}</span>}
            {row.numero_documento && (
              <>
                {row.fornecedor_nome && <span>•</span>}
                <span className="font-mono">Doc: {row.numero_documento}</span>
              </>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Valor',
      accessor: 'valor',
      sortable: true,
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(row.valor || 0))}
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

      <div className="mb-4 flex justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          {selectedIds.length > 0 && (
            <>
              <div className="flex flex-col">
                <Button
                  onClick={() => {
                    const pendingIds = selectedIds.filter(id => {
                      const account = accounts.find(a => a.id === id);
                      return account && (account.status === 'em_aberto' || account.status === 'atrasado');
                    });
                    if (pendingIds.length === 0) {
                      toast.error('Nenhuma conta pendente selecionada');
                      return;
                    }
                    setSelectedIds(pendingIds);
                    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
                    setBatchPaymentDialog(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Dar Baixa em Selecionadas
                </Button>
              </div>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-3 px-4">
                  <p className="text-xs text-blue-700 mb-1">{selectedIds.length} contas selecionadas</p>
                  <p className="text-lg font-bold text-blue-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedTotal)}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
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
                upcomingPayments.reduce((sum, a) => sum + Number(a.valor || 0), 0)
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

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="text-xs text-slate-600 mb-1.5 block">Data Início</Label>
              <Input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600 mb-1.5 block">Data Fim</Label>
              <Input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex items-end">
              {(startDateFilter || endDateFilter) && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setStartDateFilter('');
                    setEndDateFilter('');
                  }}
                  className="h-9"
                >
                  Limpar Datas
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
              { value: 'atrasado', label: 'Atrasado' }
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
            value: workFilter,
            onChange: setWorkFilter,
            placeholder: 'Obra',
            options: projects.map(p => ({ value: p.id, label: p.nome }))
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
          setStatusFilter('em_aberto');
          setMonthFilter('all');
          setWorkFilter('all');
          setCostCenterFilter('all');
          setStartDateFilter('');
          setEndDateFilter('');
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
               {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(paymentDialog?.valor || 0))}
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
              {payMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
                  accounts.filter(a => selectedIds.includes(a.id)).reduce((sum, a) => sum + Number(a.valor || 0), 0)
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