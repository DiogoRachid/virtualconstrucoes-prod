import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { FileText, Printer, Filter, Users, Clock, FileSignature, Building2, DollarSign } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import PageHeader from '@/components/ui/PageHeader';
import moment from 'moment';

export default function HRReports() {
  const [reportType, setReportType] = useState('employees');
  const [filters, setFilters] = useState({
    status: 'all',
    obra_id: 'all',
    equipe_id: 'all',
    funcao: '',
    periodo_inicio: moment().startOf('month').format('YYYY-MM-DD'),
    periodo_fim: moment().endOf('month').format('YYYY-MM-DD')
  });
  const printRef = useRef();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => base44.entities.EmployeeContract.list()
  });

  const { data: timeRecords = [] } = useQuery({
    queryKey: ['timeRecords'],
    queryFn: () => base44.entities.TimeRecord.list()
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.list()
  });

  const filteredEmployees = employees.filter(emp => {
    if (filters.status !== 'all' && emp.status !== filters.status) return false;
    if (filters.obra_id !== 'all' && emp.obra_id !== filters.obra_id) return false;
    if (filters.equipe_id !== 'all' && emp.equipe_id !== filters.equipe_id) return false;
    if (filters.funcao && !emp.funcao?.toLowerCase().includes(filters.funcao.toLowerCase())) return false;
    return true;
  });

  const filteredTimeRecords = timeRecords.filter(rec => {
    if (filters.obra_id !== 'all' && rec.obra_id !== filters.obra_id) return false;
    if (rec.data < filters.periodo_inicio || rec.data > filters.periodo_fim) return false;
    return true;
  });

  const activeContracts = contracts.filter(c => c.status === 'vigente');
  const totalSalarios = activeContracts.reduce((sum, c) => sum + (c.salario || 0), 0);

  const getEmployeesByProject = () => {
    const result = {};
    projects.forEach(proj => {
      result[proj.id] = {
        nome: proj.nome,
        colaboradores: employees.filter(e => e.obra_id === proj.id)
      };
    });
    return result;
  };

  const getCostByCenter = () => {
    const result = {};
    costCenters.forEach(cc => {
      const empsByCc = employees.filter(e => {
        const contract = contracts.find(c => c.colaborador_id === e.id && c.status === 'vigente');
        return contract;
      });
      result[cc.id] = {
        nome: cc.nome,
        total: empsByCc.reduce((sum, e) => {
          const contract = contracts.find(c => c.colaborador_id === e.id && c.status === 'vigente');
          return sum + (contract?.salario || 0);
        }, 0)
      };
    });
    return result;
  };

  const handlePrint = () => {
    const content = printRef.current;
    const WinPrint = window.open('', '', 'width=900,height=650');
    WinPrint.document.write(`
      <html>
        <head>
          <title>Relatório RH - Virtual Construções</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e3a5f; padding-bottom: 20px; }
            .header img { height: 50px; }
            .header h1 { color: #1e3a5f; font-size: 18px; margin: 10px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #1e3a5f; color: white; }
            .summary { background: #f5f5f5; padding: 15px; margin-top: 20px; border-radius: 5px; }
            .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <div class="footer">
            Gerado em ${moment().format('DD/MM/YYYY HH:mm')} - Virtual Construções
          </div>
        </body>
      </html>
    `);
    WinPrint.document.close();
    WinPrint.focus();
    WinPrint.print();
    WinPrint.close();
  };

  const renderReportContent = () => {
    switch (reportType) {
      case 'employees':
        return (
          <div>
            <h2 className="text-lg font-semibold mb-4">Relatório de Colaboradores</h2>
            <div className="summary mb-4 p-4 bg-blue-50 rounded-lg">
              <p><strong>Total de Colaboradores:</strong> {filteredEmployees.length}</p>
              <p><strong>Ativos:</strong> {filteredEmployees.filter(e => e.status === 'ativo').length}</p>
              <p><strong>Inativos:</strong> {filteredEmployees.filter(e => e.status === 'inativo').length}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 border text-left">Nome</th>
                  <th className="p-2 border text-left">CPF</th>
                  <th className="p-2 border text-left">Função</th>
                  <th className="p-2 border text-left">Vínculo</th>
                  <th className="p-2 border text-left">Obra</th>
                  <th className="p-2 border text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(emp => (
                  <tr key={emp.id}>
                    <td className="p-2 border">{emp.nome_completo}</td>
                    <td className="p-2 border">{emp.cpf}</td>
                    <td className="p-2 border">{emp.funcao}</td>
                    <td className="p-2 border">{emp.tipo_vinculo?.toUpperCase()}</td>
                    <td className="p-2 border">{emp.obra_nome || '-'}</td>
                    <td className="p-2 border">{emp.status === 'ativo' ? 'Ativo' : 'Inativo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'frequency':
        return (
          <div>
            <h2 className="text-lg font-semibold mb-4">Relatório de Frequência</h2>
            <div className="summary mb-4 p-4 bg-blue-50 rounded-lg">
              <p><strong>Período:</strong> {moment(filters.periodo_inicio).format('DD/MM/YYYY')} a {moment(filters.periodo_fim).format('DD/MM/YYYY')}</p>
              <p><strong>Total de Registros:</strong> {filteredTimeRecords.length}</p>
              <p><strong>Horas Trabalhadas:</strong> {filteredTimeRecords.reduce((sum, r) => sum + (r.horas_trabalhadas || 0), 0).toFixed(2)}h</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 border text-left">Colaborador</th>
                  <th className="p-2 border text-left">Data</th>
                  <th className="p-2 border">Entrada</th>
                  <th className="p-2 border">Saída</th>
                  <th className="p-2 border">Horas</th>
                  <th className="p-2 border text-left">Obra</th>
                </tr>
              </thead>
              <tbody>
                {filteredTimeRecords.map(rec => (
                  <tr key={rec.id}>
                    <td className="p-2 border">{rec.colaborador_nome}</td>
                    <td className="p-2 border">{moment(rec.data).format('DD/MM/YYYY')}</td>
                    <td className="p-2 border text-center">{rec.entrada || '-'}</td>
                    <td className="p-2 border text-center">{rec.saida || '-'}</td>
                    <td className="p-2 border text-center">{rec.horas_trabalhadas ? `${rec.horas_trabalhadas}h` : '-'}</td>
                    <td className="p-2 border">{rec.obra_nome || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'contracts':
        return (
          <div>
            <h2 className="text-lg font-semibold mb-4">Relatório de Contratos</h2>
            <div className="summary mb-4 p-4 bg-blue-50 rounded-lg">
              <p><strong>Total de Contratos:</strong> {contracts.length}</p>
              <p><strong>Vigentes:</strong> {activeContracts.length}</p>
              <p><strong>Total em Salários:</strong> R$ {totalSalarios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 border text-left">Colaborador</th>
                  <th className="p-2 border text-left">Tipo</th>
                  <th className="p-2 border text-left">Início</th>
                  <th className="p-2 border text-left">Término</th>
                  <th className="p-2 border text-right">Salário</th>
                  <th className="p-2 border text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id}>
                    <td className="p-2 border">{c.colaborador_nome}</td>
                    <td className="p-2 border">{c.tipo_contrato?.toUpperCase()}</td>
                    <td className="p-2 border">{moment(c.data_inicio).format('DD/MM/YYYY')}</td>
                    <td className="p-2 border">{c.data_fim ? moment(c.data_fim).format('DD/MM/YYYY') : 'Indeterminado'}</td>
                    <td className="p-2 border text-right">R$ {(c.salario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 border">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'teams':
        const empsByProject = getEmployeesByProject();
        return (
          <div>
            <h2 className="text-lg font-semibold mb-4">Equipe por Obra</h2>
            {Object.entries(empsByProject).map(([projId, data]) => (
              <div key={projId} className="mb-6">
                <h3 className="font-semibold bg-slate-100 p-2">{data.nome} ({data.colaboradores.length} colaboradores)</h3>
                {data.colaboradores.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 border text-left">Nome</th>
                        <th className="p-2 border text-left">Função</th>
                        <th className="p-2 border text-left">Equipe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.colaboradores.map(emp => (
                        <tr key={emp.id}>
                          <td className="p-2 border">{emp.nome_completo}</td>
                          <td className="p-2 border">{emp.funcao}</td>
                          <td className="p-2 border">{emp.equipe_nome || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-2 text-slate-500">Nenhum colaborador alocado</p>
                )}
              </div>
            ))}
          </div>
        );

      case 'costs':
        return (
          <div>
            <h2 className="text-lg font-semibold mb-4">Custos de Pessoal</h2>
            <div className="summary mb-4 p-4 bg-blue-50 rounded-lg">
              <p><strong>Total Geral em Salários:</strong> R$ {totalSalarios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <h3 className="font-semibold mt-4 mb-2">Por Obra</h3>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="bg-slate-100">
                  <th className="p-2 border text-left">Obra</th>
                  <th className="p-2 border text-right">Qtd. Colaboradores</th>
                  <th className="p-2 border text-right">Total Salários</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(proj => {
                  const projetoEmps = employees.filter(e => e.obra_id === proj.id);
                  const totalProj = projetoEmps.reduce((sum, e) => {
                    const contract = contracts.find(c => c.colaborador_id === e.id && c.status === 'vigente');
                    return sum + (contract?.salario || 0);
                  }, 0);
                  return (
                    <tr key={proj.id}>
                      <td className="p-2 border">{proj.nome}</td>
                      <td className="p-2 border text-right">{projetoEmps.length}</td>
                      <td className="p-2 border text-right">R$ {totalProj.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios RH"
        subtitle="Relatórios de colaboradores, frequência e custos"
        icon={FileText}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>Tipo de Relatório</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employees">Colaboradores</SelectItem>
                <SelectItem value="frequency">Frequência</SelectItem>
                <SelectItem value="contracts">Contratos</SelectItem>
                <SelectItem value="teams">Equipe por Obra</SelectItem>
                <SelectItem value="costs">Custos de Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Obra</Label>
            <Select value={filters.obra_id} onValueChange={(v) => setFilters(prev => ({ ...prev, obra_id: v }))}>
              <SelectTrigger>
                <SelectValue />
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
            <Label>Equipe</Label>
            <Select value={filters.equipe_id} onValueChange={(v) => setFilters(prev => ({ ...prev, equipe_id: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(reportType === 'frequency') && (
            <>
              <div>
                <Label>Período Início</Label>
                <Input
                  type="date"
                  value={filters.periodo_inicio}
                  onChange={(e) => setFilters(prev => ({ ...prev, periodo_inicio: e.target.value }))}
                />
              </div>
              <div>
                <Label>Período Fim</Label>
                <Input
                  type="date"
                  value={filters.periodo_fim}
                  onChange={(e) => setFilters(prev => ({ ...prev, periodo_fim: e.target.value }))}
                />
              </div>
            </>
          )}
          <div>
            <Label>Função</Label>
            <Input
              value={filters.funcao}
              onChange={(e) => setFilters(prev => ({ ...prev, funcao: e.target.value }))}
              placeholder="Filtrar por função..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" /> Imprimir / Exportar PDF
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div ref={printRef}>
            <div className="header text-center mb-6 pb-4 border-b-2 border-blue-900">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg" 
                alt="Virtual Construções" 
                className="h-12 mx-auto mb-2"
              />
              <h1 className="text-xl font-bold text-blue-900">VIRTUAL CONSTRUÇÕES</h1>
              <p className="text-slate-500 text-sm">Relatório Gerado em {moment().format('DD/MM/YYYY HH:mm')}</p>
            </div>
            {renderReportContent()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}