import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Gift, UserPlus, UserMinus, UserCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function BenefitAssignment() {
  const urlParams = new URLSearchParams(window.location.search);
  const benefitId = urlParams.get('id');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [customValue, setCustomValue] = useState('');
  const queryClient = useQueryClient();

  const { data: benefit } = useQuery({
    queryKey: ['benefit', benefitId],
    queryFn: async () => {
      const result = await base44.entities.Benefit.filter({ id: benefitId });
      return result[0];
    },
    enabled: !!benefitId
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ status: 'ativo' })
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['benefitAssignments', benefitId],
    queryFn: () => base44.entities.EmployeeBenefit.filter({ beneficio_id: benefitId }),
    enabled: !!benefitId
  });

  const assignedEmployeeIds = assignments.map(a => a.colaborador_id);
  const availableEmployees = employees.filter(e => !assignedEmployeeIds.includes(e.id));

  const addMutation = useMutation({
    mutationFn: async () => {
      const emp = employees.find(e => e.id === selectedEmployee);
      await base44.entities.EmployeeBenefit.create({
        colaborador_id: selectedEmployee,
        colaborador_nome: emp?.nome_completo,
        beneficio_id: benefitId,
        beneficio_nome: benefit?.nome,
        valor: customValue ? parseFloat(customValue) : benefit?.valor,
        data_inicio: new Date().toISOString().split('T')[0],
        status: 'ativo'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benefitAssignments', benefitId] });
      setShowAddDialog(false);
      setSelectedEmployee('');
      setCustomValue('');
    }
  });

  const removeMutation = useMutation({
    mutationFn: (id) => base44.entities.EmployeeBenefit.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['benefitAssignments', benefitId] })
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (assignment) => {
      const newStatus = assignment.status === 'ativo' ? 'suspenso' : 'ativo';
      await base44.entities.EmployeeBenefit.update(assignment.id, { status: newStatus });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['benefitAssignments', benefitId] })
  });

  if (!benefit) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={benefit.nome}
        subtitle="Vincular colaboradores ao benefício"
        icon={Gift}
        backUrl={createPageUrl('Benefits')}
      />

      <div className="flex justify-end">
        <Button onClick={() => setShowAddDialog(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Adicionar Colaborador
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Colaboradores Vinculados ({assignments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-slate-500 text-center py-8">
              Nenhum colaborador vinculado a este benefício.
            </p>
          ) : (
            <div className="space-y-3">
              {assignments.map(assignment => (
                <div key={assignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <UserCircle className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{assignment.colaborador_nome}</p>
                      <p className="text-sm text-slate-500">
                        R$ {(assignment.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={assignment.status} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleStatusMutation.mutate(assignment)}
                    >
                      {assignment.status === 'ativo' ? 'Suspender' : 'Ativar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removeMutation.mutate(assignment.id)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Colaborador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Colaborador</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.nome_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor Personalizado (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder={`Padrão: R$ ${(benefit.valor || 0).toFixed(2)}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!selectedEmployee || addMutation.isPending}
            >
              {addMutation.isPending ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}