import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Settings, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function BudgetStageEditor({ open, onClose }) {
  const queryClient = useQueryClient();
  const [newStageName, setNewStageName] = useState('');
  const [editingStages, setEditingStages] = useState([]);

  const { data: stages = [], isLoading } = useQuery({
    queryKey: ['budgetStages'],
    queryFn: () => base44.entities.BudgetStage.list(),
    onSuccess: (data) => {
      setEditingStages(data.sort((a, b) => a.ordem - b.ordem));
    }
  });

  React.useEffect(() => {
    if (stages.length > 0) {
      setEditingStages([...stages].sort((a, b) => a.ordem - b.ordem));
    }
  }, [stages]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BudgetStage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['budgetStages']);
      toast.success('Etapa adicionada');
      setNewStageName('');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BudgetStage.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['budgetStages']);
      toast.success('Etapa atualizada');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BudgetStage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['budgetStages']);
      toast.success('Etapa removida');
    }
  });

  const handleAdd = () => {
    if (!newStageName.trim()) return;
    createMutation.mutate({
      nome: newStageName,
      ordem: stages.length + 1,
      cor: `#${Math.floor(Math.random()*16777215).toString(16)}`
    });
  };

  const handleUpdateStage = (id, field, value) => {
    const newStages = editingStages.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    );
    setEditingStages(newStages);
  };

  const handleSaveAll = async () => {
    try {
      for (const stage of editingStages) {
        if (stage.id) {
          await updateMutation.mutateAsync({
            id: stage.id,
            data: { nome: stage.nome, ordem: stage.ordem, descricao: stage.descricao || '', cor: stage.cor }
          });
        }
      }
      toast.success('Todas as etapas foram salvas');
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar etapas');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurar Etapas Padrão
          </DialogTitle>
          <DialogDescription>
            Gerencie as etapas padrão que serão usadas na criação de novos orçamentos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add New Stage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Adicionar Nova Etapa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome da etapa..."
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                <Button onClick={handleAdd} disabled={!newStageName.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Existing Stages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Etapas Cadastradas ({editingStages.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {editingStages.map((stage, index) => (
                  <div key={stage.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                    <span className="text-xs text-slate-500 w-8">{stage.ordem}</span>
                    <Input
                      value={stage.nome}
                      onChange={(e) => handleUpdateStage(stage.id, 'nome', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={stage.ordem}
                      onChange={(e) => handleUpdateStage(stage.id, 'ordem', parseInt(e.target.value) || 1)}
                      className="w-20"
                      placeholder="Ordem"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Remover etapa "${stage.nome}"?`)) {
                          deleteMutation.mutate(stage.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {editingStages.length === 0 && (
                  <p className="text-center text-slate-400 py-4">Nenhuma etapa cadastrada</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSaveAll} className="bg-blue-600 hover:bg-blue-700">
              <Save className="h-4 w-4 mr-2" />
              Salvar Alterações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}