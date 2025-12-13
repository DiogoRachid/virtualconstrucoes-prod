import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import {
  ArrowLeft,
  Save,
  Copy,
  History,
  Plus,
  Trash2,
  AlertTriangle,
  Search,
  Check,
  ChevronsUpDown
} from 'lucide-react';
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ServiceEditor() {
  const urlParams = new URLSearchParams(window.location.search);
  const serviceId = urlParams.get('id');
  const queryClient = useQueryClient();

  const [service, setService] = useState({
    codigo: '',
    descricao: '',
    unidade: 'UN',
    fonte: 'PROPRIA',
    data_base: '',
    custo_material: 0,
    custo_mao_obra: 0,
    custo_total: 0
  });

  const [compositions, setCompositions] = useState([]);
  const [newItem, setNewItem] = useState({
    tipo_item: 'INSUMO',
    item_id: '',
    quantidade: 1,
    tipo_custo: 'MATERIAL'
  });
  const [applyToBudgets, setApplyToBudgets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Queries
  const { data: inputs = [] } = useQuery({ queryKey: ['inputs'], queryFn: () => base44.entities.Input.list() });
  const { data: allServices = [] } = useQuery({ queryKey: ['services'], queryFn: () => base44.entities.Service.list() });
  const { data: versions = [], refetch: refetchVersions } = useQuery({ 
    queryKey: ['serviceVersions', serviceId], 
    queryFn: () => serviceId ? base44.entities.ServiceVersion.filter({ servico_id: serviceId }) : [],
    enabled: !!serviceId
  });

  // Load Data
  useEffect(() => {
    if (serviceId) {
      const load = async () => {
        const s = await base44.entities.Service.filter({ id: serviceId }).then(r => r[0]);
        if (s) setService(s);
        const comps = await base44.entities.ServiceComposition.filter({ servico_id: serviceId });
        setCompositions(comps);
      };
      load();
    }
  }, [serviceId]);

  // Calculations
  useEffect(() => {
    const totalMat = compositions.reduce((acc, c) => c.tipo_custo === 'MATERIAL' ? acc + c.custo_total_item : acc, 0);
    const totalMO = compositions.reduce((acc, c) => c.tipo_custo === 'MAO_DE_OBRA' ? acc + c.custo_total_item : acc, 0);
    
    setService(prev => ({
      ...prev,
      custo_material: totalMat,
      custo_mao_obra: totalMO,
      custo_total: totalMat + totalMO
    }));
  }, [compositions]);

  // Handlers
  const handleAddItem = () => {
    if (!newItem.item_id) return;
    if (newItem.tipo_item === 'SERVICO' && newItem.item_id === serviceId) {
      toast.error('Não é possível adicionar o próprio serviço (recursividade).');
      return;
    }

    let itemData, custoUnit, nome;

    if (newItem.tipo_item === 'INSUMO') {
      itemData = inputs.find(i => i.id === newItem.item_id);
      custoUnit = itemData?.valor_referencia || 0;
      nome = itemData?.descricao;
    } else {
      itemData = allServices.find(s => s.id === newItem.item_id);
      custoUnit = itemData?.custo_total || 0;
      nome = itemData?.descricao;
    }

    if (!itemData) return;

    // Check duplication? usually allowed but warn? Let's allow.

    const newComp = {
      tipo_item: newItem.tipo_item,
      item_id: newItem.item_id,
      item_nome: nome,
      unidade: itemData.unidade,
      quantidade: parseFloat(newItem.quantidade),
      custo_unitario: custoUnit,
      custo_total_item: parseFloat(newItem.quantidade) * custoUnit,
      tipo_custo: newItem.tipo_custo
    };

    setCompositions([...compositions, newComp]);
    setNewItem(prev => ({ ...prev, item_id: '', quantidade: 1 }));
    setOpenCombobox(false);
    toast.success('Item adicionado');
  };

  const handleUpdateItem = (index, field, value) => {
    const newComps = [...compositions];
    const comp = { ...newComps[index], [field]: value };
    
    if (field === 'quantidade' || field === 'custo_unitario') {
      comp.custo_total_item = comp.quantidade * comp.custo_unitario;
    }

    newComps[index] = comp;
    setCompositions(newComps);
  };

  const handleRemoveItem = (index) => {
    const newComps = [...compositions];
    newComps.splice(index, 1);
    setCompositions(newComps);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let savedId = serviceId;
      
      // Save Service
      if (serviceId) {
        await base44.entities.Service.update(serviceId, service);
        
        // Update Compositions (Delete All & Recreate)
        const existingComps = await base44.entities.ServiceComposition.filter({ servico_id: serviceId });
        await Promise.all(existingComps.map(c => base44.entities.ServiceComposition.delete(c.id)));
      } else {
        const newS = await base44.entities.Service.create(service);
        savedId = newS.id;
      }

      // Create Compositions
      await Promise.all(compositions.map(c => 
        base44.entities.ServiceComposition.create({ ...c, servico_id: savedId })
      ));

      // Update Budgets?
      if (applyToBudgets && savedId) {
         // Logic to update existing budgets using this service
         // Not fully implemented in this MVP scope as it requires scanning all budgets
         toast.info('Atualização de orçamentos antigos não implementada neste MVP.');
      }

      toast.success('Serviço salvo com sucesso!');
      if (!serviceId) window.location.href = createPageUrl(`ServiceEditor?id=${savedId}`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar.');
    }
    setIsSaving(false);
  };

  const handleCreateVersion = async () => {
    if (!serviceId) return;
    const user = await base44.auth.me();
    await base44.entities.ServiceVersion.create({
      servico_id: serviceId,
      data_versao: new Date().toISOString(),
      usuario: user?.full_name || 'Sistema',
      total_material: service.custo_material,
      total_mao_obra: service.custo_mao_obra,
      total: service.custo_total,
      json_composicao: JSON.stringify(compositions)
    });
    refetchVersions();
    toast.success('Versão criada!');
  };

  const handleRestoreVersion = (version) => {
    try {
      const comps = JSON.parse(version.json_composicao);
      setCompositions(comps);
      toast.success('Versão restaurada (clique em Salvar para persistir)');
    } catch (e) {
      toast.error('Erro ao ler versão');
    }
  };

  const handleDuplicate = async () => {
    const newService = { ...service, codigo: `${service.codigo}-COPY`, descricao: `${service.descricao} (Cópia)` };
    const newS = await base44.entities.Service.create(newService);
    await Promise.all(compositions.map(c => 
      base44.entities.ServiceComposition.create({ ...c, servico_id: newS.id })
    ));
    toast.success('Serviço duplicado!');
    window.location.href = createPageUrl(`ServiceEditor?id=${newS.id}`);
  };

  return (
    <div className="pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.location.href = createPageUrl('Services')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{serviceId ? 'Editor de Composição' : 'Novo Serviço'}</h1>
            <p className="text-slate-500">{service.codigo} - {service.descricao}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {serviceId && (
            <>
              <Button variant="outline" onClick={handleDuplicate}>
                <Copy className="h-4 w-4 mr-2" /> Duplicar
              </Button>
              <Button variant="outline" onClick={handleCreateVersion}>
                <History className="h-4 w-4 mr-2" /> Nova Versão
              </Button>
            </>
          )}
          <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
            {isSaving ? 'Salvando...' : <><Save className="h-4 w-4 mr-2" /> Salvar Alterações</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {/* Header Card */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Serviço</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Código</Label>
                  <Input value={service.codigo} onChange={e => setService({...service, codigo: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                  <Label>Descrição</Label>
                  <Input value={service.descricao} onChange={e => setService({...service, descricao: e.target.value})} />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Input value={service.unidade} onChange={e => setService({...service, unidade: e.target.value})} />
                </div>
                <div>
                  <Label>Fonte</Label>
                  <Select value={service.fonte} onValueChange={v => setService({...service, fonte: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SINAPI">SINAPI</SelectItem>
                      <SelectItem value="TCPO">TCPO</SelectItem>
                      <SelectItem value="CDHU">CDHU</SelectItem>
                      <SelectItem value="PROPRIA">PRÓPRIA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data Base</Label>
                  <Input 
                    value={service.data_base || ''} 
                    onChange={e => setService({...service, data_base: e.target.value})} 
                    placeholder="MM/AAAA"
                  />
                </div>
                <div className="md:col-span-2 flex items-center pt-6 space-x-2">
                  <Checkbox 
                    id="budgets" 
                    checked={applyToBudgets} 
                    onCheckedChange={setApplyToBudgets} 
                  />
                  <Label htmlFor="budgets" className="text-sm font-normal">
                    Aplicar alterações somente para novos orçamentos (unchecked = atualiza antigos)
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Composition Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Itens da Composição</CardTitle>
              <div className="text-sm text-slate-500">
                {compositions.length} itens adicionados
              </div>
            </CardHeader>
            <CardContent>
              {/* Add Item Bar */}
              <div className="flex flex-wrap gap-2 items-end mb-6 p-4 bg-slate-50 rounded-lg border">
                <div className="w-32">
                  <Label className="text-xs mb-1">Tipo</Label>
                  <Select value={newItem.tipo_item} onValueChange={v => setNewItem({...newItem, tipo_item: v, item_id: ''})}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INSUMO">Insumo</SelectItem>
                      <SelectItem value="SERVICO">Serviço Auxiliar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[300px]">
                  <Label className="text-xs mb-1">Buscar Item</Label>
                  <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className="w-full justify-between font-normal truncate h-9"
                      >
                        {newItem.item_id
                          ? (newItem.tipo_item === 'INSUMO' 
                              ? inputs.find((i) => i.id === newItem.item_id)
                              : allServices.find((s) => s.id === newItem.item_id)
                            )?.descricao || "Selecione o item..."
                          : "Selecione o item..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Buscar por nome ou código..." 
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                          <CommandGroup>
                            {newItem.tipo_item === 'INSUMO'
                              ? inputs
                                  .filter(item => 
                                    !searchQuery || 
                                    item.codigo?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                    item.descricao?.toLowerCase().includes(searchQuery.toLowerCase())
                                  )
                                  .slice(0, 50)
                                  .map((item) => (
                                  <CommandItem
                                    key={item.id}
                                    value={`${item.codigo} ${item.descricao}`}
                                    onSelect={() => {
                                      setNewItem(prev => ({ ...prev, item_id: item.id }));
                                      setOpenCombobox(false);
                                      setSearchQuery('');
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
                              : allServices
                                  .filter(s => s.id !== serviceId)
                                  .filter(item => 
                                    !searchQuery || 
                                    item.codigo?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                    item.descricao?.toLowerCase().includes(searchQuery.toLowerCase())
                                  )
                                  .slice(0, 50)
                                  .map((item) => (
                                    <CommandItem
                                      key={item.id}
                                      value={`${item.codigo} ${item.descricao}`}
                                      onSelect={() => {
                                        setNewItem(prev => ({ ...prev, item_id: item.id }));
                                        setOpenCombobox(false);
                                        setSearchQuery('');
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
                  <Label className="text-xs mb-1">Qtd</Label>
                  <Input 
                    type="number" 
                    className="h-9"
                    value={newItem.quantidade} 
                    onChange={e => setNewItem({...newItem, quantidade: e.target.value})} 
                  />
                </div>
                <div className="w-32">
                  <Label className="text-xs mb-1">Categoria</Label>
                  <Select value={newItem.tipo_custo} onValueChange={v => setNewItem({...newItem, tipo_custo: v})}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MATERIAL">Material</SelectItem>
                      <SelectItem value="MAO_DE_OBRA">Mão de Obra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAddItem} disabled={!newItem.item_id}>
                  <Plus className="h-4 w-4 mr-2" /> Adicionar
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-20">Unid</TableHead>
                    <TableHead className="w-24 text-right">Qtd</TableHead>
                    <TableHead className="w-28 text-right">Unitário</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    <TableHead className="w-28">Categoria</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compositions.map((comp, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs font-medium text-slate-500">
                        {comp.tipo_item === 'INSUMO' ? 'Insumo' : 'Serviço Auxiliar'}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">
                          {(() => {
                            const item = comp.tipo_item === 'INSUMO' 
                              ? inputs.find(i => i.id === comp.item_id)
                              : allServices.find(s => s.id === comp.item_id);
                            
                            const code = item?.codigo;
                            const description = item?.descricao || comp.item_nome || 'Item não encontrado';

                            return (
                              <div className="flex flex-col">
                                {code && <span className="text-xs text-slate-500 font-mono mb-0.5">{code}</span>}
                                <span>{description}</span>
                              </div>
                            );
                          })()}
                        </div>
                        {comp.custo_unitario === 0 && <span className="text-xs text-red-500 flex items-center"><AlertTriangle className="h-3 w-3 mr-1" /> Sem custo</span>}
                      </TableCell>
                      <TableCell className="text-xs">{comp.unidade}</TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          className="h-7 w-20 text-right text-xs" 
                          value={comp.quantidade} 
                          onChange={e => handleUpdateItem(idx, 'quantidade', e.target.value)} 
                        />
                      </TableCell>
                      <TableCell>
                         <Input 
                          type="number" 
                          className="h-7 w-24 text-right text-xs" 
                          value={comp.custo_unitario} 
                          onChange={e => handleUpdateItem(idx, 'custo_unitario', e.target.value)} 
                          disabled={service.fonte !== 'PROPRIA'}
                          title={service.fonte !== 'PROPRIA' ? 'Editável apenas em composições próprias' : ''}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comp.custo_total_item)}
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={comp.tipo_custo} 
                          onValueChange={v => handleUpdateItem(idx, 'tipo_custo', v)}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MATERIAL">Material</SelectItem>
                            <SelectItem value="MAO_DE_OBRA">Mão de Obra</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)} className="h-6 w-6 text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {compositions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                        Nenhum item na composição.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-slate-900 text-white border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Custo Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-4">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.custo_total)}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">Material</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.custo_material)}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-slate-400">Mão de Obra</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.custo_mao_obra)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {versions.length > 0 && (
             <Card>
              <CardHeader>
                <CardTitle className="text-sm">Histórico de Versões</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {versions.map(v => (
                  <div key={v.id} className="flex flex-col gap-1 p-3 bg-slate-50 rounded border text-xs">
                    <div className="flex justify-between font-medium">
                      <span>{format(new Date(v.data_versao), 'dd/MM/yy HH:mm')}</span>
                      <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.total)}</span>
                    </div>
                    <div className="text-slate-500 truncate">Por: {v.usuario}</div>
                    <Button variant="outline" size="sm" className="w-full mt-2 h-6 text-xs" onClick={() => handleRestoreVersion(v)}>
                      Restaurar
                    </Button>
                  </div>
                ))}
              </CardContent>
             </Card>
          )}
        </div>
      </div>
    </div>
  );
}