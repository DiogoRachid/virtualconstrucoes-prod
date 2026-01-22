import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileInput, Plus, Edit2, Trash2 } from 'lucide-react';
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
import RequisitionItemForm from '@/components/requisitions/RequisitionItemForm';

export default function MaterialRequisitionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ numero_pedido: '', obra_id: '', status: 'rascunho' });
  const [items, setItems] = useState([]);
  const [editingRequisition, setEditingRequisition] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const queryClient = useQueryClient();

  const { data: requisitions = [] } = useQuery({
    queryKey: ['materialRequisitions'],
    queryFn: () => base44.entities.MaterialRequisition?.list?.() || Promise.resolve([])
  });

  const { data: requisitionItems = [] } = useQuery({
    queryKey: ['requisitionItems', editingRequisition?.id],
    queryFn: () => editingRequisition 
      ? base44.entities.MaterialRequisitionItem.filter({ requisicao_id: editingRequisition.id })
      : Promise.resolve([]),
    enabled: !!editingRequisition
  });

  const { data: works = [] } = useQuery({
    queryKey: ['works'],
    queryFn: () => base44.entities.Project.list()
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingRequisition) {
        await base44.entities.MaterialRequisition.update(editingRequisition.id, data.requisition);
        
        // Deletar items antigos
        for (const item of requisitionItems) {
          await base44.entities.MaterialRequisitionItem.delete(item.id);
        }
        
        // Criar novos items
        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            await base44.entities.MaterialRequisitionItem.create({
              ...item,
              requisicao_id: editingRequisition.id
            });
          }
        }
      } else {
        const requisition = await base44.entities.MaterialRequisition.create(data.requisition);
        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            await base44.entities.MaterialRequisitionItem.create({
              ...item,
              requisicao_id: requisition.id
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialRequisitions'] });
      queryClient.invalidateQueries({ queryKey: ['requisitionItems'] });
      setShowForm(false);
      setEditingRequisition(null);
      setFormData({ numero_pedido: '', obra_id: '', status: 'rascunho' });
      setItems([]);
      setEditingItemIndex(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MaterialRequisition.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialRequisitions'] });
    }
  });

  const handleSaveRequisition = async () => {
    if (!formData.numero_pedido || !formData.obra_id) return;
    const selectedWork = works.find(w => w.id === formData.obra_id);
    saveMutation.mutate({
      requisition: {
        ...formData,
        data_pedido: editingRequisition?.data_pedido || new Date().toISOString().split('T')[0],
        obra_nome: selectedWork?.nome,
        total_itens: items.length,
        valor_total: 0
      },
      items
    });
  };

  const openEdit = (requisition) => {
    setEditingRequisition(requisition);
    setFormData({
      numero_pedido: requisition.numero_pedido,
      obra_id: requisition.obra_id,
      status: requisition.status
    });
    setItems(requisitionItems.map(i => ({
      insumo_nome: i.insumo_nome,
      unidade: i.unidade,
      quantidade_solicitada: i.quantidade_solicitada
    })));
    setShowForm(true);
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
        <div className="space-y-4 mb-6">
          <Card className="bg-blue-50 border-blue-200">
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
            </CardContent>
          </Card>

          <RequisitionItemForm
            items={items}
            editingIndex={editingItemIndex}
            onAddItem={(item) => setItems([...items, item])}
            onEditItem={(idx, item) => {
              setItems(items.map((i, index) => index === idx ? { ...item } : i));
              setEditingItemIndex(null);
            }}
            onRemoveItem={(idx) => {
              setItems(items.filter((_, i) => i !== idx));
              setEditingItemIndex(null);
            }}
          />

          <div className="flex gap-3">
            <Button
              onClick={handleSaveRequisition}
              disabled={!formData.numero_pedido || !formData.obra_id || saveMutation.isPending || items.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? 'Salvando...' : editingRequisition ? 'Atualizar Pedido' : 'Criar Pedido'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingRequisition(null);
                setFormData({ numero_pedido: '', obra_id: '', status: 'rascunho' });
                setItems([]);
                setEditingItemIndex(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
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
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">{req.numero_pedido}</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">{req.obra_nome}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(req)}
                      className="text-blue-600 hover:text-blue-700 transition"
                    >
                      <Edit2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(req.id)}
                      className="text-red-600 hover:text-red-700 transition"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
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
                    <p className="text-slate-600">Data Entrega Prevista</p>
                    <p className="font-medium">{req.data_entrega_prevista || '-'}</p>
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