import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BookOpen, Plus, Save, FileDown, Trash2,
  Sun, Cloud, CloudRain, CloudDrizzle, CloudFog,
  Users, ChevronLeft, Calendar, HardHat, Loader2, Filter
} from 'lucide-react';
import { exportDiarioPDF, exportDiariosLotePDF, getCurrentUser } from '@/components/diario/DiarioPDFExporter';
import { useToast } from '@/components/ui/use-toast';

const DIAS_SEMANA = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];

const TEMPO_OPTIONS = [
  { value: 'Sol', label: 'Sol', icon: Sun, color: 'text-yellow-500' },
  { value: 'Parcialmente Nublado', label: 'Parcialmente Nublado', icon: Cloud, color: 'text-blue-400' },
  { value: 'Nublado', label: 'Nublado', icon: CloudFog, color: 'text-slate-500' },
  { value: 'Garoa', label: 'Garoa', icon: CloudDrizzle, color: 'text-blue-500' },
  { value: 'Chuva', label: 'Chuva', icon: CloudRain, color: 'text-blue-700' },
];

const FUNCOES = [
  { key: 'mestre_obras', label: 'Mestre de Obras' },
  { key: 'pedreiros', label: 'Pedreiros' },
  { key: 'carpinteiros', label: 'Carpinteiros' },
  { key: 'armadores', label: 'Armadores' },
  { key: 'eletricistas', label: 'Eletricistas' },
  { key: 'encanadores', label: 'Encanadores' },
  { key: 'pintores', label: 'Pintores' },
  { key: 'ajudantes', label: 'Ajudantes' },
];

const MESES = [
  { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },   { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },    { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },   { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },{ value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },{ value: '12', label: 'Dezembro' },
];

const EMPTY_DIARIO = {
  obra_id: '', obra_nome: '', data: '', dia_semana: '', dia_obra: '', dias_restantes: '',
  tempo: 'Sol',
  mestre_obras: 0, pedreiros: 0, carpinteiros: 0, armadores: 0,
  eletricistas: 0, encanadores: 0, pintores: 0, ajudantes: 0,
  outros_funcao: '', outros_quantidade: 0,
  servicos_execucao: '', servicos_concluidos: '', ocorrencias: '',
  status: 'rascunho'
};

function getDiaSemana(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return DIAS_SEMANA[new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function totalEfetivo(d) {
  return (d.mestre_obras || 0) + (d.pedreiros || 0) + (d.carpinteiros || 0) +
    (d.armadores || 0) + (d.eletricistas || 0) + (d.encanadores || 0) +
    (d.pintores || 0) + (d.ajudantes || 0) + (d.outros_quantidade || 0);
}

export default function DiarioObraPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_DIARIO);
  const [exporting, setExporting] = useState(null); // null | 'single-{id}' | 'lote'
  const [selected, setSelected] = useState(new Set());
  const [currentUser, setCurrentUser] = useState('');
  const logoRef = useRef(null);
  const [logoBase64, setLogoBase64] = useState(null);

  // Filtros
  const [filterObra, setFilterObra] = useState('');
  const [filterMes, setFilterMes] = useState('');
  const [filterAno, setFilterAno] = useState('');

  useEffect(() => {
    base44.auth.me()
      .then(u => setCurrentUser(u?.full_name || getCurrentUser() || ''))
      .catch(() => setCurrentUser(getCurrentUser() || ''));
  }, []);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-diario'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: diarios = [], isLoading } = useQuery({
    queryKey: ['diarios'],
    queryFn: () => base44.entities.DiarioObra.list('-data', 500)
  });

  const { data: companySettingsList = [] } = useQuery({
    queryKey: ['company-settings-diario'],
    queryFn: () => base44.entities.CompanySettings.list()
  });

  const cs = companySettingsList[0] || null;

  const saveMutation = useMutation({
    mutationFn: async (data) => editingId
      ? base44.entities.DiarioObra.update(editingId, data)
      : base44.entities.DiarioObra.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios'] });
      toast({ title: 'Diário salvo com sucesso!' });
      setView('list'); setEditingId(null); setForm(EMPTY_DIARIO);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DiarioObra.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diarios'] });
      toast({ title: 'Diário excluído.' });
    }
  });

  const handleNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_DIARIO, data: new Date().toISOString().split('T')[0] });
    setView('form');
  };

  const handleEdit = (d) => { setEditingId(d.id); setForm({ ...EMPTY_DIARIO, ...d }); setView('form'); };

  const handleObraChange = (obraId) => {
    const obra = projects.find(p => p.id === obraId);
    setForm(f => ({ ...f, obra_id: obraId, obra_nome: obra?.nome || '' }));
  };

  const handleDataChange = (val) => setForm(f => ({ ...f, data: val, dia_semana: getDiaSemana(val) }));

  const handleSave = (status = 'salvo') => {
    if (!form.obra_id || !form.data) {
      toast({ title: 'Selecione a obra e a data.', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({ ...form, status });
  };

  const handleExportSingle = async (e, diario) => {
    e.stopPropagation();
    setExporting(`single-${diario.id}`);
    await exportDiarioPDF(diario, cs, currentUser, logoRef.current);
    setExporting(null);
  };

  const handleExportLote = async () => {
    const selecionados = filtered.filter(d => selected.has(d.id));
    if (!selecionados.length) return;
    setExporting('lote');
    selecionados.sort((a, b) => a.data.localeCompare(b.data));
    await exportDiariosLotePDF(selecionados, cs, currentUser, logoRef.current);
    setExporting(null);
  };

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(d => d.id)));
  };

  // Anos disponíveis a partir dos diários existentes
  const anosDisponiveis = [...new Set(diarios.map(d => d.data?.split('-')[0]).filter(Boolean))].sort().reverse();

  // Obras únicas para o filtro
  const obrasUnicas = [...new Map(diarios.map(d => [d.obra_id, { id: d.obra_id, nome: d.obra_nome }])).values()];

  const filtered = diarios.filter(d => {
    if (filterObra && d.obra_id !== filterObra) return false;
    if (filterMes && d.data?.split('-')[1] !== filterMes) return false;
    if (filterAno && d.data?.split('-')[0] !== filterAno) return false;
    return true;
  });

  const clearFilters = () => { setFilterObra(''); setFilterMes(''); setFilterAno(''); setSelected(new Set()); };
  const hasFilters = filterObra || filterMes || filterAno;

  const logoUrl = cs?.logo_url_clara;

  // ── LISTA ──
  if (view === 'list') return (
    <div className="max-w-5xl mx-auto">
      {/* Logo hidden para captura via canvas (sem CORS) */}
      {logoUrl && <img ref={logoRef} src={logoUrl} alt="" crossOrigin="anonymous" style={{ display: 'none' }} />}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <BookOpen className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Diário de Obra</h1>
            <p className="text-sm text-slate-500">Registro diário de atividades e ocorrências</p>
          </div>
        </div>
        <Button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Plus className="h-4 w-4" /> Novo Diário
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 flex-shrink-0">
              <Filter className="h-4 w-4" /> Filtros
            </div>

            {/* Filtro Obra */}
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs mb-1 block">Obra</Label>
              <Select value={filterObra} onValueChange={v => { setFilterObra(v === 'all' ? '' : v); setSelected(new Set()); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas as obras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as obras</SelectItem>
                  {obrasUnicas.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Mês */}
            <div className="min-w-[140px]">
              <Label className="text-xs mb-1 block">Mês</Label>
              <Select value={filterMes} onValueChange={v => { setFilterMes(v === 'all' ? '' : v); setSelected(new Set()); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos os meses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {MESES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Ano */}
            <div className="min-w-[110px]">
              <Label className="text-xs mb-1 block">Ano</Label>
              <Select value={filterAno} onValueChange={v => { setFilterAno(v === 'all' ? '' : v); setSelected(new Set()); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {anosDisponiveis.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-slate-700 self-end h-9">
                Limpar
              </Button>
            )}

            {/* Exportar lote */}
            {selected.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportLote}
                disabled={exporting === 'lote'}
                className="gap-2 border-green-500 text-green-700 hover:bg-green-50 self-end h-9 whitespace-nowrap"
              >
                {exporting === 'lote' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                PDF em Lote ({selected.size})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{hasFilters ? 'Nenhum diário encontrado com esses filtros' : 'Nenhum diário registrado'}</p>
          {!hasFilters && <p className="text-sm mt-1">Clique em "Novo Diário" para começar</p>}
        </div>
      ) : (
        <>
          {/* Selecionar todos */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <Checkbox
              id="select-all"
              checked={selected.size > 0 && selected.size === filtered.length}
              onCheckedChange={toggleSelectAll}
            />
            <label htmlFor="select-all" className="text-sm text-slate-500 cursor-pointer select-none">
              Selecionar todos ({filtered.length} {filtered.length === 1 ? 'diário' : 'diários'})
            </label>
          </div>

          <div className="space-y-2">
            {filtered.map(d => {
              const isSel = selected.has(d.id);
              const isExp = exporting === `single-${d.id}`;
              return (
                <Card
                  key={d.id}
                  className={`transition-all cursor-pointer hover:shadow-md ${isSel ? 'ring-2 ring-blue-400 bg-blue-50/40 dark:bg-blue-900/10' : ''}`}
                  onClick={() => handleEdit(d)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    {/* Checkbox individual — stopPropagation para não abrir edição */}
                    <div
                      className="flex-shrink-0"
                      onClick={e => toggleSelect(e, d.id)}
                    >
                      <Checkbox checked={isSel} onCheckedChange={() => {}} />
                    </div>

                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex-shrink-0">
                      <HardHat className="h-5 w-5 text-blue-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{d.obra_nome}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />{formatDate(d.data)} – {getDiaSemana(d.data)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />{totalEfetivo(d)} func.
                        </span>
                        <span className="hidden sm:inline">{d.tempo}</span>
                        {d.dias_restantes !== '' && d.dias_restantes !== undefined && d.dias_restantes !== null && (
                          <span className="text-xs font-medium text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">
                            {d.dias_restantes} dias restantes
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm" variant="outline"
                        onClick={e => handleExportSingle(e, d)}
                        disabled={!!exporting}
                        className="gap-1.5 text-xs"
                      >
                        {isExp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                        PDF
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={e => { e.stopPropagation(); deleteMutation.mutate(d.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // ── FORMULÁRIO ──
  return (
    <div className="max-w-4xl mx-auto">
      {logoUrl && <img ref={logoRef} src={logoUrl} alt="" crossOrigin="anonymous" style={{ display: 'none' }} />}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => { setView('list'); setEditingId(null); setForm(EMPTY_DIARIO); }}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {editingId ? 'Editar Diário' : 'Novo Diário de Obra'}
          </h1>
          {form.obra_nome && <p className="text-sm text-slate-500">{form.obra_nome} – {formatDate(form.data)}</p>}
        </div>
      </div>

      <div className="space-y-5">
        {/* Identificação */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Identificação</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Label>Obra *</Label>
              <Select value={form.obra_id} onValueChange={handleObraChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.data} onChange={e => handleDataChange(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Dia de Obra (nº)</Label>
              <Input type="number" min={0} value={form.dia_obra || ''} onChange={e => setForm(f => ({ ...f, dia_obra: Number(e.target.value) }))} placeholder="Ex: 45" className="mt-1" />
            </div>
            <div>
              <Label>Dias Restantes</Label>
              <Input type="number" min={0} value={form.dias_restantes || ''} onChange={e => setForm(f => ({ ...f, dias_restantes: e.target.value }))} placeholder="Ex: 120" className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Condição do Tempo */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Condição do Tempo</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {TEMPO_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const sel = form.tempo === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, tempo: opt.value }))}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${sel ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30' : 'border-slate-200 hover:border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'}`}>
                    <Icon className={`h-4 w-4 ${sel ? opt.color : 'text-slate-400'}`} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Efetivo */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Efetivo de Mão de Obra</CardTitle>
              <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Total: {totalEfetivo(form)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {FUNCOES.map(f => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  <Input type="number" min={0} value={form[f.key] || 0}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                    className="mt-1 text-center font-semibold" />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Label className="text-xs">Outros – Discriminar</Label>
                <Input value={form.outros_funcao || ''} onChange={e => setForm(f => ({ ...f, outros_funcao: e.target.value }))} placeholder="Ex: Soldadores" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Qtd. Outros</Label>
                <Input type="number" min={0} value={form.outros_quantidade || 0}
                  onChange={e => setForm(f => ({ ...f, outros_quantidade: Number(e.target.value) }))}
                  className="mt-1 text-center font-semibold" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Atividades */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Atividades</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Serviços em Execução</Label>
              <Textarea value={form.servicos_execucao || ''} onChange={e => setForm(f => ({ ...f, servicos_execucao: e.target.value }))}
                placeholder="Descreva os serviços em andamento neste dia..." rows={3} className="mt-1 resize-none" />
            </div>
            <div>
              <Label>Serviços Concluídos</Label>
              <Textarea value={form.servicos_concluidos || ''} onChange={e => setForm(f => ({ ...f, servicos_concluidos: e.target.value }))}
                placeholder="Descreva os serviços finalizados neste dia..." rows={3} className="mt-1 resize-none" />
            </div>
            <div>
              <Label>Ocorrências</Label>
              <Textarea value={form.ocorrencias || ''} onChange={e => setForm(f => ({ ...f, ocorrencias: e.target.value }))}
                placeholder="Registre ocorrências, problemas, observações importantes..." rows={3} className="mt-1 resize-none" />
            </div>
          </CardContent>
        </Card>

        {/* Ações */}
        <div className="flex flex-wrap gap-3 justify-end pb-8">
          <Button variant="outline" onClick={() => { setView('list'); setEditingId(null); setForm(EMPTY_DIARIO); }}>Cancelar</Button>
          <Button variant="outline" onClick={() => handleSave('rascunho')} disabled={saveMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" /> Salvar Rascunho
          </Button>
          <Button onClick={() => handleSave('salvo')} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Diário
          </Button>
          {editingId && (
            <Button variant="outline"
              onClick={e => handleExportSingle(e, { ...form, id: editingId })}
              disabled={!!exporting}
              className="gap-2 border-green-500 text-green-700 hover:bg-green-50">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Exportar PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}