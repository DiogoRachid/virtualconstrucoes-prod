import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Users, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DocumentUploader from '@/components/shared/DocumentUploader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClientForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('id');
  const isEdit = !!clientId;

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

  const { data: client, isLoading, error } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const allClients = await base44.entities.Client.list();
      const found = allClients.find(c => c.id === clientId);
      console.log('Cliente encontrado:', found);
      return found;
    },
    enabled: isEdit,
    retry: false
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  useEffect(() => {
    if (client) {
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
  }, [client]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (isEdit) {
        return base44.entities.Client.update(clientId, data);
      }
      return base44.entities.Client.create(data);
    },
    onSuccess: () => {
      window.location.href = createPageUrl('Clients');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatCPF = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);
  };

  const formatCNPJ = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18);
  };

  const handleDocumentoChange = (value) => {
    const formatted = formData.tipo_documento === 'CPF' 
      ? formatCPF(value) 
      : formatCNPJ(value);
    handleChange('documento', formatted);
  };

  const toggleObra = (obraId) => {
    setFormData(prev => ({
      ...prev,
      obras_vinculadas: prev.obras_vinculadas.includes(obraId)
        ? prev.obras_vinculadas.filter(id => id !== obraId)
        : [...prev.obras_vinculadas, obraId]
    }));
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isEdit && !isLoading && !client) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-600">Cliente não encontrado</p>
          <Button onClick={() => window.location.href = createPageUrl('Clients')} className="mt-4">
            Voltar para Clientes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar Cliente' : 'Novo Cliente'}
        subtitle={isEdit ? 'Atualize os dados do cliente' : 'Preencha os dados do novo cliente'}
        icon={Users}
        backUrl={createPageUrl('Clients')}
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
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="tipo_documento">Tipo de Documento *</Label>
                <Select
                  value={formData.tipo_documento}
                  onValueChange={(value) => {
                    handleChange('tipo_documento', value);
                    handleChange('documento', '');
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">CPF</SelectItem>
                    <SelectItem value="CNPJ">CNPJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="documento">{formData.tipo_documento} *</Label>
                <Input
                  id="documento"
                  value={formData.documento}
                  onChange={(e) => handleDocumentoChange(e.target.value)}
                  required
                  placeholder={formData.tipo_documento === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
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
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Contato */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contato</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => handleChange('telefone', e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Endereço</CardTitle>
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

              <div className="grid grid-cols-2 gap-4">
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

                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={formData.cep}
                    onChange={(e) => handleChange('cep', e.target.value)}
                    placeholder="00000-000"
                    className="mt-1.5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Obras Vinculadas */}
          {projects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Obras Vinculadas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map(project => (
                    <div 
                      key={project.id}
                      className="flex items-center space-x-3 p-3 border border-slate-200 rounded-xl"
                    >
                      <Checkbox
                        id={project.id}
                        checked={formData.obras_vinculadas.includes(project.id)}
                        onCheckedChange={() => toggleObra(project.id)}
                      />
                      <label 
                        htmlFor={project.id}
                        className="text-sm font-medium cursor-pointer flex-1"
                      >
                        {project.nome}
                      </label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documentos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documentos</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUploader
                documents={formData.documentos}
                onChange={(docs) => handleChange('documentos', docs)}
              />
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observações</CardTitle>
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

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('Clients')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}