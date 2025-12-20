import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { PieChart, Loader2 } from 'lucide-react';
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

export default function CostCenterForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const centerId = urlParams.get('id');
  const isEdit = !!centerId;

  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    tipo: 'outros',
    descricao: '',
    orcamento_mensal: '',
    status: 'ativo'
  });

  const { data: center, isLoading, error } = useQuery({
    queryKey: ['costCenter', centerId],
    queryFn: async () => {
      if (!centerId) return null;
      const allCenters = await base44.entities.CostCenter.list();
      const found = allCenters.find(c => c.id === centerId);
      console.log('Centro de custo encontrado:', found);
      return found;
    },
    enabled: isEdit,
    retry: false
  });

  useEffect(() => {
    if (center) {
      setFormData({
        nome: center.nome || '',
        codigo: center.codigo || '',
        tipo: center.tipo || 'outros',
        descricao: center.descricao || '',
        orcamento_mensal: center.orcamento_mensal || '',
        status: center.status || 'ativo'
      });
    }
  }, [center]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        orcamento_mensal: data.orcamento_mensal ? parseFloat(data.orcamento_mensal) : null
      };
      if (isEdit) {
        return base44.entities.CostCenter.update(centerId, payload);
      }
      return base44.entities.CostCenter.create(payload);
    },
    onSuccess: () => {
      window.location.href = createPageUrl('CostCenters');
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

  if (isEdit && !isLoading && !center) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-600">Centro de custo não encontrado</p>
          <Button onClick={() => window.location.href = createPageUrl('CostCenters')} className="mt-4">
            Voltar para Centros de Custo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
        subtitle={isEdit ? 'Atualize os dados do centro de custo' : 'Preencha os dados do novo centro de custo'}
        icon={PieChart}
        backUrl={createPageUrl('CostCenters')}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados do Centro de Custo</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  value={formData.codigo}
                  onChange={(e) => handleChange('codigo', e.target.value)}
                  placeholder="Ex: CC001"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="tipo">Tipo *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => handleChange('tipo', value)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrativo">Administrativo</SelectItem>
                    <SelectItem value="obras">Obras</SelectItem>
                    <SelectItem value="rh">Recursos Humanos</SelectItem>
                    <SelectItem value="logistica">Logística</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="orcamento_mensal">Orçamento Mensal</Label>
                <Input
                  id="orcamento_mensal"
                  type="number"
                  step="0.01"
                  value={formData.orcamento_mensal}
                  onChange={(e) => handleChange('orcamento_mensal', e.target.value)}
                  placeholder="0,00"
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

              <div className="md:col-span-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => handleChange('descricao', e.target.value)}
                  rows={3}
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Salvar Alterações' : 'Cadastrar Centro de Custo'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('CostCenters')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}