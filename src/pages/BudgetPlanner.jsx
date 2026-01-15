import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSearchParams, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Calendar, TrendingUp, Users, AlertTriangle, Save, Plus, Trash2, ArrowLeft, RefreshCw, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';

const CORES_ABC = {
  A: '#ef4444',
  B: '#f59e0b',
  C: '#10b981'
};

export default function BudgetPlanner() {
  const [searchParams] = useSearchParams();
  const budgetId = searchParams.get('id');
  const queryClient = useQueryClient();

  const [duracao_meses, setDuracaoMeses] = useState(12);
  const [s_param, setSParam] = useState(2);
  const [i_param, setIParam] = useState(50);
  const [num_equipes, setNumEquipes] = useState(0);
  const [num_equipes_sugerido, setNumEquipesSugerido] = useState(0);
  const [curvaS, setCurvaS] = useState([]);
  const [cronogramaFinanceiro, setCronogramaFinanceiro] = useState([]);
  const [curvaABC_servicos, setCurvaABC_Servicos] = useState([]);
  const [curvaABC_insumos, setCurvaABC_Insumos] = useState([]);
  const [calculando, setCalculando] = useState(false);

  // Buscar orçamento e itens
  const { data: budget } = useQuery({
    queryKey: ['budget', budgetId],
    queryFn: () => base44.entities.Budget.filter({ id: budgetId }).then(r => r[0]),
    enabled: !!budgetId
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ['budgetItems', budgetId],
    queryFn: () => base44.entities.BudgetItem.filter({ orcamento_id: budgetId }),
    enabled: !!budgetId
  });

  const { data: stages = [] } = useQuery({
    queryKey: ['stages', budgetId],
    queryFn: () => base44.entities.ProjectStage.filter({ orcamento_id: budgetId }),
    enabled: !!budgetId
  });

  // Calcular Curva S
  const calcularCurvaS = () => {
    const n = duracao_meses;
    const s = s_param;
    const u = Math.log(1 / (1 - (i_param / 100))) / Math.log(n);
    
    const dados = [];
    for (let t = 1; t <= n; t++) {
      const y = 1 - Math.pow(1 - Math.pow(t / n, u), s);
      dados.push({
        mes: t,
        avanço_real: Math.round(y * 100 * 100) / 100,
        avanço_ideal: Math.round((t / n) * 100 * 100) / 100
      });
    }
    setCurvaS(dados);
  };

  // Calcular equipes necessárias
  const calcularEquipes = async () => {
    if (!budgetItems.length) return;

    setCalculando(true);
    let totalHorasMaoObra = 0;

    try {
      // Buscar todos os serviços e insumos de uma vez
      const allServices = await base44.entities.Service.list();
      const allServiceItems = await base44.entities.ServiceItem.list();
      const allInputs = await base44.entities.Input.list();

      // Para cada item do orçamento
      for (const item of budgetItems) {
        const service = allServices.find(s => s.id === item.servico_id);
        if (!service) continue;

        const serviceItems = allServiceItems.filter(si => si.servico_id === service.id);
        
        for (const si of serviceItems) {
          if (si.tipo === 'insumo') {
            const insumo = allInputs.find(inp => inp.id === si.item_id);
            if (insumo?.categoria === 'MAO_OBRA' && insumo.horas_por_unidade) {
              totalHorasMaoObra += (si.quantidade || 0) * (insumo.horas_por_unidade || 0) * (item.quantidade || 0);
            }
          }
        }
      }

      // Considerar 8h/dia, 22 dias úteis/mês, 2 pessoas por equipe (servente + pedreiro)
      const horasPorEquipePorMes = 8 * 22 * 2;
      const horasDisponiveisTotais = horasPorEquipePorMes * duracao_meses;
      const equipesNecessarias = Math.ceil(totalHorasMaoObra / horasDisponiveisTotais);

      setNumEquipesSugerido(equipesNecessarias || 1);
      setNumEquipes(equipesNecessarias || 1);
    } catch (e) {
      console.error('Erro ao calcular equipes:', e);
      setNumEquipesSugerido(1);
      setNumEquipes(1);
    } finally {
      setCalculando(false);
    }
  };

  // Calcular cronograma financeiro mensal
  const calcularCronogramaFinanceiro = () => {
    if (!curvaS.length || !budget) return;

    const valorTotal = budget.valor_total || 0;
    const dados = curvaS.map((mes, idx) => {
      const percAtual = mes.avanço_real;
      const percAnterior = idx > 0 ? curvaS[idx - 1].avanço_real : 0;
      const percMes = percAtual - percAnterior;
      const valorMes = (percMes / 100) * valorTotal;

      return {
        mes: mes.mes,
        valor: Math.round(valorMes * 100) / 100,
        acumulado: Math.round((percAtual / 100) * valorTotal * 100) / 100
      };
    });

    setCronogramaFinanceiro(dados);
  };

  // Calcular Curva ABC
  const calcularCurvaABC = async () => {
    if (!budgetItems.length) return;

    // ABC de Serviços
    const servicosCusto = budgetItems.map(item => ({
      nome: item.servico_descricao || item.servico_codigo,
      valor: (item.valor_unitario || 0) * (item.quantidade || 0)
    })).filter(s => s.valor > 0).sort((a, b) => b.valor - a.valor);

    let acumulado = 0;
    const totalGeral = servicosCusto.reduce((sum, s) => sum + s.valor, 0);
    
    const servicosComFaixa = servicosCusto.map(s => {
      acumulado += s.valor;
      const percAcum = (acumulado / totalGeral) * 100;
      let faixa = 'C';
      if (percAcum <= 50) faixa = 'A';
      else if (percAcum <= 80) faixa = 'B';
      
      return { 
        ...s, 
        faixa, 
        percAcum: Math.round(percAcum * 100) / 100,
        percValor: Math.round((s.valor / totalGeral) * 100 * 100) / 100
      };
    });

    setCurvaABC_Servicos(servicosComFaixa);

    // ABC de Insumos - agregar todos
    try {
      const allServices = await base44.entities.Service.list();
      const allServiceItems = await base44.entities.ServiceItem.list();
      const allInputs = await base44.entities.Input.list();

      const insumosMap = new Map();

      for (const budgetItem of budgetItems) {
        const service = allServices.find(s => s.id === budgetItem.servico_id);
        if (!service) continue;

        const serviceItems = allServiceItems.filter(si => si.servico_id === service.id && si.tipo === 'insumo');
        
        for (const si of serviceItems) {
          const insumo = allInputs.find(inp => inp.id === si.item_id);
          if (!insumo) continue;

          const qtdTotal = (si.quantidade || 0) * (budgetItem.quantidade || 0);
          const valorTotal = qtdTotal * (insumo.valor_unitario || 0);

          const key = insumo.id;
          if (insumosMap.has(key)) {
            const existing = insumosMap.get(key);
            existing.valor += valorTotal;
          } else {
            insumosMap.set(key, {
              nome: insumo.descricao,
              categoria: insumo.categoria,
              valor: valorTotal
            });
          }
        }
      }

      const insumosList = Array.from(insumosMap.values())
        .filter(i => i.valor > 0)
        .sort((a, b) => b.valor - a.valor);

      let acumInsumos = 0;
      const totalInsumos = insumosList.reduce((sum, i) => sum + i.valor, 0);

      const insumosComFaixa = insumosList.map(i => {
        acumInsumos += i.valor;
        const percAcum = (acumInsumos / totalInsumos) * 100;
        let faixa = 'C';
        if (percAcum <= 50) faixa = 'A';
        else if (percAcum <= 80) faixa = 'B';

        return {
          ...i,
          faixa,
          percAcum: Math.round(percAcum * 100) / 100,
          percValor: Math.round((i.valor / totalInsumos) * 100 * 100) / 100
        };
      });

      setCurvaABC_Insumos(insumosComFaixa);
    } catch (e) {
      console.error('Erro ao calcular ABC de insumos:', e);
    }
  };

  useEffect(() => {
    calcularCurvaS();
  }, [duracao_meses, s_param, i_param]);

  useEffect(() => {
    calcularCronogramaFinanceiro();
  }, [curvaS, budget]);

  useEffect(() => {
    if (budgetItems.length > 0) {
      calcularEquipes();
      calcularCurvaABC();
    }
  }, [budgetItems, duracao_meses]);

  const deleteStageMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectStage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['stages']);
      toast.success('Etapa excluída');
    }
  });

  const handleAjustarEquipes = () => {
    if (num_equipes !== num_equipes_sugerido) {
      const novaDuracao = Math.ceil((num_equipes_sugerido / num_equipes) * duracao_meses);
      if (confirm(`Com ${num_equipes} equipe(s), o prazo estimado passa para ${novaDuracao} meses. Deseja recalcular?`)) {
        setDuracaoMeses(novaDuracao);
      }
    }
  };

  const handleCriarEtapasPadrao = async () => {
    const etapasPadrao = [
      { nome: 'Fundação', ordem: 1, duracao_meses: duracao_meses * 0.15, dependencias: [] },
      { nome: 'Estrutura', ordem: 2, duracao_meses: duracao_meses * 0.25, dependencias: [] },
      { nome: 'Elétrica', ordem: 3, duracao_meses: duracao_meses * 0.15, dependencias: [] },
      { nome: 'Hidráulica', ordem: 4, duracao_meses: duracao_meses * 0.15, dependencias: [] },
      { nome: 'Fechamentos', ordem: 5, duracao_meses: duracao_meses * 0.15, dependencias: [] },
      { nome: 'Acabamentos', ordem: 6, duracao_meses: duracao_meses * 0.10, dependencias: [] },
      { nome: 'Limpeza Final', ordem: 7, duracao_meses: duracao_meses * 0.05, dependencias: [] }
    ];

    try {
      for (const etapa of etapasPadrao) {
        await base44.entities.ProjectStage.create({
          orcamento_id: budgetId,
          ...etapa
        });
      }
      toast.success('Etapas padrão criadas!');
      window.location.reload();
    } catch (e) {
      toast.error('Erro ao criar etapas');
      console.error(e);
    }
  };

  const distribuicaoABC_Servicos = React.useMemo(() => {
    const faixas = { A: 0, B: 0, C: 0 };
    curvaABC_servicos.forEach(s => faixas[s.faixa]++);
    return [
      { name: 'Faixa A', value: faixas.A, color: CORES_ABC.A },
      { name: 'Faixa B', value: faixas.B, color: CORES_ABC.B },
      { name: 'Faixa C', value: faixas.C, color: CORES_ABC.C }
    ];
  }, [curvaABC_servicos]);

  const distribuicaoABC_Insumos = React.useMemo(() => {
    const faixas = { A: 0, B: 0, C: 0 };
    curvaABC_insumos.forEach(i => faixas[i.faixa]++);
    return [
      { name: 'Faixa A', value: faixas.A, color: CORES_ABC.A },
      { name: 'Faixa B', value: faixas.B, color: CORES_ABC.B },
      { name: 'Faixa C', value: faixas.C, color: CORES_ABC.C }
    ];
  }, [curvaABC_insumos]);

  if (!budget) {
    return <div className="p-6">Carregando orçamento...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to={createPageUrl('Budgets')}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Planejamento e Cronograma</h1>
          <p className="text-slate-600">Orçamento: {budget.nome || budget.codigo}</p>
        </div>
        <Button variant="outline" onClick={() => {
          calcularEquipes();
          calcularCurvaABC();
        }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Recalcular
        </Button>
      </div>

      <Tabs defaultValue="cronograma" className="space-y-6">
        <TabsList>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
          <TabsTrigger value="curva-abc">Curva ABC</TabsTrigger>
          <TabsTrigger value="etapas">Etapas</TabsTrigger>
        </TabsList>

        <TabsContent value="cronograma" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Parâmetros da Curva S</CardTitle>
              <CardDescription>Configure os parâmetros para gerar o cronograma físico-financeiro</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Duração (meses)</Label>
                  <Input 
                    type="number" 
                    value={duracao_meses} 
                    onChange={e => setDuracaoMeses(parseInt(e.target.value) || 1)}
                    min="1"
                  />
                </div>
                <div>
                  <Label>Coeficiente S</Label>
                  <Input 
                    type="number" 
                    step="0.1"
                    value={s_param} 
                    onChange={e => setSParam(parseFloat(e.target.value) || 2)}
                  />
                  <p className="text-xs text-slate-500 mt-1">Recomendado: 2.0</p>
                </div>
                <div>
                  <Label>Inflexão i% (%)</Label>
                  <Input 
                    type="number" 
                    value={i_param} 
                    onChange={e => setIParam(parseFloat(e.target.value) || 50)}
                    min="0"
                    max="100"
                  />
                  <p className="text-xs text-slate-500 mt-1">Recomendado: 50%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Curva S - Avanço Físico (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={curvaS}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" label={{ value: 'Mês', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: '% Avanço', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="avanço_real" stroke="#3b82f6" name="Curva S Projetada" strokeWidth={3} />
                  <Line type="monotone" dataKey="avanço_ideal" stroke="#10b981" name="Curva Linear (Ideal)" strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cronograma Financeiro</CardTitle>
              <CardDescription>Desembolso mensal e acumulado</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={cronogramaFinanceiro}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" label={{ value: 'Mês', position: 'insideBottom', offset: -5 }} />
                  <YAxis />
                  <Tooltip formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} />
                  <Legend />
                  <Bar dataKey="valor" fill="#3b82f6" name="Desembolso Mensal" />
                  <Line type="monotone" dataKey="acumulado" stroke="#10b981" name="Acumulado" strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {cronogramaFinanceiro.slice(0, 6).map((mes) => (
                  <div key={mes.mes} className="flex justify-between p-3 bg-slate-50 rounded">
                    <span className="font-medium">Mês {mes.mes}</span>
                    <div className="text-right">
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mes.valor)}</p>
                      <p className="text-xs text-slate-500">Acum: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mes.acumulado)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Dimensionamento de Equipes
              </CardTitle>
              <CardDescription>Cálculo baseado nas horas de mão de obra das composições</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {calculando ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
                  <p className="text-sm text-slate-600">Calculando equipes necessárias...</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-6 rounded-lg text-center">
                      <p className="text-sm text-slate-600 mb-2">Equipes Sugeridas</p>
                      <p className="text-4xl font-bold text-blue-600">{num_equipes_sugerido}</p>
                      <p className="text-xs text-slate-500 mt-2">Para {duracao_meses} meses</p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-lg text-center">
                      <p className="text-sm text-slate-600 mb-2">Horas/Dia</p>
                      <p className="text-4xl font-bold text-slate-900">8h</p>
                      <p className="text-xs text-slate-500 mt-2">Jornada padrão</p>
                    </div>
                    <div className="bg-slate-50 p-6 rounded-lg text-center">
                      <p className="text-sm text-slate-600 mb-2">Dias Úteis/Mês</p>
                      <p className="text-4xl font-bold text-slate-900">22</p>
                      <p className="text-xs text-slate-500 mt-2">Dias trabalhados</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg">
                    <p className="text-xs text-slate-600 font-medium mb-2">Composição da Equipe</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">1 Servente</Badge>
                      <span className="text-slate-400">+</span>
                      <Badge variant="outline">1 Pedreiro</Badge>
                      <span className="text-slate-400">=</span>
                      <Badge className="bg-blue-600">2 Profissionais/Equipe</Badge>
                    </div>
                  </div>

                  <div>
                    <Label>Ajustar Número de Equipes</Label>
                    <div className="flex gap-2 mt-2">
                      <Input 
                        type="number" 
                        value={num_equipes} 
                        onChange={e => setNumEquipes(parseInt(e.target.value) || 1)}
                        min="1"
                      />
                      <Button onClick={handleAjustarEquipes} variant="outline">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Recalcular Prazo
                      </Button>
                    </div>
                  </div>

                  {num_equipes < num_equipes_sugerido && num_equipes > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">Atenção: Equipes Insuficientes</p>
                        <p className="text-xs text-yellow-700 mt-1">
                          Com {num_equipes} equipe(s), o prazo estimado será maior. 
                          Recomendamos {num_equipes_sugerido} equipe(s) para cumprir os {duracao_meses} meses planejados.
                        </p>
                      </div>
                    </div>
                  )}

                  {num_equipes > num_equipes_sugerido && (
                    <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-800">Equipes Extras</p>
                        <p className="text-xs text-green-700 mt-1">
                          Com {num_equipes} equipe(s), a obra pode ser concluída em menos tempo ou com folga no cronograma.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curva-abc" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição ABC - Serviços</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={distribuicaoABC_Servicos}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({name, value}) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {distribuicaoABC_Servicos.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: CORES_ABC.A }}></div>
                      <span>Faixa A</span>
                    </div>
                    <span className="font-medium">até 50% acumulado</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: CORES_ABC.B }}></div>
                      <span>Faixa B</span>
                    </div>
                    <span className="font-medium">50% a 80% acumulado</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: CORES_ABC.C }}></div>
                      <span>Faixa C</span>
                    </div>
                    <span className="font-medium">80% a 100% acumulado</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição ABC - Insumos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={distribuicaoABC_Insumos}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({name, value}) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {distribuicaoABC_Insumos.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Curva ABC - Serviços</CardTitle>
              <CardDescription>Top 30 serviços por valor</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {curvaABC_servicos.slice(0, 30).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-slate-50 rounded hover:bg-slate-100 transition-colors">
                    <span className="text-slate-400 font-mono text-xs w-8">{idx + 1}</span>
                    <Badge className={`${
                      item.faixa === 'A' ? 'bg-red-500' :
                      item.faixa === 'B' ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}>
                      {item.faixa}
                    </Badge>
                    <span className="flex-1 text-sm">{item.nome}</span>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                      </p>
                      <p className="text-xs text-slate-500">{item.percValor}% | Acum: {item.percAcum}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Curva ABC - Insumos</CardTitle>
              <CardDescription>Top 30 insumos por valor</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {curvaABC_insumos.slice(0, 30).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-slate-50 rounded hover:bg-slate-100 transition-colors">
                    <span className="text-slate-400 font-mono text-xs w-8">{idx + 1}</span>
                    <Badge className={`${
                      item.faixa === 'A' ? 'bg-red-500' :
                      item.faixa === 'B' ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}>
                      {item.faixa}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {item.categoria}
                    </Badge>
                    <span className="flex-1 text-sm">{item.nome}</span>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                      </p>
                      <p className="text-xs text-slate-500">{item.percValor}% | Acum: {item.percAcum}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="etapas">
          <Card>
            <CardHeader>
              <CardTitle>Etapas da Obra</CardTitle>
              <CardDescription>Organize as etapas da obra e suas dependências</CardDescription>
            </CardHeader>
            <CardContent>
              {stages.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-2 font-medium">Nenhuma etapa cadastrada</p>
                  <p className="text-slate-500 text-sm mb-6">Crie etapas padrão para começar o planejamento</p>
                  <Button onClick={handleCriarEtapasPadrao}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Etapas Padrão
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex justify-between items-center">
                    <p className="text-sm text-slate-600">{stages.length} etapa(s) cadastrada(s)</p>
                    <Button variant="outline" size="sm" onClick={handleCriarEtapasPadrao}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Recriar Etapas
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {stages.sort((a, b) => a.ordem - b.ordem).map(stage => (
                      <div key={stage.id} className="flex items-center gap-4 p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold">
                          {stage.ordem}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{stage.nome}</p>
                          <div className="flex items-center gap-4 mt-1">
                            <span className="text-xs text-slate-500">
                              Duração: {Math.round(stage.duracao_meses * 10) / 10} meses
                            </span>
                            {stage.dependencias?.length > 0 && (
                              <span className="text-xs text-slate-500">
                                Depende de: {stage.dependencias.length} etapa(s)
                              </span>
                            )}
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            if (confirm(`Excluir etapa "${stage.nome}"?`)) {
                              deleteStageMutation.mutate(stage.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-3">
                      <BarChart3 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">Cronograma das Etapas</p>
                        <p className="text-xs text-blue-700 mt-1">
                          O sistema distribui automaticamente as etapas ao longo dos {duracao_meses} meses, 
                          respeitando as dependências e a curva S definida.
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}