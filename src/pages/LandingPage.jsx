import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  HardHat, Building2, Award, Users, Phone, Mail, MapPin, Globe,
  ChevronDown, Menu, X, ArrowRight, CheckCircle2, Shield, BarChart3,
  Wrench, TreePine, Landmark, FileText
} from 'lucide-react';
import { Button } from "@/components/ui/button";

const LOGO_CLARA = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg";

const servicos = [
  {
    icon: Building2,
    titulo: "Edificações Públicas",
    desc: "Construção de escolas, hospitais, creches, fóruns, delegacias e demais equipamentos públicos com alto padrão técnico.",
    color: "bg-blue-50 text-blue-600"
  },
  {
    icon: TreePine,
    titulo: "Obras de Urbanização",
    desc: "Praças, calçadões, parques urbanos e projetos de requalificação do espaço público com qualidade e durabilidade.",
    color: "bg-emerald-50 text-emerald-600"
  },
  {
    icon: Wrench,
    titulo: "Infraestrutura Viária",
    desc: "Pavimentação, drenagem, obras de arte especiais e melhorias no sistema viário municipal e estadual.",
    color: "bg-orange-50 text-orange-600"
  },
  {
    icon: Landmark,
    titulo: "Obras de Saneamento",
    desc: "Construção e ampliação de sistemas de abastecimento de água, esgotamento sanitário e resíduos sólidos.",
    color: "bg-cyan-50 text-cyan-600"
  },
  {
    icon: HardHat,
    titulo: "Reforma e Requalificação",
    desc: "Restauração e modernização de edificações públicas, garantindo conformidade com normas técnicas vigentes.",
    color: "bg-violet-50 text-violet-600"
  },
  {
    icon: FileText,
    titulo: "Projetos e Consultoria",
    desc: "Elaboração de projetos executivos, laudos técnicos, ART e suporte em todas as fases de licitação e execução.",
    color: "bg-rose-50 text-rose-600"
  }
];

const obras = [
  {
    nome: "UBS Bairro Nova Esperança",
    local: "Mongaguá – SP",
    tipo: "Unidade Básica de Saúde",
    status: "Concluída",
    img: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=600&q=80"
  },
  {
    nome: "Escola Municipal Integrada",
    local: "Itanhaém – SP",
    tipo: "Educação",
    status: "Concluída",
    img: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=600&q=80"
  },
  {
    nome: "Pavimentação Av. Principal",
    local: "Praia Grande – SP",
    tipo: "Infraestrutura Viária",
    status: "Em Execução",
    img: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&q=80"
  },
  {
    nome: "Praça de Convivência Central",
    local: "Peruíbe – SP",
    tipo: "Urbanização",
    status: "Concluída",
    img: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=600&q=80"
  },
  {
    nome: "Ampliação Rede de Esgoto",
    local: "São Vicente – SP",
    tipo: "Saneamento",
    status: "Em Licitação",
    img: "https://images.unsplash.com/photo-1581094651181-35942459ef62?w=600&q=80"
  },
  {
    nome: "CRAS Comunidade Litoral",
    local: "Cubatão – SP",
    tipo: "Assistência Social",
    status: "Concluída",
    img: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80"
  }
];

const numeros = [
  { valor: "15+", label: "Anos de Experiência" },
  { valor: "80+", label: "Obras Entregues" },
  { valor: "R$ 50M+", label: "Em Contratos" },
  { valor: "100%", label: "Obras Públicas" }
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [companySettings, setCompanySettings] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    base44.entities.CompanySettings.list().then(r => { if (r.length > 0) setCompanySettings(r[0]); });
  }, []);

  const logoUrl = companySettings?.logo_url_clara || LOGO_CLARA;
  const nomeEmpresa = companySettings?.nome_empresa || 'Virtual Construções Civis';
  const emailEmpresa = companySettings?.email || 'contato@virtual.eng.br';
  const telefone = companySettings?.telefone || '(13) 3421-1379';
  const endereco = companySettings?.endereco || 'Mongaguá – SP';
  const site = companySettings?.site || 'www.virtual.eng.br';

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* NAVBAR */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-md py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <img src={logoUrl} alt={nomeEmpresa} className="h-10 object-contain" />

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            {['sobre', 'servicos', 'obras', 'contato'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                className={`capitalize transition-colors hover:text-blue-600 ${scrolled ? 'text-slate-700' : 'text-white'}`}>
                {s === 'sobre' ? 'Sobre' : s === 'servicos' ? 'Serviços' : s === 'obras' ? 'Obras' : 'Contato'}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <a href={`mailto:${emailEmpresa}`}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${scrolled ? 'text-slate-600 hover:text-blue-600' : 'text-white/80 hover:text-white'}`}>
              <Mail className="h-4 w-4" /> {emailEmpresa}
            </a>
            <Link to={createPageUrl('PortalSelect')}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5">
                Acessar Sistema
              </Button>
            </Link>
          </div>

          {/* Mobile */}
          <button className={`md:hidden ${scrolled ? 'text-slate-700' : 'text-white'}`} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-white shadow-lg px-4 py-4 space-y-3">
            {['sobre', 'servicos', 'obras', 'contato'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block w-full text-left py-2 text-slate-700 font-medium capitalize border-b border-slate-100">
                {s === 'sobre' ? 'Sobre' : s === 'servicos' ? 'Serviços' : s === 'obras' ? 'Obras' : 'Contato'}
              </button>
            ))}
            <Link to={createPageUrl('PortalSelect')} onClick={() => setMenuOpen(false)}>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 mt-2">Acessar Sistema ERP</Button>
            </Link>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=85"
            alt="Obras"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/85 via-blue-900/70 to-slate-900/80" />
        </div>
        <div className="relative text-center text-white px-4 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-blue-600/30 border border-blue-400/40 rounded-full px-4 py-2 text-sm mb-6 backdrop-blur">
            <Shield className="h-4 w-4" /> Especialistas em Obras Públicas
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight mb-6">
            Construindo o Brasil<br />
            <span className="text-blue-400">com Qualidade</span> e Transparência
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-10">
            Mais de 15 anos executando obras públicas com excelência técnica, cumprimento de prazos e total conformidade com a legislação vigente.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => scrollTo('obras')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-full font-semibold flex items-center justify-center gap-2 transition-all hover:scale-105">
              Ver Nossas Obras <ArrowRight className="h-5 w-5" />
            </button>
            <button onClick={() => scrollTo('contato')}
              className="border border-white/40 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition-all">
              Fale Conosco
            </button>
          </div>
          <div className="mt-16">
            <button onClick={() => scrollTo('sobre')} className="text-white/60 hover:text-white animate-bounce">
              <ChevronDown className="h-8 w-8 mx-auto" />
            </button>
          </div>
        </div>
      </section>

      {/* NÚMEROS */}
      <section className="bg-blue-700 py-12">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
          {numeros.map((n, i) => (
            <div key={i}>
              <div className="text-3xl sm:text-4xl font-bold">{n.valor}</div>
              <div className="text-blue-200 text-sm mt-1">{n.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SOBRE */}
      <section id="sobre" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Sobre a Empresa</span>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2 mb-6">
                Tradição e Competência em Obras Públicas
              </h2>
              <p className="text-slate-600 leading-relaxed mb-4">
                A <strong>Virtual Construções Civis Ltda</strong> é uma empresa especializada na execução de obras públicas, atuando há mais de 15 anos no mercado de construção civil. Sediada em Mongaguá/SP, atende municípios e órgãos estaduais na Baixada Santista e região.
              </p>
              <p className="text-slate-600 leading-relaxed mb-4">
                Nossa trajetória foi construída com base na seriedade, qualidade técnica e respeito às normas legais. Participamos ativamente de licitações públicas, garantindo a entrega de obras dentro do prazo e do orçamento contratado.
              </p>
              <p className="text-slate-600 leading-relaxed mb-6">
                Contamos com equipe técnica qualificada, maquinário próprio e processos de gestão modernos — incluindo sistema ERP proprietário para controle total das obras, orçamentos, planejamento e pessoal.
              </p>
              <div className="space-y-3">
                {[
                  "CNPJ regularizado e certidões em dia",
                  "Registro no CREA e demais conselhos competentes",
                  "Capacidade técnica e financeira comprovada",
                  "Equipe multidisciplinar de engenheiros e técnicos"
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <span className="text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=700&q=80"
                alt="Obras"
                className="rounded-2xl shadow-2xl w-full object-cover h-96"
              />
              <div className="absolute -bottom-6 -left-6 bg-blue-600 text-white rounded-2xl p-6 shadow-xl">
                <div className="text-3xl font-bold">2008</div>
                <div className="text-blue-200 text-sm">Fundação da empresa</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVIÇOS */}
      <section id="servicos" className="py-20 px-4 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">O Que Fazemos</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Serviços Especializados</h2>
            <p className="text-slate-500 mt-4 max-w-xl mx-auto">Atuamos exclusivamente em obras públicas, garantindo conformidade técnica, legal e orçamentária em cada projeto.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {servicos.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-slate-100">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-4 ${s.color.split(' ')[0]}`}>
                  <s.icon className={`h-6 w-6 ${s.color.split(' ')[1]}`} />
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{s.titulo}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OBRAS */}
      <section id="obras" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Portfólio</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Obras Realizadas</h2>
            <p className="text-slate-500 mt-4 max-w-xl mx-auto">Uma seleção de projetos que demonstram nossa capacidade técnica e compromisso com a qualidade.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {obras.map((o, i) => (
              <div key={i} className="rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow border border-slate-100 group">
                <div className="relative overflow-hidden h-48">
                  <img src={o.img} alt={o.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className={`absolute top-3 right-3 text-xs font-semibold px-3 py-1 rounded-full ${o.status === 'Concluída' ? 'bg-emerald-500 text-white' : o.status === 'Em Execução' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>
                    {o.status}
                  </div>
                </div>
                <div className="p-5">
                  <span className="text-xs text-blue-600 font-semibold uppercase">{o.tipo}</span>
                  <h3 className="font-bold text-slate-900 mt-1 mb-1">{o.nome}</h3>
                  <div className="flex items-center gap-1 text-slate-500 text-sm">
                    <MapPin className="h-3 w-3" /> {o.local}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SISTEMA */}
      <section className="py-20 px-4 bg-gradient-to-br from-blue-700 to-blue-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-blue-300" />
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Sistema de Gestão de Obras</h2>
          <p className="text-blue-200 text-lg mb-8 max-w-2xl mx-auto">
            Acesse nosso ERP interno para gerenciar orçamentos, planejamento, medições, financeiro, RH e muito mais — tudo em um só lugar.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={createPageUrl('PortalSelect')}>
              <Button className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8 py-3 h-auto rounded-full text-base">
                <Shield className="h-5 w-5 mr-2" /> Acessar Sistema ERP
              </Button>
            </Link>
            <a href={`mailto:${emailEmpresa}`}>
              <Button variant="outline" className="border-white/40 text-white hover:bg-white/10 px-8 py-3 h-auto rounded-full text-base">
                <Mail className="h-5 w-5 mr-2" /> Enviar E-mail
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* CONTATO */}
      <section id="contato" className="py-20 px-4 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Contato</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Fale Conosco</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <a href={`mailto:${emailEmpresa}`} className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center text-center hover:shadow-md transition-shadow border border-slate-100 group">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <Mail className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">E-mail</h3>
              <p className="text-blue-600 text-sm">{emailEmpresa}</p>
            </a>
            <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center text-center border border-slate-100">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                <Phone className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Telefone</h3>
              <p className="text-slate-600 text-sm">{telefone}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center text-center border border-slate-100">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                <MapPin className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Endereço</h3>
              <p className="text-slate-600 text-sm">{endereco}</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={companySettings?.logo_url_escura || logoUrl} alt={nomeEmpresa} className="h-8 object-contain" />
            <span className="text-sm text-slate-400">© {new Date().getFullYear()} {nomeEmpresa}. Todos os direitos reservados.</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <a href={`mailto:${emailEmpresa}`} className="hover:text-white flex items-center gap-1"><Mail className="h-4 w-4" /> {emailEmpresa}</a>
            <Link to={createPageUrl('PortalSelect')} className="hover:text-white flex items-center gap-1"><Shield className="h-4 w-4" /> Sistema ERP</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}