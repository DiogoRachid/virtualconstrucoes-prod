import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Landmark, 
  Loader2, 
  Pencil,
  ArrowUpCircle,
  ArrowDownCircle,
  Receipt
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';

const tipoLabels = {
  corrente: 'Conta Corrente',
  poupanca: 'Poupança',
  investimento: 'Investimento',
  caixa: 'Caixa'
};

export default function BankAccountDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const accountId = urlParams.get('id');

  const { data: account, isLoading } = useQuery({
    queryKey: ['bankAccount', accountId],
    queryFn: () => base44.entities.BankAccount.list({ id: accountId }).then(res => res[0])
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['accountTransactions', accountId],
    queryFn: () => base44.entities.Transaction.filter({ conta_bancaria_id: accountId }, '-data'),
    enabled: !!accountId
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!account) {
    return (
      <EmptyState
        icon={Landmark}
        title="Conta não encontrada"
        description="A conta bancária que você está procurando não existe."
        actionLabel="Voltar para Contas"
        onAction={() => window.location.href = createPageUrl('BankAccounts')}
      />
    );
  }

  const tipoIcon = {
    entrada: <ArrowUpCircle className="h-4 w-4 text-emerald-600" />,
    saida: <ArrowDownCircle className="h-4 w-4 text-red-600" />
  };

  const transactionColumns = [
    {
      header: 'Data',
      render: (row) => format(new Date(row.data), 'dd/MM/yyyy', { locale: ptBR })
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
      render: (row) => <span className="font-medium">{row.descricao}</span>
    },
    {
      header: 'Valor',
      render: (row) => (
        <span className={`font-semibold ${row.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
          {row.tipo === 'entrada' ? '+' : '-'}
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor)}
        </span>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title={account.nome}
        subtitle={tipoLabels[account.tipo]}
        icon={Landmark}
        backUrl={createPageUrl('BankAccounts')}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <StatusBadge status={account.status} />
      </div>

      <div className="flex gap-3 mb-8">
        <Button
          onClick={() => window.location.href = createPageUrl(`BankAccountForm?id=${accountId}`)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </Button>
      </div>

      {/* Informações */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-0">
          <CardContent className="pt-6">
            <p className="text-emerald-100 text-sm">Saldo Atual</p>
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(account.saldo_atual || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Banco</p>
            <p className="text-lg font-medium text-slate-900">{account.banco || '-'}</p>
            {account.agencia && account.conta && (
              <p className="text-sm text-slate-500 mt-1">
                Ag: {account.agencia} / C: {account.conta}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Saldo Inicial</p>
            <p className="text-lg font-medium text-slate-900">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(account.saldo_inicial || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Histórico de Transações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Transações</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={transactionColumns}
            data={transactions}
            emptyComponent={
              <EmptyState
                icon={Receipt}
                title="Nenhuma transação"
                description="Esta conta ainda não possui movimentações registradas."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}