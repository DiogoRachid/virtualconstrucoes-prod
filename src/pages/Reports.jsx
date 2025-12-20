import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText,
  Filter,
  Printer,
  Calendar,
  ArrowUpCircle,
  ArrowDownCircle,
  HardHat,
  PieChart,
  LayoutTemplate,
  Download,
  ChevronLeft,
  CheckCircle2,
  Clock
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
import StatusBadge from '@/components/ui/StatusBadge';

export default function Reports() {
  const [activeReport, setActiveReport] = useState(null);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [costCenterFilter, setCostCenterFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const reportRef = useRef(null);

  // Queries
  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-data')
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['accountsPayable'],
    queryFn: () => base44.entities.AccountPayable.list('data_vencimento')
  });

  const { data: receivables = [] } = useQuery({
    queryKey: ['accountsReceivable'],
    queryFn: () => base44.entities.AccountReceivable.list('data_vencimento')
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

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  // Helper de Filtros
  const filterData = (items, dateField) => {
    return items.filter(item => {
      // Filtro de Data
      const itemDate = new Date(item[dateField]);
      const start = new Date(startDate);
      const end = new Date(endDate);
      // Ajuste para garantir comparação correta (zerar horas)
      itemDate.setHours(0,0,0,0);
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);
      
      const inDateRange = itemDate >= start && itemDate <= end;

      // Filtros Comuns
      const matchCC = costCenterFilter === 'all' || item.centro_custo_id === costCenterFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchProject = projectFilter === 'all' || item.obra_id === projectFilter;

      // Filtros Específicos
      const matchSupplier = supplierFilter === 'all' || !item.fornecedor_id || item.fornecedor_id === supplierFilter;
      const matchClient = clientFilter === 'all' || !item.cliente_id || item.cliente_id === clientFilter;

      return inDateRange && matchCC && matchStatus && matchProject && matchSupplier && matchClient;
    });
  };

  const filteredTransactions = filterData(transactions, 'data');
  const filteredPayables = filterData(payables, 'data_vencimento');
  const filteredReceivables = filterData(receivables, 'data_vencimento');

  // Cálculos Gerais
  const totalEntradas = filteredTransactions
    .filter(t => t.tipo === 'entrada')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const totalSaidas = filteredTransactions
    .filter(t => t.tipo === 'saida')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  // Relatório Consolidado de Contas (Pagas + A Pagar)
  const consolidatedPayables = filteredPayables.reduce((acc, curr) => {
    const isPaid = curr.status === 'pago';
    acc.total += curr.valor || 0;
    if (isPaid) acc.paid += curr.valor || 0;
    else acc.pending += curr.valor || 0;
    return acc;
  }, { total: 0, paid: 0, pending: 0 });

  // Relatório Consolidado de Recebimentos (Recebidas + A Receber)
  const consolidatedReceivables = filteredReceivables.reduce((acc, curr) => {
    const isReceived = curr.status === 'recebido';
    acc.total += curr.valor || 0;
    if (isReceived) acc.received += curr.valor || 0;
    else acc.pending += curr.valor || 0;
    return acc;
  }, { total: 0, received: 0, pending: 0 });

  // Agrupamento por Centro de Custo
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
    if (!printContent) return;
    
    const titleMap = {
      'detailed': 'Relatório Detalhado',
      'resumo': 'Resumo Financeiro Geral',
      'centros': 'Relatório por Centro de Custo',
      'pagar': 'Relatório de Contas Pagas e a Pagar',
      'receber': 'Relatório de Contas Recebidas e a Receber'
    };

    const currentTitle = titleMap[activeReport] || 'Relatório Financeiro';
    const now = new Date();
    const formattedDate = format(now, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${currentTitle} - Virtual Construções</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            
            body { 
              font-family: 'Inter', sans-serif; 
              padding: 40px; 
              color: #334155;
              max-width: 1200px;
              margin: 0 auto;
            }
            
            .header { 
              display: flex; 
              justify-content: space-between; 
              align-items: center; 
              margin-bottom: 40px; 
              border-bottom: 3px solid #8b5cf6; 
              padding-bottom: 20px; 
            }
            
            .logo-section {
              display: flex;
              align-items: center;
              gap: 20px;
            }
            
            .logo-img { 
              height: 80px; 
              object-fit: contain;
            }
            
            .company-info h1 { 
              color: #7c3aed; 
              margin: 0; 
              font-size: 24px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            .company-info p { 
              color: #64748b; 
              margin: 5px 0 0 0; 
              font-size: 14px;
              font-weight: 500;
            }
            
            .report-meta {
              background-color: #f8fafc;
              border-left: 4px solid #7c3aed;
              padding: 15px 20px;
              border-radius: 0 8px 8px 0;
              margin-bottom: 30px;
            }
            
            .meta-item {
              margin: 5px 0;
              font-size: 14px;
            }
            
            .meta-label {
              font-weight: 700;
              color: #475569;
            }
            
            table { 
              width: 100%; 
              border-collapse: separate;
              border-spacing: 0;
              margin: 20px 0; 
              font-size: 13px;
            }
            
            th { 
              background-color: #8b5cf6; 
              color: white; 
              padding: 12px 15px; 
              text-align: left; 
              font-weight: 600;
              text-transform: uppercase;
              font-size: 12px;
            }
            
            th:first-child { border-radius: 8px 0 0 0; }
            th:last-child { border-radius: 0 8px 0 0; }
            
            td { 
              padding: 12px 15px; 
              border-bottom: 1px solid #e2e8f0;
              color: #334155;
            }
            
            tr:last-child td { border-bottom: none; }
            tr:nth-child(even) { background-color: #f8fafc; }
            
            .summary-box {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 20px;
              margin-top: 30px;
              background: white;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            }
            
            .summary-header {
              font-weight: 700;
              color: #1e293b;
              margin-bottom: 15px;
              font-size: 16px;
              border-left: 4px solid #7c3aed;
              padding-left: 10px;
            }
            
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
              gap: 30px;
            }
            
            .summary-item label {
              display: block;
              font-size: 11px;
              text-transform: uppercase;
              color: #64748b;
              margin-bottom: 5px;
              font-weight: 600;
              letter-spacing: 0.5px;
            }
            
            .summary-item .value {
              font-size: 24px;
              font-weight: 700;
            }
            
            .text-green { color: #059669; }
            .text-red { color: #dc2626; }
            .text-blue { color: #2563eb; }
            .text-right { text-align: right; }
            
            .footer {
              margin-top: 50px;
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 20px;
            }

            @media print { 
              body { padding: 0; }
              .no-print { display: none; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-section">
              <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg" class="logo-img" alt="Logo" />
              <div class="company-info">
                <h1>Virtual Construções</h1>
                <p>${currentTitle}</p>
              </div>
            </div>
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6926eb0b6c1242bf806695a4/4d718eac7_image.png" style="height: 60px; opacity: 0; pointer-events: none;" /> 
          </div>

          <div class="report-meta">
            <div class="meta-item">
              <span class="meta-label">Data de Geração:</span> ${formattedDate}
            </div>
            <div class="meta-item">
              <span class="meta-label">Período:</span> ${format(new Date(startDate), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(endDate), 'dd/MM/yyyy', { locale: ptBR })}
            </div>
          </div>

          ${printContent.innerHTML}

          <div class="footer">
            Sistema de Gestão - Virtual Construções<br/>
            Relatório gerado em ${formattedDate}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 800);
  };

  const ReportCard = ({ title, description, icon: Icon, colorClass, count, onClick, onExport }) => (
    <div 
      className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-slate-200 cursor-pointer group"
      onClick={onClick}
    >
      <div className={`p-6 text-white relative h-32 flex flex-col justify-between ${colorClass}`}>
        <div>
          <h3 className="font-bold text-lg leading-tight mb-1">{title}</h3>
          <p className="text-xs opacity-90 leading-snug max-w-[80%]">{description}</p>
        </div>
        <Icon className="absolute top-6 right-6 h-8 w-8 opacity-80 group-hover:scale-110 transition-transform" />
      </div>
      <div className="p-6 flex items-center justify-between bg-white">
        <div>
          <p className="text-2xl font-bold text-slate-800">{count}</p>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">registros</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 hover:bg-slate-50 border-slate-200 text-slate-600"
          onClick={(e) => {
            e.stopPropagation();
            onExport();
          }}
        >
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </div>
    </div>
  );

  if (activeReport) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={() => setActiveReport(null)} className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">
            {activeReport === 'detailed' && 'Relatório Detalhado'}
            {activeReport === 'resumo' && 'Resumo Financeiro Geral'}
            {activeReport === 'centros' && 'Relatório por Centro de Custo'}
            {activeReport === 'pagar' && 'Contas Pagas e a Pagar'}
            {activeReport === 'receber' && 'Contas Recebidas e a Receber'}
          </h1>
          <Button onClick={handlePrint} className="ml-auto bg-blue-600 hover:bg-blue-700">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        </div>

        <div ref={reportRef}>
          {activeReport === 'pagar' && (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Centro de Custo</TableHead>
                    <TableHead>Obra</TableHead>
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
                      <TableCell>{p.centro_custo_nome || '-'}</TableCell>
                      <TableCell>{p.obra_nome || '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          p.status === 'pago' ? 'bg-green-100 text-green-700' : 
                          p.status === 'atrasado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {p.status === 'pago' ? 'PAGO' : p.status === 'atrasado' ? 'ATRASADO' : 'A PAGAR'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="summary-box">
                <div className="summary-header">Resumo de Contas</div>
                <div className="summary-grid">
                  <div className="summary-item">
                    <label>Total Pago</label>
                    <div className="value text-green">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(consolidatedPayables.paid)}
                    </div>
                  </div>
                  <div className="summary-item">
                    <label>A Pagar</label>
                    <div className="value text-red">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(consolidatedPayables.pending)}
                    </div>
                  </div>
                  <div className="summary-item">
                    <label>Total Geral</label>
                    <div className="value text-blue">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(consolidatedPayables.total)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeReport === 'receber' && (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Centro de Custo</TableHead>
                    <TableHead>Obra</TableHead>
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
                      <TableCell>{r.centro_custo_nome || '-'}</TableCell>
                      <TableCell>{r.obra_nome || '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          r.status === 'recebido' ? 'bg-green-100 text-green-700' : 
                          r.status === 'atrasado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {r.status === 'recebido' ? 'RECEBIDO' : r.status === 'atrasado' ? 'ATRASADO' : 'A RECEBER'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="summary-box">
                <div className="summary-header">Resumo de Recebimentos</div>
                <div className="summary-grid">
                  <div className="summary-item">
                    <label>Total Recebido</label>
                    <div className="value text-green">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(consolidatedReceivables.received)}
                    </div>
                  </div>
                  <div className="summary-item">
                    <label>A Receber</label>
                    <div className="value text-blue">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(consolidatedReceivables.pending)}
                    </div>
                  </div>
                  <div className="summary-item">
                    <label>Total Geral</label>
                    <div className="value text-blue">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(consolidatedReceivables.total)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeReport === 'resumo' && (
            <div>
              <div className="summary-box mb-8 mt-0">
                <div className="summary-header">Fluxo de Caixa do Período</div>
                <div className="summary-grid">
                  <div className="summary-item">
                    <label>Total Entradas</label>
                    <div className="value text-green">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas)}
                    </div>
                  </div>
                  <div className="summary-item">
                    <label>Total Saídas</label>
                    <div className="value text-red">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSaidas)}
                    </div>
                  </div>
                  <div className="summary-item">
                    <label>Resultado</label>
                    <div className={`value ${totalEntradas - totalSaidas >= 0 ? 'text-green' : 'text-red'}`}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas - totalSaidas)}
                    </div>
                  </div>
                </div>
              </div>

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
                      <TableCell>{t.tipo === 'entrada' ? 'Entrada' : 'Saída'}</TableCell>
                      <TableCell>{t.descricao}</TableCell>
                      <TableCell>{t.centro_custo_nome || '-'}</TableCell>
                      <TableCell className={`text-right font-medium ${t.tipo === 'entrada' ? 'text-green' : 'text-red'}`}>
                        {t.tipo === 'entrada' ? '+' : '-'}
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Relatórios"
        subtitle="Exporte relatórios em PDF ou imprima diretamente"
        icon={FileText}
      />

      <Card className="mb-8 border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
              <Label>Obra</Label>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor/Cliente</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>
                  ))}
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ReportCard
          title="Contas Pagas/A Pagar"
          description="Relatório consolidado de todas as contas do período"
          icon={ArrowDownCircle}
          colorClass="bg-gradient-to-r from-orange-500 to-red-600"
          count={filteredPayables.length}
          onClick={() => setActiveReport('pagar')}
          onExport={() => {
            setActiveReport('pagar');
            setTimeout(handlePrint, 100);
          }}
        />

        <ReportCard
          title="Recebidas/A Receber"
          description="Relatório consolidado de recebimentos do período"
          icon={ArrowUpCircle}
          colorClass="bg-gradient-to-r from-green-500 to-emerald-600"
          count={filteredReceivables.length}
          onClick={() => setActiveReport('receber')}
          onExport={() => {
            setActiveReport('receber');
            setTimeout(handlePrint, 100);
          }}
        />

        <ReportCard
          title="Resumo Financeiro"
          description="Fluxo de caixa realizado (Entradas x Saídas)"
          icon={LayoutTemplate}
          colorClass="bg-gradient-to-r from-cyan-500 to-blue-600"
          count={filteredTransactions.length}
          onClick={() => setActiveReport('resumo')}
          onExport={() => {
            setActiveReport('resumo');
            setTimeout(handlePrint, 100);
          }}
        />
      </div>

      <div style={{ display: 'none' }}>
        <div ref={reportRef}>
           {/* Placeholder for print content */}
        </div>
      </div>
    </div>
  );
}