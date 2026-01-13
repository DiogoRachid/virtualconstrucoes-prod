import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { History, Plus, Edit2, Trash2, Package, Sparkles, Wrench, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const tipoIcons = {
  novo: { icon: Sparkles, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  melhoria: { icon: Wrench, color: 'bg-green-100 text-green-700 border-green-200' },
  correcao: { icon: Package, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  removido: { icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200' }
};

export default function VersionHistoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState(null);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['versions'],
    queryFn: () => base44.entities.VersionHistory.list('-data_lancamento')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.VersionHistory.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions'] });
      setDeleteId(null);
    }
  });

  if (isLoading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Histórico de Versões"
        subtitle="Acompanhe as atualizações do sistema"
        icon={History}
        actionLabel="Nova Versão"
        onAction={() => navigate(createPageUrl('VersionHistoryForm'))}
      />

      {versions.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhuma versão registrada"
          description="Comece registrando a primeira atualização"
          actionLabel="Nova Versão"
          onAction={() => navigate(createPageUrl('VersionHistoryForm'))}
        />
      ) : (
        <div className="space-y-6">
          {versions.map((version) => {
            const dataLanc = version.data_lancamento ? new Date(version.data_lancamento + 'T00:00:00') : null;
            
            return (
              <Card key={version.id} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-slate-50 border-b">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <Badge className="bg-blue-600 text-white px-3 py-1">
                          v{version.versao}
                        </Badge>
                        <CardTitle className="text-lg">{version.titulo}</CardTitle>
                      </div>
                      {dataLanc && (
                        <p className="text-sm text-slate-500 mt-2">
                          Lançado em {dataLanc.toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(createPageUrl(`VersionHistoryForm?id=${version.id}`))}
                      >
                        <Edit2 className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteId(version.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  {version.descricao && (
                    <p className="text-slate-600 mb-6">{version.descricao}</p>
                  )}

                  {version.alteracoes && version.alteracoes.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-slate-700 mb-3">Alterações:</h4>
                      <div className="space-y-2">
                        {version.alteracoes.map((alt, idx) => {
                          const config = tipoIcons[alt.tipo] || tipoIcons.novo;
                          const Icon = config.icon;
                          
                          return (
                            <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                              <div className={`p-2 rounded-lg ${config.color} border`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-700">{alt.descricao}</p>
                                <span className="text-xs text-slate-500 capitalize">{alt.tipo}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir versão?"
        description="Esta ação não pode ser desfeita."
      />
    </div>
  );
}