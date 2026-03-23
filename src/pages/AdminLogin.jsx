import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Shield, ArrowLeft, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LOGO_ESCURA = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6926eb0b6c1242bf806695a4/4053fb920_logofundoescuro.png";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [companySettings, setCompanySettings] = useState(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    base44.entities.CompanySettings.list().then(r => { if (r.length > 0) setCompanySettings(r[0]); });
    // Se já tem sessão ativa, redireciona direto
    const session = sessionStorage.getItem('portal_admin_auth');
    if (session) navigate(createPageUrl('Dashboard'), { replace: true });
  }, []);

  const logoUrl = companySettings?.logo_url_escura || LOGO_ESCURA;
  const nomeEmpresa = companySettings?.nome_empresa || 'Virtual Construções Civis';

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    if (!email || !senha) { setErro('Preencha e-mail e senha.'); return; }
    setLoading(true);
    try {
      const admins = await base44.entities.Administrador.filter({ email: email.trim().toLowerCase() });
      const admin = admins.find(a => a.email.toLowerCase() === email.trim().toLowerCase() && a.senha === senha && a.status === 'ativo');
      if (!admin) {
        setErro('E-mail ou senha inválidos, ou acesso inativo.');
        setLoading(false);
        return;
      }
      // Salva sessão simples no sessionStorage
      sessionStorage.setItem('portal_admin_auth', JSON.stringify({ id: admin.id, nome: admin.nome_completo, email: admin.email }));
      navigate(createPageUrl('Dashboard'));
    } catch (err) {
      setErro('Erro ao verificar credenciais. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logoUrl} alt={nomeEmpresa} className="h-12 object-contain mx-auto mb-4" />
          <div className="inline-flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-full px-4 py-1.5 text-blue-300 text-sm mb-2">
            <Shield className="h-4 w-4" /> Portal Administrador
          </div>
          <h1 className="text-2xl font-bold text-white mt-3">Acesso Restrito</h1>
          <p className="text-slate-400 text-sm mt-1">Digite suas credenciais para continuar</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 space-y-5">
          <div>
            <Label className="text-slate-300">E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="mt-1.5 bg-white/10 border-white/20 text-white placeholder:text-slate-500 focus:border-blue-400"
              autoComplete="username"
            />
          </div>
          <div>
            <Label className="text-slate-300">Senha</Label>
            <div className="relative mt-1.5">
              <Input
                type={showSenha ? 'text' : 'password'}
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="••••••••"
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 focus:border-blue-400 pr-10"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowSenha(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {erro && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {erro}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-base font-semibold">
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Shield className="h-5 w-5 mr-2" />}
            Entrar
          </Button>
        </form>

        <Link to={createPageUrl('PortalSelect')} className="mt-6 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar à seleção de portal
        </Link>
      </div>
    </div>
  );
}