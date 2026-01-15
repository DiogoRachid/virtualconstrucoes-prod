import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowDownCircle, Loader2, Plus, X } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import PageHeader from '@/components/ui/PageHeader';
import DocumentUploader from '@/components/shared/DocumentUploader';
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

export default function AccountPayableForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const accountId = urlParams.get('id');
  const supplierId = urlParams.get('supplier');
  const isEdit = !!accountId;
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  
  const [formData, setFormData] = useState({
    descricao: '',
    valor: '',
    data_vencimento: today,
    data_compra: today,
    data_pagamento: '',
    fornecedor_id: supplierId || '',
    fornecedor_nome: '',
    centro_custo_id: '',
    centro_custo_nome: '',
    conta_bancaria_id: '',
    conta_bancaria_nome: '',
    obra_id: '',
    obra_nome: '',
    status: 'em_aberto',
    forma_pagamento: 'boleto',
    numero_documento: '',
    documentos: [],
    observacoes: ''
  });

  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [installments, setInstallments] = useState([]);

  const { data: account, isLoading } = useQuery({
    queryKey: ['accountPayable', accountId],
    queryFn: () => base44.entities.AccountPayable.filter({ id: accountId }).then(res => res[0]),
    enabled: isEdit
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.filter({ status: 'ativo' })
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.filter({ status: 'ativo' })
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.filter({ status: 'ativa' })
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  useEffect(() => {
    if (account) {
      setFormData({
        descricao: account.descricao || '',
        valor: account.valor || '',
        data_vencimento: account.data_vencimento || '',
        data_compra: account.data_compra || account.created_date?.split('T')[0] || '',
        data_pagamento: account.data_pagamento || '',
        fornecedor_id: account.fornecedor_id || '',
        fornecedor_nome: account.fornecedor_nome || '',
        centro_custo_id: account.centro_custo_id || '',
        centro_custo_nome: account.centro_custo_nome || '',
        conta_bancaria_id: account.conta_bancaria_id || '',
        conta_bancaria_nome: account.conta_bancaria_nome || '',
        obra_id: account.obra_id || '',
        obra_nome: account.obra_nome || '',
        status: account.status || 'em_aberto',
        forma_pagamento: account.forma_pagamento || 'boleto',
        numero_documento: account.numero_documento || '',
        documentos: account.documentos || [],
        observacoes: account.observacoes || ''
      });
    }
  }, [account]);

  useEffect(() => {
    if (supplierId && suppliers.length && !isEdit && !account) {
      const supplier = suppliers.find(s => s.id === supplierId);
      if (supplier && !formData.fornecedor_id) {
        setFormData(prev => ({
          ...prev,
          fornecedor_id: supplierId,
          fornecedor_nome: supplier.razao_social
        }));
      }
    }
  }, [supplierId, suppliers, isEdit, account]);

  // Definir conta padrão Itaú Empresas - somente ao carregar, não ao editar
  useEffect(() => {
    if (bankAccounts.length && !formData.conta_bancaria_id && !isEdit && !account) {
      const itau = bankAccounts.find(acc => acc.nome?.toLowerCase().includes('itaú empresas') || acc.nome?.toLowerCase().includes('itau empresas'));
      if (itau) {
        setFormData(prev => ({
          ...prev,
          conta_bancaria_id: itau.id,
          conta_bancaria_nome: itau.nome
        }));
      }
    }
  }, [bankAccounts, isEdit, account]);

  // Ajustar data para dia útil (evitar sábado/domingo)
  const adjustToBusinessDay = (dateStr) => {
    // Adicionar T00:00:00 para forçar timezone local e evitar mudança de dia
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) { // Domingo
      d.setDate(d.getDate() + 1);
    } else if (dayOfWeek === 6) { // Sábado
      d.setDate(d.getDate() + 2);
    }
    return d.toISOString().split('T')[0];
  };

  useEffect(() => {
    if (isInstallment && formData.valor && formData.data_vencimento) {
      const totalValue = parseFloat(formData.valor) || 0;
      const installmentValue = totalValue / installmentCount;
      
      const newInstallments = Array.from({ length: installmentCount }, (_, i) => {
        const dueDate = new Date(formData.data_vencimento + 'T00:00:00');
        dueDate.setMonth(dueDate.getMonth() + i);
        
        return {
          numero: i + 1,
          valor: i === installmentCount - 1 
            ? totalValue - (installmentValue * (installmentCount - 1))
            : installmentValue,
          data_vencimento: adjustToBusinessDay(dueDate.toISOString().split('T')[0])
        };
      });
      
      setInstallments(newInstallments);
    }
  }, [isInstallment, installmentCount, formData.valor, formData.data_vencimento]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isInstallment && !isEdit) {
        // Criar múltiplas contas parceladas
        const promises = installments.map((inst) => {
          const payload = {
            ...data,
            descricao: `${data.descricao} - Parcela ${inst.numero}/${installmentCount}`,
            valor: inst.valor,
            data_vencimento: inst.data_vencimento
          };
          delete payload.data_pagamento;
          return base44.entities.AccountPayable.create(payload);
        });
        return Promise.all(promises);
      } else {
        const payload = {
          ...data,
          valor: data.valor ? parseFloat(data.valor) : 0
        };
        if (isEdit) {
          return base44.entities.AccountPayable.update(accountId, payload);
        }
        return base44.entities.AccountPayable.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      toast.success(isInstallment && !isEdit ? 'Parcelas cadastradas com sucesso' : isEdit ? 'Conta atualizada' : 'Conta cadastrada');
      setTimeout(() => {
        window.location.href = createPageUrl('AccountsPayable');
      }, 500);
    },
    onError: (error) => {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar conta');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSupplierChange = (id) => {
    const supplier = suppliers.find(s => s.id === id);
    setFormData(prev => ({
      ...prev,
      fornecedor_id: id,
      fornecedor_nome: supplier?.razao_social || ''
    }));
  };

  const handleCostCenterChange = (id) => {
    const center = costCenters.find(c => c.id === id);
    setFormData(prev => ({
      ...prev,
      centro_custo_id: id,
      centro_custo_nome: center?.nome || ''
    }));
  };

  const handleBankAccountChange = (id) => {
    const account = bankAccounts.find(a => a.id === id);
    setFormData(prev => ({
      ...prev,
      conta_bancaria_id: id,
      conta_bancaria_nome: account?.nome || ''
    }));
  };

  const handleProjectChange = (id) => {
    const project = projects.find(p => p.id === id);
    setFormData(prev => ({
      ...prev,
      obra_id: id,
      obra_nome: project?.nome || ''
    }));
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
        subtitle={isEdit ? 'Atualize os dados da conta' : 'Preencha os dados da nova conta'}
        icon={ArrowDownCircle}
        backUrl={createPageUrl('AccountsPayable')}
      />

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="space-y-6">
          {/* Dados Principais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados Principais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label htmlFor="descricao">Descrição *</Label>
                <Input
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => handleChange('descricao', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="valor">Valor *</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  value={formData.valor}
                  onChange={(e) => handleChange('valor', e.target.value)}
                  required
                  placeholder="0,00"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="data_compra">Data de Compra *</Label>
                <Input
                  id="data_compra"
                  type="date"
                  value={formData.data_compra}
                  onChange={(e) => handleChange('data_compra', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="data_vencimento">Data de Vencimento *</Label>
                <Input
                  id="data_vencimento"
                  type="date"
                  value={formData.data_vencimento}
                  onChange={(e) => handleChange('data_vencimento', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              {!isEdit && (
                <div className="md:col-span-2 flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="installment" 
                    checked={isInstallment}
                    onCheckedChange={setIsInstallment}
                  />
                  <Label htmlFor="installment" className="text-sm font-normal cursor-pointer">
                    Parcelar esta conta
                  </Label>
                </div>
              )}

              {isInstallment && !isEdit && (
                <div className="md:col-span-2 space-y-3 pt-2 border-t">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <Label htmlFor="installmentCount">Número de Parcelas</Label>
                      <Input
                        id="installmentCount"
                        type="number"
                        min="2"
                        max="60"
                        value={installmentCount}
                        onChange={(e) => setInstallmentCount(parseInt(e.target.value) || 2)}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <Label className="text-sm font-medium">Parcelas Geradas:</Label>
                    {installments.map((inst, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded">
                        <span className="text-xs font-medium min-w-[70px]">
                          Parcela {inst.numero}/{installmentCount}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          value={inst.valor}
                          onChange={(e) => {
                            const newInst = [...installments];
                            newInst[idx].valor = parseFloat(e.target.value) || 0;
                            setInstallments(newInst);
                          }}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="date"
                          value={inst.data_vencimento}
                          onChange={(e) => {
                            const newInst = [...installments];
                            newInst[idx].data_vencimento = e.target.value;
                            setInstallments(newInst);
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange('status', value)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_aberto">Em Aberto</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="forma_pagamento">Forma de Pagamento</Label>
                <Select
                  value={formData.forma_pagamento}
                  onValueChange={(value) => handleChange('forma_pagamento', value)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="numero_documento">Número do Documento</Label>
                <Input
                  id="numero_documento"
                  value={formData.numero_documento}
                  onChange={(e) => handleChange('numero_documento', e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Vínculos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vínculos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <Select
                  value={formData.fornecedor_id}
                  onValueChange={handleSupplierChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="centro_custo">Centro de Custo</Label>
                <Select
                  value={formData.centro_custo_id}
                  onValueChange={handleCostCenterChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="conta_bancaria">Conta Bancária</Label>
                <Select
                  value={formData.conta_bancaria_id}
                  onValueChange={handleBankAccountChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="obra">Obra</Label>
                <Select
                  value={formData.obra_id}
                  onValueChange={handleProjectChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Documentos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comprovantes e Notas Fiscais</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUploader
                documents={formData.documentos}
                onChange={(docs) => handleChange('documentos', docs)}
              />
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => handleChange('observacoes', e.target.value)}
                rows={4}
              />
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
              {isEdit ? 'Salvar Alterações' : isInstallment ? `Cadastrar ${installmentCount} Parcelas` : 'Cadastrar Conta'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('AccountsPayable')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}