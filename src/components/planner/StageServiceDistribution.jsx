import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Save, AlertTriangle, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function StageServiceDistribution({ stage, budget, duracao_meses, onClose }) {
  const queryClient = useQueryClient();
  const [selectedServices, setSelectedServices] = useState([]);
  const [distributions, setDistributions] = useState({});
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceId, setNewServiceId] = useState('');

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems', budget.id],
    queryFn: () => base44.entities.BudgetItem.filter({ orcamento_id: budget.id })
  });

  const { data: existingDistributions = [] } = useQuery({
    queryKey: ['distributions', stage.id],
    queryFn: () => base44.entities.ServiceMonthlyDistribution.filter({ project_stage_id: stage.id })
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      // Deletar distribuições antigas
      for (const dist of existingDistributions) {
        await base44.entities.ServiceMonthlyDistribution.delete(dist.id);
      }

      // Criar novas
      const toCreate = [];
      for (const servicoId of selectedServices) {
        const budgetItem = budgetItems.find(bi => bi.servico_id === servicoId);
        if (!budgetItem) continue;

        for (let mes = 1; mes <= duracao_meses; mes++) {
          const dist = distributions[servicoId]?.[mes];
          if (dist && (dist.quantidade > 0 || dist.percentual > 0)) {
            const quantidade = dist.quantidade || (budgetItem.quantidade * (dist.percentual / 100));
            const valor_mes = quantidade * (budgetItem.valor_unitario || 0);

            toCreate.push({
              orcamento_id: budget.id,
              project_stage_id: stage.id,
              servico_id: servicoId,
              servico_codigo: budgetItem.servico_codigo,
              servico_descricao: budgetItem.servico_descricao,
              mes,
              quantidade,
              percentual: dist.percentual || (quantidade / budgetItem.quantidade * 100),
              valor_mes
            });
          }
        }
      }

      if (toCreate.length > 0) {
        await base44.entities.ServiceMonthlyDistribution.bulkCreate(toCreate);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['distributions']);
      toast.success('Distribuição salva!');
      onClose();
    }
  });

  useEffect(() => {
    if (existingDistributions.length > 0) {
      const services = [...new Set(existingDistributions.map(d => d.servico_id))];
      setSelectedServices(services);

      const dist = {};
      for (const d of existingDistributions) {
        if (!dist[d.servico_id]) dist[d.servico_id] = {};
        dist[d.servico_id][d.mes] = {
          quantidade: d.quantidade,
          percentual: d.percentual
        };
      }
      setDistributions(dist);
    }
  }, [existingDistributions]);

  const handleAddService = () => {
    if (!newServiceId || selectedServices.includes(newServiceId)) return;
    setSelectedServices([...selectedServices, newServiceId]);
    setShowAddService(false);
    setNewServiceId('');
  };

  const handleRemoveService = (servicoId) => {
    setSelectedServices(selectedServices.filter(s => s !== servicoId));
    const newDist = { ...distributions };
    delete newDist[servicoId];
    setDistributions(newDist);
  };

  const updateDistribution = (servicoId, mes, field, value) => {
    const newDist = { ...distributions };
    if (!newDist[servicoId]) newDist[servicoId] = {};
    if (!newDist[servicoId][mes]) newDist[servicoId][mes] = { quantidade: 0, percentual: 0 };
    
    const budgetItem = budgetItems.find(bi => bi.servico_id === servicoId);
    if (!budgetItem) return;

    if (field === 'percentual') {
      newDist[servicoId][mes].percentual = parseFloat(value) || 0;
      newDist[servicoId][mes].quantidade = (budgetItem.quantidade * (parseFloat(value) || 0)) / 100;
    } else {
      newDist[servicoId][mes].quantidade = parseFloat(value) || 0;
      newDist[servicoId][mes].percentual = ((parseFloat(value) || 0) / budgetItem.quantidade) * 100;
    }

    setDistributions(newDist);
  };

  const getTotalPercentual = (servicoId) => {
    let total = 0;
    for (let mes = 1; mes <= duracao_meses; mes++) {
      total += distributions[servicoId]?.[mes]?.percentual || 0;
    }
    return Math.round(total * 100) / 100;
  };

  const getValorMensal = (mes) => {
    let total = 0;
    for (const servicoId of selectedServices) {
      const budgetItem = budgetItems.find(bi => bi.servico_id === servicoId);
      if (!budgetItem) continue;
      const qtd = distributions[servicoId]?.[mes]?.quantidade || 0;
      total += qtd * (budgetItem.valor_unitario || 0);
    }
    return total;
  };

  const getValorAcumulado = (mes) => {
    let total = 0;
    for (let m = 1; m <= mes; m++) {
      total += getValorMensal(m);
    }
    return total;
  };

  const getPercentualSobreObra = (mes) => {
    const valorMes = getValorMensal(mes);
    return budget.valor_total > 0 ? (valorMes / budget.valor_total * 100) : 0;
  };

  const availableServices = budgetItems.filter(bi => !selectedServices.includes(bi.servico_id));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Distribuição de Serviços - {stage.nome}
          </DialogTitle>
          <DialogDescription>
            Distribua os serviços e suas quantidades/percentuais pelos meses da etapa
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowAddService(!showAddService)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Serviço
            </Button>
          </div>

          {showAddService && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex gap-2">
                  <Select value={newServiceId} onValueChange={setNewServiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableServices.map(bi => (
                        <SelectItem key={bi.servico_id} value={bi.servico_id}>
                          {bi.servico_codigo} - {bi.servico_descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddService}>Adicionar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedServices.map(servicoId => {
            const budgetItem = budgetItems.find(bi => bi.servico_id === servicoId);
            if (!budgetItem) return null;

            const totalPerc = getTotalPercentual(servicoId);
            const isValid = totalPerc <= 100;

            return (
              <Card key={servicoId}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">{budgetItem.servico_codigo} - {budgetItem.servico_descricao}</CardTitle>
                      <CardDescription>
                        Quantidade total: {budgetItem.quantidade} {budgetItem.unidade || ''} | Valor unitário: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(budgetItem.valor_unitario || 0)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {isValid ? (
                        <Badge className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {totalPerc.toFixed(1)}%
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {totalPerc.toFixed(1)}%
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveService(servicoId)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">Mês</th>
                          {Array.from({ length: duracao_meses }, (_, i) => i + 1).map(mes => (
                            <th key={mes} className="text-center py-2 px-2 min-w-[100px]">{mes}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="py-2 px-2 font-medium">%</td>
                          {Array.from({ length: duracao_meses }, (_, i) => i + 1).map(mes => (
                            <td key={mes} className="py-2 px-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={distributions[servicoId]?.[mes]?.percentual || ''}
                                onChange={(e) => updateDistribution(servicoId, mes, 'percentual', e.target.value)}
                                className="h-8 text-center"
                              />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="py-2 px-2 font-medium">Qtd</td>
                          {Array.from({ length: duracao_meses }, (_, i) => i + 1).map(mes => (
                            <td key={mes} className="py-2 px-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={distributions[servicoId]?.[mes]?.quantidade || ''}
                                onChange={(e) => updateDistribution(servicoId, mes, 'quantidade', e.target.value)}
                                className="h-8 text-center"
                              />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {selectedServices.length > 0 && (
            <Card className="bg-blue-50">
              <CardHeader>
                <CardTitle className="text-base">Resumo Financeiro por Mês</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-200">
                        <th className="text-left py-2 px-2">Métrica</th>
                        {Array.from({ length: duracao_meses }, (_, i) => i + 1).map(mes => (
                          <th key={mes} className="text-center py-2 px-2 min-w-[120px]">Mês {mes}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-blue-200">
                        <td className="py-2 px-2 font-medium">Valor Mensal</td>
                        {Array.from({ length: duracao_meses }, (_, i) => i + 1).map(mes => (
                          <td key={mes} className="py-2 px-2 text-center font-semibold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getValorMensal(mes))}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-blue-200">
                        <td className="py-2 px-2 font-medium">Acumulado</td>
                        {Array.from({ length: duracao_meses }, (_, i) => i + 1).map(mes => (
                          <td key={mes} className="py-2 px-2 text-center text-blue-700 font-bold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getValorAcumulado(mes))}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-medium">% da Obra</td>
                        {Array.from({ length: duracao_meses }, (_, i) => i + 1).map(mes => (
                          <td key={mes} className="py-2 px-2 text-center">
                            <Badge variant="outline">
                              {getPercentualSobreObra(mes).toFixed(2)}%
                            </Badge>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button 
              onClick={() => saveMutation.mutate()} 
              disabled={saveMutation.isPending || selectedServices.some(s => getTotalPercentual(s) > 100)}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Distribuição'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}