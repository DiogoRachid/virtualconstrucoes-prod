import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { UsersRound, Plus, MoreVertical, Eye, Pencil, Trash2, UserCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import PageHeader from '@/components/ui/PageHeader';
import SearchFilter from '@/components/shared/SearchFilter';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';

export default function Teams() {
  const [search, setSearch] = useState('');
  const [deleteItem, setDeleteItem] = useState(null);
  const queryClient = useQueryClient();

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list('-created_date')
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setDeleteItem(null);
    }
  });

  const filteredTeams = teams.filter(team => 
    team.nome?.toLowerCase().includes(search.toLowerCase()) ||
    team.obra_nome?.toLowerCase().includes(search.toLowerCase())
  );

  const getTeamMembers = (teamId) => {
    return employees.filter(emp => emp.equipe_id === teamId);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipes"
        subtitle="Gestão de equipes e alocação em obras"
        icon={UsersRound}
        actionLabel="Nova Equipe"
        onAction={() => window.location.href = createPageUrl('TeamForm')}
      />

      <SearchFilter
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Buscar por nome ou obra..."
      />

      {filteredTeams.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title="Nenhuma equipe cadastrada"
            description="Crie equipes para organizar seus colaboradores."
            actionLabel="Nova Equipe"
            onAction={() => window.location.href = createPageUrl('TeamForm')}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams.map(team => {
            const members = getTeamMembers(team.id);
            return (
              <Card key={team.id} className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => window.location.href = createPageUrl(`TeamDetail?id=${team.id}`)}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-lg">{team.nome}</CardTitle>
                    {team.obra_nome && (
                      <p className="text-sm text-slate-500 mt-1">{team.obra_nome}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={createPageUrl(`TeamDetail?id=${team.id}`)}>
                          <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={createPageUrl(`TeamForm?id=${team.id}`)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={(e) => { e.stopPropagation(); setDeleteItem(team); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {members.slice(0, 4).map((member, i) => (
                          <div key={i} className="h-8 w-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center">
                            <span className="text-xs font-medium text-blue-600">
                              {member.nome_completo?.[0]?.toUpperCase()}
                            </span>
                          </div>
                        ))}
                        {members.length > 4 && (
                          <div className="h-8 w-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center">
                            <span className="text-xs font-medium text-slate-600">+{members.length - 4}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-slate-500">{members.length} membros</span>
                    </div>
                    <StatusBadge status={team.status || 'ativa'} />
                  </div>
                  {team.responsavel_nome && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                      <UserCircle className="h-4 w-4" />
                      <span>Resp: {team.responsavel_nome}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DeleteConfirmDialog
        open={!!deleteItem}
        onOpenChange={() => setDeleteItem(null)}
        onConfirm={() => deleteMutation.mutate(deleteItem?.id)}
        isDeleting={deleteMutation.isPending}
        title="Excluir Equipe"
        description={`Tem certeza que deseja excluir a equipe ${deleteItem?.nome}?`}
      />
    </div>
  );
}