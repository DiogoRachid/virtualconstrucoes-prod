import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  FileText,
  PieChart as PieChartIcon,
  Download,
  Loader2,
  Calculator,
  RefreshCw
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { format } from 'date-fns';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function BudgetForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const budgetId = urlParams.get('id');
  const queryClient = useQueryClient();
  const reportRef = useRef(null);

  // Estados do Orçamento
  const [header, setHeader] = useState({
    descricao: '',
    obra_id: '',
    centro_custo_id: '',
    bdi_padrao: 30,
    status: 'rascunho',
    versao: 1,
    observacoes: ''
  });

  const [items, setItems] = useState([]);
  const [serviceToAdd, setServiceToAdd] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Dados Auxiliares
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list() });
  const { data: costCenters = [] } = useQuery({ queryKey: ['costCenters'], queryFn: () => base44.entities.CostCenter.list() });
  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: () => base44.entities.Service.list() });

  // Carregar Orçamento Existente
  useEffect(() => {
    if (budgetId) {
      const loadBudget = async () => {
        const budget = await base44.entities.Budget.filter({ id: budgetId }).then(res => res[0]);
        if (budget) {
          setHeader({
            descricao: budget.descricao,
            obra_id: budget.obra_id,
            centro_custo_id: budget.centro_custo_id,
            bdi_padrao: budget.bdi_padrao,
            status: budget.status,
            versao: budget.versao,
            observacoes: budget.observacoes
          });
          const budgetItems = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
          setItems(budgetItems);
        }
      };
      loadBudget();
    }
  }, [budgetId]);

  // Cálculos Gerais (Totais)
  const totals = items.reduce((acc, item) => {
    acc.material += (item.custo_unitario_material || 0) * item.quantidade;
    acc.mao_obra += (item.custo_unitario_mao_obra || 0) * item.quantidade;
    acc.direto += (item.custo_direto_total || 0);
    acc.final += (item.subtotal || 0);
    return acc;
  }, { material: 0, mao_obra: 0, direto: 0, final: 0 });
  
  const totalBDI = totals.final - totals.direto;
  const bdiRealPercent = totals.direto > 0 ? (totalBDI / totals.direto) * 100 : 0;

  // Funções de Manipulação
  const handleAddService = () => {
    if (!serviceToAdd) return;
    const service = services.find(s => s.id === serviceToAdd);
    if (!service) return;

    const bdi = header.bdi_padrao;
    const custoDireto = service.custo_total;
    const custoComBDI = custoDireto * (1 + bdi / 100);

    const newItem = {
      // id: tempId (será gerado pelo banco depois, mas aqui usamos timestamp para key)
      tempId: Date.now(),
      servico_id: service.id,
      codigo: service.codigo,
      descricao: service.descricao,
      unidade: service.unidade,
      quantidade: 1,
      custo_unitario_material: service.custo_material,
      custo_unitario_mao_obra: service.custo_mao_obra,
      custo_unitario_total: service.custo_total,
      custo_direto_total: service.custo_total * 1,
      bdi_percentual: bdi,
      custo_com_bdi_unitario: custoComBDI,
      subtotal: custoComBDI * 1
    };

    setItems([...items, newItem]);
    setServiceToAdd('');
    toast.success('Serviço adicionado!');
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: parseFloat(value) || 0 };

    // Recalcular linha
    if (field === 'quantidade' || field === 'bdi_percentual') {
      item.custo_direto_total = item.custo_unitario_total * item.quantidade;
      const bdiMult = 1 + (item.bdi_percentual / 100);
      item.custo_com_bdi_unitario = item.custo_unitario_total * bdiMult;
      item.subtotal = item.custo_com_bdi_unitario * item.quantidade;
    }

    newItems[index] = item;
    setItems(newItems);
  };

  const removeItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const updateGlobalBDI = () => {
    const newItems = items.map(item => {
      const bdiMult = 1 + (header.bdi_padrao / 100);
      return {
        ...item,
        bdi_percentual: header.bdi_padrao,
        custo_com_bdi_unitario: item.custo_unitario_total * bdiMult,
        subtotal: item.custo_unitario_total * bdiMult * item.quantidade
      };
    });
    setItems(newItems);
    toast.success(`BDI de ${header.bdi_padrao}% aplicado a todos os itens.`);
  };

  const handleSave = async () => {
    if (!header.descricao || !header.obra_id) {
      toast.error('Preencha a descrição e selecione a obra.');
      return;
    }

    setIsSaving(true);
    try {
      const budgetData = {
        ...header,
        obra_nome: projects.find(p => p.id === header.obra_id)?.nome,
        centro_custo_nome: costCenters.find(c => c.id === header.centro_custo_id)?.nome,
        total_material: totals.material,
        total_mao_obra: totals.mao_obra,
        total_direto: totals.direto,
        total_bdi: totalBDI,
        total_final: totals.final,
        data_referencia: new Date().toISOString() // ou manter a original
      };

      let savedBudgetId = budgetId;

      if (budgetId) {
        await base44.entities.Budget.update(budgetId, budgetData);
        // Delete all items and recreate (simpler for now to ensure consistency)
        // In a real app with huge lists, we would do diffing.
        const currentItems = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
        await Promise.all(currentItems.map(i => base44.entities.BudgetItem.delete(i.id)));
      } else {
        const newBudget = await base44.entities.Budget.create({
          ...budgetData,
          data_criacao: new Date().toISOString()
        });
        savedBudgetId = newBudget.id;
      }

      // Create items
      if (items.length > 0) {
        // Batch creation if supported, or loop
        // Base44 might limit concurrency, so let's do chunks or Promise.all
        await Promise.all(items.map(item => 
          base44.entities.BudgetItem.create({
            orcamento_id: savedBudgetId,
            servico_id: item.servico_id,
            codigo: item.codigo,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: item.quantidade,
            custo_unitario_material: item.custo_unitario_material,
            custo_unitario_mao_obra: item.custo_unitario_mao_obra,
            custo_unitario_total: item.custo_unitario_total,
            custo_direto_total: item.custo_direto_total,
            bdi_percentual: item.bdi_percentual,
            custo_com_bdi_unitario: item.custo_com_bdi_unitario,
            subtotal: item.subtotal
          })
        ));
      }

      toast.success('Orçamento salvo com sucesso!');
      if (!budgetId) {
        window.location.href = createPageUrl('Budgets');
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar orçamento.');
    }
    setIsSaving(false);
  };

  const exportPDF = () => {
    const input = reportRef.current;
    if (!input) return;

    html2canvas(input).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`orcamento_${header.descricao}.pdf`);
    });
  };

  // Gráficos Data
  const pieData = [
    { name: 'Material', value: totals.material },
    { name: 'Mão de Obra', value: totals.mao_obra },
    { name: 'BDI', value: totalBDI }
  ].filter(d => d.value > 0);

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.location.href = createPageUrl('Budgets')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{budgetId ? 'Editar Orçamento' : 'Novo Orçamento'}</h1>
            <p className="text-slate-500">Elaboração de proposta comercial e custos</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={exportPDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="lg:col-span-3 space-y-6">
          {/* Cabeçalho do Orçamento */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados Gerais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Descrição / Título *</Label>
                  <Input 
                    value={header.descricao} 
                    onChange={(e) => setHeader(prev => ({...prev, descricao: e.target.value}))} 
                    placeholder="Ex: Reforma do Prédio Administrativo"
                  />
                </div>
                <div>
                  <Label>Obra *</Label>
                  <Select 
                    value={header.obra_id} 
                    onValueChange={(v) => setHeader(prev => ({...prev, obra_id: v}))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Centro de Custo</Label>
                  <Select 
                    value={header.centro_custo_id} 
                    onValueChange={(v) => setHeader(prev => ({...prev, centro_custo_id: v}))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {costCenters.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select 
                    value={header.status} 
                    onValueChange={(v) => setHeader(prev => ({...prev, status: v}))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="revisado">Revisado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>BDI Padrão (%)</Label>
                    <Input 
                      type="number" 
                      value={header.bdi_padrao} 
                      onChange={(e) => setHeader(prev => ({...prev, bdi_padrao: parseFloat(e.target.value)}))}
                    />
                  </div>
                  <Button variant="outline" onClick={updateGlobalBDI} title="Aplicar a todos os itens">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="sheet">
            <TabsList className="mb-4">
              <TabsTrigger value="sheet"><Calculator className="h-4 w-4 mr-2"/> Planilha</TabsTrigger>
              <TabsTrigger value="report"><PieChartIcon className="h-4 w-4 mr-2"/> Relatório e Gráficos</TabsTrigger>
            </TabsList>

            <TabsContent value="sheet" className="space-y-4">
              {/* Adicionar Item */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Label className="mb-2 block">Adicionar Serviço</Label>
                      <Select 
                        value={serviceToAdd} 
                        onValueChange={setServiceToAdd}
                      >
                        <SelectTrigger><SelectValue placeholder="Busque um serviço..." /></SelectTrigger>
                        <SelectContent>
                          {services.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.codigo} - {s.descricao} ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.custo_total)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleAddService} disabled={!serviceToAdd}>
                        <Plus className="h-4 w-4 mr-2" /> Adicionar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabela de Itens */}
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-20">Código</TableHead>
                        <TableHead className="min-w-[200px]">Descrição</TableHead>
                        <TableHead className="w-16">Unid</TableHead>
                        <TableHead className="w-24 text-right">Qtd</TableHead>
                        <TableHead className="w-32 text-right">Custo Unit.</TableHead>
                        <TableHead className="w-32 text-right">Custo Direto</TableHead>
                        <TableHead className="w-24 text-right">BDI %</TableHead>
                        <TableHead className="w-32 text-right">Preço Unit.</TableHead>
                        <TableHead className="w-32 text-right">Total</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, idx) => (
                        <TableRow key={item.id || item.tempId}>
                          <TableCell className="text-xs font-medium">{item.codigo}</TableCell>
                          <TableCell className="text-sm">{item.descricao}</TableCell>
                          <TableCell className="text-xs text-slate-500">{item.unidade}</TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              className="h-8 w-20 text-right" 
                              value={item.quantidade} 
                              onChange={(e) => updateItem(idx, 'quantidade', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_unitario_total)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium text-slate-600">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_direto_total)}
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              className="h-8 w-16 text-right" 
                              value={item.bdi_percentual} 
                              onChange={(e) => updateItem(idx, 'bdi_percentual', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_com_bdi_unitario)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold text-slate-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-6 w-6 text-red-500">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-slate-400">
                            Nenhum item no orçamento.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="report">
              <div ref={reportRef} className="bg-white p-8 rounded-lg border shadow-sm space-y-8">
                <div className="text-center border-b pb-4">
                  <h2 className="text-2xl font-bold uppercase">{header.descricao}</h2>
                  <p className="text-slate-500">Relatório de Fechamento de Orçamento</p>
                  <p className="text-sm mt-2">Versão: {header.versao} | Data: {format(new Date(), 'dd/MM/yyyy')}</p>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h3 className="font-semibold mb-4">Resumo Financeiro</h3>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell>Total Material</TableCell>
                          <TableCell className="text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.material)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Total Mão de Obra</TableCell>
                          <TableCell className="text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.mao_obra)}</TableCell>
                        </TableRow>
                        <TableRow className="font-medium bg-slate-50">
                          <TableCell>Custo Direto Total</TableCell>
                          <TableCell className="text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.direto)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Total BDI ({bdiRealPercent.toFixed(2)}%)</TableCell>
                          <TableCell className="text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBDI)}</TableCell>
                        </TableRow>
                        <TableRow className="font-bold text-lg bg-slate-100">
                          <TableCell>Valor Final (Preço de Venda)</TableCell>
                          <TableCell className="text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.final)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="h-64">
                    <h3 className="font-semibold mb-4 text-center">Composição de Custos</h3>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-slate-900 text-white border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Valor Final</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-4">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.final)}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Custo Direto</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.direto)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">BDI Total</span>
                  <span className="text-green-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBDI)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
             <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Indicadores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Material</span>
                  <span className="font-medium">{totals.final > 0 ? ((totals.material / totals.final) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${totals.final > 0 ? (totals.material / totals.final) * 100 : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Mão de Obra</span>
                  <span className="font-medium">{totals.final > 0 ? ((totals.mao_obra / totals.final) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${totals.final > 0 ? (totals.mao_obra / totals.final) * 100 : 0}%` }} />
                </div>
              </div>
              <div>
                 <div className="flex justify-between text-sm mb-1">
                  <span>Lucro/Indiretos (BDI)</span>
                  <span className="font-medium">{totals.final > 0 ? ((totalBDI / totals.final) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${totals.final > 0 ? (totalBDI / totals.final) * 100 : 0}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}