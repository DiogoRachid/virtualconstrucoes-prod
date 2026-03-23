import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * Protege rotas do portal administrador.
 * Verifica se existe uma sessão válida no sessionStorage (portal_admin_auth).
 * Se não houver, redireciona para a tela de login do admin.
 */
export default function ProtectedAdminRoute({ children }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const session = sessionStorage.getItem('portal_admin_auth');
    if (session) {
      setAllowed(true);
    } else {
      navigate(createPageUrl('AdminLogin'), { replace: true });
    }
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return allowed ? children : null;
}