import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { FileSignature, Save, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import PageHeader from '@/components/ui/PageHeader';
import DocumentUploader from '@/components/shared/DocumentUploader';

export default function ContractForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const contractId = urlParams.get('id');
  const employeeIdParam = urlParams.get('employee');
  const isEditing = !!contractId;
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    colaborador_id: employeeIdParam || '',
    colaborador_nome: '',
    tipo_contrato: 'clt',
    data_inicio: '',
    data_fim: '',
    salario: '',
    carga_horaria: '',
    status: 'vigente',
    data_rescisao: '',
    motivo_rescisao: '',
    documentos: [],
    observacoes: ''
  });

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => base44.entities.EmployeeContract.filter({ id: contractId }),
    enabled: isEditing
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  useEffect(() => {
    if (contract?.[0]) {
      setFormData({ ...contract[0], salario: contract[0].salario || '', carga_horaria: contract[0].carga_horaria || '' });
    }
  }, [contract]);

  useEffect(() => {
    if (employeeIdParam && employees.length > 0) {
      const emp = employees.find(e => e.id === employeeIdParam);
      if (emp) {
        setFormData(prev => ({
          ...prev,
          colaborador_id: emp.id,
          colaborador_nome: emp.nome_completo
        }));
      }
    }
  }, [employeeIdParam, employees]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        salario: data.salario ? parseFloat(data.salario) : null,
        carga_horaria: data.carga_horaria ? parseFloat(data.carga_horaria) : null
      };
      return isEditing
        ? base44.entities.EmployeeContract.update(contractId, payload)
        : base44.entities.EmployeeContract.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      window.location.href = createPageUrl('EmployeeContracts');
    }
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEmployeeChange = (empId) => {
    const emp = employees.find(e => e.id === empId);
    setFormData(prev => ({
      ...prev,
      colaborador_id: empId,
      colaborador_nome: emp?.nome_completo || ''
    }));
  };

  if (isEditing && isLoading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Editar Contrato' : 'Novo Contrato'}
        subtitle="Cadastro de contrato de trabalho"
        icon={FileSignature}
        backUrl={createPageUrl('EmployeeContracts')}
      />

      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(formData); }} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados do Contrato</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <Label>Tipo de Contrato *</Label>
              <Select value={formData.tipo_contrato} onValueChange={(v) => handleChange('tipo_contrato', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clt">CLT</SelectItem>
                  <SelectItem value="pj">PJ</SelectItem>
                  <SelectItem value="terceirizado">Terceirizado</SelectItem>
                  <SelectItem value="temporario">Temporário</SelectItem>
                  <SelectItem value="estagio">Estágio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vigente">Vigente</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                  <SelectItem value="renovado">Renovado</SelectItem>
                  <SelectItem value="rescindido">Rescindido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de Início *</Label>
              <Input
                type="date"
                value={formData.data_inicio}
                onChange={(e) => handleChange('data_inicio', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Data de Término</Label>
              <Input
                type="date"
                value={formData.data_fim}
                onChange={(e) => handleChange('data_fim', e.target.value)}
              />
            </div>
            <div>
              <Label>Salário *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.salario}
                onChange={(e) => handleChange('salario', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Carga Horária (horas/semana)</Label>
              <Input
                type="number"
                value={formData.carga_horaria}
                onChange={(e) => handleChange('carga_horaria', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {formData.status === 'rescindido' && (
          <Card>
            <CardHeader>
              <CardTitle>Dados da Rescisão</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Data da Rescisão</Label>
                <Input
                  type="date"
                  value={formData.data_rescisao}
                  onChange={(e) => handleChange('data_rescisao', e.target.value)}
                />
              </div>
              <div>
                <Label>Motivo da Rescisão</Label>
                <Input
                  value={formData.motivo_rescisao}
                  onChange={(e) => handleChange('motivo_rescisao', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentUploader
              documents={formData.documentos || []}
              onChange={(docs) => handleChange('documentos', docs)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => handleChange('observacoes', e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.href = createPageUrl('EmployeeContracts')}
          >
            <X className="h-4 w-4 mr-2" /> Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {mutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </div>
  );
}