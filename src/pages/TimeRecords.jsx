import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Clock, Plus, Check, X, FileText, Calendar } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogFooter
} from "@/components/ui/dialog";
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import moment from 'moment';

const statusStyles = {
  pendente: 'bg-amber-50 text-amber-700 border-amber-200',
  aprovado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejeitado: 'bg-red-50 text-red-700 border-red-200'
};

export default function TimeRecords() {
  const [showForm, setShowForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(moment().format('YYYY-MM'));
  const [formData, setFormData] = useState({
    colaborador_id: '',
    colaborador_nome: '',
    data: moment().format('YYYY-MM-DD'),
    entrada: '',
    saida_almoco: '',
    retorno_almoco: '',
    saida: '',
    obra_id: '',
    obra_nome: '',
    tipo_registro: 'manual',
    observacoes: ''
  });
  const queryClient = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['timeRecords'],
    queryFn: () => base44.entities.TimeRecord.list('-data')
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ status: 'ativo' })
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const horasTrabalhadas = calcularHoras(data);
      return base44.entities.TimeRecord.create({ 
        ...data, 
        horas_trabalhadas: horasTrabalhadas,
        status: 'pendente'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeRecords'] });
      setShowForm(false);
      resetForm();
    }
  });

  const approveMutation = useMutation({
    mutationFn: (id) => base44.entities.TimeRecord.update(id, { status: 'aprovado' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeRecords'] })
  });

  const rejectMutation = useMutation({
    mutationFn: (id) => base44.entities.TimeRecord.update(id, { status: 'rejeitado' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timeRecords'] })
  });

  const calcularHoras = (data) => {
    if (!data.entrada || !data.saida) return 0;
    const entrada = moment(data.entrada, 'HH:mm');
    const saida = moment(data.saida, 'HH:mm');
    let total = saida.diff(entrada, 'hours', true);
    
    if (data.saida_almoco && data.retorno_almoco) {
      const saidaAlmoco = moment(data.saida_almoco, 'HH:mm');
      const retornoAlmoco = moment(data.retorno_almoco, 'HH:mm');
      total -= retornoAlmoco.diff(saidaAlmoco, 'hours', true);
    }
    return Math.round(total * 100) / 100;
  };

  const resetForm = () => {
    setFormData({
      colaborador_id: '',
      colaborador_nome: '',
      data: moment().format('YYYY-MM-DD'),
      entrada: '',
      saida_almoco: '',
      retorno_almoco: '',
      saida: '',
      obra_id: '',
      obra_nome: '',
      tipo_registro: 'manual',
      observacoes: ''
    });
  };

  const handleEmployeeChange = (empId) => {
    const emp = employees.find(e => e.id === empId);
    setFormData(prev => ({
      ...prev,
      colaborador_id: empId,
      colaborador_nome: emp?.nome_completo || ''
    }));
  };

  const handleProjectChange = (projId) => {
    const proj = projects.find(p => p.id === projId);
    setFormData(prev => ({
      ...prev,
      obra_id: projId,
      obra_nome: proj?.nome || ''
    }));
  };

  const filteredRecords = records.filter(rec => {
    const matchEmployee = selectedEmployee === 'all' || rec.colaborador_id === selectedEmployee;
    const matchMonth = rec.data?.startsWith(selectedMonth);
    return matchEmployee && matchMonth;
  });

  const columns = [
    {
      header: 'Colaborador',
      render: (row) => (
        <div>
          <p className="font-medium">{row.colaborador_nome}</p>
          <p className="text-sm text-slate-500">{row.obra_nome || '-'}</p>
        </div>
      )
    },
    {
      header: 'Data',
      render: (row) => moment(row.data).format('DD/MM/YYYY')
    },
    {
      header: 'Entrada',
      render: (row) => row.entrada || '-'
    },
    {
      header: 'Saída',
      render: (row) => row.saida || '-'
    },
    {
      header: 'Horas',
      render: (row) => row.horas_trabalhadas ? `${row.horas_trabalhadas}h` : '-'
    },
    {
      header: 'Status',
      render: (row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusStyles[row.status]}`}>
          {row.status === 'pendente' ? 'Pendente' : row.status === 'aprovado' ? 'Aprovado' : 'Rejeitado'}
        </span>
      )
    },
    {
      header: '',
      className: 'w-24',
      render: (row) => row.status === 'pendente' && (
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon"
            className="text-emerald-600 hover:bg-emerald-50"
            onClick={(e) => { e.stopPropagation(); approveMutation.mutate(row.id); }}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            className="text-red-600 hover:bg-red-50"
            onClick={(e) => { e.stopPropagation(); rejectMutation.mutate(row.id); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controle de Frequência"
        subtitle="Registro de ponto e folha de frequência"
        icon={Clock}
        actionLabel="Novo Registro"
        onAction={() => setShowForm(true)}
      />

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os colaboradores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              {employees.map(emp => (
                <SelectItem key={emp.id} value={emp.id}>{emp.nome_completo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => window.location.href = createPageUrl('TimeSheet')}>
          <FileText className="h-4 w-4 mr-2" /> Folha de Ponto
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filteredRecords}
        isLoading={isLoading}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Registro de Ponto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Colaborador *</Label>
              <Select value={formData.colaborador_id} onValueChange={handleEmployeeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.nome_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={formData.data}
                onChange={(e) => setFormData(prev => ({ ...prev, data: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entrada</Label>
                <Input
                  type="time"
                  value={formData.entrada}
                  onChange={(e) => setFormData(prev => ({ ...prev, entrada: e.target.value }))}
                />
              </div>
              <div>
                <Label>Saída Almoço</Label>
                <Input
                  type="time"
                  value={formData.saida_almoco}
                  onChange={(e) => setFormData(prev => ({ ...prev, saida_almoco: e.target.value }))}
                />
              </div>
              <div>
                <Label>Retorno Almoço</Label>
                <Input
                  type="time"
                  value={formData.retorno_almoco}
                  onChange={(e) => setFormData(prev => ({ ...prev, retorno_almoco: e.target.value }))}
                />
              </div>
              <div>
                <Label>Saída</Label>
                <Input
                  type="time"
                  value={formData.saida}
                  onChange={(e) => setFormData(prev => ({ ...prev, saida: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Obra</Label>
              <Select value={formData.obra_id || ''} onValueChange={handleProjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(proj => (
                    <SelectItem key={proj.id} value={proj.id}>{proj.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button 
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.colaborador_id || createMutation.isPending}
            >
              {createMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}