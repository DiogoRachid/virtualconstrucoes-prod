import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Trash2, Loader2, Check, X, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MODULOS_COLABORADOR } from '@/pages/ColaboradorPortal';

const GRUPOS = [...new Set(MODULOS_COLABORADOR.map(m => m.group))];

function ModulosSelector({ modulos, onChange }) {
  const [expanded, setExpanded] = useState(GRUPOS);

  const toggle = (key) => onChange(modulos.includes(key) ? modulos.filter(k => k !== key) : [...modulos, key]);

  const toggleGroup = (group) => {
    const keys = MODULOS_COLABORADOR.filter(m => m.group === group).map(m => m.key);
    const allSelected = keys.every(k => modulos.includes(k));
    onChange(allSelected ? modulos.filter(k => !keys.includes(k)) : [...new Set([...modulos, ...keys])]);
  };

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {GRUPOS.map(group => {
        const mods = MODULOS_COLABORADOR.filter(m => m.group === group);
        const allSel = mods.every(m => modulos.includes(m.key));
        const someSel = mods.some(m => modulos.includes(m.key));
        const isExpanded = expanded.includes(group);
        return (
          <div key={group} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
              <button type="button" onClick={() => toggleGroup(group)} className={`flex items-center gap-2 text-sm font-semibold ${allSel ? 'text-blue-600' : someSel ? 'text-amber-600' : 'text-slate-600'}`}>
                <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${allSel ? 'bg-blue-600 border-blue-600' : someSel ? 'bg-amber-400 border-amber-400' : 'border-slate-300'}`}>
                  {(allSel || someSel) && <Check className="h-3 w-3 text-white" />}
                </div>
                {group}
              </button>
              <button type="button" onClick={() => setExpanded(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group])} className="text-slate-400">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
            {isExpanded && (
              <div className="divide-y divide-slate-100">
                {mods.map(m => (
                  <button key={m.key} type="button" onClick={() => toggle(m.key)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left">
                    <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${modulos.includes(m.key) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {modulos.includes(m.key) && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <m.icon className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-700">{m.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_ADMIN = { nome_completo: '', email: '', cpf: '', senha: '', status: 'ativo' };
const EMPTY_COLAB = { nome_completo: '', email: '', cpf: '', cargo: '', senha: '', status: 'ativo', modulos_habilitados: [] };

function UserForm({ data, onChange, showCargo }) {
  const [showSenha, setShowSenha] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <Label>Nome Completo *</Label>
        <Input value={data.nome_completo} onChange={e => onChange('nome_completo', e.target.value)} className="mt-1.5" placeholder="Nome completo" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>E-mail *</Label>
          <Input value={data.email} onChange={e => onChange('email', e.target.value)} className="mt-1.5" placeholder="email@exemplo.com" type="email" />
        </div>
        <div>
          <Label>CPF *</Label>
          <Input value={data.cpf} onChange={e => onChange('cpf', e.target.value)} className="mt-1.5" placeholder="000.000.000-00" />
        </div>
      </div>
      {showCargo && (
        <div>
          <Label>Cargo / Função</Label>
          <Input value={data.cargo || ''} onChange={e => onChange('cargo', e.target.value)} className="mt-1.5" placeholder="Ex: Engenheiro, Técnico..." />
        </div>
      )}
      <div>
        <Label>Senha *</Label>
        <div className="relative mt-1.5">
          <Input
            value={data.senha}
            onChange={e => onChange('senha', e.target.value)}
            type={showSenha ? 'text' : 'password'}
            placeholder="Senha de acesso"
            className="pr-10"
          />
          <button type="button" onClick={() => setShowSenha(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div>
        <Label>Status</Label>
        <Select value={data.status} onValueChange={v => onChange('status', v)}>
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function UserTable({ entity, title, description, showCargo, emptyData, showModulos }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null); // null | { mode: 'create'|'edit', data: {} }

  const { data: records = [], isLoading } = useQuery({
    queryKey: [entity],
    queryFn: () => base44.entities[entity].list()
  });

  const saveMutation = useMutation({
    mutationFn: (d) => d.id
      ? base44.entities[entity].update(d.id, d)
      : base44.entities[entity].create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity] });
      toast.success('Salvo com sucesso!');
      setDialog(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities[entity].delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entity] });
      toast.success('Removido com sucesso!');
    }
  });

  const openCreate = () => setDialog({ mode: 'create', data: { ...emptyData } });
  const openEdit = (rec) => setDialog({ mode: 'edit', data: { ...rec } });
  const handleChange = (field, value) => setDialog(prev => ({ ...prev, data: { ...prev.data, [field]: value } }));
  const handleSave = () => saveMutation.mutate(dialog.data);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 flex-shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /></div>
        ) : records.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">Nenhum cadastro ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>CPF</TableHead>
                {showCargo && <TableHead>Cargo</TableHead>}
                {showModulos && <TableHead>Módulos</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(rec => (
                <TableRow key={rec.id}>
                  <TableCell className="font-medium">{rec.nome_completo}</TableCell>
                  <TableCell>{rec.email}</TableCell>
                  <TableCell>{rec.cpf}</TableCell>
                  {showCargo && <TableCell>{rec.cargo || '—'}</TableCell>}
                  {showModulos && (
                    <TableCell>
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        {(rec.modulos_habilitados || []).length} módulos
                      </span>
                    </TableCell>
                  )}
                  <TableCell>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rec.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {rec.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(rec)} className="text-slate-400 hover:text-blue-600 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteMutation.mutate(rec.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'create' ? `Novo ${title.replace('Cadastro de ', '')}` : `Editar ${title.replace('Cadastro de ', '')}`}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-4">
              <UserForm data={dialog.data} onChange={handleChange} showCargo={showCargo} />
              {showModulos && (
                <div>
                  <Label className="mb-2 block">Módulos com Acesso <span className="text-slate-400 font-normal">({(dialog.data.modulos_habilitados || []).length} selecionados)</span></Label>
                  <ModulosSelector
                    modulos={dialog.data.modulos_habilitados || []}
                    onChange={val => handleChange('modulos_habilitados', val)}
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function PortalUsersConfig() {
  return (
    <div className="space-y-6">
      <UserTable
        entity="Administrador"
        title="Cadastro de Administradores"
        description="Usuários com acesso total ao Portal Administrador"
        showCargo={false}
        emptyData={EMPTY_ADMIN}
      />
      <UserTable
        entity="Colaborador"
        title="Cadastro de Colaboradores"
        description="Usuários com acesso restrito ao Portal Colaborador"
        showCargo={true}
        showModulos={true}
        emptyData={EMPTY_COLAB}
      />
    </div>
  );
}