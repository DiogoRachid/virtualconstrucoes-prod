import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import {
  Ruler,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { exportMeasurementXLSX, exportMeasurementPDF } from '@/components/measurements/MeasurementExporter';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from 'date-fns';
import { toast } from "sonner";

export default function Measurements() {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: measurements = [], isLoading } = useQuery({
    queryKey: ['measurements'],
    queryFn: () => base44.entities.Measurement.list('-numero_medicao')
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.MeasurementItem.filter({ medicao_id: id })
        .then(items => Promise.all(items.map(item => base44.entities.MeasurementItem.delete(item.id))));
      await base44.entities.Measurement.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurements'] });
      setDeleteId(null);
      toast.success('Medição excluída!');
    }
  });

  const filteredMeasurements = measurements.filter(m => 
    !search || 
    m.obra_nome?.toLowerCase().includes(search.toLowerCase()) ||
    m.periodo_referencia?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusIcon = (status) => {
    switch(status) {
      case 'aprovada': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'salva': return <Clock className="h-4 w-4 text-blue-600" />;
      default: return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    }
  };

  const columns = [
    { 
      header: 'Nº', 
      accessor: 'numero_medicao',
      className: 'w-16 text-center font-bold'
    },
    { 
      header: 'Obra', 
      accessor: 'obra_nome',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.obra_nome}</p>
          <p className="text-xs text-slate-500">{row.periodo_referencia}</p>
        </div>
      )
    },
    { 
      header: 'Período', 
      accessor: 'periodo_referencia',
      className: 'w-32 text-center',
      render: (row) => (
        <div>
          <p className="text-sm">{row.periodo_referencia}</p>
          {row.data_inicio && row.data_fim && (
            <p className="text-xs text-slate-500">
              {format(new Date(row.data_inicio + 'T00:00:00'), 'dd/MM')} - {format(new Date(row.data_fim + 'T00:00:00'), 'dd/MM')}
            </p>
          )}
        </div>
      )
    },
    { 
      header: '% Físico', 
      accessor: 'percentual_fisico_executado',
      className: 'w-24 text-center',
      render: (row) => (
        <span className="font-semibold text-blue-600">
          {(row.percentual_fisico_executado || 0).toFixed(1)}%
        </span>
      )
    },
    { 
      header: 'Valor Período', 
      accessor: 'valor_total_periodo',
      className: 'w-32 text-right',
      render: (row) => new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }).format(row.valor_total_periodo || 0)
    },
    { 
      header: 'Valor Acumulado', 
      accessor: 'valor_total_acumulado',
      className: 'w-32 text-right font-bold',
      render: (row) => new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }).format(row.valor_total_acumulado || 0)
    },
    { 
      header: 'Status', 
      accessor: 'status',
      className: 'w-32',
      render: (row) => (
        <div className="flex items-center gap-2">
          {getStatusIcon(row.status)}
          <span className={`text-xs font-medium capitalize
            ${row.status === 'aprovada' ? 'text-green-700' : 
              row.status === 'salva' ? 'text-blue-700' : 'text-yellow-700'}`}>
            {row.status.replace('_', ' ')}
          </span>
        </div>
      )
    },
    {
      header: '',
      className: 'w-12',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`MeasurementForm?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              const result = await exportMeasurementXLSX(row.id);
              if (result.success) {
                toast.success(result.message);
              } else {
                toast.error(result.message);
              }
            }}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar XLSX
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              const result = await exportMeasurementPDF(row.id);
              if (result.success) {
                toast.success(result.message);
              } else {
                toast.error(result.message);
              }
            }}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteId(row.id)} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Medições de Obra"
        subtitle="Registro e acompanhamento de quantidades executadas"
        icon={Ruler}
        actionLabel="Nova Medição"
        onAction={() => window.location.href = createPageUrl('MeasurementForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar medição..."
      />

      <DataTable
        columns={columns}
        data={filteredMeasurements}
        isLoading={isLoading}
        emptyComponent={
          <EmptyState
            icon={Ruler}
            title="Nenhuma medição encontrada"
            description="Crie sua primeira medição para começar o acompanhamento da obra."
            actionLabel="Nova Medição"
            onAction={() => window.location.href = createPageUrl('MeasurementForm')}
          />
        }
      />

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Medição"
        description="Tem certeza? Todos os itens desta medição serão perdidos."
      />
    </div>
  );
}