import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ImportInvoiceManual() {
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    numero_nota: '',
    serie: '',
    data_emissao: '',
    data_entrada: '',
    fornecedor_id: '',
    obra_id: '',
    valor_total: 0,
    forma_pagamento: 'boleto',
    observacoes: ''
  });

  const [items, setItems] = useState([{
    codigo_xml: '',
    descricao_xml: '',
    quantidade_xml: 0,
    unidade_xml: '',
    valor_unitario_xml: 0,
    insumo_id: ''
  }]);

  const [parcelas, setParcelas] = useState([{
    data_vencimento: '',
    valor: 0
  }]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list()
  });

  const { data: works = [] } = useQuery({
    queryKey: ['works'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: inputs = [] } = useQuery({
    queryKey: ['inputs'],
    queryFn: () => base44.entities.Input.list()
  });

  const addItem = () => {
    setItems([...items, {
      codigo_xml: '',
      descricao_xml: '',
      quantidade_xml: 0,
      unidade_xml: '',
      valor_unitario_xml: 0,
      insumo_id: ''
    }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const addParcela = () => {
    setParcelas([...parcelas, { data_vencimento: '', valor: 0 }]);
  };

  const removeParcela = (index) => {
    if (parcelas.length > 1) {
      setParcelas(parcelas.filter((_, i) => i !== index));
    }
  };

  const updateParcela = (index, field, value) => {
    const newParcelas = [...parcelas];
    newParcelas[index][field] = value;
    setParcelas(newParcelas);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    
    // Calcular valor total quando quantidade ou valor unitário mudar
    if (field === 'quantidade_xml' || field === 'valor_unitario_xml') {
      const qtd = parseFloat(newItems[index].quantidade_xml) || 0;
      const vlrUnit = parseFloat(newItems[index].valor_unitario_xml) || 0;
      newItems[index].valor_total = qtd * vlrUnit;
    }
    
    setItems(newItems);
    
    // Recalcular valor total da nota
    const totalNota = newItems.reduce((sum, item) => {
      const qtd = parseFloat(item.quantidade_xml) || 0;
      const vlr = parseFloat(item.valor_unitario_xml) || 0;
      return sum + (qtd * vlr);
    }, 0);
    setFormData(prev => ({ ...prev, valor_total: totalNota }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validações
      if (!formData.numero_nota || !formData.serie) {
        throw new Error('Número e série da nota são obrigatórios');
      }
      if (!formData.fornecedor_id) {
        throw new Error('Selecione um fornecedor');
      }
      if (!formData.obra_id) {
        throw new Error('Selecione uma obra');
      }
      if (items.length === 0) {
        throw new Error('Adicione pelo menos um item');
      }

      const supplier = suppliers.find(s => s.id === formData.fornecedor_id);
      const work = works.find(w => w.id === formData.obra_id);

      // 1. Criar nota fiscal
      const invoiceData = {
        numero_nota: formData.numero_nota,
        serie: formData.serie,
        chave_acesso: `MANUAL_${formData.numero_nota}_${Date.now()}`,
        data_emissao: formData.data_emissao,
        data_entrada: formData.data_entrada,
        fornecedor_id: formData.fornecedor_id,
        fornecedor_nome: supplier?.razao_social || '',
        fornecedor_cnpj: supplier?.cnpj || '',
        valor_total: formData.valor_total,
        valor_produtos: formData.valor_total,
        valor_icms: 0,
        valor_ipi: 0,
        valor_frete: 0,
        valor_seguro: 0,
        valor_desconto: 0,
        forma_pagamento: formData.forma_pagamento,
        obra_id: formData.obra_id,
        obra_nome: work?.nome || '',
        status: 'importada',
        observacoes: formData.observacoes
      };

      const invoice = await base44.entities.Invoice.create(invoiceData);

      // 2. Criar itens da nota
      const invoiceItems = items.map(item => {
        const input = inputs.find(i => i.id === item.insumo_id);
        
        return {
          nota_fiscal_id: invoice.id,
          codigo_xml: item.codigo_xml,
          descricao_xml: item.descricao_xml,
          insumo_id: item.insumo_id || null,
          insumo_codigo: input?.codigo || '',
          insumo_nome: input?.descricao || '',
          unidade_xml: item.unidade_xml,
          unidade_insumo: input?.unidade || '',
          quantidade_xml: parseFloat(item.quantidade_xml) || 0,
          quantidade_convertida: parseFloat(item.quantidade_xml) || 0,
          valor_unitario_xml: parseFloat(item.valor_unitario_xml) || 0,
          valor_unitario_convertido: parseFloat(item.valor_unitario_xml) || 0,
          valor_total: (parseFloat(item.quantidade_xml) || 0) * (parseFloat(item.valor_unitario_xml) || 0),
          status_mapeamento: item.insumo_id ? 'mapeado' : 'nao_mapeado'
        };
      });

      await base44.entities.InvoiceItem.bulkCreate(invoiceItems);

      // 3. Criar contas a pagar (uma para cada parcela)
      const accountsPayable = parcelas.map((parcela, index) => ({
        descricao: parcelas.length > 1 
          ? `NF ${formData.numero_nota} - ${supplier?.razao_social || ''} - Parcela ${index + 1}/${parcelas.length}`
          : `NF ${formData.numero_nota} - ${supplier?.razao_social || ''}`,
        valor: parseFloat(parcela.valor) || 0,
        data_vencimento: parcela.data_vencimento,
        data_compra: formData.data_emissao,
        fornecedor_id: formData.fornecedor_id,
        fornecedor_nome: supplier?.razao_social || '',
        obra_id: formData.obra_id,
        obra_nome: work?.nome || '',
        status: 'em_aberto',
        forma_pagamento: formData.forma_pagamento,
        numero_documento: formData.numero_nota
      }));

      await base44.entities.AccountPayable.bulkCreate(accountsPayable);

      // 4. Criar histórico de compra para itens mapeados
      const purchaseHistory = items
        .filter(item => item.insumo_id)
        .map(item => {
          const input = inputs.find(i => i.id === item.insumo_id);
          
          return {
            insumo_id: item.insumo_id,
            insumo_codigo: input?.codigo || '',
            insumo_nome: input?.descricao || '',
            nota_fiscal_id: invoice.id,
            numero_nota: formData.numero_nota,
            fornecedor_id: formData.fornecedor_id,
            fornecedor_nome: supplier?.razao_social || '',
            data_compra: formData.data_emissao,
            quantidade: parseFloat(item.quantidade_xml) || 0,
            unidade: item.unidade_xml,
            valor_unitario: parseFloat(item.valor_unitario_xml) || 0,
            valor_total: (parseFloat(item.quantidade_xml) || 0) * (parseFloat(item.valor_unitario_xml) || 0),
            obra_id: formData.obra_id,
            obra_nome: work?.nome || ''
          };
        });

      if (purchaseHistory.length > 0) {
        await base44.entities.InputPurchaseHistory.bulkCreate(purchaseHistory);
      }

      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['accountsPayable'] });
      queryClient.invalidateQueries({ queryKey: ['inputPurchaseHistory'] });
      toast.success('Nota fiscal importada com sucesso!');
      setTimeout(() => window.location.href = createPageUrl('ImportInvoice'), 1000);
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao importar nota fiscal');
    }
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.href = createPageUrl('ImportInvoice')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Importação Manual de Nota Fiscal</h1>
            <p className="text-sm text-slate-500">Cadastre manualmente os dados da nota fiscal</p>
          </div>
        </div>
        
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar e Processar
            </>
          )}
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados da Nota Fiscal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Número da Nota *</Label>
                <Input
                  value={formData.numero_nota}
                  onChange={(e) => setFormData(prev => ({ ...prev, numero_nota: e.target.value }))}
                  placeholder="Ex: 123456"
                />
              </div>

              <div>
                <Label>Série *</Label>
                <Input
                  value={formData.serie}
                  onChange={(e) => setFormData(prev => ({ ...prev, serie: e.target.value }))}
                  placeholder="Ex: 1"
                />
              </div>

              <div>
                <Label>Data de Emissão *</Label>
                <Input
                  type="date"
                  value={formData.data_emissao}
                  onChange={(e) => setFormData(prev => ({ ...prev, data_emissao: e.target.value }))}
                />
              </div>

              <div>
                <Label>Data de Entrada *</Label>
                <Input
                  type="date"
                  value={formData.data_entrada}
                  onChange={(e) => setFormData(prev => ({ ...prev, data_entrada: e.target.value }))}
                />
              </div>

              <div>
                <Label>Forma de Pagamento</Label>
                <Select
                  value={formData.forma_pagamento}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, forma_pagamento: value }))}
                >
                  <SelectTrigger>
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
                <Label>Fornecedor *</Label>
                <Select
                  value={formData.fornecedor_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, fornecedor_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Obra *</Label>
                <Select
                  value={formData.obra_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, obra_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {works.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Valor Total da Nota</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.valor_total}
                  onChange={(e) => setFormData(prev => ({ ...prev, valor_total: parseFloat(e.target.value) || 0 }))}
                  className="font-semibold text-blue-600"
                  disabled
                />
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                rows={2}
                placeholder="Observações adicionais sobre a nota fiscal"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Parcelas de Pagamento</CardTitle>
              <Button onClick={addParcela} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Parcela
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {parcelas.map((parcela, index) => (
                <div key={index} className="flex items-end gap-3 p-3 border rounded-lg">
                  <div className="flex-shrink-0 w-20">
                    <Label className="text-xs">Parcela</Label>
                    <div className="text-lg font-semibold text-slate-700">{index + 1}/{parcelas.length}</div>
                  </div>
                  
                  <div className="flex-1">
                    <Label>Data de Vencimento *</Label>
                    <Input
                      type="date"
                      value={parcela.data_vencimento}
                      onChange={(e) => updateParcela(index, 'data_vencimento', e.target.value)}
                    />
                  </div>

                  <div className="flex-1">
                    <Label>Valor da Parcela *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={parcela.valor}
                      onChange={(e) => updateParcela(index, 'valor', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeParcela(index)}
                      disabled={parcelas.length === 1}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg mt-4">
                <span className="font-medium text-slate-700">Total das Parcelas:</span>
                <span className="text-lg font-bold text-blue-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    parcelas.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0)
                  )}
                </span>
              </div>

              {parcelas.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0) !== formData.valor_total && (
                <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                  ⚠️ O total das parcelas não corresponde ao valor total da nota
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Itens da Nota Fiscal</CardTitle>
              <Button onClick={addItem} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-slate-700">Item {index + 1}</h4>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-6 gap-3">
                    <div>
                      <Label>Código</Label>
                      <Input
                        value={item.codigo_xml}
                        onChange={(e) => updateItem(index, 'codigo_xml', e.target.value)}
                        placeholder="Código"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label>Descrição *</Label>
                      <Input
                        value={item.descricao_xml}
                        onChange={(e) => updateItem(index, 'descricao_xml', e.target.value)}
                        placeholder="Descrição do produto"
                      />
                    </div>

                    <div>
                      <Label>Quantidade *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.quantidade_xml}
                        onChange={(e) => updateItem(index, 'quantidade_xml', e.target.value)}
                      />
                    </div>

                    <div>
                      <Label>Unidade *</Label>
                      <Input
                        value={item.unidade_xml}
                        onChange={(e) => updateItem(index, 'unidade_xml', e.target.value)}
                        placeholder="UN, KG, M, etc"
                      />
                    </div>

                    <div>
                      <Label>Valor Unit. *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.valor_unitario_xml}
                        onChange={(e) => updateItem(index, 'valor_unitario_xml', e.target.value)}
                      />
                    </div>

                    <div className="col-span-3">
                      <Label>Mapear para Insumo (Opcional)</Label>
                      <Select
                        value={item.insumo_id}
                        onValueChange={(value) => updateItem(index, 'insumo_id', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um insumo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>Não mapear</SelectItem>
                          {inputs.map(input => (
                            <SelectItem key={input.id} value={input.id}>
                              {input.codigo} - {input.descricao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-3 flex items-end">
                      <div className="w-full">
                        <Label>Valor Total do Item</Label>
                        <div className="text-lg font-semibold text-blue-600 mt-2">
                          {new Intl.NumberFormat('pt-BR', { 
                            style: 'currency', 
                            currency: 'BRL' 
                          }).format((parseFloat(item.quantidade_xml) || 0) * (parseFloat(item.valor_unitario_xml) || 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-slate-700">Total da Nota:</span>
                <span className="text-2xl font-bold text-blue-600">
                  {new Intl.NumberFormat('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                  }).format(formData.valor_total)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}