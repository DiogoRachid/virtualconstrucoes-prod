import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Users, Save, X } from 'lucide-react';
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

export default function EmployeeForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const employeeId = urlParams.get('id');
  const isEditing = !!employeeId;
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    funcao: '',
    tipo_vinculo: 'clt',
    status: 'ativo',
    data_admissao: '',
    salario: '',
    equipe_id: '',
    equipe_nome: '',
    obra_id: '',
    obra_nome: '',
    documentos: [],
    observacoes: ''
  });

  const { data: employee, isLoading: loadingEmployee } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => base44.entities.Employee.filter({ id: employeeId }),
    enabled: isEditing
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  useEffect(() => {
    if (employee?.[0]) {
      setFormData({ ...employee[0], salario: employee[0].salario || '' });
    }
  }, [employee]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, salario: data.salario ? parseFloat(data.salario) : null };
      return isEditing
        ? base44.entities.Employee.update(employeeId, payload)
        : base44.entities.Employee.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      window.location.href = createPageUrl('Employees');
    }
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTeamChange = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    setFormData(prev => ({
      ...prev,
      equipe_id: teamId,
      equipe_nome: team?.nome || ''
    }));
  };

  const handleProjectChange = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    setFormData(prev => ({
      ...prev,
      obra_id: projectId,
      obra_nome: project?.nome || ''
    }));
  };

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14);
  };

  if (isEditing && loadingEmployee) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Editar Colaborador' : 'Novo Colaborador'}
        subtitle={isEditing ? formData.nome_completo : 'Preencha os dados do colaborador'}
        icon={Users}
        backUrl={createPageUrl('Employees')}
      />

      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(formData); }} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Nome Completo *</Label>
              <Input
                value={formData.nome_completo}
                onChange={(e) => handleChange('nome_completo', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>CPF *</Label>
              <Input
                value={formData.cpf}
                onChange={(e) => handleChange('cpf', formatCPF(e.target.value))}
                required
                maxLength={14}
              />
            </div>
            <div>
              <Label>Data de Nascimento</Label>
              <Input
                type="date"
                value={formData.data_nascimento}
                onChange={(e) => handleChange('data_nascimento', e.target.value)}
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={formData.telefone}
                onChange={(e) => handleChange('telefone', e.target.value)}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="md:col-span-2 lg:col-span-2">
              <Label>Endereço</Label>
              <Input
                value={formData.endereco}
                onChange={(e) => handleChange('endereco', e.target.value)}
              />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input
                value={formData.cidade}
                onChange={(e) => handleChange('cidade', e.target.value)}
              />
            </div>
            <div>
              <Label>Estado</Label>
              <Input
                value={formData.estado}
                onChange={(e) => handleChange('estado', e.target.value)}
                maxLength={2}
              />
            </div>
            <div>
              <Label>CEP</Label>
              <Input
                value={formData.cep}
                onChange={(e) => handleChange('cep', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados Profissionais</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Função/Cargo *</Label>
              <Input
                value={formData.funcao}
                onChange={(e) => handleChange('funcao', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Tipo de Vínculo *</Label>
              <Select value={formData.tipo_vinculo} onValueChange={(v) => handleChange('tipo_vinculo', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clt">CLT</SelectItem>
                  <SelectItem value="pj">PJ</SelectItem>
                  <SelectItem value="terceirizado">Terceirizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status *</Label>
              <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de Admissão</Label>
              <Input
                type="date"
                value={formData.data_admissao}
                onChange={(e) => handleChange('data_admissao', e.target.value)}
              />
            </div>
            <div>
              <Label>Salário</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.salario}
                onChange={(e) => handleChange('salario', e.target.value)}
              />
            </div>
            <div>
              <Label>Equipe</Label>
              <Select value={formData.equipe_id || ''} onValueChange={handleTeamChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </CardContent>
        </Card>

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
              placeholder="Informações adicionais..."
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.href = createPageUrl('Employees')}
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