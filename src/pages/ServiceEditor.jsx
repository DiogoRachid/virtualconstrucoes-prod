import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Save, Plus, Trash2, Calculator, Loader2 } from 'lucide-react';
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

export default function ServiceEditor() {
  const urlParams = new URLSearchParams(window.location.search);
  const serviceId = urlParams.get('id');
  const queryClient = useQueryClient();

  // PROMPT 7: INTERFACE DINÂMICA
  const [service, setService] = useState({
    codigo: '', descricao: '', unidade: 'UN', ativo: true
  });
  const [items, setItems] = useState([]);
  const [inputs, setInputs] = useState([]);
  const [services, setServices] = useState([]);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const [allInputs, allServices] = await Promise.all([
        base44.entities.Input.list(),
        base44.entities.Service.list()
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
      await base44.entities.Service.update(id, service);
      toast.success("Cabeçalho salvo");
    }
  };

  // Add Item
  const [newItem, setNewItem] = useState({ type: 'INSUMO', id: '', qtd: 1, cat: 'MATERIAL' });
  
  const handleAddItem = async () => {
    if (!serviceId) return toast.error("Salve o serviço antes de adicionar itens");
    if (!newItem.id) return;

    // PROMPT 4: BLOQUEIO CIRCULAR
    if (newItem.type === 'SERVICO') {
      const hasCycle = await Engine.checkCircularDependency(serviceId, newItem.id);
      if (hasCycle) return toast.error("Dependência circular não permitida.");
    }

    // Get snapshot data
    let unitCost = 0;
    if (newItem.type === 'INSUMO') {
      const i = inputs.find(x => x.id === newItem.id);
      unitCost = i ? i.valor_unitario : 0;
    } else {
      const s = services.find(x => x.id === newItem.id);
      unitCost = s ? s.custo_total : 0;
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
    await Engine.recalculateService(serviceId);
    await Engine.updateDependents('SERVICO', serviceId);

    // Reload
    const its = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
    setItems(its.sort((a,b) => a.ordem - b.ordem));
    const s = await base44.entities.Service.filter({ id: serviceId }).then(r => r[0]);
    setService(s);
    
    toast.success("Item adicionado e custos recalculados");
    setNewItem({ ...newItem, id: '', qtd: 1 });
  };

  const handleDeleteItem = async (itemId) => {
    await base44.entities.ServiceItem.delete(itemId);
    await Engine.recalculateService(serviceId);
    await Engine.updateDependents('SERVICO', serviceId);
    
    // Reload
    const its = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
    setItems(its);
    const s = await base44.entities.Service.filter({ id: serviceId }).then(r => r[0]);
    setService(s);
  };

  // PROMPT 6: DESCRIÇÃO DIRETA (Helper para exibir)
  const getItemDesc = (item) => {
    if (item.tipo_item === 'INSUMO') return inputs.find(i => i.id === item.item_id)?.descricao || '???';
    return services.find(s => s.id === item.item_id)?.descricao || '???';
  };

  const getItemUnit = (item) => {
    if (item.tipo_item === 'INSUMO') return inputs.find(i => i.id === item.item_id)?.unidade || 'UN';
    return services.find(s => s.id === item.item_id)?.unidade || 'UN';
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
                <div className="flex gap-2 items-end mb-4 bg-slate-50 p-3 rounded">
                  <div className="w-32">
                    <Label>Tipo</Label>
                    <Select value={newItem.type} onValueChange={v => setNewItem({...newItem, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INSUMO">Insumo</SelectItem>
                        <SelectItem value="SERVICO">Serviço</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label>Item</Label>
                    <Select value={newItem.id} onValueChange={v => setNewItem({...newItem, id: v})}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(newItem.type === 'INSUMO' ? inputs : services.filter(s => s.id !== serviceId)).map(i => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.codigo} - {i.descricao.substring(0, 50)}...
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        <SelectItem value="MAO_DE_OBRA">Mão de Obra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddItem}><Plus className="h-4 w-4"/></Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição (Vinculada)</TableHead>
                      <TableHead>Und</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Unit. (Snapshot)</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Cat</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs font-mono">{item.tipo_item}</TableCell>
                        <TableCell className="text-sm">{getItemDesc(item)}</TableCell>
                        <TableCell className="text-xs">{getItemUnit(item)}</TableCell>
                        <TableCell>{item.quantidade}</TableCell>
                        <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_unitario_snapshot)}</TableCell>
                        <TableCell className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_total_item)}</TableCell>
                        <TableCell className="text-xs">{item.categoria}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)} className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
               </div>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}