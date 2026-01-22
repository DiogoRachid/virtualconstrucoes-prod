import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { History, TrendingDown } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function InputPurchaseHistoryPage() {
  const [selectedInputId, setSelectedInputId] = useState('');

  const { data: inputs = [] } = useQuery({
    queryKey: ['inputs'],
    queryFn: () => base44.entities.Input.list()
  });

  const { data: history = [] } = useQuery({
    queryKey: ['purchaseHistory', selectedInputId],
    queryFn: () => selectedInputId 
      ? base44.entities.InputPurchaseHistory.filter({ insumo_id: selectedInputId }, '-data_compra')
      : Promise.resolve([]),
    enabled: !!selectedInputId
  });

  const selectedInput = inputs.find(i => i.id === selectedInputId);

  // Calcular médias
  const avgPrice = history.length > 0 
    ? (history.reduce((sum, h) => sum + h.valor_unitario, 0) / history.length).toFixed(2)
    : 0;

  const minPrice = history.length > 0
    ? Math.min(...history.map(h => h.valor_unitario)).toFixed(2)
    : 0;

  const maxPrice = history.length > 0
    ? Math.max(...history.map(h => h.valor_unitario)).toFixed(2)
    : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Histórico de Compras de Insumos"
        subtitle="Acompanhe o histórico de preços e fornecedores"
        icon={History}
      />

      {/* Filtro de Insumo */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Selecione o Insumo</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedInputId} onValueChange={setSelectedInputId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um insumo para ver o histórico" />
            </SelectTrigger>
            <SelectContent>
              {inputs.map(input => (
                <SelectItem key={input.id} value={input.id}>
                  {input.codigo} - {input.descricao} ({input.unidade})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedInput && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Preço Médio</p>
                <p className="text-2xl font-bold text-slate-900">R$ {avgPrice}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Preço Mínimo</p>
                <p className="text-2xl font-bold text-green-600">R$ {minPrice}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Preço Máximo</p>
                <p className="text-2xl font-bold text-red-600">R$ {maxPrice}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-slate-600">Total de Compras</p>
                <p className="text-2xl font-bold text-slate-900">{history.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Histórico em Tabela */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico Completo</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="text-left py-3 px-4 font-medium">Data</th>
                        <th className="text-left py-3 px-4 font-medium">Fornecedor</th>
                        <th className="text-left py-3 px-4 font-medium">NF</th>
                        <th className="text-left py-3 px-4 font-medium">Obra</th>
                        <th className="text-right py-3 px-4 font-medium">Qtd</th>
                        <th className="text-right py-3 px-4 font-medium">Valor Unit.</th>
                        <th className="text-right py-3 px-4 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record) => (
                        <tr key={record.id} className="border-b hover:bg-slate-50 transition">
                          <td className="py-3 px-4">{record.data_compra}</td>
                          <td className="py-3 px-4">{record.fornecedor_nome}</td>
                          <td className="py-3 px-4">
                            <span className="text-blue-600 font-medium">{record.numero_nota}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{record.obra_nome}</td>
                          <td className="py-3 px-4 text-right">
                            {record.quantidade} {selectedInput.unidade}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            R$ {record.valor_unitario.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900">
                            R$ {record.valor_total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <TrendingDown className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum histórico de compra registrado para este insumo</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}