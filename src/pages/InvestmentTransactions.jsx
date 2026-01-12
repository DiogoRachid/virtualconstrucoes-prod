import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  History,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Filter,
  Download
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function InvestmentTransactions() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['allInvestmentTransactions'],
    queryFn: () => base44.entities.InvestmentTransaction.list('-data_operacao', 500) // Listar até 500 últimas
  });

  const filteredTransactions = transactions.filter(t => {
    const matchSearch = !search || 
      t.investimento_nome?.toLowerCase().includes(search.toLowerCase());
    
    const matchType = typeFilter === 'all' || t.tipo_operacao === typeFilter;
    
    const tDate = new Date(t.data_operacao);
    const matchStart = !startDate || tDate >= new Date(startDate);
    const matchEnd = !endDate || tDate <= new Date(endDate);

    return matchSearch && matchType && matchStart && matchEnd;
  });

  // Totais do período filtrado
  const totalCompras = filteredTransactions
    .filter(t => t.tipo_operacao === 'compra')
    .reduce((sum, t) => sum + (t.valor_total || 0), 0);

  const totalVendas = filteredTransactions
    .filter(t => t.tipo_operacao === 'venda')
    .reduce((sum, t) => sum + (t.valor_total || 0), 0);

  const totalProventos = filteredTransactions
    .filter(t => ['dividendo', 'jcp', 'rendimento'].includes(t.tipo_operacao))
    .reduce((sum, t) => sum + (t.valor_total || 0), 0);

  // Variação real considerando recebimentos
  const variacaoReal = totalCompras - totalVendas - totalProventos;

  const columns = [
    {
      header: 'Data',
      accessor: 'data_operacao',
      sortable: true,
      render: (row) => {
         if (!row.data_operacao) return '-';
         const [y, m, d] = row.data_operacao.split('-');
         return `${d}/${m}/${y}`;
      }
    },
    {
      header: 'Ativo',
      accessor: 'investimento_nome',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-slate-700">{row.investimento_nome}</span>
      )
    },
    {
      header: 'Operação',
      accessor: 'tipo_operacao',
      sortable: true,
      render: (row) => {
        const isEntry = ['compra', 'aplicacao'].includes(row.tipo_operacao);
        const isExit = ['venda', 'resgate'].includes(row.tipo_operacao);
        const isIncome = ['dividendo', 'jcp', 'rendimento'].includes(row.tipo_operacao);
        
        let colorClass = 'bg-slate-100 text-slate-700';
        if (isEntry) colorClass = 'bg-blue-100 text-blue-700';
        if (isExit) colorClass = 'bg-amber-100 text-amber-700';
        if (isIncome) colorClass = 'bg-emerald-100 text-emerald-700';

        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass}`}>
            {row.tipo_operacao}
          </span>
        );
      }
    },
    {
      header: 'Qtd',
      accessor: 'quantidade',
      className: 'text-right',
      render: (row) => row.quantidade ? row.quantidade.toLocaleString('pt-BR') : '-'
    },
    {
      header: 'Preço Unit.',
      accessor: 'preco_unitario',
      className: 'text-right',
      render: (row) => row.preco_unitario 
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: row.moeda || 'BRL' }).format(row.preco_unitario)
        : '-'
    },
    {
      header: 'Valor Total',
      accessor: 'valor_total',
      className: 'text-right font-bold',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col items-end">
           <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_total)}</span>
           {row.moeda === 'USD' && (
              <span className="text-xs text-slate-400 font-normal">
                 {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.valor_origem || 0)}
              </span>
           )}
        </div>
      )
    }
  ];

  return (
    <div className="pb-20 space-y-6">
      <PageHeader
        title="Histórico de Operações"
        subtitle="Movimentação global de todos os investimentos"
        icon={History}
        backUrl={createPageUrl('Investments')}
      />

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full text-blue-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Compras</p>
              <p className="text-xl font-bold text-slate-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCompras)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-full text-amber-600">
              <TrendingDown className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Vendas</p>
              <p className="text-xl font-bold text-slate-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalVendas)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-full text-emerald-600">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Proventos</p>
              <p className="text-xl font-bold text-slate-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalProventos)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className={`p-3 rounded-full ${variacaoReal >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
              {variacaoReal >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-sm text-slate-500">Variação Real</p>
              <p className={`text-xl font-bold ${variacaoReal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(variacaoReal)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex-1">
          <Input 
            placeholder="Buscar por ativo..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo de Operação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Operações</SelectItem>
              <SelectItem value="compra">Compra</SelectItem>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="dividendo">Dividendo</SelectItem>
              <SelectItem value="jcp">JCP</SelectItem>
              <SelectItem value="rendimento">Rendimento</SelectItem>
              <SelectItem value="amortizacao">Amortização</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
           <Input 
             type="date" 
             value={startDate} 
             onChange={(e) => setStartDate(e.target.value)}
             className="w-full md:w-40"
           />
           <Input 
             type="date" 
             value={endDate} 
             onChange={(e) => setEndDate(e.target.value)}
             className="w-full md:w-40"
           />
        </div>
        <Button 
           variant="outline" 
           onClick={() => {
              setSearch('');
              setTypeFilter('all');
              setStartDate('');
              setEndDate('');
           }}
           title="Limpar Filtros"
        >
           <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabela */}
      <DataTable
        columns={columns}
        data={filteredTransactions}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={History}
            title="Nenhuma movimentação encontrada"
            description="Tente ajustar os filtros ou registre novas operações nos seus investimentos."
          />
        }
      />
    </div>
  );
}