import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { UsersRound, Save, X } from 'lucide-react';
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

export default function TeamForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('id');
  const isEditing = !!teamId;
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nome: '',
    responsavel_id: '',
    responsavel_nome: '',
    obra_id: '',
    obra_nome: '',
    descricao: '',
    status: 'ativa'
  });

  const { data: team, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => base44.entities.Team.filter({ id: teamId }),
    enabled: isEditing
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ status: 'ativo' })
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  useEffect(() => {
    if (team?.[0]) {
      setFormData(team[0]);
    }
  }, [team]);

  const mutation = useMutation({
    mutationFn: (data) => {
      return isEditing
        ? base44.entities.Team.update(teamId, data)
        : base44.entities.Team.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      window.location.href = createPageUrl('Teams');
    }
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleResponsavelChange = (empId) => {
    const emp = employees.find(e => e.id === empId);
    setFormData(prev => ({
      ...prev,
      responsavel_id: empId,
      responsavel_nome: emp?.nome_completo || ''
    }));
  };

  const handleObraChange = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    setFormData(prev => ({
      ...prev,
      obra_id: projectId,
      obra_nome: project?.nome || ''
    }));
  };

  if (isEditing && isLoading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Editar Equipe' : 'Nova Equipe'}
        subtitle={isEditing ? formData.nome : 'Preencha os dados da equipe'}
        icon={UsersRound}
        backUrl={createPageUrl('Teams')}
      />

      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(formData); }} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados da Equipe</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome da Equipe *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="inativa">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={formData.responsavel_id || ''} onValueChange={handleResponsavelChange}>
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
              <Label>Obra Vinculada</Label>
              <Select value={formData.obra_id || ''} onValueChange={handleObraChange}>
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
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => handleChange('descricao', e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.href = createPageUrl('Teams')}
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