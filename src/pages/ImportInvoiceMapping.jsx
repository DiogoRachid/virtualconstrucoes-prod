import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { CheckCircle2, AlertCircle, Zap, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import InvoiceItemMapper from '@/components/invoice/InvoiceItemMapper';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ImportInvoiceMappingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [invoice, setInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState([]);

  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('id');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [invoices, items, allInputs] = await Promise.all([
          base44.entities.Invoice.filter({ id: invoiceId }),
          base44.entities.InvoiceItem.filter({ nota_fiscal_id: invoiceId }),
          base44.entities.Input.list()
        ]);
        const inv = invoices[0];
        if (!inv) throw new Error('Nota fiscal não encontrada');
        setInvoice(inv);
        setInvoiceItems(items);
        setInputs(allInputs);
      } catch (err) {
        setError(err.message || 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };
    
    if (invoiceId) loadData();
  }, [invoiceId]);

  const unmappedItems = invoiceItems.filter(item => item.status_mapeamento !== 'mapeado');

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      // Para itens não mapeados, criar novo insumo automaticamente
      for (const item of unmappedItems) {
        const primeiraLetra = (invoice.fornecedor_nome || 'F').charAt(0).toUpperCase();
        const codigoInsumo = `${primeiraLetra}.${item.codigo_xml}`;
        
        // Verificar se já existe insumo com este código
        const insumosExistentes = await base44.entities.Input.filter({ codigo: codigoInsumo });
        
        let insumoId;
        if (insumosExistentes.length === 0) {
          // Criar novo insumo
          const mesAno = new Date(invoice.data_emissao).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' });
          const novoInsumo = await base44.entities.Input.create({
            codigo: codigoInsumo,
            descricao: item.descricao_xml,
            unidade: item.unidade_xml,
            valor_unitario: item.valor_unitario_xml,
            categoria: 'MATERIAL',
            data_base: mesAno,
            fonte: `NF ${invoice.numero_nota}/${invoice.serie}`
          });
          insumoId = novoInsumo.id;
        } else {
          insumoId = insumosExistentes[0].id;
        }
        
        // Vincular item ao insumo (criado ou existente)
        const insumo = insumosExistentes.length > 0 ? insumosExistentes[0] : await base44.entities.Input.read(insumoId);
        await base44.entities.InvoiceItem.update(item.id, {
          insumo_id: insumoId,
          insumo_codigo: insumo.codigo,
          insumo_nome: insumo.descricao,
          unidade_insumo: insumo.unidade,
          quantidade_convertida: item.quantidade_xml,
          valor_unitario_convertido: item.valor_unitario_xml,
          motivo_ajuste: 'Vinculação automática - insumo criado',
          status_mapeamento: 'mapeado'
        });
        
        // Criar registro no histórico
        await base44.entities.InputPurchaseHistory.create({
          insumo_id: insumoId,
          insumo_codigo: insumo.codigo,
          insumo_nome: insumo.descricao,
          quantidade: item.quantidade_xml,
          unidade: item.unidade_xml,
          valor_unitario: item.valor_unitario_xml,
          valor_total: item.valor_total,
          fornecedor_id: invoice.fornecedor_id,
          fornecedor_nome: invoice.fornecedor_nome,
          data_compra: invoice.data_emissao,
          tipo_transacao: 'compra',
          nota_fiscal_id: invoice.id
        });
      }
      
      await base44.entities.Invoice.update(invoiceId, { status: 'processada' });
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceItems', invoiceId] });
      navigate(createPageUrl(`InvoicePayableConfig?invoiceId=${invoiceId}`));
    }
  });

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-slate-600">Carregando dados da nota fiscal...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-medium">Erro ao carregar</p>
            <p>{error || 'Nota fiscal não encontrada'}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate(createPageUrl('ImportInvoice'))}
              className="mt-3"
            >
              Voltar à Importação
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title={`Vincular Insumos - NF ${invoice.numero_nota}/${invoice.serie}`}
        subtitle={`Fornecedor: ${invoice.fornecedor_nome} | Data: ${invoice.data_emissao}`}
        icon={Zap}
      />

      {/* Status da Importação */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Status da Importação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-slate-900">{invoiceItems.length}</p>
              <p className="text-sm text-slate-600">Total de Itens</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {invoiceItems.filter(i => i.status_mapeamento === 'mapeado').length}
              </p>
              <p className="text-sm text-slate-600">Mapeados</p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-lg">
              <p className="text-2xl font-bold text-amber-600">{unmappedItems.length}</p>
              <p className="text-sm text-slate-600">Pendentes</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Itens */}
      <div className="space-y-4">
        {invoiceItems.map((item) => (
          <Card key={item.id} className={item.status_mapeamento === 'mapeado' ? 'bg-green-50 border-green-200' : ''}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{item.descricao_xml}</CardTitle>
                    {item.status_mapeamento === 'mapeado' && (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-2">
                    Código XML: <strong>{item.codigo_xml}</strong>
                  </p>
                </div>
              </div>
            </CardHeader>

            {item.status_mapeamento !== 'mapeado' && (
              <CardContent>
                <InvoiceItemMapper 
                  invoiceItemId={item.id}
                  inputsList={inputs}
                  onLinked={() => {
                    // Recarregar items após vincular
                    base44.entities.InvoiceItem.filter({ nota_fiscal_id: invoiceId }).then(items => {
                      setInvoiceItems(items);
                    });
                  }}
                />
              </CardContent>
            )}

            {item.status_mapeamento === 'mapeado' && (
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Insumo Vinculado</p>
                    <p className="font-medium text-slate-900">{item.insumo_nome}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Conversão</p>
                    <p className="font-medium text-slate-900">
                      {item.quantidade_xml} {item.unidade_xml} → {item.quantidade_convertida} {item.unidade_insumo}
                    </p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Ações Finais */}
      <div className="flex gap-3 mt-8">
        <Button
          onClick={() => finalizeMutation.mutate()}
          disabled={finalizeMutation.isPending}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {finalizeMutation.isPending ? 'Processando...' : 'Próximo: Registrar Contas a Pagar'}
        </Button>
        <Button variant="outline" onClick={() => navigate(createPageUrl('AccountsPayable'))}>
          Cancelar
        </Button>
      </div>

      {unmappedItems.length > 0 && (
        <div className="p-4 mt-6 bg-blue-50 border border-blue-200 rounded-lg flex gap-3 text-blue-900">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Aviso</p>
            <p>{unmappedItems.length} {unmappedItems.length === 1 ? 'item não foi' : 'itens não foram'} vinculado(s). Você pode continuar e vincular depois se desejar.</p>
          </div>
        </div>
      )}
    </div>
  );
}