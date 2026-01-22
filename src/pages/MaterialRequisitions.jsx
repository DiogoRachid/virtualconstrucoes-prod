import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileInput, Plus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EmptyState from '@/components/ui/EmptyState';

export default function MaterialRequisitionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ numero_pedido: '', obra_id: '', total_itens: 0, valor_total: 0, status: 'rascunho' });
  const queryClient = useQueryClient();

  const { data: requisitions = [] } = useQuery({
    queryKey: ['materialRequisitions'],
    queryFn: () => base44.entities.MaterialRequisition?.list?.() || Promise.resolve([])
  });

  const { data: works = [] } = useQuery({
    queryKey: ['works'],
    queryFn: () => base44.entities.Project.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MaterialRequisition.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialRequisitions'] });
      setShowForm(false);
      setFormData({ numero_pedido: '', obra_id: '', total_itens: 0, valor_total: 0, status: 'rascunho' });
    }
  });

  const handleCreateRequisition = async () => {
    if (!formData.numero_pedido || !formData.obra_id) return;
    const selectedWork = works.find(w => w.id === formData.obra_id);
    createMutation.mutate({
      ...formData,
      data_pedido: new Date().toISOString().split('T')[0],
      obra_nome: selectedWork?.nome
    });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Pedidos de Materiais"
        subtitle="Gerencie pedidos de materiais para as obras"
        icon={FileInput}
        actionLabel="Novo Pedido"
        onAction={() => setShowForm(true)}
      />

      {showForm && (
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-base">Novo Pedido de Material</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero">Número do Pedido</Label>
                <Input
                  id="numero"
                  placeholder="Ex: PED-001"
                  value={formData.numero_pedido}
                  onChange={(e) => setFormData({ ...formData, numero_pedido: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="obra">Obra</Label>
                <Select value={formData.obra_id} onValueChange={(value) => setFormData({ ...formData, obra_id: value })}>
                  <SelectTrigger id="obra">
                    <SelectValue placeholder="Selecione a obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {works.map(work => (
                      <SelectItem key={work.id} value={work.id}>
                        {work.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleCreateRequisition}
                disabled={!formData.numero_pedido || !formData.obra_id || createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMutation.isPending ? 'Salvando...' : 'Criar Pedido'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ numero_pedido: '', obra_id: '', total_itens: 0, valor_total: 0, status: 'rascunho' });
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {requisitions.length === 0 && !showForm ? (
        <EmptyState
          icon={FileInput}
          title="Nenhum pedido registrado"
          description="Crie um novo pedido de material para começar"
          actionLabel="Novo Pedido"
          onAction={() => setShowForm(true)}
        />
      ) : requisitions.length > 0 && (
        <div className="grid gap-4">
          {requisitions.map((req) => (
            <Card key={req.id}>
              <CardHeader>
                <CardTitle className="text-base">{req.numero_pedido}</CardTitle>
                <p className="text-sm text-slate-600 mt-1">{req.obra_nome}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Data</p>
                    <p className="font-medium">{req.data_pedido}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Itens</p>
                    <p className="font-medium">{req.total_itens}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Status</p>
                    <p className="font-medium capitalize">{req.status}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Valor Total</p>
                    <p className="font-medium">R$ {req.valor_total.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}