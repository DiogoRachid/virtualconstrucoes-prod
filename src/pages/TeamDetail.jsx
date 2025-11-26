import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { UsersRound, Pencil, UserPlus, UserMinus, UserCircle, Building2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

export default function TeamDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get('id');
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const queryClient = useQueryClient();

  const { data: team, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const result = await base44.entities.Team.filter({ id: teamId });
      return result[0];
    },
    enabled: !!teamId
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list()
  });

  const teamMembers = allEmployees.filter(emp => emp.equipe_id === teamId);
  const availableEmployees = allEmployees.filter(emp => !emp.equipe_id && emp.status === 'ativo');

  const addMemberMutation = useMutation({
    mutationFn: async (empId) => {
      await base44.entities.Employee.update(empId, { 
        equipe_id: teamId, 
        equipe_nome: team?.nome 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowAddMember(false);
      setSelectedEmployee('');
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (empId) => {
      await base44.entities.Employee.update(empId, { 
        equipe_id: '', 
        equipe_nome: '' 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    }
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  if (!team) {
    return <div className="text-center py-8">Equipe não encontrada</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={team.nome}
        subtitle="Detalhes da equipe"
        icon={UsersRound}
        backUrl={createPageUrl('Teams')}
      />

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setShowAddMember(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Adicionar Membro
        </Button>
        <Link to={createPageUrl(`TeamForm?id=${team.id}`)}>
          <Button>
            <Pencil className="h-4 w-4 mr-2" /> Editar
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-slate-500">Status</p>
              <StatusBadge status={team.status || 'ativa'} />
            </div>
            {team.responsavel_nome && (
              <div>
                <p className="text-sm text-slate-500">Responsável</p>
                <div className="flex items-center gap-2 mt-1">
                  <UserCircle className="h-5 w-5 text-slate-400" />
                  <span className="font-medium">{team.responsavel_nome}</span>
                </div>
              </div>
            )}
            {team.obra_nome && (
              <div>
                <p className="text-sm text-slate-500">Obra Vinculada</p>
                <div className="flex items-center gap-2 mt-1">
                  <Building2 className="h-5 w-5 text-slate-400" />
                  <span className="font-medium">{team.obra_nome}</span>
                </div>
              </div>
            )}
            {team.descricao && (
              <div>
                <p className="text-sm text-slate-500">Descrição</p>
                <p className="mt-1">{team.descricao}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Membros ({teamMembers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {teamMembers.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Nenhum membro nesta equipe</p>
            ) : (
              <div className="space-y-3">
                {teamMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                    <Link to={createPageUrl(`EmployeeDetail?id=${member.id}`)} className="flex items-center gap-3 flex-1">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {member.nome_completo?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{member.nome_completo}</p>
                        <p className="text-sm text-slate-500">{member.funcao}</p>
                      </div>
                    </Link>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removeMemberMutation.mutate(member.id)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Membro à Equipe</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um colaborador..." />
              </SelectTrigger>
              <SelectContent>
                {availableEmployees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.nome_completo} - {emp.funcao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableEmployees.length === 0 && (
              <p className="text-sm text-slate-500 mt-2">
                Não há colaboradores disponíveis sem equipe.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMember(false)}>Cancelar</Button>
            <Button 
              onClick={() => addMemberMutation.mutate(selectedEmployee)}
              disabled={!selectedEmployee || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}