import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { ArrowUpCircle, Loader2 } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DocumentUploader from '@/components/shared/DocumentUploader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountReceivableForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const accountId = urlParams.get('id');
  const clientId = urlParams.get('client');
  const isEdit = !!accountId;

  const [formData, setFormData] = useState({
    descricao: '',
    valor: '',
    data_vencimento: '',
    data_recebimento: '',
    cliente_id: clientId || '',
    cliente_nome: '',
    centro_custo_id: '',
    centro_custo_nome: '',
    conta_bancaria_id: '',
    conta_bancaria_nome: '',
    obra_id: '',
    obra_nome: '',
    status: 'em_aberto',
    forma_recebimento: 'boleto',
    numero_documento: '',
    documentos: [],
    observacoes: ''
  });

  const { data: account, isLoading } = useQuery({
    queryKey: ['accountReceivable', accountId],
    queryFn: () => base44.entities.AccountReceivable.list({ id: accountId }).then(res => res[0]),
    enabled: isEdit
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.filter({ status: 'ativo' })
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['costCenters'],
    queryFn: () => base44.entities.CostCenter.filter({ status: 'ativo' })
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => base44.entities.BankAccount.filter({ status: 'ativa' })
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list()
  });

  useEffect(() => {
    if (account) {
      setFormData({
        descricao: account.descricao || '',
        valor: account.valor || '',
        data_vencimento: account.data_vencimento || '',
        data_recebimento: account.data_recebimento || '',
        cliente_id: account.cliente_id || '',
        cliente_nome: account.cliente_nome || '',
        centro_custo_id: account.centro_custo_id || '',
        centro_custo_nome: account.centro_custo_nome || '',
        conta_bancaria_id: account.conta_bancaria_id || '',
        conta_bancaria_nome: account.conta_bancaria_nome || '',
        obra_id: account.obra_id || '',
        obra_nome: account.obra_nome || '',
        status: account.status || 'em_aberto',
        forma_recebimento: account.forma_recebimento || 'boleto',
        numero_documento: account.numero_documento || '',
        documentos: account.documentos || [],
        observacoes: account.observacoes || ''
      });
    }
  }, [account]);

  useEffect(() => {
    if (clientId && clients.length) {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        setFormData(prev => ({
          ...prev,
          cliente_id: clientId,
          cliente_nome: client.nome
        }));
      }
    }
  }, [clientId, clients]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        valor: data.valor ? parseFloat(data.valor) : 0
      };
      if (isEdit) {
        return base44.entities.AccountReceivable.update(accountId, payload);
      }
      return base44.entities.AccountReceivable.create(payload);
    },
    onSuccess: () => {
      window.location.href = createPageUrl('AccountsReceivable');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClientChange = (id) => {
    const client = clients.find(c => c.id === id);
    setFormData(prev => ({
      ...prev,
      cliente_id: id,
      cliente_nome: client?.nome || ''
    }));
  };

  const handleCostCenterChange = (id) => {
    const center = costCenters.find(c => c.id === id);
    setFormData(prev => ({
      ...prev,
      centro_custo_id: id,
      centro_custo_nome: center?.nome || ''
    }));
  };

  const handleBankAccountChange = (id) => {
    const account = bankAccounts.find(a => a.id === id);
    setFormData(prev => ({
      ...prev,
      conta_bancaria_id: id,
      conta_bancaria_nome: account?.nome || ''
    }));
  };

  const handleProjectChange = (id) => {
    const project = projects.find(p => p.id === id);
    setFormData(prev => ({
      ...prev,
      obra_id: id,
      obra_nome: project?.nome || ''
    }));
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
        title={isEdit ? 'Editar Conta a Receber' : 'Nova Conta a Receber'}
        subtitle={isEdit ? 'Atualize os dados da conta' : 'Preencha os dados da nova conta'}
        icon={ArrowUpCircle}
        backUrl={createPageUrl('AccountsReceivable')}
      />

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="space-y-6">
          {/* Dados Principais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados Principais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Label htmlFor="descricao">Descrição *</Label>
                <Input
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => handleChange('descricao', e.target.value)}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="valor">Valor *</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  value={formData.valor}
                  onChange={(e) => handleChange('valor', e.target.value)}
                  required
                  placeholder="0,00"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="data_vencimento">Data Prevista *</Label>
                <Input
                  id="data_vencimento"
                  type="date"
                  value={formData.data_vencimento}
                  onChange={(e) => handleChange('data_vencimento', e.target.value)}
                  required
                  className="mt-1.5"
                />
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
                    <SelectItem value="em_aberto">Em Aberto</SelectItem>
                    <SelectItem value="recebido">Recebido</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="forma_recebimento">Forma de Recebimento</Label>
                <Select
                  value={formData.forma_recebimento}
                  onValueChange={(value) => handleChange('forma_recebimento', value)}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="numero_documento">Número do Documento</Label>
                <Input
                  id="numero_documento"
                  value={formData.numero_documento}
                  onChange={(e) => handleChange('numero_documento', e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Vínculos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vínculos</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="cliente">Cliente</Label>
                <Select
                  value={formData.cliente_id}
                  onValueChange={handleClientChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="centro_custo">Centro de Custo</Label>
                <Select
                  value={formData.centro_custo_id}
                  onValueChange={handleCostCenterChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="conta_bancaria">Conta Bancária de Destino</Label>
                <Select
                  value={formData.conta_bancaria_id}
                  onValueChange={handleBankAccountChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="obra">Obra</Label>
                <Select
                  value={formData.obra_id}
                  onValueChange={handleProjectChange}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Documentos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Comprovantes</CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUploader
                documents={formData.documentos}
                onChange={(docs) => handleChange('documentos', docs)}
              />
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => handleChange('observacoes', e.target.value)}
                rows={4}
              />
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
              onClick={() => window.location.href = createPageUrl('AccountsReceivable')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}