import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RequisitionItemForm({ inputs = [], items = [], onAddItem, onRemoveItem }) {
  const [selectedInput, setSelectedInput] = useState('');
  const [quantity, setQuantity] = useState('');

  const handleAdd = () => {
    if (!selectedInput || !quantity) return;
    
    const input = inputs.find(i => i.id === selectedInput);
    if (!input) return;

    onAddItem({
      insumo_id: input.id,
      insumo_codigo: input.codigo,
      insumo_nome: input.descricao,
      unidade: input.unidade,
      quantidade_solicitada: parseFloat(quantity)
    });

    setSelectedInput('');
    setQuantity('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Materiais do Pedido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Adicionar Item */}
        <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
          <div className="space-y-2">
            <Label htmlFor="insumo">Insumo</Label>
            <Select value={selectedInput} onValueChange={setSelectedInput}>
              <SelectTrigger id="insumo">
                <SelectValue placeholder="Selecione um insumo" />
              </SelectTrigger>
              <SelectContent>
                {inputs.map(input => (
                  <SelectItem key={input.id} value={input.id}>
                    {input.codigo} - {input.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantidade">Quantidade</Label>
            <Input
              id="quantidade"
              type="number"
              step="0.01"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <Button
            onClick={handleAdd}
            disabled={!selectedInput || !quantity}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Item
          </Button>
        </div>

        {/* Lista de Items */}
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium">Código</th>
                  <th className="text-left py-3 px-4 font-medium">Material</th>
                  <th className="text-center py-3 px-4 font-medium">Unidade</th>
                  <th className="text-right py-3 px-4 font-medium">Quantidade</th>
                  <th className="text-center py-3 px-4 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50 transition">
                    <td className="py-3 px-4 text-slate-600">{item.insumo_codigo}</td>
                    <td className="py-3 px-4">{item.insumo_nome}</td>
                    <td className="py-3 px-4 text-center font-medium">{item.unidade}</td>
                    <td className="py-3 px-4 text-right font-medium">{item.quantidade_solicitada}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onRemoveItem(idx)}
                        className="text-red-600 hover:text-red-700 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">Nenhum item adicionado</p>
        )}
      </CardContent>
    </Card>
  );
}