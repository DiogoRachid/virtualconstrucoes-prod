import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import InvoiceItemMapper from '@/components/invoice/InvoiceItemMapper';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ImportInvoiceMappingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [processStep, setProcessStep] = useState(0);

  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('id');

  const { data: invoice } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => base44.entities.Invoice.read(invoiceId)
  });

  const { data: invoiceItems = [] } = useQuery({
    queryKey: ['invoiceItems', invoiceId],
    queryFn: () => base44.entities.InvoiceItem.filter({ nota_fiscal_id: invoiceId })
  });

  const unmappedItems = invoiceItems.filter(item => item.status_mapeamento !== 'mapeado');

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      // Criar Contas a Pagar baseado nos itens vinculados
      await base44.entities.Invoice.update(invoiceId, { status: 'processada' });
      
      // Lógica para gerar contas a pagar
      // (será implementada em função separada)
      
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceItems', invoiceId] });
      navigate(createPageUrl('AccountsPayable'));
    }
  });

  if (!invoice) return <div>Carregando...</div>;

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
                  onLinked={() => {
                    queryClient.invalidateQueries({ queryKey: ['invoiceItems', invoiceId] });
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
          disabled={unmappedItems.length > 0 || finalizeMutation.isPending}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {finalizeMutation.isPending ? 'Processando...' : 'Finalizar e Criar Contas a Pagar'}
        </Button>
        <Button variant="outline" onClick={() => navigate(createPageUrl('Projects'))}>
          Cancelar
        </Button>
      </div>

      {unmappedItems.length > 0 && (
        <div className="p-4 mt-6 bg-amber-50 border border-amber-200 rounded-lg flex gap-3 text-amber-900">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Ação requerida</p>
            <p>Vincule todos os {unmappedItems.length} itens antes de finalizar a importação</p>
          </div>
        </div>
      )}
    </div>
  );
}