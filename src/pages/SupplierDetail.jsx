import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Building2, 
  Loader2, 
  Phone, 
  Mail, 
  MapPin, 
  FileText,
  Pencil,
  Receipt,
  ExternalLink
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';

export default function SupplierDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const supplierId = urlParams.get('id');

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => base44.entities.Supplier.filter({ id: supplierId }).then(res => res[0])
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['supplierTransactions', supplierId],
    queryFn: () => base44.entities.AccountPayable.filter({ fornecedor_id: supplierId }, '-created_date'),
    enabled: !!supplierId
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <EmptyState
        icon={Building2}
        title="Fornecedor não encontrado"
        description="O fornecedor que você está procurando não existe ou foi removido."
        actionLabel="Voltar para Fornecedores"
        onAction={() => window.location.href = createPageUrl('Suppliers')}
      />
    );
  }

  const transactionColumns = [
    {
      header: 'Descrição',
      render: (row) => <span className="font-medium">{row.descricao}</span>
    },
    {
      header: 'Valor',
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valor)}
        </span>
      )
    },
    {
      header: 'Vencimento',
      render: (row) => format(new Date(row.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })
    },
    {
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />
    }
  ];

  return (
    <div>
      <PageHeader
        title={supplier.razao_social}
        subtitle={supplier.cnpj}
        icon={Building2}
        backUrl={createPageUrl('Suppliers')}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <StatusBadge status={supplier.status} />
        {supplier.tipo_servico && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            {supplier.tipo_servico}
          </span>
        )}
      </div>

      <div className="flex gap-3 mb-8">
        <Button
          onClick={() => window.location.href = createPageUrl(`SupplierForm?id=${supplierId}`)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.href = createPageUrl(`AccountPayableForm?supplier=${supplierId}`)}
        >
          <Receipt className="h-4 w-4 mr-2" />
          Nova Conta a Pagar
        </Button>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="history">Histórico Financeiro</TabsTrigger>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Phone className="h-5 w-5 text-slate-400" />
                  Contato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {supplier.telefone && (
                  <div>
                    <p className="text-sm text-slate-500">Telefone</p>
                    <p className="font-medium">{supplier.telefone}</p>
                  </div>
                )}
                {supplier.email && (
                  <div>
                    <p className="text-sm text-slate-500">E-mail</p>
                    <p className="font-medium">{supplier.email}</p>
                  </div>
                )}
                {!supplier.telefone && !supplier.email && (
                  <p className="text-slate-500 text-sm">Nenhum contato cadastrado</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-slate-400" />
                  Endereço
                </CardTitle>
              </CardHeader>
              <CardContent>
                {supplier.endereco ? (
                  <div className="space-y-1">
                    <p className="font-medium">{supplier.endereco}</p>
                    <p className="text-slate-600">
                      {[supplier.cidade, supplier.estado].filter(Boolean).join(' - ')}
                    </p>
                    {supplier.cep && <p className="text-slate-500">CEP: {supplier.cep}</p>}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Nenhum endereço cadastrado</p>
                )}
              </CardContent>
            </Card>

            {supplier.observacoes && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-700 whitespace-pre-wrap">{supplier.observacoes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <DataTable
            columns={transactionColumns}
            data={transactions}
            onRowClick={(row) => window.location.href = createPageUrl(`AccountPayableDetail?id=${row.id}`)}
            emptyComponent={
              <EmptyState
                icon={Receipt}
                title="Nenhuma transação encontrada"
                description="Este fornecedor ainda não possui transações registradas."
              />
            }
          />
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardContent className="pt-6">
              {supplier.documentos?.length > 0 ? (
                <div className="space-y-3">
                  {supplier.documentos.map((doc, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{doc.nome}</p>
                          {doc.data_upload && (
                            <p className="text-sm text-slate-500">
                              {format(new Date(doc.data_upload), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                      </div>
                      <a 
                        href={doc.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        <ExternalLink className="h-5 w-5 text-slate-500" />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Nenhum documento anexado"
                  description="Adicione documentos editando o fornecedor."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}