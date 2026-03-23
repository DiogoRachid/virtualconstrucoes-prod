import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { FileSignature, Save, X, Upload, FileText, Trash2, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from '@/components/ui/PageHeader';
import { toast } from 'sonner';

export default function ContractForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const contractId = urlParams.get('id');
  const isEditing = !!contractId;
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    colaborador_id: '', colaborador_nome: '', tipo_contrato: 'clt',
    data_inicio: '', data_fim: '', data_fim_experiencia: '', prorrogacao_experiencia: '',
    salario: '', carga_horaria: 44, status: 'vigente',
    ferias_proximas: '', data_rescisao: '', motivo_rescisao: '',
    documentos: [], observacoes: ''
  });

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => base44.entities.Employee.list() });
  const { data: contract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await base44.entities.EmployeeContract.filter({ id: contractId }))[0],
    enabled: isEditing
  });

  useEffect(() => {
    if (contract) setFormData({ ...formData, ...contract, salario: contract.salario || '' });
  }, [contract]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, salario: data.salario ? parseFloat(data.salario) : 0, carga_horaria: data.carga_horaria ? parseFloat(data.carga_horaria) : 0 };
      return isEditing ? base44.entities.EmployeeContract.update(contractId, payload) : base44.entities.EmployeeContract.create(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contracts'] }); window.location.href = createPageUrl('EmployeeContracts'); },
    onError: () => toast.error('Erro ao salvar contrato')
  });

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleFilesUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const newDocs = [...(formData.documentos || [])];
    for (const file of files) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        newDocs.push({ nome: file.name, url: file_url, tipo: 'contrato', data_upload: new Date().toISOString() });
      } catch { toast.error(`Erro ao enviar ${file.name}`); }
    }
    set('documentos', newDocs);
    setUploading(false);
    toast.success(`${files.length} arquivo(s) enviado(s)`);
    e.target.value = '';
  };

  const removeDoc = (i) => setFormData(prev => ({ ...prev, documentos: prev.documentos.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Editar Contrato' : 'Novo Contrato'}
        subtitle="Contrato de trabalho e documentos"
        icon={FileSignature}
        backUrl={createPageUrl('EmployeeContracts')}
      />

      <form onSubmit={e => { e.preventDefault(); mutation.mutate(formData); }} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Dados do Contrato</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Colaborador *</Label>
              <Select value={formData.colaborador_id} onValueChange={v => {
                const emp = employees.find(e => e.id === v);
                setFormData(p => ({ ...p, colaborador_id: v, colaborador_nome: emp?.nome_completo || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.nome_completo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Contrato</Label>
              <Select value={formData.tipo_contrato} onValueChange={v => set('tipo_contrato', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clt">CLT</SelectItem>
                  <SelectItem value="pj">PJ</SelectItem>
                  <SelectItem value="terceirizado">Terceirizado</SelectItem>
                  <SelectItem value="temporario">Temporário</SelectItem>
                  <SelectItem value="estagio">Estágio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de Início *</Label>
              <Input type="date" value={formData.data_inicio} onChange={e => set('data_inicio', e.target.value)} required />
            </div>
            <div>
              <Label>Data de Término (se houver)</Label>
              <Input type="date" value={formData.data_fim} onChange={e => set('data_fim', e.target.value)} />
            </div>
            <div>
              <Label>Salário (R$) *</Label>
              <Input type="number" step="0.01" value={formData.salario} onChange={e => set('salario', e.target.value)} required />
            </div>
            <div>
              <Label>Carga Horária (h/semana)</Label>
              <Input type="number" value={formData.carga_horaria} onChange={e => set('carga_horaria', e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vigente">Vigente</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                  <SelectItem value="renovado">Renovado</SelectItem>
                  <SelectItem value="rescindido">Rescindido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Próximas Férias (previsão)</Label>
              <Input type="date" value={formData.ferias_proximas} onChange={e => set('ferias_proximas', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-amber-700">Contrato de Experiência</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Fim do Período de Experiência</Label>
              <Input type="date" value={formData.data_fim_experiencia} onChange={e => set('data_fim_experiencia', e.target.value)} />
            </div>
            <div>
              <Label>Prorrogação do Contrato de Experiência</Label>
              <Input type="date" value={formData.prorrogacao_experiencia} onChange={e => set('prorrogacao_experiencia', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {formData.status === 'rescindido' && (
          <Card>
            <CardHeader><CardTitle className="text-red-700">Rescisão</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Data de Rescisão</Label>
                <Input type="date" value={formData.data_rescisao} onChange={e => set('data_rescisao', e.target.value)} />
              </div>
              <div>
                <Label>Motivo</Label>
                <Input value={formData.motivo_rescisao} onChange={e => set('motivo_rescisao', e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload de documentos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-5 bg-slate-50 border-b">
            <CardTitle className="text-sm font-bold text-slate-700 uppercase">Documentos do Contrato</CardTitle>
            <div className="flex gap-2 items-center">
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="h-3 w-3 mr-1" />{uploading ? 'Enviando...' : 'Upload de Contratos'}
              </Button>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg" className="hidden" onChange={handleFilesUpload} />
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            {(formData.documentos || []).length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 cursor-pointer hover:border-blue-300" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Clique para enviar o contrato assinado, aditivos, prorrogações...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {formData.documentos.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate">{doc.nome}</a>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeDoc(i)} className="h-7 w-7 text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-3 text-center text-slate-400 text-xs cursor-pointer hover:border-blue-300" onClick={() => fileInputRef.current?.click()}>
                  + Adicionar mais documentos
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={formData.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => window.location.href = createPageUrl('EmployeeContracts')}>
            <X className="h-4 w-4 mr-2" />Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending} className="bg-blue-600 hover:bg-blue-700">
            <Save className="h-4 w-4 mr-2" />{mutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </div>
  );
}