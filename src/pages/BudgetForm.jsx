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
  RefreshCw,
  GripVertical,
  ChevronDown,
  ChevronRight,
  FolderPlus
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function BudgetForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const budgetId = urlParams.get('id');
  const reportRef = useRef(null);

  // States
  const [header, setHeader] = useState({
    descricao: '',
    obra_id: '',
    centro_custo_id: '',
    bdi_padrao: 30,
    status: 'rascunho',
    versao: 1,
    observacoes: ''
  });

  const [stages, setStages] = useState([]);
  const [items, setItems] = useState([]); // All items flat
  const [newStageName, setNewStageName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState({});

  // Aux Data
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list() });
  const { data: costCenters = [] } = useQuery({ queryKey: ['costCenters'], queryFn: () => base44.entities.CostCenter.list() });
  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: () => base44.entities.Service.list() });

  // Load Budget
  useEffect(() => {
    if (budgetId) {
      const load = async () => {
        const b = await base44.entities.Budget.filter({ id: budgetId }).then(r => r[0]);
        if (b) {
          setHeader({
            descricao: b.descricao,
            obra_id: b.obra_id,
            centro_custo_id: b.centro_custo_id,
            bdi_padrao: b.bdi_padrao,
            status: b.status,
            versao: b.versao,
            observacoes: b.observacoes
          });
          const bs = await base44.entities.BudgetStage.filter({ orcamento_id: budgetId });
          setStages(bs.sort((a, b) => a.ordem - b.ordem));
          const bi = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
          setItems(bi);
        }
      };
      load();
    }
  }, [budgetId]);

  // Stage Management
  const handleAddStage = () => {
    if (!newStageName) return;
    const newStage = {
      tempId: `stage-${Date.now()}`,
      nome: newStageName,
      ordem: stages.length + 1,
      orcamento_id: budgetId || ''
    };
    setStages([...stages, newStage]);
    setNewStageName('');
  };

  const handleRemoveStage = (stageId) => {
    // Move items to 'uncategorized' (null stage)
    const newItems = items.map(i => i.stage_id === stageId ? { ...i, stage_id: null } : i);
    setItems(newItems);
    setStages(stages.filter(s => (s.id || s.tempId) !== stageId));
  };

  const moveItemToStage = (itemIndex, stageId) => {
    const newItems = [...items];
    newItems[itemIndex].stage_id = stageId === 'null' ? null : stageId;
    setItems(newItems);
  };

  // Item Management
  const handleAddService = (serviceId, stageId) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    const bdi = header.bdi_padrao;
    const custoDireto = service.custo_total;
    const custoComBDI = custoDireto * (1 + bdi / 100);

    const newItem = {
      tempId: `item-${Date.now()}`,
      stage_id: stageId === 'uncategorized' ? null : stageId,
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
    toast.success('Serviço adicionado!');
  };

  const updateItem = (itemTempIdOrId, field, value) => {
    const index = items.findIndex(i => (i.id || i.tempId) === itemTempIdOrId);
    if (index === -1) return;

    const newItems = [...items];
    const item = { ...newItems[index], [field]: parseFloat(value) || 0 };

    if (field === 'quantidade' || field === 'bdi_percentual') {
      item.custo_direto_total = item.custo_unitario_total * item.quantidade;
      const bdiMult = 1 + (item.bdi_percentual / 100);
      item.custo_com_bdi_unitario = item.custo_unitario_total * bdiMult;
      item.subtotal = item.custo_com_bdi_unitario * item.quantidade;
    }

    newItems[index] = item;
    setItems(newItems);
  };

  const removeItem = (itemTempIdOrId) => {
    setItems(items.filter(i => (i.id || i.tempId) !== itemTempIdOrId));
  };

  // Global Calculations
  const calculateTotals = (itemList) => {
    return itemList.reduce((acc, item) => {
      acc.material += (item.custo_unitario_material || 0) * item.quantidade;
      acc.mao_obra += (item.custo_unitario_mao_obra || 0) * item.quantidade;
      acc.direto += (item.custo_direto_total || 0);
      acc.final += (item.subtotal || 0);
      return acc;
    }, { material: 0, mao_obra: 0, direto: 0, final: 0 });
  };

  const globalTotals = calculateTotals(items);
  const globalBDI = globalTotals.final - globalTotals.direto;

  // Save
  const handleSave = async () => {
    if (!header.descricao || !header.obra_id) {
      toast.error('Preencha a descrição e selecione a obra.');
      return;
    }
    setIsSaving(true);
    try {
      let savedBudgetId = budgetId;
      
      const budgetData = {
        ...header,
        obra_nome: projects.find(p => p.id === header.obra_id)?.nome,
        centro_custo_nome: costCenters.find(c => c.id === header.centro_custo_id)?.nome,
        total_material: globalTotals.material,
        total_mao_obra: globalTotals.mao_obra,
        total_direto: globalTotals.direto,
        total_bdi: globalBDI,
        total_final: globalTotals.final,
        data_referencia: new Date().toISOString()
      };

      if (budgetId) {
        await base44.entities.Budget.update(budgetId, budgetData);
        // Clean existing stages and items to recreate (simplest consistency strategy)
        // Optimization: In real world, use diff.
        const existingStages = await base44.entities.BudgetStage.filter({ orcamento_id: budgetId });
        await Promise.all(existingStages.map(s => base44.entities.BudgetStage.delete(s.id)));
        
        const existingItems = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
        await Promise.all(existingItems.map(i => base44.entities.BudgetItem.delete(i.id)));
      } else {
        const newBudget = await base44.entities.Budget.create({
           ...budgetData,
           data_criacao: new Date().toISOString()
        });
        savedBudgetId = newBudget.id;
      }

      // Create Stages and Map IDs
      const stageMap = {}; // tempId -> realId
      
      // Sort stages to keep order
      const sortedStages = [...stages].sort((a, b) => a.ordem - b.ordem);
      
      for (const stage of sortedStages) {
        const createdStage = await base44.entities.BudgetStage.create({
          orcamento_id: savedBudgetId,
          nome: stage.nome,
          ordem: stage.ordem,
          descricao: stage.descricao || ''
        });
        stageMap[stage.id || stage.tempId] = createdStage.id;
      }

      // Create Items with new Stage IDs
      if (items.length > 0) {
        await Promise.all(items.map(item => {
           const realStageId = item.stage_id ? (stageMap[item.stage_id] || item.stage_id) : null;
           // If stage_id was null (uncategorized), it stays null.
           // If stage_id was a tempId from new stage, it gets mapped.
           // If stage_id was an old ID from deleted stage (if we didn't recreate), we would need care.
           // Since we recreated everything, we assume item.stage_id refers to one of the objects in `stages` state.
           // If user added item to "Existing Stage A", item.stage_id is "ID_A".
           // But we deleted "ID_A" and created new "ID_New_A".
           // Problem: item.stage_id points to old ID.
           // Fix: We need to map old IDs to new IDs too?
           // Easier: Map by index? Or name?
           // Let's rely on the fact that `stages` state contains the IDs we are mapping.
           
           // Actually, since we deleted old stages, we must map EVERYTHING.
           // But `stageMap` only has mapping for stages in `stages` array.
           // If `stages` contains objects with old IDs, `stageMap` will have `oldID -> newID`.
           // So `stageMap[item.stage_id]` should work for both tempIds and oldIds.
           
           return base44.entities.BudgetItem.create({
            orcamento_id: savedBudgetId,
            stage_id: realStageId,
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
          });
        }));
      }

      toast.success('Orçamento salvo com sucesso!');
      if (!budgetId) window.location.href = createPageUrl('Budgets');
      else {
         // Reload page to refresh IDs
         window.location.reload();
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    }
    setIsSaving(false);
  };

  const handleExportPDF = () => {
    const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg";
    const projectName = projects.find(p => p.id === header.obra_id)?.nome || 'N/A';
    const costCenterName = costCenters.find(c => c.id === header.centro_custo_id)?.nome || '';
    const dateStr = format(new Date(), 'dd/MM/yyyy');
    
    // Sort stages
    const sortedStages = [...stages].sort((a, b) => a.ordem - b.ordem);
    
    // Helper to format currency
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

    let htmlBody = '';

    // Loop Stages
    sortedStages.forEach(stage => {
      const stageItems = items.filter(i => i.stage_id === (stage.id || stage.tempId));
      if (stageItems.length === 0) return;

      const stageTotal = calculateTotals(stageItems).final;

      htmlBody += `
        <div class="stage-header">
          <span>${stage.ordem}. ${stage.nome}</span>
          <span>${fmt(stageTotal)}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 10%">Código</th>
              <th style="width: 40%">Descrição</th>
              <th style="width: 10%">Unid</th>
              <th style="width: 10%; text-align: right">Qtd</th>
              <th style="width: 15%; text-align: right">Unitário</th>
              <th style="width: 15%; text-align: right">Total</th>
            </tr>
          </thead>
          <tbody>
      `;

      stageItems.forEach(item => {
        htmlBody += `
          <tr>
            <td>${item.codigo || ''}</td>
            <td>${item.descricao || ''}</td>
            <td style="text-align: center">${item.unidade || ''}</td>
            <td style="text-align: right">${item.quantidade}</td>
            <td style="text-align: right">${fmt(item.custo_com_bdi_unitario)}</td>
            <td style="text-align: right">${fmt(item.subtotal)}</td>
          </tr>
        `;
      });

      htmlBody += `
          </tbody>
        </table>
      `;
    });

    // Uncategorized
    const uncategorizedItems = items.filter(i => !i.stage_id);
    if (uncategorizedItems.length > 0) {
      const stageTotal = calculateTotals(uncategorizedItems).final;
      htmlBody += `
        <div class="stage-header">
          <span>Itens sem Etapa</span>
          <span>${fmt(stageTotal)}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 10%">Código</th>
              <th style="width: 40%">Descrição</th>
              <th style="width: 10%">Unid</th>
              <th style="width: 10%; text-align: right">Qtd</th>
              <th style="width: 15%; text-align: right">Unitário</th>
              <th style="width: 15%; text-align: right">Total</th>
            </tr>
          </thead>
          <tbody>
      `;
      uncategorizedItems.forEach(item => {
        htmlBody += `
          <tr>
            <td>${item.codigo || ''}</td>
            <td>${item.descricao || ''}</td>
            <td style="text-align: center">${item.unidade || ''}</td>
            <td style="text-align: right">${item.quantidade}</td>
            <td style="text-align: right">${fmt(item.custo_com_bdi_unitario)}</td>
            <td style="text-align: right">${fmt(item.subtotal)}</td>
          </tr>
        `;
      });
      htmlBody += `</tbody></table>`;
    }

    // Totals Section
    const totalsHtml = `
      <div class="totals-section">
        <div class="total-row">
          <span>Custo Direto:</span>
          <span>${fmt(globalTotals.direto)}</span>
        </div>
        <div class="total-row">
          <span>BDI Total:</span>
          <span>${fmt(globalBDI)}</span>
        </div>
        <div class="total-row final">
          <span>VALOR TOTAL DA OBRA:</span>
          <span>${fmt(globalTotals.final)}</span>
        </div>
      </div>
    `;

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Orçamento - ${header.descricao}</title>
        <style>
          @page { margin: 15mm; size: A4; }
          body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10px; color: #333; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .logo { height: 50px; }
          .company-info { text-align: right; }
          .company-name { font-size: 14px; font-weight: bold; text-transform: uppercase; }
          .project-info { margin-bottom: 5px; }
          
          .stage-header { background-color: #f1f5f9; padding: 5px 10px; font-weight: bold; font-size: 11px; border-bottom: 1px solid #cbd5e1; margin-top: 15px; display: flex; justify-content: space-between; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
          th { background-color: #fff; border-bottom: 1px solid #000; padding: 4px; text-align: left; font-weight: bold; }
          td { border-bottom: 1px solid #e2e8f0; padding: 4px; }
          tr:last-child td { border-bottom: none; }
          
          .totals-section { margin-top: 30px; page-break-inside: avoid; width: 300px; margin-left: auto; }
          .total-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e2e8f0; }
          .total-row.final { font-weight: bold; font-size: 12px; border-top: 2px solid #333; border-bottom: none; margin-top: 5px; padding-top: 10px; }
          
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" class="logo" alt="Logo" />
          <div class="company-info">
            <div class="company-name">Virtual Construções</div>
            <div class="project-info">
              <div><strong>Obra:</strong> ${projectName}</div>
              <div><strong>Orçamento:</strong> ${header.descricao}</div>
              <div>Data: ${dateStr} | Versão: ${header.versao}</div>
            </div>
          </div>
        </div>
        
        ${htmlBody}
        
        ${totalsHtml}
        
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(fullHtml);
      win.document.close();
    } else {
      toast.error('Permita popups para visualizar o PDF.');
    }
  };

  // Rendering Helpers
  const renderStageTable = (stageId, stageName, stageItems) => {
    const stageTotals = calculateTotals(stageItems);
    const isUncategorized = stageId === 'uncategorized';

    return (
      <Card key={stageId || 'uncategorized'} className="mb-6 border-l-4 border-l-blue-500">
        <Collapsible 
          open={!collapsedStages[stageId]} 
          onOpenChange={v => setCollapsedStages({...collapsedStages, [stageId]: !v})}
        >
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-t-lg">
            <div className="flex items-center gap-2">
               <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                     {collapsedStages[stageId] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
               </CollapsibleTrigger>
               <h3 className="font-bold text-lg uppercase flex items-center gap-2">
                 {stageName}
                 <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-normal normal-case">
                   {stageItems.length} itens
                 </span>
               </h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm hidden sm:block">
                <span className="text-slate-500 mr-2">Total Etapa:</span>
                <span className="font-bold text-slate-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stageTotals.final)}</span>
              </div>
              {!isUncategorized && (
                 <Button variant="ghost" size="icon" onClick={() => handleRemoveStage(stageId)} className="text-red-400 hover:text-red-600 h-6 w-6">
                   <Trash2 className="h-4 w-4" />
                 </Button>
              )}
            </div>
          </div>
          
          <CollapsibleContent>
             <CardContent className="p-0">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead className="w-20">Código</TableHead>
                     <TableHead className="min-w-[200px]">Descrição</TableHead>
                     <TableHead className="w-16">Unid</TableHead>
                     <TableHead className="w-20 text-right">Qtd</TableHead>
                     <TableHead className="w-28 text-right">Custo Unit</TableHead>
                     <TableHead className="w-20 text-right">BDI%</TableHead>
                     <TableHead className="w-28 text-right">Preço Unit</TableHead>
                     <TableHead className="w-28 text-right">Subtotal</TableHead>
                     <TableHead className="w-24 text-center">Etapa</TableHead>
                     <TableHead className="w-10"></TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {stageItems.map((item) => (
                     <TableRow key={item.id || item.tempId}>
                       <TableCell className="text-xs font-medium">{item.codigo}</TableCell>
                       <TableCell className="text-sm">{item.descricao}</TableCell>
                       <TableCell className="text-xs text-slate-500">{item.unidade}</TableCell>
                       <TableCell>
                         <Input 
                           type="number" 
                           className="h-7 w-20 text-right text-xs" 
                           value={item.quantidade} 
                           onChange={e => updateItem(item.id || item.tempId, 'quantidade', e.target.value)} 
                         />
                       </TableCell>
                       <TableCell className="text-right text-xs">
                         {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_unitario_total)}
                       </TableCell>
                       <TableCell>
                          <Input 
                           type="number" 
                           className="h-7 w-16 text-right text-xs" 
                           value={item.bdi_percentual} 
                           onChange={e => updateItem(item.id || item.tempId, 'bdi_percentual', e.target.value)} 
                         />
                       </TableCell>
                       <TableCell className="text-right text-xs">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custo_com_bdi_unitario)}
                       </TableCell>
                       <TableCell className="text-right font-medium text-xs">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.subtotal)}
                       </TableCell>
                       <TableCell>
                         <Select 
                           value={item.stage_id || 'null'} 
                           onValueChange={(v) => {
                              // We need to find index in main items array
                              const idx = items.findIndex(i => (i.id || i.tempId) === (item.id || item.tempId));
                              moveItemToStage(idx, v);
                           }}
                         >
                           <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="null">Sem Etapa</SelectItem>
                             {stages.map(s => <SelectItem key={s.id || s.tempId} value={s.id || s.tempId}>{s.nome}</SelectItem>)}
                           </SelectContent>
                         </Select>
                       </TableCell>
                       <TableCell>
                         <Button variant="ghost" size="icon" onClick={() => removeItem(item.id || item.tempId)} className="h-6 w-6 text-red-500">
                           <Trash2 className="h-3 w-3" />
                         </Button>
                       </TableCell>
                     </TableRow>
                   ))}
                   <TableRow className="bg-slate-50/50">
                     <TableCell colSpan={10} className="p-2">
                       <div className="flex items-center gap-2">
                         <Select onValueChange={(v) => handleAddService(v, isUncategorized ? 'uncategorized' : stageId)}>
                           <SelectTrigger className="h-8 w-[300px] bg-white">
                             <SelectValue placeholder="Adicionar serviço nesta etapa..." />
                           </SelectTrigger>
                           <SelectContent>
                             {services.map(s => (
                               <SelectItem key={s.id} value={s.id}>
                                 {s.codigo} - {s.descricao}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                     </TableCell>
                   </TableRow>
                 </TableBody>
               </Table>
             </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  const pieData = stages.map(s => ({
    name: s.nome,
    value: calculateTotals(items.filter(i => i.stage_id === (s.id || s.tempId))).final
  })).concat([{
    name: 'Sem Etapa',
    value: calculateTotals(items.filter(i => !i.stage_id)).final
  }]).filter(d => d.value > 0);

  return (
    <div className="pb-20">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.location.href = createPageUrl('Budgets')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{budgetId ? 'Editar Orçamento' : 'Novo Orçamento'}</h1>
            <p className="text-slate-500">Orçamento por Etapas de Obra</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="h-4 w-4 mr-2" /> Imprimir / PDF
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="lg:col-span-3 space-y-6">
          {/* Main Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados Gerais</CardTitle>
            </CardHeader>
            <CardContent>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Descrição</Label>
                  <Input value={header.descricao} onChange={e => setHeader({...header, descricao: e.target.value})} />
                </div>
                <div>
                  <Label>Obra</Label>
                  <Select value={header.obra_id} onValueChange={v => setHeader({...header, obra_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={header.status} onValueChange={v => setHeader({...header, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="revisado">Revisado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="sheet">
            <TabsList>
              <TabsTrigger value="sheet"><Calculator className="h-4 w-4 mr-2" /> Planilha</TabsTrigger>
              <TabsTrigger value="report"><PieChartIcon className="h-4 w-4 mr-2" /> Relatórios</TabsTrigger>
            </TabsList>

            <TabsContent value="sheet">
              {/* Add Stage Toolbar */}
              <div className="flex gap-2 mb-4 bg-slate-100 p-3 rounded-lg items-center">
                <Label className="whitespace-nowrap">Nova Etapa:</Label>
                <Input 
                  placeholder="Ex: Fundação, Pintura..." 
                  value={newStageName} 
                  onChange={e => setNewStageName(e.target.value)}
                  className="max-w-xs h-9 bg-white"
                />
                <Button size="sm" onClick={handleAddStage} disabled={!newStageName}>
                  <FolderPlus className="h-4 w-4 mr-2" /> Adicionar
                </Button>
              </div>

              {/* Stages List */}
              <div className="space-y-6">
                {stages.map(stage => renderStageTable(
                  stage.id || stage.tempId, 
                  stage.nome, 
                  items.filter(i => i.stage_id === (stage.id || stage.tempId))
                ))}
                
                {/* Uncategorized Items */}
                {items.some(i => !i.stage_id) && renderStageTable(
                  'uncategorized',
                  'Sem Etapa Definida',
                  items.filter(i => !i.stage_id)
                )}

                {stages.length === 0 && items.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed rounded-xl bg-slate-50 text-slate-400">
                    <FolderPlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Adicione etapas e serviços para começar o orçamento.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="report">
               <div ref={reportRef} className="bg-white p-8 rounded-lg border shadow-sm">
                 <div className="text-center border-b pb-6 mb-6">
                   <h2 className="text-2xl font-bold uppercase">{header.descricao}</h2>
                   <p className="text-slate-500">Relatório Analítico por Etapas</p>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-8 mb-8">
                    <div className="h-64">
                       <h3 className="font-bold text-center mb-4">Custo por Etapa</h3>
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
                             label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                           >
                             {pieData.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                           </Pie>
                           <Tooltip formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} />
                         </PieChart>
                       </ResponsiveContainer>
                    </div>
                    <div>
                      <Table>
                        <TableHeader>
                           <TableRow>
                             <TableHead>Etapa</TableHead>
                             <TableHead className="text-right">Total</TableHead>
                           </TableRow>
                        </TableHeader>
                        <TableBody>
                           {pieData.map((d, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  <span className="inline-block w-3 h-3 rounded-full mr-2" style={{backgroundColor: COLORS[i % COLORS.length]}}></span>
                                  {d.name}
                                </TableCell>
                                <TableCell className="text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.value)}</TableCell>
                              </TableRow>
                           ))}
                           <TableRow className="font-bold bg-slate-50">
                             <TableCell>TOTAL GERAL</TableCell>
                             <TableCell className="text-right">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalTotals.final)}</TableCell>
                           </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                 </div>
               </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Floating Sidebar Summary */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-slate-900 text-white border-0 sticky top-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Resumo do Orçamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-6">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalTotals.final)}
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">Total Material</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalTotals.material)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">Total Mão de Obra</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalTotals.mao_obra)}</span>
                </div>
                 <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">Custo Direto</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalTotals.direto)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Total BDI</span>
                  <span className="text-green-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(globalBDI)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}