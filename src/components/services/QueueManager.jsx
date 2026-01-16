import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, Trash2, AlertCircle, Play } from 'lucide-react';
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function QueueManager({ open, onOpenChange }) {
  const [processing, setProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState(null);
  
  const { data: queueItems = [], isLoading, refetch } = useQuery({
    queryKey: ['recalculationQueue'],
    queryFn: () => base44.entities.RecalculationQueue.list(),
    enabled: open,
    refetchInterval: open && !processing ? 3000 : false
  });

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list(),
    enabled: open
  });

  const retryMutation = useMutation({
    mutationFn: async (itemId) => {
      await base44.entities.RecalculationQueue.update(itemId, {
        status: 'pending',
        retry_count: 0,
        error_message: null
      });
    },
    onSuccess: () => {
      refetch();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId) => {
      await base44.entities.RecalculationQueue.delete(itemId);
    },
    onSuccess: () => {
      toast.success('Item removido da fila');
      refetch();
    }
  });

  const clearAllMutation = useMutation({
    mutationFn: async (status) => {
      const itemsToDelete = queueItems.filter(item => item.status === status);
      await Promise.all(itemsToDelete.map(item => base44.entities.RecalculationQueue.delete(item.id)));
    },
    onSuccess: (_, status) => {
      toast.success(`Todos os itens ${status === 'failed' ? 'falhados' : 'concluídos'} removidos`);
      refetch();
    }
  });

  const handleProcessQueue = async () => {
    setProcessing(true);
    setProcessStatus({ processed: 0, failed: 0 });
    
    try {
      let iterationCount = 0;
      const maxIterations = 1000;
      let currentProcessed = 0;
      let currentFailed = 0;
      
      while (iterationCount < maxIterations) {
        iterationCount++;
        
        // Invocar função backend
        const result = await base44.functions.invoke('processRecalculationQueue', {});
        
        if (result.data.processed === 0 && result.data.failed === 0) {
          // Nenhum item processado, sair do loop
          break;
        }

        currentProcessed += result.data.processed || 0;
        currentFailed += result.data.failed || 0;
        
        // Consultar itens pendentes restantes
        const pendingItems = await base44.entities.RecalculationQueue.filter({ status: 'pending' });
        
        setProcessStatus({
          processed: currentProcessed,
          failed: currentFailed,
          remaining: pendingItems.length
        });

        if (pendingItems.length === 0) {
          break;
        }

        // Aguardar antes da próxima iteração
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      if (iterationCount >= maxIterations) {
        toast.warning(`Processamento pausado após ${maxIterations} iterações`);
      } else {
        toast.success(`Processamento concluído! ${currentProcessed} processados, ${currentFailed} falharam`);
      }
      
      refetch();
    } catch (e) {
      toast.error("Erro ao processar fila: " + e.message);
      console.error(e);
    } finally {
      setProcessing(false);
      setProcessStatus(null);
    }
  };

  const getServiceName = (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    return service ? `${service.codigo} - ${service.descricao}` : serviceId;
  };

  const getStatusBadge = (status) => {
    const config = {
      pending: { label: 'Pendente', icon: Clock, className: 'bg-yellow-100 text-yellow-800' },
      processing: { label: 'Processando', icon: Loader2, className: 'bg-blue-100 text-blue-800' },
      completed: { label: 'Concluído', icon: CheckCircle2, className: 'bg-green-100 text-green-800' },
      failed: { label: 'Falhou', icon: XCircle, className: 'bg-red-100 text-red-800' }
    };
    
    const { label, icon: Icon, className } = config[status] || config.pending;
    
    return (
      <Badge variant="outline" className={className}>
        <Icon className={`h-3 w-3 mr-1 ${status === 'processing' ? 'animate-spin' : ''}`} />
        {label}
      </Badge>
    );
  };

  const pendingCount = queueItems.filter(item => item.status === 'pending').length;
  const processingCount = queueItems.filter(item => item.status === 'processing').length;
  const failedCount = queueItems.filter(item => item.status === 'failed').length;
  const completedCount = queueItems.filter(item => item.status === 'completed').length;

  const sortedItems = [...queueItems].sort((a, b) => {
    const statusOrder = { processing: 0, pending: 1, failed: 2, completed: 3 };
    return (statusOrder[a.status] || 999) - (statusOrder[b.status] || 999);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Gerenciador de Fila de Recálculo</DialogTitle>
          <DialogDescription>
            Monitore e gerencie o processamento dos serviços
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-yellow-700 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-yellow-900">{pendingCount}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Processando</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{processingCount}</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-700 mb-1">
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Falhados</span>
            </div>
            <p className="text-2xl font-bold text-red-900">{failedCount}</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Concluídos</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{completedCount}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {pendingCount > 0 && (
            <Button
              size="sm"
              onClick={handleProcessQueue}
              disabled={processing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {processStatus ? `${processStatus.processed} (${processStatus.remaining} restantes)` : 'Processando...'}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Processar Agora ({pendingCount})
                </>
              )}
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || processing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          
          {failedCount > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (confirm(`Reprocessar ${failedCount} itens falhados?`)) {
                    const failedItems = queueItems.filter(item => item.status === 'failed');
                    await Promise.all(failedItems.map(item => retryMutation.mutateAsync(item.id)));
                    toast.success(`${failedCount} itens reenfileirados`);
                  }
                }}
                disabled={processing}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocessar Falhados
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Remover ${failedCount} itens falhados?`)) {
                    clearAllMutation.mutate('failed');
                  }
                }}
                disabled={processing}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Falhados
              </Button>
            </>
          )}
          
          {completedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Remover ${completedCount} itens concluídos?`)) {
                  clearAllMutation.mutate('completed');
                }
              }}
              disabled={processing}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar Concluídos
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px] border rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : queueItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <CheckCircle2 className="h-12 w-12 mb-2" />
              <p>Fila vazia</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-20">Tentativas</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {getServiceName(item.service_id)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(item.status)}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {item.retry_count || 0}/3
                    </TableCell>
                    <TableCell>
                      {item.error_message && (
                        <div className="flex items-start gap-1 text-xs text-red-600">
                          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{item.error_message}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {item.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => retryMutation.mutate(item.id)}
                            disabled={processing}
                            title="Reenviar"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Remover este item?')) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          disabled={processing}
                          title="Remover"
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}