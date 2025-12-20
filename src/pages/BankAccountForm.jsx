import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '../utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from '../components/ui/PageHeader';
import { Landmark, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BankAccountForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const urlParams = new URLSearchParams(window.location.search);
  const accountId = urlParams.get('id');
  const isEditing = !!accountId;

  const [formData, setFormData] = useState({
    nome: '',
    banco: '',
    agencia: '',
    conta: '',
    tipo: 'corrente',
    moeda: 'BRL',
    saldo_inicial: '',
    saldo_atual: '',
    status: 'ativa'
  });

  const { data: account, isLoading } = useQuery({
    queryKey: ['bankAccount', accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const res = await base44.entities.BankAccount.filter({ id: accountId });
      return res && res.length > 0 ? res[0] : null;
    },
    enabled: isEditing
  });

  useEffect(() => {
    if (isEditing && account) {
      setFormData({
        nome: account.nome || '',
        banco: account.banco || '',
        agencia: account.agencia || '',
        conta: account.conta || '',
        tipo: account.tipo || 'corrente',
        moeda: account.moeda || 'BRL',
        saldo_inicial: account.saldo_inicial || '',
        saldo_atual: account.saldo_atual || '',
        status: account.status || 'ativa'
      });
    }
  }, [isEditing, account]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      const submitData = {
        ...data,
        saldo_inicial: data.saldo_inicial ? parseFloat(data.saldo_inicial) : 0,
        saldo_atual: data.saldo_atual ? parseFloat(data.saldo_atual) : 0
      };

      if (isEditing) {
        return await base44.entities.BankAccount.update(accountId, submitData);
      } else {
        return await base44.entities.BankAccount.create(submitData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      toast.success(isEditing ? 'Conta atualizada!' : 'Conta cadastrada!');
      navigate(createPageUrl('BankAccounts'));
    },
    onError: (error) => {
      toast.error('Erro ao salvar conta');
      console.error(error);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isEditing && isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title={isEditing ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}
        subtitle={isEditing ? 'Atualize as informações da conta' : 'Cadastre uma nova conta bancária'}
        backUrl={createPageUrl('BankAccounts')}
        icon={Landmark}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados da Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da Conta *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                placeholder="Ex: Conta Principal Itaú"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Banco</Label>
                <Input
                  value={formData.banco}
                  onChange={(e) => handleChange('banco', e.target.value)}
                  placeholder="Ex: Banco do Brasil"
                />
              </div>
              <div>
                <Label>Tipo de Conta *</Label>
                <Select value={formData.tipo} onValueChange={(value) => handleChange('tipo', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Conta Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="investimento">Investimento</SelectItem>
                    <SelectItem value="caixa">Caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Agência</Label>
                <Input
                  value={formData.agencia}
                  onChange={(e) => handleChange('agencia', e.target.value)}
                />
              </div>
              <div>
                <Label>Número da Conta</Label>
                <Input
                  value={formData.conta}
                  onChange={(e) => handleChange('conta', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Moeda</Label>
                <Select value={formData.moeda} onValueChange={(value) => handleChange('moeda', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL - Real</SelectItem>
                    <SelectItem value="USD">USD - Dólar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saldos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Saldo Inicial</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.saldo_inicial}
                  onChange={(e) => handleChange('saldo_inicial', e.target.value)}
                />
              </div>
              <div>
                <Label>Saldo Atual</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.saldo_atual}
                  onChange={(e) => handleChange('saldo_atual', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(createPageUrl('BankAccounts'))}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              isEditing ? 'Salvar Alterações' : 'Cadastrar Conta'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}