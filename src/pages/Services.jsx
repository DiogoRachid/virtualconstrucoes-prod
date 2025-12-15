import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2,
  Search,
  Calculator,
  Check,
  ChevronsUpDown,
  RefreshCw,
  Settings2
} from 'lucide-react';
import * as CostEngine from '@/components/logic/CostEngine';
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from 'date-fns';

export default function Services() {
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editingService, setEditingService] = useState(null);
  
  // Update Costs State
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateDataBase, setUpdateDataBase] = useState('09/2025');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState('');
  const [updateMode, setUpdateMode] = useState('VALUES_AND_DESC'); // VALUES_ONLY, VALUES_AND_DESC

  // Estado para o formulário de serviço
  const [serviceForm, setServiceForm] = useState({
    codigo: '',
    descricao: '',
    unidade: '',
    fonte: 'PROPRIA',
    data_base: '',
    observacao: ''
  });

  // Estado para as composições em edição (local, antes de salvar)
  const [compositions, setCompositions] = useState([]);
  
  // Estado para adicionar novo item na composição
  const [newItem, setNewItem] = useState({
    tipo_item: 'INSUMO', // INSUMO ou SERVICO
    item_id: '',
    quantidade: 1,
    tipo_custo: 'MATERIAL'
  });
  
  const [openCombobox, setOpenCombobox] = useState(false);

  const queryClient = useQueryClient();

  // Queries
  const { data: services = [], isLoading: loadingServices } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list()
  });

  const { data: inputs = [] } = useQuery({
    queryKey: ['inputs'],
    queryFn: () => base44.entities.Input.list()
  });

  // Filtro principal
  const filteredServices = services.filter(s => 
    !search || 
    s.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    s.codigo?.toLowerCase().includes(search.toLowerCase())
  );

  // Mutações
  const createServiceMutation = useMutation({
    mutationFn: async (data) => {
      // 1. Criar Serviço
      const newService = await base44.entities.Service.create(data.service);
      
      // 2. Criar Composições vinculadas
      if (data.compositions.length > 0) {
        await Promise.all(data.compositions.map(comp => 
          base44.entities.ServiceComposition.create({
            ...comp,
            servico_id: newService.id
          })
        ));
      }
      return newService;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowDialog(false);
      resetForm();
      toast.success('Serviço criado com sucesso!');
    }
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      // 1. Atualizar Serviço
      await base44.entities.Service.update(id, data.service);
      
      // 2. Gerenciar Composições (Estratégia: Apagar todas e recriar é mais simples para MVP, 
      // mas ideal seria diff. Vamos tentar deletar as antigas e criar as novas para garantir integridade do cálculo)
      
      // Listar atuais
      const currentComps = await base44.entities.ServiceComposition.filter({ servico_id: id });
      // Deletar atuais
      await Promise.all(currentComps.map(c => base44.entities.ServiceComposition.delete(c.id)));
      // Criar novas
      if (data.compositions.length > 0) {
        await Promise.all(data.compositions.map(comp => 
          base44.entities.ServiceComposition.create({
            ...comp,
            servico_id: id
          })
        ));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowDialog(false);
      resetForm();
      toast.success('Serviço atualizado com sucesso!');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Service.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setDeleteId(null);
      toast.success('Serviço excluído!');
    }
  });

  // Load composições ao editar
  const loadCompositions = async (serviceId) => {
    const comps = await base44.entities.ServiceComposition.filter({ servico_id: serviceId });
    setCompositions(comps);
  };

  // Update Costs Logic
  const executeUpdateCosts = async () => {
    if (!updateDataBase) {
      toast.error('Informe a data base.');
      return;
    }
    
    setIsUpdating(true);
    setUpdateProgress('Iniciando cálculos...');

    try {
      // Use CostEngine
      const result = await CostEngine.recalculateCosts(updateDataBase, updateMode);

      if (result.errors.length > 0) {
        console.warn('Erros durante cálculo:', result.errors);
        toast.warning(`${result.errors.length} erros encontrados. Verifique o console.`);
      }

      setUpdateProgress(`Aplicando ${result.serviceUpdates.length} atualizações de serviço e ${result.compUpdates.length} itens...`);
      
      await CostEngine.executeUpdates(
        { serviceUpdates: result.serviceUpdates, compUpdates: result.compUpdates },
        (processed, total) => setUpdateProgress(`Atualizando: ${processed}/${total} registros...`)
      );

      // Log
      await CostEngine.createLog({
        data: new Date().toISOString(),
        tipo_origem: 'MANUAL',
        origem_id: null,
        quantidade_servicos_afetados: result.serviceUpdates.length,
        usuario: (await base44.auth.me())?.email || 'Unknown',
        detalhes: JSON.stringify(result.stats)
      });

      toast.success(`Atualização concluída! ${result.stats.affectedServices} serviços atualizados.`);
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowUpdateDialog(false);

    } catch (e) {
      console.error(e);
      toast.error('Erro na atualização: ' + e.message);
    } finally {
      setIsUpdating(false);
      setUpdateProgress('');
    }
  };

  const handleEdit = async (service) => {
    setEditingService(service);
    setServiceForm({
      codigo: service.codigo,
      descricao: service.descricao,
      unidade: service.unidade,
      fonte: service.fonte,
      data_base: service.data_base || '',
      observacao: service.observacao
    });
    setCompositions([]); 
    await loadCompositions(service.id);
    setShowDialog(true);
  };

  const resetForm = () => {
    setEditingService(null);
    setServiceForm({
      codigo: '',
      descricao: '',
      unidade: '',
      fonte: 'PROPRIA',
      data_base: '',
      observacao: ''
    });
    setCompositions([]);
    setNewItem({ tipo_item: 'INSUMO', item_id: '', quantidade: 1, tipo_custo: 'MATERIAL' });
    setOpenCombobox(false);
  };

  // Funções de Cálculo e Composição
  const addItemToComposition = () => {
    if (!newItem.item_id) return;

    let itemData;
    let custoUnit = 0;
    let nome = '';

    if (newItem.tipo_item === 'INSUMO') {
      itemData = inputs.find(i => i.id === newItem.item_id);
      custoUnit = itemData?.valor_referencia || 0;
      nome = itemData?.descricao;
    } else {
      itemData = services.find(s => s.id === newItem.item_id);
      custoUnit = itemData?.custo_total || 0;
      nome = itemData?.descricao;
    }

    if (!itemData) return;

    const newComp = {
      tipo_item: newItem.tipo_item,
      item_id: newItem.item_id,
      item_nome: nome, // Cache visual
      unidade: itemData.unidade,
      quantidade: parseFloat(newItem.quantidade),
      custo_unitario: custoUnit,
      custo_total_item: parseFloat(newItem.quantidade) * custoUnit,
      tipo_custo: newItem.tipo_custo
    };

    setCompositions([...compositions, newComp]);
    setNewItem({ ...newItem, item_id: '', quantidade: 1 }); // Reset parcial
  };

  const removeComposition = (index) => {
    const newComps = [...compositions];
    newComps.splice(index, 1);
    setCompositions(newComps);
  };

  // Cálculo Automático dos Totais do Serviço
  const totals = compositions.reduce((acc, curr) => {
    if (curr.tipo_custo === 'MATERIAL') acc.material += curr.custo_total_item;
    else acc.mao_obra += curr.custo_total_item;
    return acc;
  }, { material: 0, mao_obra: 0 });

  const custoTotalCalculado = totals.material + totals.mao_obra;

  const handleSave = () => {
    const serviceData = {
      ...serviceForm,
      custo_material: totals.material,
      custo_mao_obra: totals.mao_obra,
      custo_total: custoTotalCalculado
    };

    const payload = {
      service: serviceData,
      compositions: compositions
    };

    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, data: payload });
    } else {
      createServiceMutation.mutate(payload);
    }
  };

  // Tabela Principal
  const columns = [
    { header: 'Código', accessor: 'codigo', className: 'w-24' },
    { header: 'Descrição', accessor: 'descricao' },
    { header: 'Unidade', accessor: 'unidade', className: 'w-16' },
    { header: 'Data Base', accessor: 'data_base', className: 'w-24 text-xs' },
    { 
      header: 'Material',
      accessor: 'custo_material',
      className: 'text-right',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.custo_material || 0)
    },
    { 
      header: 'Mão de Obra', 
      accessor: 'custo_mao_obra',
      className: 'text-right',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.custo_mao_obra || 0)
    },
    { 
      header: 'Total', 
      accessor: 'custo_total',
      className: 'text-right font-bold',
      render: (row) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.custo_total)
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
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`ServiceEditor?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar / Composição
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
             <Layers className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Serviços e Composições</h1>
            <p className="text-slate-500">Banco de serviços para orçamentos</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={() => setShowUpdateDialog(true)}>
             <RefreshCw className="h-4 w-4 mr-2" />
             Atualizar Custos
           </Button>
           <Button onClick={() => window.location.href = createPageUrl('ServiceEditor')} className="bg-blue-600 hover:bg-blue-700">
             <Plus className="h-4 w-4 mr-2" />
             Novo Serviço
           </Button>
        </div>
      </div>

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar serviço..."
      />

      <DataTable
        columns={columns}
        data={filteredServices}
        isLoading={loadingServices}
        emptyComponent={
          <EmptyState
            icon={Layers}
            title="Nenhum serviço cadastrado"
            description="Crie composições de serviços utilizando insumos."
            actionLabel="Novo Serviço"
            onAction={() => window.location.href = createPageUrl('ServiceEditor')}
          />
        }
      />

      {/* Dialog de Edição/Criação (Largo) */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Dados Básicos */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border">
              <div className="md:col-span-1">
                <Label>Código *</Label>
                <Input
                  value={serviceForm.codigo}
                  onChange={(e) => setServiceForm(prev => ({ ...prev, codigo: e.target.value }))}
                  placeholder="Ex: SER-001"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Descrição *</Label>
                <Input
                  value={serviceForm.descricao}
                  onChange={(e) => setServiceForm(prev => ({ ...prev, descricao: e.target.value }))}
                />
              </div>
              <div className="md:col-span-1">
                <Label>Unidade *</Label>
                <Input
                  value={serviceForm.unidade}
                  onChange={(e) => setServiceForm(prev => ({ ...prev, unidade: e.target.value }))}
                  placeholder="Ex: M2"
                />
              </div>
              <div className="md:col-span-1">
                <Label>Data Base</Label>
                <Input
                  value={serviceForm.data_base}
                  onChange={(e) => setServiceForm(prev => ({ ...prev, data_base: e.target.value }))}
                  placeholder="MM/AAAA"
                />
              </div>
            </div>

            {/* Seção de Composição */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Composição de Custos
                </h3>
                <div className="text-right text-sm">
                  <span className="text-slate-500 mr-3">Material: <b>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.material)}</b></span>
                  <span className="text-slate-500 mr-3">Mão de Obra: <b>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.mao_obra)}</b></span>
                  <span className="text-lg font-bold text-blue-700">Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(custoTotalCalculado)}</span>
                </div>
              </div>

              {/* Adicionar Item */}
              <div className="flex flex-wrap gap-2 items-end mb-4 p-3 border rounded-lg bg-white">
                <div className="w-32">
                  <Label>Tipo</Label>
                  <Select
                    value={newItem.tipo_item}
                    onValueChange={(v) => setNewItem(prev => ({ ...prev, tipo_item: v, item_id: '' }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INSUMO">Insumo</SelectItem>
                      <SelectItem value="SERVICO">Serviço</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 min-w-[300px]">
                  <Label>Item</Label>
                  <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className="w-full justify-between font-normal truncate"
                      >
                        {newItem.item_id
                          ? (newItem.tipo_item === 'INSUMO' 
                              ? inputs.find((i) => i.id === newItem.item_id)
                              : services.find((s) => s.id === newItem.item_id)
                            )?.descricao || "Selecione o item..."
                          : "Selecione o item..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar por nome ou código..." />
                        <CommandList>
                          <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                          <CommandGroup>
                            {newItem.tipo_item === 'INSUMO'
                              ? inputs.map((item) => (
                                  <CommandItem
                                    key={item.id}
                                    value={`${item.codigo} ${item.descricao}`}
                                    onSelect={() => {
                                      setNewItem(prev => ({ ...prev, item_id: item.id }));
                                      setOpenCombobox(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        newItem.item_id === item.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span className="font-medium">{item.descricao}</span>
                                      <span className="text-xs text-slate-500">
                                        {item.codigo} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor_referencia)}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))
                              : services
                                  .filter(s => s.id !== editingService?.id)
                                  .map((item) => (
                                    <CommandItem
                                      key={item.id}
                                      value={`${item.codigo} ${item.descricao}`}
                                      onSelect={() => {
                                        setNewItem(prev => ({ ...prev, item_id: item.id }));
                                        setOpenCombobox(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          newItem.item_id === item.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <div className="flex flex-col">
                                        <span className="font-medium">{item.descricao}</span>
                                        <span className="text-xs text-slate-500">
                                          {item.codigo} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_total)}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="w-24">
                  <Label>Qtd.</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={newItem.quantidade}
                    onChange={(e) => setNewItem(prev => ({ ...prev, quantidade: e.target.value }))}
                  />
                </div>

                <div className="w-32">
                  <Label>Classe Custo</Label>
                  <Select
                    value={newItem.tipo_custo}
                    onValueChange={(v) => setNewItem(prev => ({ ...prev, tipo_custo: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MATERIAL">Material</SelectItem>
                      <SelectItem value="MAO_DE_OBRA">Mão de Obra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={addItemToComposition} disabled={!newItem.item_id}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Lista de Itens */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Unid.</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Unitário</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compositions.map((comp, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs font-medium text-slate-500">{comp.tipo_item}</TableCell>
                        <TableCell>{comp.item_nome}</TableCell>
                        <TableCell className="text-xs text-slate-500">{comp.unidade}</TableCell>
                        <TableCell className="text-right">{comp.quantidade}</TableCell>
                        <TableCell className="text-right">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comp.custo_unitario)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comp.custo_total_item)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={`px-2 py-1 rounded-full ${comp.tipo_custo === 'MATERIAL' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {comp.tipo_custo === 'MATERIAL' ? 'Mat' : 'MO'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeComposition(idx)} className="h-6 w-6 text-red-500">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {compositions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                          Nenhum item na composição. Adicione insumos acima.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={createServiceMutation.isPending || updateServiceMutation.isPending || !serviceForm.codigo || !serviceForm.descricao}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {(createServiceMutation.isPending || updateServiceMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Serviço
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Serviço"
        description="Tem certeza que deseja excluir este serviço?"
      />

      {/* Update Costs Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Custos e Composições</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-amber-800 text-sm">
                <p className="font-bold flex items-center gap-2">
                   Atenção
                </p>
                <p className="mt-1">
                   Esta ação irá recalcular recursivamente o custo total de TODOS os serviços e suas composições (insumos e sub-serviços).
                   A data base dos serviços será atualizada para a data informada abaixo.
                </p>
             </div>

             <div>
               <Label>Nova Data Base (MM/AAAA)</Label>
               <Input 
                 value={updateDataBase} 
                 onChange={e => setUpdateDataBase(e.target.value)} 
                 placeholder="Ex: 09/2025" 
               />
             </div>

             <div className="space-y-3 pt-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                   <Settings2 className="h-4 w-4" /> Opções de Atualização
                </Label>
                
                <div className="flex items-center space-x-2">
                   <Checkbox 
                     id="updateMode" 
                     checked={updateMode === 'VALUES_AND_DESC'} 
                     onCheckedChange={(checked) => setUpdateMode(checked ? 'VALUES_AND_DESC' : 'VALUES_ONLY')} 
                   />
                   <Label htmlFor="updateMode" className="font-normal">
                     Atualizar também Descrições e Unidades (Snapshot)
                   </Label>
                </div>
                <p className="text-xs text-slate-500 pl-6">
                   Se marcado, as descrições nas composições serão sobrescritas com as descrições atuais dos insumos/serviços originais.
                </p>
             </div>

             {isUpdating && (
               <div className="bg-slate-50 p-4 rounded-lg flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-2" />
                  <p className="text-sm font-medium text-blue-800">{updateProgress}</p>
               </div>
             )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(false)} disabled={isUpdating}>Cancelar</Button>
            <Button onClick={executeUpdateCosts} disabled={isUpdating || !updateDataBase} className="bg-blue-600">
               {isUpdating ? 'Atualizando...' : 'Confirmar Atualização'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}