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
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from '../components/ui/PageHeader';
import DocumentUploader from '../components/shared/DocumentUploader';
import { Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ClientForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('id');
  const isEditing = !!clientId;

  const [formData, setFormData] = useState({
    nome: '',
    tipo_documento: 'CPF',
    documento: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    obras_vinculadas: [],
    status: 'ativo',
    documentos: [],
    observacoes: ''
  });

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const res = await base44.entities.Client.filter({ id: clientId });
      return res && res.length > 0 ? res[0] : null;
    },
    enabled: isEditing
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  useEffect(() => {
    if (isEditing && client) {
      setFormData({
        nome: client.nome || '',
        tipo_documento: client.tipo_documento || 'CPF',
        documento: client.documento || '',
        telefone: client.telefone || '',
        email: client.email || '',
        endereco: client.endereco || '',
        cidade: client.cidade || '',
        estado: client.estado || '',
        cep: client.cep || '',
        obras_vinculadas: client.obras_vinculadas || [],
        status: client.status || 'ativo',
        documentos: client.documentos || [],
        observacoes: client.observacoes || ''
      });
    }
  }, [isEditing, client]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (isEditing) {
        return await base44.entities.Client.update(clientId, data);
      } else {
        return await base44.entities.Client.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(isEditing ? 'Cliente atualizado!' : 'Cliente cadastrado!');
      navigate(createPageUrl('Clients'));
    },
    onError: (error) => {
      toast.error('Erro ao salvar cliente');
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

  const toggleProject = (projectId) => {
    setFormData(prev => ({
      ...prev,
      obras_vinculadas: prev.obras_vinculadas.includes(projectId)
        ? prev.obras_vinculadas.filter(id => id !== projectId)
        : [...prev.obras_vinculadas, projectId]
    }));
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
        title={isEditing ? 'Editar Cliente' : 'Novo Cliente'}
        subtitle={isEditing ? 'Atualize as informações do cliente' : 'Cadastre um novo cliente no sistema'}
        backUrl={createPageUrl('Clients')}
        icon={Users}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados Principais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome Completo *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Documento *</Label>
                <Select value={formData.tipo_documento} onValueChange={(value) => handleChange('tipo_documento', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{formData.tipo_documento} *</Label>
                <Input
                  value={formData.documento}
                  onChange={(e) => handleChange('documento', e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Endereço Completo</Label>
              <Input
                value={formData.endereco}
                onChange={(e) => handleChange('endereco', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>
          </CardContent>
        </Card>

        {projects && projects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Obras Vinculadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {projects.map(project => (
                  <div key={project.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={project.id}
                      checked={formData.obras_vinculadas.includes(project.id)}
                      onCheckedChange={() => toggleProject(project.id)}
                    />
                    <label htmlFor={project.id} className="text-sm cursor-pointer">
                      {project.nome}
                    </label>
                  </div>
                ))}
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
              documents={formData.documentos}
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
              placeholder="Informações adicionais sobre o cliente..."
            />
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(createPageUrl('Clients'))}
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
              isEditing ? 'Salvar Alterações' : 'Cadastrar Cliente'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}