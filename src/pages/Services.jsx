import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Layers, Plus, Search, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import DataTable from '@/components/shared/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Services() {
  const [search, setSearch] = useState('');

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.list()
  });

  const filtered = services.filter(s => 
    !search || 
    s.descricao?.toLowerCase().includes(search.toLowerCase()) ||
    s.codigo?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    { header: 'Código', accessor: 'codigo', className: 'w-24 font-mono text-xs' },
    { header: 'Descrição', accessor: 'descricao' },
    { header: 'Unidade', accessor: 'unidade', className: 'w-16' },
    { 
      header: 'Material', 
      accessor: 'custo_material', 
      className: 'text-right',
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_material)
    },
    { 
      header: 'Mão de Obra', 
      accessor: 'custo_mao_obra', 
      className: 'text-right',
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_mao_obra)
    },
    { 
      header: 'Total', 
      accessor: 'custo_total', 
      className: 'text-right font-bold',
      render: r => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.custo_total)
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
            <DropdownMenuItem onClick={() => window.location.href = createPageUrl(`ServiceEditor?id=${row.id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar Composição
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={async () => {
                if(confirm('Excluir serviço?')) {
                  await base44.entities.Service.delete(row.id);
                  window.location.reload();
                }
              }} 
              className="text-red-600"
            >
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
        title="Serviços" 
        subtitle="Banco de composições" 
        icon={Layers}
        actionLabel="Novo Serviço"
        onAction={() => window.location.href = createPageUrl('ServiceEditor')}
      />

      <SearchFilter 
        searchValue={search} 
        onSearchChange={setSearch} 
        placeholder="Buscar serviço..." 
      />

      <DataTable 
        columns={columns} 
        data={filtered} 
        isLoading={isLoading}
        emptyComponent={
          <EmptyState 
            title="Nenhum serviço" 
            description="Cadastre composições." 
            actionLabel="Novo" 
            onAction={() => window.location.href = createPageUrl('ServiceEditor')} 
          />
        } 
      />
    </div>
  );
}