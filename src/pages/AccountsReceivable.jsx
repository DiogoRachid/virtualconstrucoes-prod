import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, MoreHorizontal, Pencil, Trash2, AlertTriangle, CheckCircle, Send, CalendarCheck, Loader2 } from 'lucide-react';
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
  const [statusFilter, setStatusFilter] = useState('em_aberto');
  const [monthFilter, setMonthFilter] = useState('all');
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [workFilter, setWorkFilter] = useState('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [deleteId, setDeleteId] = useState(null);
  const [receiveDialog, setReceiveDialog] = useState(null);
  const [receiveDate, setReceiveDate] = useState('');
  const [receiveBankAccountId, setReceiveBankAccountId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [editReceiveDialog, setEditReceiveDialog] = useState(null);
  const [editReceiveDate, setEditReceiveDate] = useState('');
  const [editReceiveBankAccountId, setEditReceiveBankAccountId] = useState('');
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accountsReceivable'],
    queryFn: () => base44.entities.AccountReceivable.list('data_vencimento')
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.list()
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
      const allAccounts = await base44.entities.AccountReceivable.list('', 10000);
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
          await base44.entities.AccountReceivable.update(acc.id, updates);
          fixed++;
        }
      }
      
      return fixed;
    },
    onSuccess: (fixed) => {
      queryClient.invalidateQueries({ queryKey: ['accountsReceivable'] });
      toast.success(`${fixed} contas corrigidas`);
    }
  });

  // Atualizar status de atrasados e voltar para em_aberto se vencimento for futuro
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneDayAgo = new Date(today);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    accounts.forEach(async (acc) => {
      const dueDate = new Date(acc.data_vencimento);
      dueDate.setHours(0, 0, 0, 0);
      
      if (acc.status === 'em_aberto' && dueDate < oneDayAgo) {
        await base44.entities.AccountReceivable.update(acc.id, { status: 'atrasado' });
        queryClient.invalidateQueries({ queryKey: ['accountsReceivable'] });
      } else if (acc.status === 'atrasado' && dueDate >= oneDayAgo) {
        await base44.entities.AccountReceivable.update(acc.id, { status: 'em_aberto' });
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
    mutationFn: async ({ id, date, bankAccountId }) => {
      const account = accounts.find(a => a.id === id);
      const selectedBankAccount = bankAccounts.find(ba => ba.id === bankAccountId);
      
      await base44.entities.AccountReceivable.update(id, { 
        status: 'recebido',
        data_recebimento: date,
        conta_bancaria_id: bankAccountId,
        conta_bancaria_nome: selectedBankAccount?.nome
      });
      
      // Atualizar saldo da conta bancária
      if (bankAccountId) {
        const [bankAccount] = await base44.entities.BankAccount.filter({ id: bankAccountId });
        if (bankAccount) {
          const novoSaldo = Math.round(((bankAccount.saldo_atual || 0) + Number(account.valor || 0)) * 100) / 100;
          await base44.entities.BankAccount.update(bankAccountId, {
            saldo_atual: novoSaldo
          });
        }
      }
      
      // Registrar transação
      await base44.entities.Transaction.create({
        tipo: 'entrada',
        descricao: account.descricao,
        valor: account.valor,
        data: date,
        conta_bancaria_id: bankAccountId,
        conta_bancaria_nome: selectedBankAccount?.nome,
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

  const editReceiveMutation = useMutation({
    mutationFn: async ({ id, date, bankAccountId }) => {
      const selectedBankAccount = bankAccounts.find(ba => ba.id === bankAccountId);
      await base44.entities.AccountReceivable.update(id, {
        data_recebimento: date,
        conta_bancaria_id: bankAccountId,
        conta_bancaria_nome: selectedBankAccount?.nome
      });
      // Atualizar transação vinculada
      const linkedTransactions = await base44.entities.Transaction.filter({ conta_receber_id: id });
      for (const t of linkedTransactions) {
        await base44.entities.Transaction.update(t.id, {
          data: date,
          conta_bancaria_id: bankAccountId,
          conta_bancaria_nome: selectedBankAccount?.nome
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsReceivable'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Recebimento atualizado');
      setEditReceiveDialog(null);
    },
    onError: () => toast.error('Erro ao atualizar recebimento')
  });

  const sendReminder = async (account) => {
    // Simular envio de lembrete
    toast.success(`Lembrete enviado para ${account.cliente_nome || 'cliente'}`);
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

  const filteredAccounts = React.useMemo(() => {
    let result = accounts.filter(a => {
      const matchSearch = !search || 
        a.descricao?.toLowerCase().includes(search.toLowerCase()) ||
        a.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
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

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

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
            {row.cliente_nome && <span>{row.cliente_nome}</span>}
            {row.numero_documento && (
              <>
                {row.cliente_nome && <span>•</span>}
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
        <span className="font-semibold text-emerald-600">
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
              <>
                <DropdownMenuItem onClick={() => {
                  setReceiveDate(format(new Date(), 'yyyy-MM-dd'));
                  setReceiveBankAccountId(row.conta_bancaria_id || '');
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
            {row.status === 'recebido' && (
              <DropdownMenuItem onClick={() => {
                setEditReceiveDate(row.data_recebimento || format(new Date(), 'yyyy-MM-dd'));
                setEditReceiveBankAccountId(row.conta_bancaria_id || '');
                setEditReceiveDialog(row);
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar Recebimento
              </DropdownMenuItem>
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

      <div className="mb-4 flex justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          {selectedIds.length > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="py-3 px-4">
                <p className="text-xs text-emerald-700 mb-1">{selectedIds.length} contas selecionadas</p>
                <p className="text-lg font-bold text-emerald-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedTotal)}
                </p>
              </CardContent>
            </Card>
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
        placeholder="Buscar por descrição ou cliente..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'em_aberto', label: 'Em Aberto' },
              { value: 'recebido', label: 'Recebido' },
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

      {/* Dialog de edição de recebimento */}
      <Dialog open={!!editReceiveDialog} onOpenChange={() => setEditReceiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Recebimento</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-slate-600 text-sm">
              Editando recebimento de <strong>{editReceiveDialog?.descricao}</strong> —{' '}
              <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(editReceiveDialog?.valor || 0))}</strong>
            </p>
            <div>
              <Label>Data do Recebimento</Label>
              <Input
                type="date"
                value={editReceiveDate}
                onChange={(e) => setEditReceiveDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Conta Bancária (Crédito)</Label>
              <select
                value={editReceiveBankAccountId}
                onChange={(e) => setEditReceiveBankAccountId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione a conta bancária</option>
                {bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>
                    {ba.nome} - Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ba.saldo_atual || 0)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditReceiveDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => editReceiveMutation.mutate({ id: editReceiveDialog.id, date: editReceiveDate, bankAccountId: editReceiveBankAccountId })}
              disabled={editReceiveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de recebimento */}
      <Dialog open={!!receiveDialog} onOpenChange={() => setReceiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-slate-600">
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
            <div>
              <Label htmlFor="receiveBankAccount">Conta Bancária *</Label>
              <select
                id="receiveBankAccount"
                value={receiveBankAccountId}
                onChange={(e) => setReceiveBankAccountId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Selecione a conta bancária</option>
                {bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>
                    {ba.nome} - Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ba.saldo_atual || 0)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialog(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (!receiveBankAccountId) {
                  toast.error('Selecione uma conta bancária');
                  return;
                }
                receiveMutation.mutate({ id: receiveDialog.id, date: receiveDate, bankAccountId: receiveBankAccountId });
              }}
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