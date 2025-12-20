import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Users, 
  Loader2, 
  Phone, 
  Mail, 
  MapPin, 
  FileText,
  Pencil,
  Receipt,
  ExternalLink,
  HardHat
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';

export default function ClientDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get('id');

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => base44.entities.Client.filter({ id: clientId }).then(res => res[0])
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['clientReceivables', clientId],
    queryFn: () => base44.entities.AccountReceivable.filter({ cliente_id: clientId }, '-created_date'),
    enabled: !!clientId
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!client) {
    return (
      <EmptyState
        icon={Users}
        title="Cliente não encontrado"
        description="O cliente que você está procurando não existe ou foi removido."
        actionLabel="Voltar para Clientes"
        onAction={() => window.location.href = createPageUrl('Clients')}
      />
    );
  }

  const linkedProjects = projects.filter(p => client.obras_vinculadas?.includes(p.id));

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
        title={client.nome}
        subtitle={`${client.tipo_documento}: ${client.documento}`}
        icon={Users}
        backUrl={createPageUrl('Clients')}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <StatusBadge status={client.status || 'ativo'} />
      </div>

      <div className="flex gap-3 mb-8">
        <Button
          onClick={() => window.location.href = createPageUrl(`ClientForm?id=${clientId}`)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.href = createPageUrl(`AccountReceivableForm?client=${clientId}`)}
        >
          <Receipt className="h-4 w-4 mr-2" />
          Nova Conta a Receber
        </Button>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="obras">Obras Vinculadas</TabsTrigger>
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
                {client.telefone && (
                  <div>
                    <p className="text-sm text-slate-500">Telefone</p>
                    <p className="font-medium">{client.telefone}</p>
                  </div>
                )}
                {client.email && (
                  <div>
                    <p className="text-sm text-slate-500">E-mail</p>
                    <p className="font-medium">{client.email}</p>
                  </div>
                )}
                {!client.telefone && !client.email && (
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
                {client.endereco ? (
                  <div className="space-y-1">
                    <p className="font-medium">{client.endereco}</p>
                    <p className="text-slate-600">
                      {[client.cidade, client.estado].filter(Boolean).join(' - ')}
                    </p>
                    {client.cep && <p className="text-slate-500">CEP: {client.cep}</p>}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Nenhum endereço cadastrado</p>
                )}
              </CardContent>
            </Card>

            {client.observacoes && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Observações</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-700 whitespace-pre-wrap">{client.observacoes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="obras">
          <Card>
            <CardContent className="pt-6">
              {linkedProjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {linkedProjects.map(project => (
                    <div 
                      key={project.id}
                      className="p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => window.location.href = createPageUrl(`ProjectDetail?id=${project.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                          <HardHat className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{project.nome}</p>
                          <StatusBadge status={project.status} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={HardHat}
                  title="Nenhuma obra vinculada"
                  description="Vincule obras a este cliente editando o cadastro."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <DataTable
            columns={transactionColumns}
            data={transactions}
            onRowClick={(row) => window.location.href = createPageUrl(`AccountReceivableDetail?id=${row.id}`)}
            emptyComponent={
              <EmptyState
                icon={Receipt}
                title="Nenhuma transação encontrada"
                description="Este cliente ainda não possui transações registradas."
              />
            }
          />
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardContent className="pt-6">
              {client.documentos?.length > 0 ? (
                <div className="space-y-3">
                  {client.documentos.map((doc, index) => (
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
                  description="Adicione documentos editando o cliente."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}