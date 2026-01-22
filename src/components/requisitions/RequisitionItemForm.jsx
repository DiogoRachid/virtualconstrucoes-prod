import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Edit2, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RequisitionItemForm({ items = [], onAddItem, onRemoveItem, onEditItem, editingIndex = null }) {
  const [insumoNome, setInsumoNome] = useState('');
  const [unidade, setUnidade] = useState('');
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    if (editingIndex !== null && items[editingIndex]) {
      setInsumoNome(items[editingIndex].insumo_nome);
      setUnidade(items[editingIndex].unidade);
      setQuantity(items[editingIndex].quantidade_solicitada.toString());
    } else {
      setInsumoNome('');
      setUnidade('');
      setQuantity('');
    }
  }, [editingIndex, items]);

  const handleAdd = () => {
    if (!insumoNome || !unidade || !quantity) return;

    if (editingIndex !== null) {
      onEditItem(editingIndex, {
        insumo_nome: insumoNome,
        unidade: unidade,
        quantidade_solicitada: parseFloat(quantity)
      });
    } else {
      onAddItem({
        insumo_nome: insumoNome,
        unidade: unidade,
        quantidade_solicitada: parseFloat(quantity)
      });
    }

    setInsumoNome('');
    setUnidade('');
    setQuantity('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{editingIndex !== null ? 'Editar Material' : 'Materiais do Pedido'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Adicionar/Editar Item */}
        <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
          <div className="space-y-2">
            <Label htmlFor="insumo">Material/Descrição</Label>
            <Input
              id="insumo"
              placeholder="Ex: Cimento, Areia, Tijolos..."
              value={insumoNome}
              onChange={(e) => setInsumoNome(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unidade">Unidade</Label>
              <Input
                id="unidade"
                placeholder="Ex: SC, KG, M, UN..."
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
              />
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
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleAdd}
              disabled={!insumoNome || !unidade || !quantity}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              {editingIndex !== null ? 'Salvar Alterações' : 'Adicionar Item'}
            </Button>
            {editingIndex !== null && (
              <Button
                variant="outline"
                onClick={() => {
                  setInsumoNome('');
                  setUnidade('');
                  setQuantity('');
                  onRemoveItem(editingIndex);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Lista de Items */}
        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium">Material</th>
                  <th className="text-center py-3 px-4 font-medium">Unidade</th>
                  <th className="text-right py-3 px-4 font-medium">Quantidade</th>
                  <th className="text-center py-3 px-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className={`border-b transition ${editingIndex === idx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <td className="py-3 px-4">{item.insumo_nome}</td>
                    <td className="py-3 px-4 text-center font-medium">{item.unidade}</td>
                    <td className="py-3 px-4 text-right font-medium">{item.quantidade_solicitada}</td>
                    <td className="py-3 px-4 text-center flex gap-2 justify-center">
                      <button
                        onClick={() => setInsumoNome(item.insumo_nome) || setUnidade(item.unidade) || setQuantity(item.quantidade_solicitada.toString())}
                        className="text-blue-600 hover:text-blue-700 transition"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
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