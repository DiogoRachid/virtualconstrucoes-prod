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
import { PieChart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CostCenterForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const urlParams = new URLSearchParams(window.location.search);
  const costCenterId = urlParams.get('id');
  const isEditing = !!costCenterId;

  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    tipo: 'outros',
    descricao: '',
    orcamento_mensal: '',
    status: 'ativo'
  });

  const { data: costCenter, isLoading } = useQuery({
    queryKey: ['costCenter', costCenterId],
    queryFn: async () => {
      if (!costCenterId) return null;
      const res = await base44.entities.CostCenter.filter({ id: costCenterId });
      return res && res.length > 0 ? res[0] : null;
    },
    enabled: isEditing
  });

  useEffect(() => {
    if (isEditing && costCenter) {
      setFormData({
        nome: costCenter.nome || '',
        codigo: costCenter.codigo || '',
        tipo: costCenter.tipo || 'outros',
        descricao: costCenter.descricao || '',
        orcamento_mensal: costCenter.orcamento_mensal || '',
        status: costCenter.status || 'ativo'
      });
    }
  }, [isEditing, costCenter]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const submitData = {
        ...data,
        orcamento_mensal: data.orcamento_mensal ? parseFloat(data.orcamento_mensal) : 0
      };

      if (isEditing) {
        return await base44.entities.CostCenter.update(costCenterId, submitData);
      } else {
        return await base44.entities.CostCenter.create(submitData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costCenters'] });
      toast.success(isEditing ? 'Centro de custo atualizado!' : 'Centro de custo cadastrado!');
      navigate(createPageUrl('CostCenters'));
    },
    onError: (error) => {
      toast.error('Erro ao salvar centro de custo');
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
        title={isEditing ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
        subtitle={isEditing ? 'Atualize as informações do centro de custo' : 'Cadastre um novo centro de custo'}
        backUrl={createPageUrl('CostCenters')}
        icon={PieChart}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados do Centro de Custo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                placeholder="Ex: Obras - Projeto X"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Código</Label>
                <Input
                  value={formData.codigo}
                  onChange={(e) => handleChange('codigo', e.target.value)}
                  placeholder="Ex: CC-001"
                />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={formData.tipo} onValueChange={(value) => handleChange('tipo', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrativo">Administrativo</SelectItem>
                    <SelectItem value="obras">Obras</SelectItem>
                    <SelectItem value="rh">RH</SelectItem>
                    <SelectItem value="logistica">Logística</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Orçamento Mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.orcamento_mensal}
                  onChange={(e) => handleChange('orcamento_mensal', e.target.value)}
                />
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

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => handleChange('descricao', e.target.value)}
                rows={4}
                placeholder="Descrição do centro de custo..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(createPageUrl('CostCenters'))}
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
              isEditing ? 'Salvar Alterações' : 'Cadastrar Centro de Custo'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}