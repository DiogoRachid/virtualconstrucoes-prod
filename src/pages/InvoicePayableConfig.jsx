import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Calendar, DollarSign, FolderOpen, AlertCircle, CheckCircle2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

export default function InvoicePayableConfigPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoiceId');

  const [paymentInstallments, setPaymentInstallments] = useState([]);
  const [selectedCostCenter, setSelectedCostCenter] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState('');

  // Fetch invoice
  const { data: invoice } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => base44.entities.Invoice.read(invoiceId)
  });

  // Fetch cost centers
  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.list()
  });

  // Fetch bank accounts
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.list()
  });

  // Initialize installments from invoice value
  React.useEffect(() => {
    if (invoice && paymentInstallments.length === 0) {
      const singleInstallment = {
        id: 1,
        numero: 1,
        valor: invoice.valor_total,
        data_vencimento: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
        dias: 30
      };
      setPaymentInstallments([singleInstallment]);
    }
  }, [invoice]);

  // Add installment
  const addInstallment = () => {
    const newId = Math.max(...paymentInstallments.map(i => i.id), 0) + 1;
    setPaymentInstallments([
      ...paymentInstallments,
      {
        id: newId,
        numero: paymentInstallments.length + 1,
        valor: 0,
        data_vencimento: '',
        dias: 0
      }
    ]);
  };

  // Update installment
  const updateInstallment = (id, field, value) => {
    setPaymentInstallments(paymentInstallments.map(inst =>
      inst.id === id
        ? {
            ...inst,
            [field]: field === 'valor' || field === 'dias' ? parseFloat(value) || 0 : value,
            ...(field === 'dias' && {
              data_vencimento: new Date(new Date().setDate(new Date().getDate() + parseInt(value))).toISOString().split('T')[0]
            })
          }
        : inst
    ));
  };

  // Remove installment
  const removeInstallment = (id) => {
    setPaymentInstallments(paymentInstallments.filter(inst => inst.id !== id));
  };

  // Create payables mutation
  const createPayablesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCostCenter) {
        throw new Error('Selecione um centro de custo');
      }

      const createdPayables = [];
      
      for (const installment of paymentInstallments) {
        if (!installment.valor || !installment.data_vencimento) continue;

        const payable = await base44.entities.AccountPayable.create({
          descricao: `${invoice.fornecedor_nome} - NF ${invoice.numero_nota}/${invoice.serie} (Parcela ${installment.numero}/${paymentInstallments.length})`,
          valor: installment.valor,
          data_vencimento: installment.data_vencimento,
          data_compra: invoice.data_emissao,
          fornecedor_id: invoice.fornecedor_id,
          fornecedor_nome: invoice.fornecedor_nome,
          centro_custo_id: selectedCostCenter,
          centro_custo_nome: costCenters.find(cc => cc.id === selectedCostCenter)?.nome,
          conta_bancaria_id: selectedBankAccount || null,
          conta_bancaria_nome: bankAccounts.find(ba => ba.id === selectedBankAccount)?.nome || null,
          obra_id: invoice.obra_id,
          obra_nome: invoice.obra_nome,
          status: 'em_aberto',
          forma_pagamento: 'transferencia',
          numero_documento: `${invoice.numero_nota}/${invoice.serie}`
        });

        createdPayables.push(payable);
      }

      // Update invoice status
      await base44.entities.Invoice.update(invoiceId, { status: 'processada' });

      return createdPayables;
    },
    onSuccess: (payables) => {
      toast({ title: `${payables.length} contas a pagar criadas com sucesso!` });
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      setTimeout(() => {
        navigate(createPageUrl('AccountsPayable'));
      }, 2000);
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar contas a pagar', description: error.message, variant: 'destructive' });
    }
  });

  if (!invoice) return <div>Carregando...</div>;

  const totalInstallments = paymentInstallments.reduce((sum, inst) => sum + (inst.valor || 0), 0);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title={`Configurar Contas a Pagar - NF ${invoice.numero_nota}/${invoice.serie}`}
        subtitle={`Fornecedor: ${invoice.fornecedor_nome} | Valor Total: R$ ${invoice.valor_total.toFixed(2)}`}
        icon={DollarSign}
      />

      <div className="space-y-6">
        {/* Informações da Nota */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da Nota Fiscal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-600">Fornecedor</p>
                <p className="font-medium">{invoice.fornecedor_nome}</p>
              </div>
              <div>
                <p className="text-slate-600">CNPJ</p>
                <p className="font-medium">{invoice.fornecedor_cnpj}</p>
              </div>
              <div>
                <p className="text-slate-600">Data de Emissão</p>
                <p className="font-medium">{new Date(invoice.data_emissao).toLocaleDateString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-slate-600">Valor Total</p>
                <p className="font-medium text-green-600">R$ {invoice.valor_total.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Centro de Custo e Conta Bancária */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuração Financeira</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cost-center">Centro de Custo *</Label>
              <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                <SelectTrigger id="cost-center">
                  <SelectValue placeholder="Selecione o centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters.map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>
                      {cc.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank-account">Conta Bancária (opcional)</Label>
              <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                <SelectTrigger id="bank-account">
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Nenhuma (vincular depois)</SelectItem>
                  {bankAccounts.map(ba => (
                    <SelectItem key={ba.id} value={ba.id}>
                      {ba.nome} - {ba.banco}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Parcelas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Parcelamento</CardTitle>
              <Button
                onClick={addInstallment}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                + Adicionar Parcela
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {paymentInstallments.map((inst, idx) => (
                <div key={inst.id} className="p-4 border rounded-lg space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs text-slate-600">Parcela</Label>
                      <Input
                        type="number"
                        value={inst.numero}
                        onChange={(e) => updateInstallment(inst.id, 'numero', e.target.value)}
                        className="text-center"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={inst.valor || ''}
                        onChange={(e) => updateInstallment(inst.id, 'valor', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Dias para Vencer</Label>
                      <Input
                        type="number"
                        value={inst.dias || ''}
                        onChange={(e) => updateInstallment(inst.id, 'dias', e.target.value)}
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Data Vencimento</Label>
                      <Input
                        type="date"
                        value={inst.data_vencimento}
                        onChange={(e) => updateInstallment(inst.id, 'data_vencimento', e.target.value)}
                      />
                    </div>
                  </div>
                  {paymentInstallments.length > 1 && (
                    <div className="flex justify-end">
                      <Button
                        onClick={() => removeInstallment(inst.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Remover
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {/* Resumo */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Total das Parcelas</span>
                  <span className={`text-lg font-bold ${
                    Math.abs(totalInstallments - invoice.valor_total) < 0.01
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}>
                    R$ {totalInstallments.toFixed(2)}
                  </span>
                </div>
                {Math.abs(totalInstallments - invoice.valor_total) > 0.01 && (
                  <p className="text-xs text-red-600 mt-2">
                    Diferença: R$ {Math.abs(totalInstallments - invoice.valor_total).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ações */}
        <div className="flex gap-3">
          <Button
            onClick={() => createPayablesMutation.mutate()}
            disabled={!selectedCostCenter || paymentInstallments.length === 0 || createPayablesMutation.isPending}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {createPayablesMutation.isPending ? 'Criando...' : 'Criar Contas a Pagar'}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl('AccountsPayable'))}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}