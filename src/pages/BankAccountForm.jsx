import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { Landmark, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BankAccountForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const accountId = urlParams.get('id');
  const isEdit = !!accountId;

  const [formData, setFormData] = useState({
    nome: '',
    banco: '',
    agencia: '',
    conta: '',
    tipo: 'corrente',
    saldo_inicial: '',
    saldo_atual: '',
    moeda: 'BRL',
    status: 'ativa'
  });

  const { data: account, isLoading } = useQuery({
    queryKey: ['bankAccount', accountId],
    queryFn: () => base44.entities.BankAccount.list({ id: accountId }).then(res => res[0]),
    enabled: isEdit
  });

  useEffect(() => {
    if (account) {
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
  }, [account]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        saldo_inicial: data.saldo_inicial ? parseFloat(data.saldo_inicial) : 0,
        saldo_atual: isEdit ? (data.saldo_atual ? parseFloat(data.saldo_atual) : 0) : (data.saldo_inicial ? parseFloat(data.saldo_inicial) : 0)
      };
      if (isEdit) {
        return base44.entities.BankAccount.update(accountId, payload);
      }
      return base44.entities.BankAccount.create(payload);
    },
    onSuccess: () => {
      window.location.href = createPageUrl('BankAccounts');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}
        subtitle={isEdit ? 'Atualize os dados da conta' : 'Preencha os dados da nova conta'}
        icon={Landmark}
        backUrl={createPageUrl('BankAccounts')}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <div className="space-y-6">
          {/* Dados Principais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados da Conta</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label htmlFor="nome">Nome da Conta *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleChange('nome', e.target.value)}
                  required
                  placeholder="Ex: Conta Principal, Caixa Obra X..."
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="tipo">Tipo de Conta *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => handleChange('tipo', value)}
                >
                  <SelectTrigger className="mt-1.5">
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

              <div>
                <Label htmlFor="moeda">Moeda *</Label>
                <Select
                  value={formData.moeda}
                  onValueChange={(value) => handleChange('moeda', value)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">Real (BRL)</SelectItem>
                    <SelectItem value="USD">Dólar (USD)</SelectItem>
                    <SelectItem value="EUR">Euro (EUR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange('status', value)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="banco">Banco</Label>
                <Input
                  id="banco"
                  value={formData.banco}
                  onChange={(e) => handleChange('banco', e.target.value)}
                  placeholder="Nome do banco"
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="agencia">Agência</Label>
                  <Input
                    id="agencia"
                    value={formData.agencia}
                    onChange={(e) => handleChange('agencia', e.target.value)}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="conta">Conta</Label>
                  <Input
                    id="conta"
                    value={formData.conta}
                    onChange={(e) => handleChange('conta', e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Saldos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Saldos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="saldo_inicial">Saldo Inicial</Label>
                <Input
                  id="saldo_inicial"
                  type="number"
                  step="0.01"
                  value={formData.saldo_inicial}
                  onChange={(e) => handleChange('saldo_inicial', e.target.value)}
                  placeholder="0,00"
                  className="mt-1.5"
                />
              </div>

              {isEdit && (
                <div>
                  <Label htmlFor="saldo_atual">Saldo Atual</Label>
                  <Input
                    id="saldo_atual"
                    type="number"
                    step="0.01"
                    value={formData.saldo_atual}
                    onChange={(e) => handleChange('saldo_atual', e.target.value)}
                    placeholder="0,00"
                    className="mt-1.5"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Salvar Alterações' : 'Cadastrar Conta'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.href = createPageUrl('BankAccounts')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}