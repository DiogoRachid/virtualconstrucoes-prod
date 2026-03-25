import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Save, Plus, Trash2, Pencil, Loader2, Check, ChevronsUpDown, Calendar } from 'lucide-react';
import * as Engine from '@/components/logic/CompositionEngine';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function ServiceEditor() {
  const urlParams = new URLSearchParams(window.location.search);
  const serviceId = urlParams.get('id');

  const [service, setService] = useState({ codigo: '', descricao: '', unidade: 'UN', ativo: true, data_base: '' });
  const [items, setItems] = useState([]);
  const [inputs, setInputs] = useState([]);
  const [services, setServices] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]); // InputPriceHistory
  const [datasBaseDisponiveis, setDatasBaseDisponiveis] = useState([]);
  const [dataBaseFiltro, setDataBaseFiltro] = useState(''); // '' = usar valores atuais
  const [openCombobox, setOpenCombobox] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({ type: 'INSUMO', id: '', qtd: 1, cat: 'MATERIAL' });

  useEffect(() => {
    const load = async () => {
      const [allInputs, allServices, history] = await Promise.all([
        base44.entities.Input.list('created_date', 100000),
        base44.entities.Service.list('created_date', 100000),
        base44.entities.InputPriceHistory.list('created_date', 100000),
      ]);
      setInputs(allInputs);
      setServices(allServices);
      setPriceHistory(history);

      // Montar lista de datas base disponíveis (atual + histórico), ordenadas desc
      const fromCurrent = allInputs.map(i => i.data_base).filter(Boolean);
      const fromHistory = history.map(h => h.data_base).filter(Boolean);
      const todas = [...new Set([...fromCurrent, ...fromHistory])].sort((a, b) => {
        const [mA, yA] = a.split('/');
        const [mB, yB] = b.split('/');
        return parseInt(yB) - parseInt(yA) || parseInt(mB) - parseInt(mA);
      });
      setDatasBaseDisponiveis(todas);

      if (serviceId) {
        const s = await base44.entities.Service.filter({ id: serviceId }).then(r => r[0]);
        if (s) setService(s);
        const its = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
        setItems(its.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
      }
    };
    load();

    if (serviceId) {
      const unsubscribe = base44.entities.Service.subscribe((event) => {
        if (event.id === serviceId && event.type === 'update') {
          setService(prev => ({ ...prev, ...event.data }));
        }
      });
      return unsubscribe;
    }
  }, [serviceId]);

  // Retorna o valor unitário do insumo para a data_base filtrada (ou atual se sem filtro)
  const getValorInsumoParaDataBase = (inputId) => {
    const insumoAtual = inputs.find(i => i.id === inputId);
    if (!dataBaseFiltro) return insumoAtual?.valor_unitario || 0;
    if (insumoAtual?.data_base === dataBaseFiltro) return insumoAtual.valor_unitario || 0;
    const hist = priceHistory.find(h => h.insumo_id === inputId && h.data_base === dataBaseFiltro);
    return hist?.valor_unitario ?? insumoAtual?.valor_unitario ?? 0;
  };

  // Totais simulados para a data_base filtrada
  const totaisSimulados = useMemo(() => {
    if (!dataBaseFiltro) return null;
    let mat = 0, mo = 0;
    items.forEach(item => {
      if (item.tipo_item === 'INSUMO') {
        const insumo = inputs.find(i => i.id === item.item_id);
        const val = getValorInsumoParaDataBase(item.item_id);
        const total = (item.quantidade || 0) * val;
        if (insumo?.categoria === 'MAO_OBRA') mo += total;
        else mat += total;
      } else {
        // Para sub-serviços usa o snapshot salvo (não recalcula recursivo em tempo real)
        const subService = services.find(s => s.id === item.item_id);
        const unitCost = subService?.custo_total || item.custo_unitario_snapshot || 0;
        const total = (item.quantidade || 0) * unitCost;
        if (subService?.custo_total > 0) {
          mat += total * ((subService.custo_material || 0) / subService.custo_total);
          mo += total * ((subService.custo_mao_obra || 0) / subService.custo_total);
        }
      }
    });
    return { mat, mo, total: mat + mo };
  }, [dataBaseFiltro, items, inputs, priceHistory, services]);

  const handleSaveHeader = async () => {
    if (!service.codigo || !service.descricao) return toast.error("Preencha código e descrição");
    if (!serviceId) {
      const newS = await base44.entities.Service.create(service);
      toast.success("Serviço criado");
      window.location.href = createPageUrl(`ServiceEditor?id=${newS.id}`);
      return;
    }
    await Engine.recalculateService(serviceId);
    const updated = await base44.entities.Service.filter({ id: serviceId }).then(r => r[0]);
    if (updated) setService(updated);
    toast.success("Cabeçalho salvo e custos atualizados");
  };

  const handleAddItem = async () => {
    if (!serviceId) return toast.error("Salve o serviço antes de adicionar itens");
    if (!newItem.id) return toast.error("Selecione um item");
    if (isAdding) return;
    setIsAdding(true);
    try {
      if (items.some(i => i.item_id === newItem.id && i.tipo_item === newItem.type)) {
        toast.error("Este item já existe na composição.");
        return;
      }
      if (newItem.type === 'SERVICO') {
        const hasCycle = await Engine.checkCircularDependency(serviceId, newItem.id);
        if (hasCycle) {
          toast.error("❌ Dependência circular detectada!");
          return;
        }
      }
      let unitCost = 0;
      if (newItem.type === 'INSUMO') {
        const sel = inputs.find(x => x.id === newItem.id);
        unitCost = sel?.valor_unitario || 0;
      } else {
        const sel = services.find(x => x.id === newItem.id);
        unitCost = sel?.custo_total || 0;
      }
      const total = parseFloat(newItem.qtd) * unitCost;
      const created = await base44.entities.ServiceItem.create({
        servico_id: serviceId,
        tipo_item: newItem.type,
        item_id: newItem.id,
        quantidade: parseFloat(newItem.qtd),
        categoria: newItem.cat,
        ordem: items.length + 1,
        custo_unitario_snapshot: unitCost,
        custo_total_item: total
      });
      setItems(prev => [...prev, created].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
      Engine.clearCache();
      await Engine.recalculateService(serviceId);
      await Engine.updateDependents('SERVICO', serviceId);
      toast.success("Item adicionado");
      setNewItem({ type: newItem.type, id: '', qtd: 1, cat: 'MATERIAL' });
      setSearchQuery('');
    } catch (error) {
      toast.error("Erro ao adicionar item");
      const its = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
      setItems(its.sort((a, b) => (a.ordem || 0) - (b.ordem || 0)));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
    await base44.entities.ServiceItem.delete(itemId);
    Engine.clearCache();
    await Engine.recalculateService(serviceId);
    await Engine.updateDependents('SERVICO', serviceId);
    toast.success("Item removido");
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    let unitCost = 0;
    if (editingItem.tipo_item === 'INSUMO') {
      unitCost = inputs.find(i => i.id === editingItem.item_id)?.valor_unitario || 0;
    } else {
      unitCost = services.find(s => s.id === editingItem.item_id)?.custo_total || 0;
    }
    const total = parseFloat(editingItem.quantidade) * unitCost;
    await base44.entities.ServiceItem.update(editingItem.id, {
      quantidade: parseFloat(editingItem.quantidade),
      categoria: editingItem.categoria,
      custo_total_item: total
    });
    setItems(prev => prev.map(i =>
      i.id === editingItem.id
        ? { ...i, quantidade: parseFloat(editingItem.quantidade), categoria: editingItem.categoria, custo_total_item: total }
        : i
    ));
    Engine.clearCache();
    await Engine.recalculateService(serviceId);
    await Engine.updateDependents('SERVICO', serviceId);
    setEditingItem(null);
    toast.success("Item atualizado");
  };

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

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

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
                  <Input value={service.codigo} onChange={e => setService({ ...service, codigo: e.target.value })} />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Input value={service.unidade} onChange={e => setService({ ...service, unidade: e.target.value })} />
                </div>
                <div>
                  <Label>Data Base (calculada)</Label>
                  <Input value={service.data_base || ''} readOnly className="bg-slate-50" placeholder="Calculada automaticamente" />
                </div>
                <div className="col-span-2">
                  <Label>Descrição</Label>
                  <Input value={service.descricao} onChange={e => setService({ ...service, descricao: e.target.value })} />
                </div>
              </div>
              <Button className="mt-4" onClick={handleSaveHeader}><Save className="mr-2 h-4 w-4" /> Salvar Cabeçalho</Button>
            </CardContent>
          </Card>

          {serviceId && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle>Itens da Composição</CardTitle>
                  {/* Filtro de Data Base para visualização histórica */}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <Label className="text-sm text-slate-600 whitespace-nowrap">Visualizar por Data Base:</Label>
                    <Select value={dataBaseFiltro} onValueChange={setDataBaseFiltro}>
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Atual" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Atual (padrão)</SelectItem>
                        {datasBaseDisponiveis.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dataBaseFiltro && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                        Simulação histórica
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Formulário de adição */}
                <div className="flex flex-wrap gap-2 items-end mb-4 bg-slate-50 p-3 rounded">
                  <div className="w-32">
                    <Label>Tipo</Label>
                    <Select value={newItem.type} onValueChange={v => { setNewItem({ ...newItem, type: v, id: '' }); setSearchQuery(''); }}>
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
                        <Button variant="outline" role="combobox" aria-expanded={openCombobox} className="w-full justify-between font-normal truncate">
                          {newItem.id
                            ? ((newItem.type === 'INSUMO' ? inputs.find(i => i.id === newItem.id) : services.find(s => s.id === newItem.id))?.descricao?.substring(0, 50) + '...' || "Selecione...")
                            : "Selecione o item..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput placeholder="Buscar por nome ou código..." value={searchQuery} onValueChange={setSearchQuery} />
                          <CommandList>
                            <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                            <CommandGroup>
                              {(() => {
                                const list = newItem.type === 'INSUMO' ? inputs : services.filter(s => s.id !== serviceId);
                                return list.filter(item =>
                                  !searchQuery ||
                                  item.codigo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  item.descricao?.toLowerCase().includes(searchQuery.toLowerCase())
                                ).slice(0, 50).map(item => (
                                  <CommandItem
                                    key={item.id}
                                    value={`${item.codigo} ${item.descricao}`}
                                    onSelect={() => {
                                      let cat = 'MATERIAL';
                                      if (newItem.type === 'INSUMO') cat = item.categoria || 'MATERIAL';
                                      else {
                                        const u = (item.unidade || 'UN').toUpperCase();
                                        cat = (u === 'H' || u.startsWith('H')) ? 'MAO_OBRA' : 'MATERIAL';
                                      }
                                      setNewItem(prev => ({ ...prev, id: item.id, cat }));
                                      setOpenCombobox(false);
                                      setSearchQuery('');
                                    }}
                                  >
                                    <Check className={cn("mr-2 h-4 w-4", newItem.id === item.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col overflow-hidden">
                                      <span className="font-medium truncate">{item.descricao}</span>
                                      <span className="text-xs text-slate-500">
                                        {item.codigo} • {fmt(newItem.type === 'INSUMO' ? item.valor_unitario : item.custo_total)}
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
                    <Input type="number" value={newItem.qtd} onChange={e => setNewItem({ ...newItem, qtd: e.target.value })} />
                  </div>
                  <div className="w-32">
                    <Label>Categoria</Label>
                    <Select value={newItem.cat} onValueChange={v => setNewItem({ ...newItem, cat: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MATERIAL">Material</SelectItem>
                        <SelectItem value="MAO_OBRA">Mão de Obra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddItem} disabled={isAdding}>
                    {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Und</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Unit.</TableHead>
                      <TableHead>Total Item</TableHead>
                      <TableHead>Cat</TableHead>
                      <TableHead className="text-right">Mat</TableHead>
                      <TableHead className="text-right">MO</TableHead>
                      <TableHead className="w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => {
                      const insumo = item.tipo_item === 'INSUMO' ? inputs.find(i => i.id === item.item_id) : null;
                      const subService = item.tipo_item === 'SERVICO' ? services.find(s => s.id === item.item_id) : null;

                      // Valor unitário: se filtro de data_base ativo, usa histórico
                      const unitCost = item.tipo_item === 'INSUMO'
                        ? (dataBaseFiltro ? getValorInsumoParaDataBase(item.item_id) : item.custo_unitario_snapshot || 0)
                        : (item.custo_unitario_snapshot || 0);

                      const totalItem = (item.quantidade || 0) * unitCost;

                      let displayCategoria = 'MAT';
                      let custoMat = 0, custoMO = 0;
                      if (item.tipo_item === 'INSUMO') {
                        displayCategoria = insumo?.categoria === 'MAO_OBRA' ? 'MO' : 'MAT';
                        if (insumo?.categoria === 'MAO_OBRA') custoMO = totalItem;
                        else custoMat = totalItem;
                      } else {
                        displayCategoria = 'MISTO';
                        if (subService?.custo_total > 0) {
                          custoMat = totalItem * ((subService.custo_material || 0) / subService.custo_total);
                          custoMO = totalItem * ((subService.custo_mao_obra || 0) / subService.custo_total);
                        }
                      }

                      // Indicar se o valor é do histórico
                      const isHistorico = dataBaseFiltro && item.tipo_item === 'INSUMO' && insumo?.data_base !== dataBaseFiltro;

                      return (
                        <TableRow key={item.id} className={isHistorico ? 'bg-amber-50/50' : ''}>
                          <TableCell className="text-xs font-mono">{getItemCode(item)}</TableCell>
                          <TableCell className="text-xs font-mono">{item.tipo_item}</TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate" title={getItemDesc(item)}>{getItemDesc(item)}</TableCell>
                          <TableCell className="text-xs">{getItemUnit(item)}</TableCell>
                          <TableCell>{item.quantidade}</TableCell>
                          <TableCell className={isHistorico ? 'text-amber-600 font-medium' : ''}>
                            {fmt(unitCost)}
                          </TableCell>
                          <TableCell className="font-bold">{fmt(totalItem)}</TableCell>
                          <TableCell className="text-xs">{displayCategoria}</TableCell>
                          <TableCell className="text-right text-xs text-slate-600">{custoMat > 0 ? fmt(custoMat) : '-'}</TableCell>
                          <TableCell className="text-right text-xs text-slate-600">{custoMO > 0 ? fmt(custoMO) : '-'}</TableCell>
                          <TableCell className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setEditingItem({ ...item })} className="text-blue-600">
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

                {editingItem && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-md bg-white">
                      <CardHeader><CardTitle>Editar Item</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Quantidade</Label>
                          <Input type="number" value={editingItem.quantidade} onChange={e => setEditingItem({ ...editingItem, quantidade: e.target.value })} />
                        </div>
                        <div>
                          <Label>Categoria</Label>
                          <Select value={editingItem.categoria} onValueChange={v => setEditingItem({ ...editingItem, categoria: v })}>
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

        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-slate-900 text-white">
            <CardHeader><CardTitle>{dataBaseFiltro ? `Simulação ${dataBaseFiltro}` : 'Custos Atuais'}</CardTitle></CardHeader>
            <CardContent>
              {dataBaseFiltro && totaisSimulados ? (
                <>
                  <div className="text-3xl font-bold mb-4">{fmt(totaisSimulados.total)}</div>
                  <div className="space-y-2 text-sm border-t border-slate-700 pt-2">
                    <div className="flex justify-between">
                      <span>Material</span>
                      <span>{fmt(totaisSimulados.mat)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mão de Obra</span>
                      <span>{fmt(totaisSimulados.mo)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-700">
                      <span className="text-amber-400">Data Base Filtro</span>
                      <span className="text-amber-400">{dataBaseFiltro}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-4">{fmt(service.custo_total)}</div>
                  <div className="space-y-2 text-sm border-t border-slate-700 pt-2">
                    <div className="flex justify-between">
                      <span>Material</span>
                      <span>{fmt(service.custo_material)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mão de Obra</span>
                      <span>{fmt(service.custo_mao_obra)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-700">
                      <span className="text-slate-400">Data Base</span>
                      <span>{service.data_base || '-'}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {dataBaseFiltro && totaisSimulados && service.custo_total > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4">
                <p className="text-xs text-amber-800 font-medium mb-2">Variação vs. Atual</p>
                <div className="text-lg font-bold text-amber-700">
                  {totaisSimulados.total > service.custo_total ? '+' : ''}
                  {(((totaisSimulados.total - service.custo_total) / service.custo_total) * 100).toFixed(2)}%
                </div>
                <p className="text-xs text-amber-600">
                  {fmt(totaisSimulados.total)} vs {fmt(service.custo_total)}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}