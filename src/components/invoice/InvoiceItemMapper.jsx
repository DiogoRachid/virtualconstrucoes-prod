import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
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

export default function InvoiceItemMapper({ invoiceItemId, onLinked }) {
  const [selectedInputId, setSelectedInputId] = useState('');
  const [conversionFactor, setConversionFactor] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [showUnitAlert, setShowUnitAlert] = useState(false);

  const { data: invoiceItem } = useQuery({
    queryKey: ['invoiceItem', invoiceItemId],
    queryFn: () => base44.entities.InvoiceItem.read(invoiceItemId)
  });

  const { data: inputs = [] } = useQuery({
    queryKey: ['inputs'],
    queryFn: () => base44.entities.Input.list()
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const conversionFactorNum = parseFloat(conversionFactor) || 1;
      const selectedInput = inputs.find(i => i.id === selectedInputId);
      
      // Atualizar InvoiceItem com dados do insumo vinculado
      await base44.entities.InvoiceItem.update(invoiceItemId, {
        insumo_id: selectedInputId,
        insumo_codigo: selectedInput.codigo,
        insumo_nome: selectedInput.descricao,
        unidade_insumo: selectedInput.unidade,
        quantidade_convertida: invoiceItem.quantidade_xml * conversionFactorNum,
        valor_unitario_convertido: invoiceItem.valor_unitario_xml / conversionFactorNum,
        motivo_ajuste: motivo,
        status_mapeamento: 'mapeado'
      });

      // Criar registro no histórico de insumos
      await base44.entities.InputPurchaseHistory.create({
        insumo_id: selectedInputId,
        insumo_codigo: selectedInput.codigo,
        insumo_nome: selectedInput.descricao,
        quantidade: invoiceItem.quantidade_xml * conversionFactorNum,
        unidade: selectedInput.unidade,
        valor_unitario: invoiceItem.valor_unitario_xml / conversionFactorNum,
        valor_total: invoiceItem.valor_total,
        fornecedor_id: invoiceItem.nota_fiscal_id, // será preenchido com ID real depois
        data_compra: new Date().toISOString().split('T')[0],
        tipo_transacao: 'compra'
      });
    },
    onSuccess: () => {
      onLinked?.();
    }
  });

  if (!invoiceItem) return <div>Carregando...</div>;

  const selectedInput = inputs.find(i => i.id === selectedInputId);
  const unitMismatch = selectedInput && selectedInput.unidade !== invoiceItem.unidade_xml;

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader>
        <CardTitle className="text-base">Vincular Insumo</CardTitle>
        <p className="text-sm text-slate-600 mt-2">
          <strong>Produto:</strong> {invoiceItem.descricao_xml}
        </p>
        <p className="text-sm text-slate-600">
          <strong>Unidade na Nota:</strong> {invoiceItem.unidade_xml} | 
          <strong className="ml-2">Quantidade:</strong> {invoiceItem.quantidade_xml} | 
          <strong className="ml-2">Valor Unit.:</strong> R$ {invoiceItem.valor_unitario_xml.toFixed(2)}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Busca de Insumo */}
        <div className="space-y-2">
          <Label htmlFor="input-select">Selecione o Insumo</Label>
          <Select value={selectedInputId} onValueChange={setSelectedInputId}>
            <SelectTrigger id="input-select">
              <SelectValue placeholder="Buscar insumo cadastrado" />
            </SelectTrigger>
            <SelectContent>
              {inputs.map(input => (
                <SelectItem key={input.id} value={input.id}>
                  {input.codigo} - {input.descricao} ({input.unidade})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Alerta de Unidade Diferentes */}
        {unitMismatch && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900">
                Unidade diferente detectada
              </p>
              <p className="text-amber-800 mt-1">
                Nota: <strong>{invoiceItem.unidade_xml}</strong> | 
                Sistema: <strong>{selectedInput.unidade}</strong>
              </p>
              <p className="text-amber-800 text-xs mt-2">
                Informe o fator de conversão (ex: se 1 SC = 50 KG, digite 50)
              </p>
            </div>
          </div>
        )}

        {/* Fator de Conversão */}
        {unitMismatch && (
          <div className="space-y-2">
            <Label htmlFor="conversion">Fator de Conversão</Label>
            <div className="flex items-center gap-2">
              <Input
                id="conversion"
                type="number"
                step="0.01"
                value={conversionFactor}
                onChange={(e) => setConversionFactor(e.target.value)}
                placeholder="1"
              />
              <span className="text-sm text-slate-600">
                1 {invoiceItem.unidade_xml} = ? {selectedInput.unidade}
              </span>
            </div>
            {conversionFactor !== '1' && (
              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                Será convertido para: {(invoiceItem.quantidade_xml * parseFloat(conversionFactor)).toFixed(4)} {selectedInput.unidade}
              </p>
            )}
          </div>
        )}

        {/* Motivo do Ajuste */}
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo/Observação (opcional)</Label>
          <Input
            id="motivo"
            placeholder="Ex: Conversão de unidade, ajuste de quantidade..."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {/* Botões */}
        <div className="flex gap-2 pt-4">
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={!selectedInputId || linkMutation.isPending}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {linkMutation.isPending ? 'Vinculando...' : 'Vincular Insumo'}
          </Button>
        </div>

        {linkMutation.isSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex gap-2 text-green-900 text-sm">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            Insumo vinculado com sucesso
          </div>
        )}

        {linkMutation.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-sm">
            Erro ao vincular: {linkMutation.error?.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}