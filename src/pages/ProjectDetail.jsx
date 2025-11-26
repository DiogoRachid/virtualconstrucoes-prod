import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  HardHat, 
  Loader2, 
  MapPin, 
  Calendar,
  Pencil,
  DollarSign,
  User
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmptyState from '@/components/ui/EmptyState';

export default function ProjectDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.list({ id: projectId }).then(res => res[0])
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        icon={HardHat}
        title="Obra não encontrada"
        description="A obra que você está procurando não existe."
        actionLabel="Voltar para Obras"
        onAction={() => window.location.href = createPageUrl('Projects')}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={project.nome}
        icon={HardHat}
        backUrl={createPageUrl('Projects')}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <StatusBadge status={project.status} />
      </div>

      <div className="flex gap-3 mb-8">
        <Button
          onClick={() => window.location.href = createPageUrl(`ProjectForm?id=${projectId}`)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {project.endereco && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5 text-slate-400" />
                Localização
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{project.endereco}</p>
              <p className="text-slate-600">
                {[project.cidade, project.estado].filter(Boolean).join(' - ')}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-slate-400" />
              Cronograma
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.data_inicio && (
              <div>
                <p className="text-sm text-slate-500">Início</p>
                <p className="font-medium">{format(new Date(project.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}</p>
              </div>
            )}
            {project.data_previsao && (
              <div>
                <p className="text-sm text-slate-500">Previsão de Término</p>
                <p className="font-medium">{format(new Date(project.data_previsao), 'dd/MM/yyyy', { locale: ptBR })}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {project.valor_contrato && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-slate-400" />
                Valor do Contrato
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(project.valor_contrato)}
              </p>
            </CardContent>
          </Card>
        )}

        {project.responsavel && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-slate-400" />
                Responsável
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{project.responsavel}</p>
            </CardContent>
          </Card>
        )}

        {project.descricao && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap">{project.descricao}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}