import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { FileInput, Plus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmptyState from '@/components/ui/EmptyState';

export default function MaterialRequisitionsPage() {
  const { data: requisitions = [] } = useQuery({
    queryKey: ['materialRequisitions'],
    queryFn: () => base44.entities.MaterialRequisition?.list?.() || Promise.resolve([])
  });

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Pedidos de Materiais"
        subtitle="Gerencie pedidos de materiais para as obras"
        icon={FileInput}
        actionLabel="Novo Pedido"
        onAction={() => {}}
      />

      {requisitions.length === 0 ? (
        <EmptyState
          icon={FileInput}
          title="Nenhum pedido registrado"
          description="Crie um novo pedido de material para começar"
          actionLabel="Novo Pedido"
          onAction={() => {}}
        />
      ) : (
        <div className="grid gap-4">
          {requisitions.map((req) => (
            <Card key={req.id}>
              <CardHeader>
                <CardTitle className="text-base">{req.numero_pedido}</CardTitle>
                <p className="text-sm text-slate-600 mt-1">{req.obra_nome}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Data</p>
                    <p className="font-medium">{req.data_pedido}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Itens</p>
                    <p className="font-medium">{req.total_itens}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Status</p>
                    <p className="font-medium capitalize">{req.status}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Valor Total</p>
                    <p className="font-medium">R$ {req.valor_total.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}