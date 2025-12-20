import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Building2, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DocumentUploader from '@/components/shared/DocumentUploader';
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

const TIPOS_SERVICO = [
  'Material de Construção',
  'Mão de Obra',
  'Equipamentos',
  'Engenharia',
  'Arquitetura',
  'Elétrica',
  'Hidráulica',
  'Pintura',
  'Acabamento',
  'Transporte',
  'Consultoria',
  'Outros'
];

export default function SupplierForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const supplierId = urlParams.get('id');
  const isEdit = !!supplierId;

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

  const { data: supplier, isLoading, error } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: async () => {
      if (!supplierId) return null;
      const allSuppliers = await base44.entities.Supplier.list();
      const found = allSuppliers.find(s => s.id === supplierId);
      console.log('Fornecedor encontrado:', found);
      return found;
    },
    enabled: isEdit,
    retry: false
  });

  useEffect(() => {
    if (supplier) {
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
  }, [supplier]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (isEdit) {
        return base44.entities.Supplier.update(supplierId, data);
      }
      return base44.entities.Supplier.create(data);
    },
    onSuccess: () => {
      window.location.href = createPageUrl('Suppliers');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isEdit && !isLoading && !supplier) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-600">Fornecedor não encontrado</p>
          <Button onClick={() => window.location.href = createPageUrl('Suppliers')} className="mt-4">
            Voltar para Fornecedores
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        subtitle={isEdit ? 'Atualize os dados do fornecedor' : 'Preencha os dados do novo fornecedor'}
        icon={Building2}
        backUrl={createPageUrl('Suppliers')}
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
                <Label htmlFor="razao_social">Razão Social *</Label>
                <Input
                  id="razao_social"
                  value={formData.razao_social}
                  onChange={(e) => handleChange('razao_social', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input
                  id="cnpj"
                  value={formData.cnpj}
                  onChange={(e) => handleChange('cnpj', formatCNPJ(e.target.value))}
                  required
                  placeholder="00.000.000/0000-00"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="tipo_servico">Tipo de Serviço *</Label>
                <Select
                  value={formData.tipo_servico}
                  onValueChange={(value) => handleChange('tipo_servico', value)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_SERVICO.map(tipo => (
                      <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                placeholder="Informações adicionais sobre o fornecedor..."
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
              {isEdit ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('Suppliers')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}