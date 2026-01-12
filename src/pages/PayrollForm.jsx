import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { DollarSign, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PayrollForm() {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
  
  const [mesReferencia, setMesReferencia] = useState(currentMonth);
  const [dataPagamento, setDataPagamento] = useState(today);
  const [payrollItems, setPayrollItems] = useState([]);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ status: 'ativo' })
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.filter({ status: 'ativo' })
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.filter({ status: 'ativa' })
  });

  // Inicializar lista de colaboradores
  useEffect(() => {
    if (employees.length && payrollItems.length === 0) {
      const items = employees.map(emp => ({
        colaborador_id: emp.id,
        colaborador_nome: emp.nome_completo,
        valor_liquido: emp.salario || 0
      }));
      setPayrollItems(items);
    }
  }, [employees]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const centroCustoRH = costCenters.find(c => c.tipo === 'rh');
      const itauEmpresas = bankAccounts.find(acc => 
        acc.nome?.toLowerCase().includes('itaú empresas') || 
        acc.nome?.toLowerCase().includes('itau empresas')
      );

      // Criar folhas e contas a pagar em lote
      const promises = payrollItems
        .filter(item => item.valor_liquido > 0)
        .map(async (item) => {
          const payrollData = {
            colaborador_id: item.colaborador_id,
            colaborador_nome: item.colaborador_nome,
            mes_referencia: mesReferencia,
            valor_liquido: parseFloat(item.valor_liquido),
            data_pagamento: dataPagamento,
            status: 'pendente',
            centro_custo_id: centroCustoRH?.id || '',
            centro_custo_nome: centroCustoRH?.nome || 'RH'
          };

          const payroll = await base44.entities.Payroll.create(payrollData);

          // Criar conta a pagar
          await base44.entities.AccountPayable.create({
            descricao: `Folha de Pagamento - ${item.colaborador_nome} - ${mesReferencia}`,
            valor: parseFloat(item.valor_liquido),
            data_vencimento: dataPagamento,
            data_compra: new Date().toISOString().split('T')[0],
            conta_bancaria_id: itauEmpresas?.id || '',
            conta_bancaria_nome: itauEmpresas?.nome || '',
            status: 'em_aberto',
            forma_pagamento: 'transferencia',
            centro_custo_id: centroCustoRH?.id || '',
            centro_custo_nome: centroCustoRH?.nome || 'RH',
            observacoes: `Gerado automaticamente pela folha de pagamento - ${mesReferencia}`
          });

          return payroll;
        });

      return Promise.all(promises);
    },
    onSuccess: (results) => {
      toast.success(`${results.length} folhas lançadas com sucesso!`);
      window.location.href = createPageUrl('Payrolls');
    },
    onError: (error) => {
      toast.error('Erro ao salvar folhas de pagamento');
      console.error(error);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const itemsWithValue = payrollItems.filter(item => item.valor_liquido > 0);
    if (itemsWithValue.length === 0) {
      toast.error('Adicione pelo menos um valor de pagamento');
      return;
    }
    saveMutation.mutate();
  };

  const updateItemValue = (colaboradorId, valor) => {
    setPayrollItems(prev =>
      prev.map(item =>
        item.colaborador_id === colaboradorId
          ? { ...item, valor_liquido: parseFloat(valor) || 0 }
          : item
      )
    );
  };

  return (
    <div>
      <PageHeader
        title="Lançar Folha de Pagamento em Lote"
        subtitle="Informe os valores para todos os colaboradores"
        icon={DollarSign}
        backUrl={createPageUrl('Payrolls')}
      />

      <form onSubmit={handleSubmit} className="max-w-6xl">
        <div className="space-y-6">
          {/* Dados Gerais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados Gerais da Folha</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="mes_referencia">Mês de Referência *</Label>
                <Input
                  id="mes_referencia"
                  value={mesReferencia}
                  onChange={(e) => setMesReferencia(e.target.value)}
                  placeholder="MM/YYYY"
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="data_pagamento">Data de Pagamento *</Label>
                <Input
                  id="data_pagamento"
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Lista de Colaboradores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Valores por Colaborador</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 pb-2 border-b font-semibold text-sm">
                  <span>Colaborador</span>
                  <span>Valor Líquido (R$)</span>
                </div>
                {payrollItems.map((item) => (
                  <div key={item.colaborador_id} className="grid grid-cols-2 gap-4 items-center py-2 border-b">
                    <span className="text-sm">{item.colaborador_nome}</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.valor_liquido}
                      onChange={(e) => updateItemValue(item.colaborador_id, e.target.value)}
                      placeholder="0,00"
                      className="font-semibold"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t flex justify-between items-center">
                <span className="font-bold text-lg">Total:</span>
                <span className="font-bold text-xl text-blue-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    payrollItems.reduce((sum, item) => sum + (parseFloat(item.valor_liquido) || 0), 0)
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Lançar Folhas
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('Payrolls')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}