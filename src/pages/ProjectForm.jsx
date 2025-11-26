import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { HardHat, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const isEdit = !!projectId;

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
    queryFn: () => base44.entities.Project.list({ id: projectId }).then(res => res[0]),
    enabled: isEdit
  });

  useEffect(() => {
    if (project) {
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
  }, [project]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        valor_contrato: data.valor_contrato ? parseFloat(data.valor_contrato) : null
      };
      if (isEdit) {
        return base44.entities.Project.update(projectId, payload);
      }
      return base44.entities.Project.create(payload);
    },
    onSuccess: () => {
      window.location.href = createPageUrl('Projects');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar Obra' : 'Nova Obra'}
        subtitle={isEdit ? 'Atualize os dados da obra' : 'Preencha os dados da nova obra'}
        icon={HardHat}
        backUrl={createPageUrl('Projects')}
      />

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="space-y-6">
          {/* Dados Principais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados Principais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label htmlFor="nome">Nome da Obra *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange('status', value)}
                >
                  <SelectTrigger className="mt-1.5">
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
                <Label htmlFor="responsavel">Responsável</Label>
                <Input
                  id="responsavel"
                  value={formData.responsavel}
                  onChange={(e) => handleChange('responsavel', e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Localização */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Localização</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  value={formData.endereco}
                  onChange={(e) => handleChange('endereco', e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  value={formData.cidade}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="estado">Estado</Label>
                <Input
                  id="estado"
                  value={formData.estado}
                  onChange={(e) => handleChange('estado', e.target.value)}
                  maxLength={2}
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Cronograma e Valores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cronograma e Valores</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label htmlFor="data_inicio">Data de Início</Label>
                <Input
                  id="data_inicio"
                  type="date"
                  value={formData.data_inicio}
                  onChange={(e) => handleChange('data_inicio', e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="data_previsao">Previsão de Término</Label>
                <Input
                  id="data_previsao"
                  type="date"
                  value={formData.data_previsao}
                  onChange={(e) => handleChange('data_previsao', e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="valor_contrato">Valor do Contrato</Label>
                <Input
                  id="valor_contrato"
                  type="number"
                  step="0.01"
                  value={formData.valor_contrato}
                  onChange={(e) => handleChange('valor_contrato', e.target.value)}
                  placeholder="0,00"
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Descrição */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Descrição</CardTitle>
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

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Salvar Alterações' : 'Cadastrar Obra'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('Projects')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}