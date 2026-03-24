import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Gift, Plus, MoreVertical, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
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
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';

const tipoLabels = {
  vale_transporte: 'Vale Transporte',
  vale_alimentacao: 'Vale Alimentação',
  vale_refeicao: 'Vale Refeição',
  vale_compras: 'Vale Compras',
  cafe_manha: 'Café da Manhã',
  assistencia_medica: 'Assistência Médica',
  assistencia_odontologica: 'Assistência Odontológica',
  seguro_vida: 'Seguro de Vida',
  auxilio_creche: 'Auxílio Creche',
  outro: 'Outro'
};

const regraLabels = {
  fixo: 'Fixo',
  proporcional_faltas: 'Proporcional (desconta faltas — base 30 dias)',
  por_dias_uteis: 'Por presença (dias úteis do mês)'
};

export default function Benefits() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'outro',
    valor: '',
    descricao: '',
    status: 'ativo'
  });
  const queryClient = useQueryClient();

  const { data: benefits = [], isLoading } = useQuery({
    queryKey: ['benefits'],
    queryFn: () => base44.entities.Benefit.list('-created_date')
  });

  const { data: employeeBenefits = [] } = useQuery({
    queryKey: ['employeeBenefits'],
    queryFn: () => base44.entities.EmployeeBenefit.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, valor: data.valor ? parseFloat(data.valor) : null };
      return editItem
        ? base44.entities.Benefit.update(editItem.id, payload)
        : base44.entities.Benefit.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
      setShowForm(false);
      setEditItem(null);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Benefit.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefits'] });
      setDeleteItem(null);
    }
  });

  const resetForm = () => {
    setFormData({ nome: '', tipo: 'outro', valor: '', descricao: '', status: 'ativo' });
  };

  const handleEdit = (benefit) => {
    setEditItem(benefit);
    setFormData({ ...benefit, valor: benefit.valor || '' });
    setShowForm(true);
  };

  const getBeneficiaryCount = (benefitId) => {
    return employeeBenefits.filter(eb => eb.beneficio_id === benefitId && eb.status === 'ativo').length;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benefícios"
        subtitle="Gestão de benefícios oferecidos"
        icon={Gift}
        actionLabel="Novo Benefício"
        onAction={() => { resetForm(); setEditItem(null); setShowForm(true); }}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">Carregando...</div>
      ) : benefits.length === 0 ? (
        <Card>
          <EmptyState
            icon={Gift}
            title="Nenhum benefício cadastrado"
            description="Cadastre benefícios para oferecer aos colaboradores."
            actionLabel="Novo Benefício"
            onAction={() => setShowForm(true)}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map(benefit => (
            <Card key={benefit.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">{benefit.nome}</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">{tipoLabels[benefit.tipo]}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(benefit)}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to={createPageUrl(`BenefitAssignment?id=${benefit.id}`)}>
                        <Users className="h-4 w-4 mr-2" /> Vincular Colaboradores
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-red-600"
                      onClick={() => setDeleteItem(benefit)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  {benefit.valor ? (
                    <p className="text-lg font-semibold text-emerald-600">
                      R$ {benefit.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  ) : (
                    <p className="text-slate-500">-</p>
                  )}
                  <StatusBadge status={benefit.status} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Users className="h-4 w-4" />
                  <span>{getBeneficiaryCount(benefit.id)} beneficiário(s)</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditItem(null); } else setShowForm(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Benefício' : 'Novo Benefício'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={formData.tipo} onValueChange={(v) => setFormData(prev => ({ ...prev, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(tipoLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.valor}
                onChange={(e) => setFormData(prev => ({ ...prev, valor: e.target.value }))}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancelar</Button>
            <Button 
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.nome || createMutation.isPending}
            >
              {createMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        onConfirm={() => deleteMutation.mutate(deleteItem?.id)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Benefício"
        description={`Tem certeza que deseja excluir o benefício ${deleteItem?.nome}?`}
      />
    </div>
  );
}