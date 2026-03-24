import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, User, Eye, EyeOff } from 'lucide-react';
import { toast } from "sonner";

export default function AdminProfileEditor({ adminId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [form, setForm] = useState({
    nome_completo: '',
    email: '',
    cpf: '',
    senha_atual: '',
    nova_senha: '',
    confirmar_senha: '',
  });

  useEffect(() => {
    if (!adminId) return;
    base44.entities.Administrador.filter({ id: adminId }).then(res => {
      const admin = res[0];
      if (admin) {
        setForm(prev => ({
          ...prev,
          nome_completo: admin.nome_completo || '',
          email: admin.email || '',
          cpf: admin.cpf || '',
        }));
      }
      setLoading(false);
    });
  }, [adminId]);

  const handleSave = async () => {
    if (form.nova_senha && form.nova_senha !== form.confirmar_senha) {
      toast.error('A nova senha e a confirmação não coincidem.');
      return;
    }

    setSaving(true);

    // Verifica senha atual antes de atualizar
    if (form.nova_senha) {
      const admins = await base44.entities.Administrador.filter({ id: adminId });
      const admin = admins[0];
      if (!admin || admin.senha !== form.senha_atual) {
        toast.error('Senha atual incorreta.');
        setSaving(false);
        return;
      }
    }

    const updateData = {
      nome_completo: form.nome_completo,
      email: form.email,
      cpf: form.cpf,
    };
    if (form.nova_senha) updateData.senha = form.nova_senha;

    await base44.entities.Administrador.update(adminId, updateData);

    // Atualiza sessão com novo nome/email
    const session = JSON.parse(sessionStorage.getItem('portal_admin_auth'));
    sessionStorage.setItem('portal_admin_auth', JSON.stringify({
      ...session,
      nome: form.nome_completo,
      email: form.email,
    }));

    toast.success('Perfil atualizado com sucesso!');
    setForm(prev => ({ ...prev, senha_atual: '', nova_senha: '', confirmar_senha: '' }));
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Dados do Administrador
          </CardTitle>
          <CardDescription>Atualize seu nome, e-mail e CPF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nome Completo</Label>
              <Input value={form.nome_completo} onChange={e => setForm(p => ({ ...p, nome_completo: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1.5" />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} className="mt-1.5" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alterar Senha</CardTitle>
          <CardDescription>Preencha apenas se quiser mudar sua senha</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Senha Atual</Label>
            <div className="relative mt-1.5">
              <Input
                type={showSenha ? 'text' : 'password'}
                value={form.senha_atual}
                onChange={e => setForm(p => ({ ...p, senha_atual: e.target.value }))}
                placeholder="••••••••"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowSenha(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nova Senha</Label>
              <div className="relative mt-1.5">
                <Input
                  type={showNovaSenha ? 'text' : 'password'}
                  value={form.nova_senha}
                  onChange={e => setForm(p => ({ ...p, nova_senha: e.target.value }))}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowNovaSenha(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showNovaSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Confirmar Nova Senha</Label>
              <Input
                type="password"
                value={form.confirmar_senha}
                onChange={e => setForm(p => ({ ...p, confirmar_senha: e.target.value }))}
                placeholder="••••••••"
                className="mt-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
        Salvar Alterações
      </Button>
    </div>
  );
}