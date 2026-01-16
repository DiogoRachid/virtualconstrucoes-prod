import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Loader2, RefreshCw } from 'lucide-react';
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

export default function ServiceActions({ open, onOpenChange, selectedIds, onClearSelection, onRefresh }) {
  const [bulkDate, setBulkDate] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [enqueueing, setEnqueueing] = useState(false);

  const handleBulkUpdateDate = async () => {
    if (!bulkDate) return toast.error("Informe a data");
    if (!confirm(`Atualizar a Data Base de TODOS os serviços para ${bulkDate}?`)) return;

    setBulkUpdating(true);
    try {
      const allServices = await Engine.fetchAll('Service');
      for (let i = 0; i < allServices.length; i += 100) {
        const chunk = allServices.slice(i, i + 100);
        await Promise.all(chunk.map(s => base44.entities.Service.update(s.id, { data_base: bulkDate })));
      }
      toast.success(`${allServices.length} serviços atualizados.`);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao atualizar em massa");
      console.error(e);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleEnqueueAll = async () => {
    if (!confirm('Adicionar TODOS os serviços à fila de recálculo?')) return;
    
    setEnqueueing(true);
    try {
      const allServices = await Engine.fetchAll('Service');
      
      // Criar em lotes para evitar sobrecarga
      for (let i = 0; i < allServices.length; i += 50) {
        const batch = allServices.slice(i, i + 50);
        await Promise.all(batch.map(service => 
          base44.entities.RecalculationQueue.create({
            service_id: service.id,
            priority: service.nivel_max_dependencia || 0,
            status: 'pending'
          }).catch(() => {}) // Ignora se já existe
        ));
      }
      
      toast.success(`${allServices.length} serviços adicionados à fila!`);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao adicionar à fila");
      console.error(e);
    } finally {
      setEnqueueing(false);
    }
  };

  const handleEnqueueSelected = async () => {
    const count = selectedIds.size;
    if (count === 0) return toast.error("Selecione ao menos um serviço");
    if (!confirm(`Adicionar ${count} serviços selecionados à fila?`)) return;
    
    setEnqueueing(true);
    try {
      const allServices = await Engine.fetchAll('Service');
      const selected = allServices.filter(s => selectedIds.has(s.id));
      
      await Promise.all(selected.map(service => 
        base44.entities.RecalculationQueue.create({
          service_id: service.id,
          priority: service.nivel_max_dependencia || 0,
          status: 'pending'
        }).catch(() => {}) // Ignora se já existe
      ));
      
      toast.success(`${count} serviços adicionados à fila!`);
      onClearSelection();
      onRefresh();
    } catch (e) {
      toast.error("Erro ao adicionar à fila");
      console.error(e);
    } finally {
      setEnqueueing(false);
    }
  };

  const handleEnqueueZero = async () => {
    setEnqueueing(true);
    try {
      const allServices = await Engine.fetchAll('Service');
      const zeroServices = allServices.filter(s => !s.custo_total || s.custo_total === 0);
      
      if (zeroServices.length === 0) {
        toast.info("Não há serviços com custo zerado");
        setEnqueueing(false);
        return;
      }
      
      if (!confirm(`Adicionar ${zeroServices.length} serviços zerados à fila?`)) {
        setEnqueueing(false);
        return;
      }
      
      await Promise.all(zeroServices.map(service => 
        base44.entities.RecalculationQueue.create({
          service_id: service.id,
          priority: service.nivel_max_dependencia || 0,
          status: 'pending'
        }).catch(() => {}) // Ignora se já existe
      ));
      
      toast.success(`${zeroServices.length} serviços zerados adicionados à fila!`);
      onRefresh();
    } catch (e) {
      toast.error("Erro ao adicionar à fila");
      console.error(e);
    } finally {
      setEnqueueing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ações em Massa</DialogTitle>
          <DialogDescription>
            Execute operações em múltiplos serviços de uma vez
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Recálculo */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Recálculo de Custos
            </h3>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleEnqueueAll}
                disabled={enqueueing}
              >
                {enqueueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Recalcular Todos
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleEnqueueSelected}
                disabled={enqueueing || selectedIds.size === 0}
              >
                {enqueueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Recalcular Selecionados ({selectedIds.size})
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleEnqueueZero}
                disabled={enqueueing}
              >
                {enqueueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Recalcular Zerados
              </Button>
            </div>
          </div>

          {/* Atualização de Data Base */}
          <div className="space-y-3 pt-3 border-t">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Alterar Data Base Global
            </h3>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">
                Isso alterará a data base de TODOS os serviços
              </Label>
              <Input 
                value={bulkDate} 
                onChange={e => setBulkDate(e.target.value)} 
                placeholder="MM/AAAA (ex: 01/2026)" 
              />
              <Button 
                onClick={handleBulkUpdateDate}
                disabled={bulkUpdating || !bulkDate}
                className="w-full"
              >
                {bulkUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}
                {bulkUpdating ? 'Atualizando...' : 'Confirmar Atualização'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}