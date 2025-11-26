import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import {
  LayoutDashboard,
  Users,
  Building2,
  Wallet,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  PieChart,
  FileText,
  Settings,
  Menu,
  X,
  ChevronDown,
  LogOut,
  HardHat,
  Landmark,
  FolderKanban,
  TrendingUp,
  Moon,
  Sun
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const menuItems = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    page: 'Dashboard'
  },
  {
    title: 'Cadastros',
    icon: FolderKanban,
    submenu: [
      { title: 'Fornecedores', page: 'Suppliers', icon: Building2 },
      { title: 'Clientes', page: 'Clients', icon: Users },
      { title: 'Obras', page: 'Projects', icon: HardHat },
      { title: 'Contas Bancárias', page: 'BankAccounts', icon: Landmark },
      { title: 'Centros de Custo', page: 'CostCenters', icon: PieChart }
    ]
  },
  {
    title: 'Financeiro',
    icon: Wallet,
    submenu: [
      { title: 'Contas a Pagar', page: 'AccountsPayable', icon: ArrowDownCircle },
      { title: 'Contas a Receber', page: 'AccountsReceivable', icon: ArrowUpCircle },
      { title: 'Transações', page: 'Transactions', icon: Receipt }
    ]
  },
  {
    title: 'Investimentos',
    icon: TrendingUp,
    page: 'Investments'
  },
  {
    title: 'Relatórios',
    icon: FileText,
    page: 'Reports'
  }
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState(['Cadastros', 'Financeiro']);
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const toggleSubmenu = (title) => {
    setExpandedMenus(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const getPermissionLabel = (perm) => {
    const labels = {
      'admin': 'Administrador',
      'analyst': 'Analista Financeiro',
      'director': 'Diretoria'
    };
    return labels[perm] || 'Usuário';
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <style>{`
        :root {
          --primary: 221.2 83.2% 53.3%;
          --primary-foreground: 210 40% 98%;
        }
        .dark .card, .dark [class*="CardContent"], .dark [class*="Card"] {
          background-color: #1e293b !important;
          border-color: #334155 !important;
        }
        .dark .card *, .dark [class*="Card"] * {
          color: #e2e8f0;
        }
        .dark input, .dark select, .dark textarea {
          background-color: #1e293b !important;
          border-color: #475569 !important;
          color: #e2e8f0 !important;
        }
        .dark table {
          background-color: #1e293b !important;
        }
        .dark th {
          background-color: #334155 !important;
          color: #e2e8f0 !important;
        }
        .dark td {
          border-color: #334155 !important;
          color: #cbd5e1 !important;
        }
        .dark tr:hover {
          background-color: #334155 !important;
        }
      `}</style>
      
      {/* Mobile Header */}
      <header className={`lg:hidden fixed top-0 left-0 right-0 h-16 border-b z-50 flex items-center justify-between px-4 transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setSidebarOpen(true)}
          className={darkMode ? 'text-slate-200' : ''}
        >
          <Menu className="h-6 w-6" />
        </Button>
        <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-white' : ''}`}>
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg" 
            alt="Virtual Construções" 
            className="h-7 object-contain"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDarkMode(!darkMode)}
          className={darkMode ? 'text-slate-200' : ''}
        >
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-72 border-r z-50 transition-all duration-300",
        darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={`h-20 flex items-center justify-between px-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-white' : ''}`}>
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg" 
                alt="Virtual Construções" 
                className="h-10 object-contain"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDarkMode(!darkMode)}
                className={`hidden lg:flex ${darkMode ? 'text-slate-200 hover:bg-slate-700' : ''}`}
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className={`lg:hidden ${darkMode ? 'text-slate-200' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-6 px-4">
            <div className="space-y-1">
              {menuItems.map((item) => (
                <div key={item.title}>
                  {item.submenu ? (
                    <>
                      <button
                        onClick={() => toggleSubmenu(item.title)}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all",
                          darkMode 
                            ? "text-slate-300 hover:bg-slate-700 hover:text-white"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className="h-5 w-5" />
                          {item.title}
                        </div>
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform",
                          expandedMenus.includes(item.title) && "rotate-180"
                        )} />
                      </button>
                      {expandedMenus.includes(item.title) && (
                        <div className={`ml-4 mt-1 space-y-1 border-l-2 pl-4 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                          {item.submenu.map((subitem) => (
                            <Link
                              key={subitem.page}
                              to={createPageUrl(subitem.page)}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all",
                                currentPageName === subitem.page
                                  ? darkMode
                                    ? "bg-blue-900/50 text-blue-400 font-medium"
                                    : "bg-blue-50 text-blue-600 font-medium"
                                  : darkMode
                                    ? "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                              )}
                            >
                              <subitem.icon className="h-4 w-4" />
                              {subitem.title}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={createPageUrl(item.page)}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        currentPageName === item.page
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                          : darkMode
                            ? "text-slate-300 hover:bg-slate-700 hover:text-white"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.title}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </nav>

          {/* User Section */}
          {user && (
            <div className={`p-4 border-t ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}>
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                      {user.full_name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-medium truncate ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{user.full_name}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{getPermissionLabel(user.permissao_financeiro)}</p>
                    </div>
                    <ChevronDown className={`h-4 w-4 ${darkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl('Settings')} className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Configurações
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`lg:pl-72 pt-16 lg:pt-0 min-h-screen transition-colors ${darkMode ? 'text-slate-100' : ''}`}>
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}