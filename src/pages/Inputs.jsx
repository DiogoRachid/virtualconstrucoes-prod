import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format } from 'date-fns';

export default function Inputs() {
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    codigo: '',
    descricao: '',
    unidade: '',
    valor_referencia: '',
    fonte: 'SINAPI'
  });

  const { data: inputs = [], isLoading } = useQuery({
    queryKey: ['inputs'],
    queryFn: () => base44.entities.Input.list() // TODO: Implement server-side pagination/filtering if needed later
  });

  const filteredData = inputs.filter(item => 
    !search || 
    item.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    item.codigo?.toLowerCase().includes(search.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Input.create({
      ...data,
      valor_referencia: parseFloat(data.valor_referencia),
      data_atualizacao: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inputs'] });
      setShowDialog(false);
      resetForm();
      toast.success('Insumo criado com sucesso!');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Input.update(id, {
      ...data,
      valor_referencia: parseFloat(data.valor_referencia),
      data_atualizacao: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inputs'] });
      setShowDialog(false);
      resetForm();
      toast.success('Insumo atualizado com sucesso!');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Input.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inputs'] });
      setDeleteId(null);
      toast.success('Insumo excluído com sucesso!');
    }
  });

  const resetForm = () => {
    setFormData({
      codigo: '',
      descricao: '',
      unidade: '',
      valor_referencia: '',
      fonte: 'SINAPI',
      data_base: '09/2025'
    });
    setEditingItem(null);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      codigo: item.codigo,
      descricao: item.descricao,
      unidade: item.unidade,
      valor_referencia: item.valor_referencia,
      fonte: item.fonte,
      data_base: item.data_base || '09/2025'
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const columns = [
    { header: 'Código', accessor: 'codigo', className: 'w-32' },
    { header: 'Descrição', accessor: 'descricao' },
    { header: 'Unidade', accessor: 'unidade', className: 'w-24' },
    { 
      header: 'Preço Ref.', 
      accessor: 'valor_referencia',
      className: 'text-right',
      cellClassName: 'text-right',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor_referencia)
    },
    { header: 'Data Base', accessor: 'data_base', className: 'w-24' },
    { header: 'Fonte', accessor: 'fonte', className: 'w-32' },
    { 
      header: 'Atualização', 
      accessor: 'data_atualizacao',
      className: 'w-32',
      render: (row) => row.data_atualizacao ? format(new Date(row.data_atualizacao), 'dd/MM/yyyy') : '-'
    },
    {
      header: '',
      className: 'w-12',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEdit(row)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteId(row.id)} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Insumos"
        subtitle="Gerenciamento de materiais e mão de obra base"
        icon={Package}
        actionLabel="Novo Insumo"
        onAction={() => { resetForm(); setShowDialog(true); }}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por código ou descrição..."
      />

      <DataTable
        columns={columns}
        data={filteredData}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={Package}
            title="Nenhum insumo cadastrado"
            description="Cadastre os insumos (materiais, mão de obra) para usar nas composições."
            actionLabel="Novo Insumo"
            onAction={() => { resetForm(); setShowDialog(true); }}
          />
        }
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Insumo' : 'Novo Insumo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Código *</Label>
                <Input
                  value={formData.codigo}
                  onChange={(e) => setFormData(prev => ({ ...prev, codigo: e.target.value }))}
                  placeholder="Ex: 0001"
                />
              </div>
              <div>
                <Label>Fonte</Label>
                <Select
                  value={formData.fonte}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, fonte: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINAPI">SINAPI</SelectItem>
                    <SelectItem value="TCPO">TCPO</SelectItem>
                    <SelectItem value="CDHU">CDHU</SelectItem>
                    <SelectItem value="OUTROS">OUTROS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
               <Label>Data Base (MM/AAAA)</Label>
               <Input
                  value={formData.data_base}
                  onChange={(e) => setFormData(prev => ({ ...prev, data_base: e.target.value }))}
                  placeholder="Ex: 09/2025"
               />
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input
                value={formData.descricao}
                onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                placeholder="Ex: CIMENTO PORTLAND CP II-32"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Unidade *</Label>
                <Input
                  value={formData.unidade}
                  onChange={(e) => setFormData(prev => ({ ...prev, unidade: e.target.value }))}
                  placeholder="Ex: KG, M3, H"
                />
              </div>
              <div>
                <Label>Preço Unitário (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_referencia}
                  onChange={(e) => setFormData(prev => ({ ...prev, valor_referencia: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={createMutation.isPending || updateMutation.isPending || !formData.codigo || !formData.descricao}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Insumo"
        description="Tem certeza que deseja excluir este insumo? Isso pode afetar composições que o utilizam."
      />
    </div>
  );
}