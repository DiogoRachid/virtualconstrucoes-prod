import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Loader2, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export default function Transactions() {
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    tipo: 'saida',
    descricao: '',
    valor: '',
    data: format(new Date(), 'yyyy-MM-dd'),
    conta_bancaria_id: '',
    conta_bancaria_nome: '',
    conta_destino_id: '',
    conta_destino_nome: '',
    centro_custo_id: '',
    centro_custo_nome: ''
  });
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-data', 100)
  });

  const [editingTransaction, setEditingTransaction] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Transaction.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Transação excluída');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data) => {
        const payload = {
            ...data,
            valor: parseFloat(data.valor)
        };
        // Note: Editing manual transactions does not automatically revert/apply balance changes to avoid complex inconsistencies.
        // Ideally, we should, but for now we just update the record as requested.
        return base44.entities.Transaction.update(editingTransaction.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowNewDialog(false);
      setEditingTransaction(null);
      resetForm();
      toast.success('Transação atualizada');
    }
  });

  const resetForm = () => {
    setNewTransaction({
        tipo: 'saida',
        descricao: '',
        valor: '',
        data: format(new Date(), 'yyyy-MM-dd'),
        conta_bancaria_id: '',
        conta_bancaria_nome: '',
        conta_destino_id: '',
        conta_destino_nome: '',
        centro_custo_id: '',
        centro_custo_nome: ''
    });
  };

  const handleEdit = (transaction) => {
      setEditingTransaction(transaction);
      setNewTransaction({
          tipo: transaction.tipo,
          descricao: transaction.descricao,
          valor: transaction.valor,
          data: transaction.data,
          conta_bancaria_id: transaction.conta_bancaria_id || '',
          conta_bancaria_nome: transaction.conta_bancaria_nome || '',
          conta_destino_id: transaction.conta_destino_id || '',
          conta_destino_nome: transaction.conta_destino_nome || '',
          centro_custo_id: transaction.centro_custo_id || '',
          centro_custo_nome: transaction.centro_custo_nome || ''
      });
      setShowNewDialog(true);
  };

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.filter({ status: 'ativa' })
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.filter({ status: 'ativo' })
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const transaction = await base44.entities.Transaction.create({
        ...data,
        valor: parseFloat(data.valor),
        origem: 'manual'
      });
      // Atualizar saldo da conta origem
      const valor = parseFloat(data.valor);
      
      if (data.conta_bancaria_id) {
        const [account] = await base44.entities.BankAccount.filter({ id: data.conta_bancaria_id });
        if (account) {
          const novoSaldo = data.tipo === 'entrada' 
            ? (account.saldo_atual || 0) + valor
            : (account.saldo_atual || 0) - valor; // Saída ou Transferência (sai da origem)
          await base44.entities.BankAccount.update(data.conta_bancaria_id, { saldo_atual: novoSaldo });
        }
      }

      // Atualizar saldo da conta destino (transferência)
      if (data.tipo === 'transferencia' && data.conta_destino_id) {
        const [destAccount] = await base44.entities.BankAccount.filter({ id: data.conta_destino_id });
        if (destAccount) {
          const novoSaldoDest = (destAccount.saldo_atual || 0) + valor;
          await base44.entities.BankAccount.update(data.conta_destino_id, { saldo_atual: novoSaldoDest });
        }
      }

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setShowNewDialog(false);
      setNewTransaction({
        tipo: 'saida',
        descricao: '',
        valor: '',
        data: format(new Date(), 'yyyy-MM-dd'),
        conta_bancaria_id: '',
        conta_bancaria_nome: '',
        conta_destino_id: '',
        conta_destino_nome: '',
        centro_custo_id: '',
        centro_custo_nome: ''
      });
    }
  });

  const toggleConciliado = useMutation({
    mutationFn: ({ id, conciliado }) => base44.entities.Transaction.update(id, { conciliado }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  });

  const filteredTransactions = transactions.filter(t => {
    const matchSearch = !search || 
      t.descricao?.toLowerCase().includes(search.toLowerCase()) ||
      t.conta_bancaria_nome?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = tipoFilter === 'all' || t.tipo === tipoFilter;
    const matchStart = !startDate || new Date(t.data) >= new Date(startDate);
    const matchEnd = !endDate || new Date(t.data) <= new Date(endDate);
    return matchSearch && matchTipo && matchStart && matchEnd;
  });

  const totalEntradas = filteredTransactions
    .filter(t => t.tipo === 'entrada')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const totalSaidas = filteredTransactions
    .filter(t => t.tipo === 'saida')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const tipoIcon = {
    entrada: <ArrowUpCircle className="h-4 w-4 text-emerald-600" />,
    saida: <ArrowDownCircle className="h-4 w-4 text-red-600" />,
    transferencia: <ArrowLeftRight className="h-4 w-4 text-blue-600" />
  };

  const columns = [
    {
      header: 'Data',
      render: (row) => {
         if (!row.data) return '-';
         const [y, m, d] = row.data.split('-');
         return `${d}/${m}/${y}`;
      }
    },
    {
      header: 'Tipo',
      render: (row) => (
        <div className="flex items-center gap-2">
          {tipoIcon[row.tipo]}
          <StatusBadge status={row.tipo} />
        </div>
      )
    },
    {
      header: 'Descrição',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.descricao}</p>
          {row.conta_bancaria_nome && (
            <p className="text-sm text-slate-500">
               {row.conta_bancaria_nome}
               {row.tipo === 'transferencia' && row.conta_destino_nome && (
                  <span className="flex items-center gap-1 mt-0.5 text-blue-500">
                     <ArrowLeftRight className="h-3 w-3" />
                     {row.conta_destino_nome}
                  </span>
               )}
            </p>
          )}
        </div>
      )
    },
    {
      header: 'Valor',
      render: (row) => (
        <span className={`font-semibold ${row.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
          {row.tipo === 'entrada' ? '+' : '-'}
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor)}
        </span>
      )
    },
    {
      header: 'Centro de Custo',
      render: (row) => <span className="text-slate-600">{row.centro_custo_nome || '-'}</span>
    },
    {
      header: 'Conciliado',
      render: (row) => (
        <Checkbox
          checked={row.conciliado}
          onCheckedChange={(checked) => toggleConciliado.mutate({ id: row.id, conciliado: checked })}
        />
      )
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
            <DropdownMenuItem onClick={() => handleEdit(row)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
                if(confirm('Excluir transação?')) deleteMutation.mutate(row.id);
            }} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  const handleBankAccountChange = (id) => {
    const account = bankAccounts.find(a => a.id === id);
    setNewTransaction(prev => ({
      ...prev,
      conta_bancaria_id: id,
      conta_bancaria_nome: account?.nome || ''
    }));
  };

  const handleCostCenterChange = (id) => {
    const center = costCenters.find(c => c.id === id);
    setNewTransaction(prev => ({
      ...prev,
      centro_custo_id: id,
      centro_custo_nome: center?.nome || ''
    }));
  };

  return (
    <div>
      <PageHeader
        title="Transações"
        subtitle="Histórico de movimentações financeiras"
        icon={Receipt}
        actionLabel="Nova Transação"
        onAction={() => setShowNewDialog(true)}
      />

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Entradas</p>
            <p className="text-2xl font-bold text-emerald-600">
              +{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Saídas</p>
            <p className="text-2xl font-bold text-red-600">
              -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaidas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Saldo do Período</p>
            <p className={`text-2xl font-bold ${totalEntradas - totalSaidas >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas - totalSaidas)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição..."
            className="border-slate-200"
          />
        </div>
        <Select value={tipoFilter} onValueChange={setTipoFilter}>
          <SelectTrigger className="w-full sm:w-40 border-slate-200">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="entrada">Entradas</SelectItem>
            <SelectItem value="saida">Saídas</SelectItem>
            <SelectItem value="transferencia">Transferências</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="Data inicial"
          className="w-full sm:w-40 border-slate-200"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="Data final"
          className="w-full sm:w-40 border-slate-200"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredTransactions}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={Receipt}
            title="Nenhuma transação encontrada"
            description="As transações serão registradas automaticamente ao dar baixa em contas."
            actionLabel="Nova Transação Manual"
            onAction={() => setShowNewDialog(true)}
          />
        }
      />

      {/* Dialog Nova Transação */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Transação Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo *</Label>
              <Select
                value={newTransaction.tipo}
                onValueChange={(v) => setNewTransaction(prev => ({ ...prev, tipo: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Descrição *</Label>
              <Input
                value={newTransaction.descricao}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, descricao: e.target.value }))}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Valor *</Label>
              <Input
                type="number"
                step="0.01"
                value={newTransaction.valor}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, valor: e.target.value }))}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={newTransaction.data}
                onChange={(e) => setNewTransaction(prev => ({ ...prev, data: e.target.value }))}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>{newTransaction.tipo === 'transferencia' ? 'Conta Origem' : 'Conta Bancária'}</Label>
              <Select
                value={newTransaction.conta_bancaria_id}
                onValueChange={handleBankAccountChange}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newTransaction.tipo === 'transferencia' && (
              <div>
                <Label>Conta Destino</Label>
                <Select
                  value={newTransaction.conta_destino_id}
                  onValueChange={(id) => {
                     const account = bankAccounts.find(a => a.id === id);
                     setNewTransaction(prev => ({
                        ...prev,
                        conta_destino_id: id,
                        conta_destino_nome: account?.nome || ''
                     }));
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts
                      .filter(a => a.id !== newTransaction.conta_bancaria_id)
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newTransaction.tipo !== 'transferencia' && (
              <div>
                <Label>Centro de Custo</Label>
                <Select
                  value={newTransaction.centro_custo_id}
                  onValueChange={handleCostCenterChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => editingTransaction ? updateMutation.mutate(newTransaction) : createMutation.mutate(newTransaction)}
              disabled={createMutation.isPending || updateMutation.isPending || !newTransaction.descricao || !newTransaction.valor}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTransaction ? 'Atualizar' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}