import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Save, Plus, Trash2, Pencil, Calculator, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import * as Engine from '@/components/logic/CompositionEngine';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";

export default function ServiceEditor() {
  const urlParams = new URLSearchParams(window.location.search);
  const serviceId = urlParams.get('id');
  const queryClient = useQueryClient();

  // PROMPT 7: INTERFACE DINÂMICA
  const [service, setService] = useState({
    codigo: '', descricao: '', unidade: 'UN', ativo: true, data_base: ''
  });
  const [items, setItems] = useState([]);
  const [inputs, setInputs] = useState([]);
  const [services, setServices] = useState([]);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit State
  const [editingItem, setEditingItem] = useState(null);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      // Fetch all for dropdowns (optimize later if too slow)
      const [allInputs, allServices] = await Promise.all([
        Engine.fetchAll('Input'),
        Engine.fetchAll('Service')
      ]);
      setInputs(allInputs);
      setServices(allServices);

      if (serviceId) {
        const s = await base44.entities.Service.filter({ id: serviceId }).then(r => r[0]);
        if (s) setService(s);
        const its = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
        // Sort by ordem
        setItems(its.sort((a,b) => (a.ordem || 0) - (b.ordem || 0)));
      }
    };
    load();
  }, [serviceId]);

  // Save / Update Service Header
  const handleSaveHeader = async () => {
    if (!service.codigo || !service.descricao) return toast.error("Preencha código e descrição");
    
    let id = serviceId;
    if (!id) {
      const newS = await base44.entities.Service.create(service);
      id = newS.id;
      toast.success("Serviço criado");
      window.location.href = createPageUrl(`ServiceEditor?id=${id}`);
      return;
    } else {
      // Recalcular custos antes de salvar para garantir que estão atualizados
      await Engine.recalculateService(id);
      
      // Recarregar os dados atualizados
      const updatedService = await base44.entities.Service.filter({ id }).then(r => r[0]);
      if (updatedService) {
        setService(updatedService);
      }
      
      toast.success("Cabeçalho salvo e custos atualizados");
    }
  };

  // Add Item
  const [newItem, setNewItem] = useState({ type: 'INSUMO', id: '', qtd: 1, cat: 'MATERIAL' });
  
  const handleAddItem = async () => {
    if (!serviceId) return toast.error("Salve o serviço antes de adicionar itens");
    if (!newItem.id) return;

    // Verificar Duplicidade
    if (items.some(i => i.item_id === newItem.id && i.tipo_item === newItem.type)) {
      return toast.error("Este item já existe na composição.");
    }

    // PROMPT 4: BLOQUEIO CIRCULAR
    if (newItem.type === 'SERVICO') {
      const hasCycle = await Engine.checkCircularDependency(serviceId, newItem.id);
      if (hasCycle) return toast.error("Dependência circular não permitida.");
    }

    // Get snapshot data
    let unitCost = 0;
    let selectedItem = null;
    
    if (newItem.type === 'INSUMO') {
      selectedItem = inputs.find(x => x.id === newItem.id);
      unitCost = selectedItem ? selectedItem.valor_unitario : 0;
    } else {
      selectedItem = services.find(x => x.id === newItem.id);
      unitCost = selectedItem ? selectedItem.custo_total : 0;
    }

    const total = newItem.qtd * unitCost;

    await base44.entities.ServiceItem.create({
      servico_id: serviceId,
      tipo_item: newItem.type,
      item_id: newItem.id,
      quantidade: parseFloat(newItem.qtd),
      categoria: newItem.cat,
      ordem: items.length + 1,
      custo_unitario_snapshot: unitCost,
      custo_total_item: total
    });

    // PROMPT 2 & 3: RECALCULAR E CASCATA
    const result = await Engine.recalculateService(serviceId, true);
    await Engine.updateDependents('SERVICO', serviceId);

    // Reload - pequeno delay para garantir commit no banco
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const [its, s] = await Promise.all([
      base44.entities.ServiceItem.filter({ servico_id: serviceId }),
      base44.entities.Service.filter({ id: serviceId }).then(r => r[0])
    ]);
    
    setItems(its.sort((a,b) => a.ordem - b.ordem));
    setService(s);
    
    toast.success("Item adicionado e custos atualizados automaticamente");
    setNewItem({ ...newItem, id: '', qtd: 1 });
    setSearchQuery('');
  };

  const handleDeleteItem = async (itemId) => {
    await base44.entities.ServiceItem.delete(itemId);
    await Engine.recalculateService(serviceId, true);
    await Engine.updateDependents('SERVICO', serviceId);
    
    // Reload
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const [its, s] = await Promise.all([
      base44.entities.ServiceItem.filter({ servico_id: serviceId }),
      base44.entities.Service.filter({ id: serviceId }).then(r => r[0])
    ]);
    
    setItems(its);
    setService(s);
    toast.success("Item removido e custos atualizados");
  };

  // PROMPT 6: DESCRIÇÃO DIRETA (Helper para exibir)
  const getItemDesc = (item) => {
    if (item.tipo_item === 'INSUMO') return inputs.find(i => i.id === item.item_id)?.descricao || '???';
    return services.find(s => s.id === item.item_id)?.descricao || '???';
  };

  const getItemCode = (item) => {
    if (item.tipo_item === 'INSUMO') return inputs.find(i => i.id === item.item_id)?.codigo || '???';
    return services.find(s => s.id === item.item_id)?.codigo || '???';
  };

  const getItemUnit = (item) => {
    if (item.tipo_item === 'INSUMO') return inputs.find(i => i.id === item.item_id)?.unidade || 'UN';
    return services.find(s => s.id === item.item_id)?.unidade || 'UN';
  };

  const handleEditItem = (item) => {
    setEditingItem({ ...item });
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    
    // Recalculate cost
    let unitCost = 0;
    if (editingItem.tipo_item === 'INSUMO') {
       const inp = inputs.find(i => i.id === editingItem.item_id);
       unitCost = inp ? inp.valor_unitario : 0;
    } else {
       const svc = services.find(s => s.id === editingItem.item_id);
       unitCost = svc ? svc.custo_total : 0;
    }
    const total = editingItem.quantidade * unitCost;

    await base44.entities.ServiceItem.update(editingItem.id, {
      quantidade: parseFloat(editingItem.quantidade),
      categoria: editingItem.categoria,
      custo_total_item: total
    });

    await Engine.recalculateService(serviceId, true);
    await Engine.updateDependents('SERVICO', serviceId);

    // Reload
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const [its, s] = await Promise.all([
      base44.entities.ServiceItem.filter({ servico_id: serviceId }),
      base44.entities.Service.filter({ id: serviceId }).then(r => r[0])
    ]);
    
    setItems(its.sort((a,b) => a.ordem - b.ordem));
    setService(s);
    setEditingItem(null);
    toast.success("Item atualizado e custos recalculados");
  };

  return (
    <div className="pb-20">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => window.location.href = createPageUrl('Services')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Editor de Composição</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Dados do Serviço</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código</Label>
                  <Input value={service.codigo} onChange={e => setService({...service, codigo: e.target.value})} />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Input value={service.unidade} onChange={e => setService({...service, unidade: e.target.value})} />
                </div>
                <div className="col-span-1">
                  <Label>Data Base</Label>
                  <Input value={service.data_base || ''} readOnly className="bg-slate-50" placeholder="Definir via tabela global" />
                </div>
                <div className="col-span-2">
                  <Label>Descrição</Label>
                  <Input value={service.descricao} onChange={e => setService({...service, descricao: e.target.value})} />
                </div>
              </div>
              <Button className="mt-4" onClick={handleSaveHeader}><Save className="mr-2 h-4 w-4"/> Salvar Cabeçalho</Button>
            </CardContent>
          </Card>

          {serviceId && (
            <Card>
              <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 items-end mb-4 bg-slate-50 p-3 rounded">
                  <div className="w-32">
                    <Label>Tipo</Label>
                    <Select value={newItem.type} onValueChange={v => { setNewItem({...newItem, type: v, id: ''}); setSearchQuery(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INSUMO">Insumo</SelectItem>
                        <SelectItem value="SERVICO">Serviço</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[250px]">
                    <Label>Item (Busca Dinâmica)</Label>
                    <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openCombobox}
                          className="w-full justify-between font-normal truncate"
                        >
                          {newItem.id
                            ? (newItem.type === 'INSUMO' 
                                ? inputs.find((i) => i.id === newItem.id)
                                : services.find((s) => s.id === newItem.id)
                              )?.descricao.substring(0, 60) + '...' || "Selecione o item..."
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
                              {(() => {
                                const list = newItem.type === 'INSUMO' ? inputs : services.filter(s => s.id !== serviceId);
                                const filtered = list.filter(item => 
                                  !searchQuery || 
                                  item.codigo?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  item.descricao?.toLowerCase().includes(searchQuery.toLowerCase())
                                ).slice(0, 50); // Limit to 50 for performance
                                
                                return filtered.map((item) => (
                                  <CommandItem
                                    key={item.id}
                                    value={`${item.codigo} ${item.descricao}`}
                                    onSelect={() => {
                                      // Se for insumo, usa a categoria do cadastro. Se for serviço, infere ou usa padrão.
                                      let cat = 'MATERIAL';
                                      if (newItem.type === 'INSUMO') {
                                         cat = item.categoria || 'MATERIAL';
                                      } else {
                                         // Para serviço, tentamos inferir, mas geralmente o custo é composto.
                                         // Deixamos como Material por padrão se for serviço agregado, ou pode ser MO pura.
                                         // Vamos manter a lógica antiga SÓ para serviços, ou deixar o usuário mudar.
                                         const u = (item.unidade || 'UN').toUpperCase().trim();
                                         cat = (u === 'H' || u === 'HORA' || u.startsWith('H')) ? 'MAO_OBRA' : 'MATERIAL';
                                      }
                                      
                                      setNewItem(prev => ({ ...prev, id: item.id, cat }));
                                      setOpenCombobox(false);
                                      setSearchQuery('');
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        newItem.id === item.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <div className="flex flex-col overflow-hidden">
                                      <span className="font-medium truncate">{item.descricao}</span>
                                      <span className="text-xs text-slate-500">
                                        {item.codigo} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(newItem.type === 'INSUMO' ? item.valor_unitario : item.custo_total)}
                                      </span>
                                    </div>
                                  </CommandItem>
                                ));
                              })()}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-24">
                    <Label>Qtd</Label>
                    <Input type="number" value={newItem.qtd} onChange={e => setNewItem({...newItem, qtd: e.target.value})} />
                  </div>
                  <div className="w-32">
                    <Label>Categoria</Label>
                    <Select value={newItem.cat} onValueChange={v => setNewItem({...newItem, cat: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MATERIAL">Material</SelectItem>
                        <SelectItem value="MAO_OBRA">Mão de Obra</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddItem}><Plus className="h-4 w-4"/></Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição (Vinculada)</TableHead>
                      <TableHead>Und</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Unit.</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Cat</TableHead>
                      <TableHead className="w-24">Ações</TableHead>
                      </TableRow>
                      </TableHeader>
                      <TableBody>
                      {items.map(item => {
                        // Determinar categoria para exibição
                        let displayCategoria = 'MAT';
                        if (item.tipo_item === 'INSUMO') {
                          const input = inputs.find(i => i.id === item.item_id);
                          displayCategoria = (input?.categoria === 'MAO_OBRA') ? 'MO' : 'MAT';
                        } else {
                          // Para serviços, mostramos a proporção
                          displayCategoria = 'MISTO';
                        }

                        return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs font-mono">{getItemCode(item)}</TableCell>
                          <TableCell className="text-xs font-mono">{item.tipo_item}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={getItemDesc(item)}>{getItemDesc(item)}</TableCell>
                          <TableCell className="text-xs">{getItemUnit(item)}</TableCell>
                          <TableCell>{item.quantidade}</TableCell>
                          <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_unitario_snapshot)}</TableCell>
                          <TableCell className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_total_item)}</TableCell>
                          <TableCell className="text-xs">{displayCategoria}</TableCell>
                          <TableCell className="flex gap-1">
                             <Button variant="ghost" size="sm" onClick={() => handleEditItem(item)} className="text-blue-600">
                                <Pencil className="h-4 w-4" />
                             </Button>
                             <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)} className="text-red-500">
                               <Trash2 className="h-4 w-4" />
                             </Button>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                </Table>

                {/* Edit Dialog */}
                {editingItem && (
                   <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                      <Card className="w-full max-w-md bg-white">
                         <CardHeader>
                            <CardTitle>Editar Item</CardTitle>
                         </CardHeader>
                         <CardContent className="space-y-4">
                            <div>
                               <Label>Quantidade</Label>
                               <Input 
                                  type="number" 
                                  value={editingItem.quantidade} 
                                  onChange={e => setEditingItem({...editingItem, quantidade: e.target.value})} 
                               />
                            </div>
                            <div>
                               <Label>Categoria</Label>
                               <Select 
                                  value={editingItem.categoria} 
                                  onValueChange={v => setEditingItem({...editingItem, categoria: v})}
                               >
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                     <SelectItem value="MATERIAL">Material</SelectItem>
                                     <SelectItem value="MAO_OBRA">Mão de Obra</SelectItem>
                                  </SelectContent>
                               </Select>
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                               <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
                               <Button onClick={handleSaveEdit}>Salvar</Button>
                            </div>
                         </CardContent>
                      </Card>
                   </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
           <Card className="bg-slate-900 text-white">
             <CardHeader><CardTitle>Custos Totais</CardTitle></CardHeader>
             <CardContent>
               <div className="text-3xl font-bold mb-4">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.custo_total || 0)}</div>
               <div className="space-y-2 text-sm border-t border-slate-700 pt-2">
                 <div className="flex justify-between">
                   <span>Material</span>
                   <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.custo_material || 0)}</span>
                 </div>
                 <div className="flex justify-between">
                   <span>Mão de Obra</span>
                   <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.custo_mao_obra || 0)}</span>
                 </div>
                 <div className="flex justify-between pt-2 border-t border-slate-700">
                    <span className="text-slate-400">Data Base</span>
                    <span>{service.data_base || '-'}</span>
                 </div>
               </div>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}