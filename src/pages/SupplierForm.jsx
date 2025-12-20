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
import DocumentUploader from '../components/shared/DocumentUploader';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TIPOS_SERVICO = [
  'Materiais de Construção',
  'Serviços de Engenharia',
  'Equipamentos',
  'Transporte',
  'Consultoria',
  'Mão de Obra',
  'Fornecimento de Concreto',
  'Locação de Equipamentos',
  'Outros'
];

export default function SupplierForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const urlParams = new URLSearchParams(window.location.search);
  const supplierId = urlParams.get('id');
  const isEditing = !!supplierId;

  const [formData, setFormData] = useState({
    razao_social: '',
    cnpj: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    status: 'ativo',
    tipo_servico: '',
    documentos: [],
    observacoes: ''
  });

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: async () => {
      if (!supplierId) return null;
      const res = await base44.entities.Supplier.filter({ id: supplierId });
      return res && res.length > 0 ? res[0] : null;
    },
    enabled: isEditing
  });

  useEffect(() => {
    if (isEditing && supplier) {
      setFormData({
        razao_social: supplier.razao_social || '',
        cnpj: supplier.cnpj || '',
        telefone: supplier.telefone || '',
        email: supplier.email || '',
        endereco: supplier.endereco || '',
        cidade: supplier.cidade || '',
        estado: supplier.estado || '',
        cep: supplier.cep || '',
        status: supplier.status || 'ativo',
        tipo_servico: supplier.tipo_servico || '',
        documentos: supplier.documentos || [],
        observacoes: supplier.observacoes || ''
      });
    }
  }, [isEditing, supplier]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (isEditing) {
        return await base44.entities.Supplier.update(supplierId, data);
      } else {
        return await base44.entities.Supplier.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(isEditing ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!');
      navigate(createPageUrl('Suppliers'));
    },
    onError: (error) => {
      toast.error('Erro ao salvar fornecedor');
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
        title={isEditing ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        subtitle={isEditing ? 'Atualize as informações do fornecedor' : 'Cadastre um novo fornecedor no sistema'}
        backUrl={createPageUrl('Suppliers')}
        icon={Building2}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados Principais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Razão Social *</Label>
                <Input
                  value={formData.razao_social}
                  onChange={(e) => handleChange('razao_social', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>CNPJ *</Label>
                <Input
                  value={formData.cnpj}
                  onChange={(e) => handleChange('cnpj', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Serviço *</Label>
                <Select value={formData.tipo_servico} onValueChange={(value) => handleChange('tipo_servico', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_SERVICO.map(tipo => (
                      <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              placeholder="Informações adicionais sobre o fornecedor..."
            />
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(createPageUrl('Suppliers'))}
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
              isEditing ? 'Salvar Alterações' : 'Cadastrar Fornecedor'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}