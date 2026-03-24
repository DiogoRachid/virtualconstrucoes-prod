import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Calculator, Calendar, Ruler, HardHat, Lock, LogOut,
  User, ChevronRight, Building2, Package, Layers, Clock,
  FileText, Truck, ShoppingCart, FileInput, UploadCloud, History
} from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";

// Todos os módulos disponíveis para colaborador
export const MODULOS_COLABORADOR = [
  { key: 'Budgets', label: 'Orçamentos', icon: Calculator, group: 'Técnico' },
  { key: 'Plannings', label: 'Planejamento', icon: Calendar, group: 'Técnico' },
  { key: 'Measurements', label: 'Medições', icon: Ruler, group: 'Técnico' },
  { key: 'Projects', label: 'Obras', icon: HardHat, group: 'Técnico' },
  { key: 'Services', label: 'Serviços (Composições)', icon: Layers, group: 'Técnico' },
  { key: 'Inputs', label: 'Insumos', icon: Package, group: 'Técnico' },
  { key: 'InputPurchaseHistory', label: 'Histórico de Insumos', icon: History, group: 'Obra' },
  { key: 'MaterialRequisitions', label: 'Pedidos de Materiais', icon: FileInput, group: 'Obra' },
  { key: 'PurchasingList', label: 'Lista de Compras', icon: ShoppingCart, group: 'Obra' },
  { key: 'ImportInvoice', label: 'Importar NF (XML)', icon: UploadCloud, group: 'Obra' },
  { key: 'ImportInvoiceManual', label: 'Importar NF Manual', icon: FileInput, group: 'Obra' },
  { key: 'TimeRecords', label: 'Frequência', icon: Clock, group: 'RH' },
  { key: 'Reports', label: 'Relatórios', icon: FileText, group: 'Relatórios' },
];

export default function ColaboradorPortal() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = sessionStorage.getItem('portal_colaborador_auth');
    if (session) {
      setUser(JSON.parse(session));
    }
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Sem sessão — redireciona para login
  if (!loading && !user) {
    window.location.href = createPageUrl('ColaboradorLogin');
    return null;
  }

  const modulosHabilitados = user?.modulos_habilitados || [];

  if (modulosHabilitados.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
        <Lock className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Sem Módulos Habilitados</h2>
        <p className="text-slate-500 max-w-sm">Seu acesso ainda não foi configurado. Entre em contato com o administrador do sistema.</p>
        <button onClick={() => { sessionStorage.removeItem('portal_colaborador_auth'); window.location.href = createPageUrl('PortalSelect'); }} className="mt-6 flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    );
  }

  const groups = [...new Set(MODULOS_COLABORADOR.filter(m => modulosHabilitados.includes(m.key)).map(m => m.group))];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
            {user?.full_name?.[0]?.toUpperCase() || 'C'}
          </div>
          <div>
            <p className="font-semibold text-slate-900 text-sm">{user?.nome || user?.full_name || 'Colaborador'}</p>
            <p className="text-xs text-slate-500">Portal do Colaborador</p>
          </div>
        </div>
        <button onClick={() => { sessionStorage.removeItem('portal_colaborador_auth'); window.location.href = createPageUrl('PortalSelect'); }} className="flex items-center gap-2 text-slate-500 hover:text-red-500 text-sm transition-colors">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Bem-vindo, {(user?.nome || user?.full_name || '').split(' ')[0]}!</h1>
        <p className="text-slate-500 mb-8">Selecione o módulo que deseja acessar.</p>

        {groups.map(group => {
          const modulos = MODULOS_COLABORADOR.filter(m => modulosHabilitados.includes(m.key) && m.group === group);
          return (
            <div key={group} className="mb-8">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{group}</h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {modulos.map(modulo => (
                  <Link key={modulo.key} to={createPageUrl(modulo.key)}>
                    <Card className="hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group border-slate-200">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                          <modulo.icon className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{modulo.label}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}