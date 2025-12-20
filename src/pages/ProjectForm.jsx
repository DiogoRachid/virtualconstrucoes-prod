import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from '../components/ui/PageHeader';
import { HardHat, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProjectForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const isEditing = !!projectId;

  const [formData, setFormData] = useState({
    nome: '',
    endereco: '',
    cidade: '',
    estado: '',
    status: 'planejamento',
    data_inicio: '',
    data_previsao: '',
    valor_contrato: '',
    responsavel: '',
    descricao: ''
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await base44.entities.Project.filter({ id: projectId });
      return res && res.length > 0 ? res[0] : null;
    },
    enabled: isEditing
  });

  useEffect(() => {
    if (isEditing && project) {
      setFormData({
        nome: project.nome || '',
        endereco: project.endereco || '',
        cidade: project.cidade || '',
        estado: project.estado || '',
        status: project.status || 'planejamento',
        data_inicio: project.data_inicio || '',
        data_previsao: project.data_previsao || '',
        valor_contrato: project.valor_contrato || '',
        responsavel: project.responsavel || '',
        descricao: project.descricao || ''
      });
    }
  }, [isEditing, project]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const submitData = {
        ...data,
        valor_contrato: data.valor_contrato ? parseFloat(data.valor_contrato) : 0
      };

      if (isEditing) {
        return await base44.entities.Project.update(projectId, submitData);
      } else {
        return await base44.entities.Project.create(submitData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(isEditing ? 'Obra atualizada!' : 'Obra cadastrada!');
      navigate(createPageUrl('Projects'));
    },
    onError: (error) => {
      toast.error('Erro ao salvar obra');
      console.error(error);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isEditing && isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title={isEditing ? 'Editar Obra' : 'Nova Obra'}
        subtitle={isEditing ? 'Atualize as informações da obra' : 'Cadastre uma nova obra no sistema'}
        backUrl={createPageUrl('Projects')}
        icon={HardHat}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados Principais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da Obra *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Status *</Label>
              <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejamento">Planejamento</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Responsável</Label>
              <Input
                value={formData.responsavel}
                onChange={(e) => handleChange('responsavel', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Localização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Endereço</Label>
              <Input
                value={formData.endereco}
                onChange={(e) => handleChange('endereco', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cronograma e Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Data de Início</Label>
                <Input
                  type="date"
                  value={formData.data_inicio}
                  onChange={(e) => handleChange('data_inicio', e.target.value)}
                />
              </div>
              <div>
                <Label>Previsão de Término</Label>
                <Input
                  type="date"
                  value={formData.data_previsao}
                  onChange={(e) => handleChange('data_previsao', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Valor do Contrato (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.valor_contrato}
                onChange={(e) => handleChange('valor_contrato', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Descrição</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.descricao}
              onChange={(e) => handleChange('descricao', e.target.value)}
              rows={4}
              placeholder="Descrição detalhada da obra..."
            />
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(createPageUrl('Projects'))}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              isEditing ? 'Salvar Alterações' : 'Cadastrar Obra'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}