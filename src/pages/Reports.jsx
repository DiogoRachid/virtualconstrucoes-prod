import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText,
  Download,
  Filter,
  Printer,
  Calendar,
  ArrowUpCircle,
  ArrowDownCircle
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from '@/components/ui/StatusBadge';

export default function Reports() {
  const [reportType, setReportType] = useState('financial');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const reportRef = useRef(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-data')
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['accountsPayable'],
    queryFn: () => base44.entities.AccountPayable.list('-data_vencimento')
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ['accountsReceivable'],
    queryFn: () => base44.entities.AccountReceivable.list('-data_vencimento')
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.list()
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list()
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });

  // Filtrar dados pelo período
  const filterByDate = (items, dateField) => {
    return items.filter(item => {
      const itemDate = new Date(item[dateField]);
      return itemDate >= new Date(startDate) && itemDate <= new Date(endDate);
    });
  };

  const filteredTransactions = filterByDate(transactions, 'data').filter(t => {
    const matchCC = costCenterFilter === 'all' || t.centro_custo_id === costCenterFilter;
    return matchCC;
  });

  const filteredPayables = filterByDate(payables, 'data_vencimento').filter(p => {
    const matchSupplier = supplierFilter === 'all' || p.fornecedor_id === supplierFilter;
    const matchCC = costCenterFilter === 'all' || p.centro_custo_id === costCenterFilter;
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSupplier && matchCC && matchStatus;
  });

  const filteredReceivables = filterByDate(receivables, 'data_vencimento').filter(r => {
    const matchClient = clientFilter === 'all' || r.cliente_id === clientFilter;
    const matchCC = costCenterFilter === 'all' || r.centro_custo_id === costCenterFilter;
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchClient && matchCC && matchStatus;
  });

  // Totais
  const totalEntradas = filteredTransactions
    .filter(t => t.tipo === 'entrada')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const totalSaidas = filteredTransactions
    .filter(t => t.tipo === 'saida')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const totalPayables = filteredPayables.reduce((sum, p) => sum + (p.valor || 0), 0);
  const totalReceivables = filteredReceivables.reduce((sum, r) => sum + (r.valor || 0), 0);

  // Agrupar por centro de custo
  const byCostCenter = costCenters.map(cc => {
    const despesas = filteredTransactions
      .filter(t => t.tipo === 'saida' && t.centro_custo_id === cc.id)
      .reduce((sum, t) => sum + (t.valor || 0), 0);
    const receitas = filteredTransactions
      .filter(t => t.tipo === 'entrada' && t.centro_custo_id === cc.id)
      .reduce((sum, t) => sum + (t.valor || 0), 0);
    return { ...cc, despesas, receitas, saldo: receitas - despesas };
  }).filter(cc => cc.despesas > 0 || cc.receitas > 0);

  const handlePrint = () => {
    const printContent = reportRef.current;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório Financeiro - Virtual Construções</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; }
            .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .header img { height: 60px; }
            .header h1 { color: #2563eb; margin: 0; }
            .header p { color: #64748b; margin: 5px 0 0 0; }
            h2 { color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
            th { background: #f8fafc; font-weight: 600; }
            .total { font-weight: bold; background: #f1f5f9; }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
            .summary-card { background: #f8fafc; padding: 15px; border-radius: 8px; }
            .summary-card h3 { margin: 0 0 5px 0; font-size: 14px; color: #64748b; }
            .summary-card p { margin: 0; font-size: 24px; font-weight: bold; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg" alt="Virtual Construções" />
            <div>
              <h1>Relatório Financeiro</h1>
              <p>Período: ${format(new Date(startDate), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(endDate), 'dd/MM/yyyy', { locale: ptBR })}</p>
            </div>
          </div>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Gere relatórios financeiros personalizados"
        icon={FileText}
      />

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Data Final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Centro de Custo</Label>
              <Select value={costCenterFilter} onValueChange={setCostCenterFilter}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {costCenters.map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="em_aberto">Em Aberto</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="recebido">Recebido</SelectItem>
                  <SelectItem value="atrasado">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
              <Printer className="h-4 w-4 mr-2" />
              Imprimir / PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Relatório */}
      <div ref={reportRef}>
        <Tabs defaultValue="resumo" className="space-y-6">
          <TabsList>
            <TabsTrigger value="resumo">Resumo Geral</TabsTrigger>
            <TabsTrigger value="centros">Por Centro de Custo</TabsTrigger>
            <TabsTrigger value="pagar">Contas a Pagar</TabsTrigger>
            <TabsTrigger value="receber">Contas a Receber</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <ArrowUpCircle className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Total Entradas</p>
                      <p className="text-xl font-bold text-emerald-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                      <ArrowDownCircle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Total Saídas</p>
                      <p className="text-xl font-bold text-red-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaidas)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Saldo do Período</p>
                      <p className={`text-xl font-bold ${totalEntradas - totalSaidas >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas - totalSaidas)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Movimentações do Período</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Centro de Custo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map(t => (
                      <TableRow key={t.id}>
                        <TableCell>{format(new Date(t.data), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                        <TableCell><StatusBadge status={t.tipo} /></TableCell>
                        <TableCell>{t.descricao}</TableCell>
                        <TableCell>{t.centro_custo_nome || '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${t.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.tipo === 'entrada' ? '+' : '-'}
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="centros">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Análise por Centro de Custo</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Centro de Custo</TableHead>
                      <TableHead className="text-right">Receitas</TableHead>
                      <TableHead className="text-right">Despesas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCostCenter.map(cc => (
                      <TableRow key={cc.id}>
                        <TableCell className="font-medium">{cc.nome}</TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cc.receitas)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cc.despesas)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${cc.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cc.saldo)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right text-emerald-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaidas)}
                      </TableCell>
                      <TableCell className={`text-right ${totalEntradas - totalSaidas >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas - totalSaidas)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagar">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contas a Pagar</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayables.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{format(new Date(p.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                        <TableCell>{p.descricao}</TableCell>
                        <TableCell>{p.fornecedor_nome || '-'}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                        <TableCell className="text-right font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-bold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPayables)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receber">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contas a Receber</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReceivables.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{format(new Date(r.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                        <TableCell>{r.descricao}</TableCell>
                        <TableCell>{r.cliente_nome || '-'}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-right font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-bold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalReceivables)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}