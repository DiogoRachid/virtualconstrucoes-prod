import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, MoreHorizontal, Pencil, Trash2, Eye, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchEconomicIndicators } from '@/components/investments/QuoteService';

const tipoLabels = {
  corrente: 'Conta Corrente',
  poupanca: 'Poupança',
  investimento: 'Investimento',
  caixa: 'Caixa'
};

export default function BankAccounts() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [sortColumn, setSortColumn] = useState('nome');
  const [sortDirection, setSortDirection] = useState('asc');
  const [indicators, setIndicators] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchEconomicIndicators().then(setIndicators).catch(console.error);
  }, []);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.list('-created_date')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BankAccount.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setDeleteId(null);
    }
  });

  const filteredAccounts = accounts.filter(a => {
    const matchSearch = !search || 
      a.nome?.toLowerCase().includes(search.toLowerCase()) ||
      a.banco?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (!sortColumn) return 0;
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const totalSaldo = accounts.reduce((sum, acc) => {
    let saldo = acc.saldo_atual || 0;
    if (acc.moeda === 'USD' && indicators?.dolar) {
      saldo = saldo * indicators.dolar;
    } else if (acc.moeda === 'EUR' && indicators?.euro) {
      saldo = saldo * indicators.euro;
    }
    return sum + saldo;
  }, 0);

  const columns = [
    {
      header: 'Conta',
      accessor: 'nome',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Landmark className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{row.nome}</p>
            <p className="text-sm text-slate-500">{tipoLabels[row.tipo] || row.tipo}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Banco',
      accessor: 'banco',
      sortable: true,
      render: (row) => (
        <div className="text-sm">
          <p className="font-medium text-slate-700">{row.banco || '-'}</p>
          {row.agencia && row.conta && (
            <p className="text-slate-500">Ag: {row.agencia} / C: {row.conta}</p>
          )}
        </div>
      )
    },
    {
      header: 'Saldo Atual',
      accessor: 'saldo_atual',
      sortable: true,
      render: (row) => {
        const moeda = row.moeda || 'BRL';
        const locale = moeda === 'USD' ? 'en-US' : (moeda === 'EUR' ? 'de-DE' : 'pt-BR');
        return (
          <div className="flex flex-col">
            <span className={`font-semibold ${(row.saldo_atual || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {new Intl.NumberFormat(locale, { style: 'currency', currency: moeda }).format(row.saldo_atual || 0)}
            </span>
            {moeda !== 'BRL' && indicators && (
              <span className="text-xs text-slate-500">
                ≈ {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  (row.saldo_atual || 0) * (moeda === 'USD' ? indicators.dolar : indicators.euro || 0)
                )}
              </span>
            )}
          </div>
        );
      }
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
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`BankAccountDetail?id=${row.id}`)} className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visualizar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={createPageUrl(`BankAccountForm?id=${row.id}`)}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={(e) => {
                e.stopPropagation();
                setDeleteId(row.id);
              }}
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
        title="Contas Bancárias"
        subtitle="Gerencie suas contas e saldos"
        icon={Landmark}
        actionLabel="Nova Conta"
        onAction={() => window.location.href = createPageUrl('BankAccountForm')}
      />

      {/* Saldo Total */}
      <div className="mb-6 p-6 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl text-white">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-emerald-100 text-sm">Saldo Total</p>
            <p className="text-3xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaldo)}
            </p>
          </div>
        </div>
      </div>

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome ou banco..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: 'Status',
            options: [
              { value: 'ativa', label: 'Ativa' },
              { value: 'inativa', label: 'Inativa' }
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
        onRowClick={(row) => window.location.href = createPageUrl(`BankAccountDetail?id=${row.id}`)}
        onSort={handleSort}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        emptyComponent={
          <EmptyState
            icon={Landmark}
            title="Nenhuma conta cadastrada"
            description="Cadastre suas contas bancárias para gerenciar saldos e movimentações."
            actionLabel="Nova Conta"
            onAction={() => window.location.href = createPageUrl('BankAccountForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir conta"
        description="Tem certeza que deseja excluir esta conta? Todo o histórico de transações será perdido."
      />
    </div>
  );
}