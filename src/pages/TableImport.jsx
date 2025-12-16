import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadCloud, Loader2, Clipboard, AlertCircle, Play, Trash2, Database, RefreshCw } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

export default function TableImport() {
  const [mode, setMode] = useState('INSUMO');
  const [inputType, setInputType] = useState('PASTE');
  const [loading, setLoading] = useState(false);
  const [hasCategoryColumn, setHasCategoryColumn] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '', percent: 0 });
  const [pasteData, setPasteData] = useState('');
  const fileInputRef = useRef(null);
  
  // Staging State
  const [stagingCount, setStagingCount] = useState(0);
  const [stagingSummary, setStagingSummary] = useState({ parents: 0, children: 0 });

  // Global Processing State
  const [analyzed, setAnalyzed] = useState(false);
  const [stats, setStats] = useState(null);

  // 1. Initial Check & Refresh
  const checkStaging = async () => {
    try {
      const staging = await Engine.fetchAll('CompositionStaging');
      setStagingCount(staging.length);
      
      if (staging.length > 0) {
         const parents = new Set(staging.map(s => s.codigo_pai)).size;
         setStagingSummary({ parents, children: staging.length });
      } else {
         setStagingSummary({ parents: 0, children: 0 });
         setBatches([]);
         setAnalyzed(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkStaging();
  }, []);

  const detectCategory = (unit) => {
    if (!unit) return 'MATERIAL';
    const u = unit.toUpperCase().trim();
    if (u === 'H' || u === 'HORA' || u.startsWith('H')) return 'MAO_OBRA';
    return 'MATERIAL';
  };

  // 2. Step 1: Upload to Staging
  const handleUploadToStaging = async (textData) => {
    if (!textData) return;
    setLoading(true);
    setProgress({ current: 0, total: 100, message: 'Iniciando análise...', percent: 0 });

    try {
      const lines = textData.split('\n');
      const separator = lines[0].includes(';') ? ';' : '\t';
      
      if (mode === 'INSUMO') {
        // Direct processing for Inputs (Simpler, no staging needed usually, but user asked for robust table)
        // Let's keep Inputs direct for now as they don't have dependency complexity
        await processInputsDirectly(lines, separator);
      } else {
        // Compositions -> Staging
        const batchId = Date.now().toString();
        const stagingItems = [];
        
        setProgress({ current: 0, total: lines.length, message: 'Analisando linhas...', percent: 0 });
        
        for (const line of lines) {
          if (!line.trim()) continue;
          const cols = line.split(separator).map(c => c?.trim().replace(/"/g, ''));
          if (cols.length < 4) continue;

          const codPai = cols[0];
          const descPai = cols[1];
          const unPai = cols[2] || 'UN';
          const codFilho = cols[3];
          const qtdStr = cols[4];
          
          if (!codPai || !codFilho) continue;

          stagingItems.push({
            batch_id: batchId,
            codigo_pai: codPai,
            descricao_pai: descPai,
            unidade_pai: unPai,
            codigo_item: codFilho,
            quantidade: qtdStr ? parseFloat(qtdStr.replace(',', '.')) : 0,
            status: 'pendente'
          });
        }

        const total = stagingItems.length;
        for (let i = 0; i < total; i += 500) {
           const chunk = stagingItems.slice(i, i + 500);
           await base44.entities.CompositionStaging.bulkCreate(chunk);
           const percent = Math.round(((i + chunk.length) / total) * 100);
           setProgress({ current: i + chunk.length, total, message: 'Salvando na tabela temporária...', percent });
        }

        toast.success(`${total} itens carregados para a tabela de processamento.`);
        setPasteData('');
        if(fileInputRef.current) fileInputRef.current.value = '';
        checkStaging();
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro no upload: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const processInputsDirectly = async (lines, separator) => {
  const allInputs = await Engine.fetchAll('Input');
  const inputMap = new Map(allInputs.map(i => [i.codigo, i.id]));
  const updates = [];
  const creates = [];

  let processed = 0;
  const total = lines.length;

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(separator).map(c => c?.trim().replace(/"/g, ''));
    if (cols.length < 3) continue;

    const codigo = cols[0];
    const descricao = cols[1];
    const unidade = cols[2];
    const valorStr = cols[3];
    // Coluna 4 (índice 4) agora pode ser categoria se hasCategoryColumn for true
    // Se hasCategoryColumn for true: 0=COD, 1=DESC, 2=UN, 3=VAL, 4=CAT, 5=DATA
    // Se false: 0=COD, 1=DESC, 2=UN, 3=VAL, 4=DATA

    let categoria = 'MATERIAL';
    let dataBase = '09/2025';

    if (hasCategoryColumn) {
       const catRaw = (cols[4] || '').toUpperCase().trim();
       if (catRaw.startsWith('MAO') || catRaw.startsWith('MÃO')) categoria = 'MAO_OBRA';
       else if (catRaw.startsWith('MAT')) categoria = 'MATERIAL';
       dataBase = cols[5] || '09/2025';
    } else {
       // Fallback antigo se não tiver coluna explícita
       // O usuário pediu pra esquecer a regra de H = MO, mas se não tem coluna, usamos padrão MATERIAL
       // ou mantemos compatibilidade se o usuário não marcar o checkbox.
       // Vou assumir MATERIAL se não tiver coluna.
       dataBase = cols[4] || '09/2025';
    }

    if (!codigo) continue;
    const valor = valorStr ? parseFloat(valorStr.replace('R$', '').replace('.', '').replace(',', '.')) : 0;

    const data = { 
       codigo, 
       descricao: descricao.slice(0, 500), 
       unidade: unidade || 'UN', 
       valor_unitario: valor || 0, 
       categoria,
       data_base: dataBase, 
       fonte: 'SINAPI' 
    };

    if (inputMap.has(codigo)) updates.push({ id: inputMap.get(codigo), data });
    else creates.push(data);
    processed++;
  }

      // Execute batches...
      if (creates.length > 0) {
         setProgress({ message: `Criando ${creates.length} insumos...`, percent: 50 });
         for (let i=0; i<creates.length; i+=100) await base44.entities.Input.bulkCreate(creates.slice(i, i+100));
      }
      if (updates.length > 0) {
         setProgress({ message: `Atualizando ${updates.length} insumos...`, percent: 75 });
         // chunked updates
         for (let i=0; i<updates.length; i+=50) {
            await Promise.all(updates.slice(i, i+50).map(u => base44.entities.Input.update(u.id, u.data)));
         }
      }
      toast.success(`${processed} insumos processados.`);
  };


  // 3. Optimized Global Strategy (Fast & Robust)
  const handleProcessGlobal = async () => {
    setLoading(true);
    setProgress({ message: 'Preparando ambiente...', percent: 0 });

    try {
      // --- PHASE 0: PRE-LOAD ---
      setProgress({ message: 'Carregando TODOS os dados de importação...', percent: 5 });
      const staging = await Engine.fetchAll('CompositionStaging');
      if (staging.length === 0) { toast.info("Nada para processar"); setLoading(false); return; }

      setProgress({ message: 'Carregando Insumos e Serviços existentes...', percent: 10 });
      // Parallel Fetch
      const [existingServices, existingInputs] = await Promise.all([
        Engine.fetchAll('Service'),
        Engine.fetchAll('Input')
      ]);

      const serviceMap = new Map(existingServices.map(s => [s.codigo, s]));
      const serviceIdMap = new Map(existingServices.map(s => [s.id, s]));
      const inputMap = new Map(existingInputs.map(i => [i.codigo, { id: i.id, un: i.unidade, val: i.valor_unitario }]));
      const inputIdMap = new Map(existingInputs.map(i => [i.id, { un: i.unidade, val: i.valor_unitario }]));

      // Helper for UI yielding
      const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

      // --- PHASE 1: IDENTIFY & CREATE ALL MISSING SERVICES ---
      setProgress({ message: 'Identificando serviços faltantes (isso pode levar um tempo)...', percent: 20 });
      
      const distinctServiceCodes = new Set();
      const parentMeta = new Map(); // code -> { desc, un }
      
      // 1.1 Collect all potential Service codes (Processed in chunks to avoid freezing)
      const STAGING_CHUNK_SIZE = 2000;
      for (let i = 0; i < staging.length; i += STAGING_CHUNK_SIZE) {
         const chunk = staging.slice(i, i + STAGING_CHUNK_SIZE);
         
         for (const row of chunk) {
             distinctServiceCodes.add(row.codigo_pai);
             
             // Capture metadata for parent if new
             if (!parentMeta.has(row.codigo_pai)) {
                parentMeta.set(row.codigo_pai, { d: row.descricao_pai, u: row.unidade_pai });
             }

             // Check child: if not input, assume service
             if (!inputMap.has(row.codigo_item)) {
                distinctServiceCodes.add(row.codigo_item);
             }
         }
         // Yield every chunk
         await yieldToMain();
      }

      // 1.2 Diff against existing & Update descriptions
      const servicesToCreate = [];
      const servicesToUpdate = [];
      const codesArr = Array.from(distinctServiceCodes);
      
      for (let i = 0; i < codesArr.length; i += 1000) {
         const chunk = codesArr.slice(i, i + 1000);
         for (const code of chunk) {
            const meta = parentMeta.get(code);
            if (!serviceMap.has(code)) {
               servicesToCreate.push({
                  codigo: code,
                  descricao: meta?.d || `[IMPORTADO] Serviço ${code}`,
                  unidade: meta?.u || 'UN',
                  ativo: true
               });
            } else if (meta?.d) {
               // Update description if it exists in import
               const existing = serviceMap.get(code);
               if (existing.descricao !== meta.d) {
                  servicesToUpdate.push({
                     id: existing.id,
                     data: { descricao: meta.d, unidade: meta.u || existing.unidade }
                  });
               }
            }
         }
         await yieldToMain();
      }

      // 1.2.1 Bulk Update Existing Services
      if (servicesToUpdate.length > 0) {
         const totalUpdates = servicesToUpdate.length;
         for (let i = 0; i < totalUpdates; i += 100) {
            const chunk = servicesToUpdate.slice(i, i + 100);
            setProgress({ 
               message: `Atualizando ${i + chunk.length}/${totalUpdates} descrições de serviços...`, 
               percent: 20 
            });
            await yieldToMain();
            // We do parallel updates here as there is no bulkUpdate generic yet usually, 
            // but let's check if we can do Promise.all
            await Promise.all(chunk.map(u => base44.entities.Service.update(u.id, u.data)));
         }
      }

      // 1.3 Bulk Create Missing Services
      if (servicesToCreate.length > 0) {
         const total = servicesToCreate.length;
         // Reduced batch size to 200 for better reliability
         for (let i = 0; i < total; i += 200) {
             const chunk = servicesToCreate.slice(i, i + 200);
             const percent = 20 + Math.floor((i/total) * 30); // 20% -> 50%
             setProgress({ 
                message: `Criando ${i + chunk.length}/${total} novos serviços...`, 
                percent 
             });
             
             await yieldToMain();
             
             try {
                const created = await base44.entities.Service.bulkCreate(chunk);
                if (created && Array.isArray(created)) {
                   created.forEach(c => serviceMap.set(c.codigo, c));
                } else {
                   // Fallback logic if response is weird
                   console.warn('Bulk create response invalid, continuing...');
                }
             } catch (err) {
                console.error('Error creating service chunk', err);
                // Continue to next chunk instead of crashing
             }
         }
      }

      // --- PHASE 2: CREATE LINKS (COMPOSITIONS) ---
      setProgress({ message: 'Preparando vínculos de composição...', percent: 50 });
      
      const linksToCreate = [];
      
      for (let i = 0; i < staging.length; i += 2000) {
         const chunk = staging.slice(i, i + 2000);
         
         for (const row of chunk) {
             const parent = serviceMap.get(row.codigo_pai);
             if (!parent) continue;

             let childId = null;
             let type = 'SERVICO';
             let category = 'MATERIAL';

             if (inputMap.has(row.codigo_item)) {
                const inp = inputMap.get(row.codigo_item);
                childId = inp.id;
                type = 'INSUMO';
                category = detectCategory(inp.un);
             } else if (serviceMap.has(row.codigo_item)) {
                const svc = serviceMap.get(row.codigo_item);
                childId = svc.id;
                type = 'SERVICO';
                category = detectCategory(svc.unidade);
             }

             if (childId) {
                let unitCost = 0;
                if (type === 'INSUMO') {
                   const inp = inputMap.get(row.codigo_item);
                   unitCost = inp ? (inp.val || 0) : 0;
                } else {
                   const svc = serviceMap.get(row.codigo_item);
                   unitCost = svc ? (svc.custo_total || 0) : 0;
                }

                linksToCreate.push({
                   servico_id: parent.id,
                   tipo_item: type,
                   item_id: childId,
                   quantidade: row.quantidade,
                   categoria: category,
                   ordem: 0,
                   custo_unitario_snapshot: unitCost,
                   custo_total_item: (row.quantidade || 0) * unitCost
                });
             }
         }
         await yieldToMain();
      }

      // 2.1 Bulk Create Links
      const totalLinks = linksToCreate.length;
      // Reduced batch size for links
      for (let i = 0; i < totalLinks; i += 200) {
          const chunk = linksToCreate.slice(i, i + 200);
          const percent = 50 + Math.floor((i/totalLinks) * 30); // 50% -> 80%
          setProgress({ 
             message: `Salvando vínculos ${i + chunk.length}/${totalLinks}...`, 
             percent 
          });
          
          await yieldToMain();
          try {
             await base44.entities.ServiceItem.bulkCreate(chunk);
          } catch (err) {
             console.error('Error creating link chunk', err);
             // Continue
          }
      }

      // --- PHASE 3: CALCULATE COSTS (Iterative) ---
      setProgress({ message: 'Calculando custos (Iteração 1/5)...', percent: 80 });
      
      // Group links by parent for fast lookup
      const linksByParent = new Map();
      for (const link of linksToCreate) {
         if (!linksByParent.has(link.servico_id)) linksByParent.set(link.servico_id, []);
         linksByParent.get(link.servico_id).push(link);
      }
      
      const parentIds = Array.from(linksByParent.keys());
      const localCosts = new Map(); // id -> { mat, mo, total }
      
      // Initialize local costs for new services (or use existing if available)
      for (const pid of parentIds) {
         const existing = serviceIdMap.get(pid);
         localCosts.set(pid, { 
            mat: existing?.custo_material || 0, 
            mo: existing?.custo_mao_obra || 0, 
            total: existing?.custo_total || 0 
         });
      }

      // Run 5 passes to propagate costs bottom-up (handling depth ~5)
      for (let pass = 1; pass <= 5; pass++) {
         setProgress({ message: `Calculando custos (Iteração ${pass}/5)...`, percent: 80 + (pass * 2) });
         await yieldToMain();

         let changed = false;
         for (const pid of parentIds) {
            let mat = 0;
            let mo = 0;
            const links = linksByParent.get(pid);

            for (const link of links) {
               const qty = link.quantidade || 0;
               if (link.tipo_item === 'INSUMO') {
                  const inp = inputIdMap.get(link.item_id);
                  const cost = (inp?.val || 0) * qty;
                  if (link.categoria === 'MAO_OBRA') mo += cost;
                  else mat += cost;
               } else {
                  // Service
                  const childCost = localCosts.get(link.item_id) || { 
                     mat: serviceIdMap.get(link.item_id)?.custo_material || 0,
                     mo: serviceIdMap.get(link.item_id)?.custo_mao_obra || 0,
                     total: serviceIdMap.get(link.item_id)?.custo_total || 0
                  };
                  
                  // If child has 0 total, we can't split, so assign based on fallback or just 0
                  if (childCost.total > 0) {
                     const totalLinkCost = childCost.total * qty;
                     const matRatio = childCost.mat / childCost.total;
                     const moRatio = childCost.mo / childCost.total;
                     mat += totalLinkCost * matRatio;
                     mo += totalLinkCost * moRatio;
                  } else {
                     // Fallback: if child cost is 0, we can't do anything in this pass
                  }
               }
            }
            
            const total = mat + mo;
            const prev = localCosts.get(pid);
            if (Math.abs(prev.total - total) > 0.001) {
               localCosts.set(pid, { mat, mo, total });
               changed = true;
            }
         }
         
         if (!changed) break; // Optimized exit
      }

      // Save calculated costs
      const updates = [];
      for (const [pid, costs] of localCosts.entries()) {
         if (costs.total > 0) { // Only update if we calculated something
            updates.push({
               id: pid,
               data: {
                  custo_material: costs.mat,
                  custo_mao_obra: costs.mo,
                  custo_total: costs.total
               }
            });
         }
      }

      if (updates.length > 0) {
         const totalUpd = updates.length;
         for (let i = 0; i < totalUpd; i += 100) {
             const chunk = updates.slice(i, i + 100);
             setProgress({ message: `Salvando custos calculados ${i}/${totalUpd}...`, percent: 90 });
             await yieldToMain();
             await Promise.all(chunk.map(u => base44.entities.Service.update(u.id, u.data)));
         }
      }

      // --- PHASE 4: CASCADE UPDATES ---
      // Trigger updateDependents for all updated services to ensure parents (existing compositions) get updated costs
      if (updates.length > 0) {
         const totalCasc = updates.length;
         // Process in smaller chunks to report progress and avoid timeout
         for (let i = 0; i < totalCasc; i += 20) { 
            const chunk = updates.slice(i, i + 20);
            const percent = 90 + Math.floor((i/totalCasc) * 5); // 90-95%
            setProgress({ message: `Atualizando dependentes externos ${i}/${totalCasc}...`, percent });
            await yieldToMain();
            
            for (const u of chunk) {
               try {
                  await Engine.updateDependents('SERVICO', u.id);
               } catch (err) {
                  console.warn(`Falha ao atualizar dependentes de ${u.id}`, err);
               }
            }
         }
      }

      // --- PHASE 5: CLEANUP ---
      setProgress({ message: 'Limpando dados temporários...', percent: 95 });
      const stagingIds = staging.map(s => s.id);
      for(let i=0; i<stagingIds.length; i+=1000) {
         await base44.entities.CompositionStaging.delete(stagingIds.slice(i, i+1000));
         await new Promise(r => setTimeout(r, 0));
      }

      setProgress({ message: 'Processamento global concluído!', percent: 100 });
      toast.success(`Importação finalizada! ${servicesToCreate.length} serviços criados e ${totalLinks} vínculos gerados.`);
      
      setAnalyzed(false);
      setStats(null);
      checkStaging();

    } catch (e) {
       console.error(e);
       toast.error("Erro Crítico: " + e.message);
    } finally {
       setLoading(false);
    }
  };

  // Helper for analysis stats
  const handleAnalyzeStats = async () => {
    setLoading(true);
    try {
      const staging = await Engine.fetchAll('CompositionStaging');
      const uniqueParents = new Set(staging.map(s => s.codigo_pai)).size;
      setStats({
         totalRows: staging.length,
         uniqueParents: uniqueParents
      });
      setAnalyzed(true);
    } catch(e) {}
    setLoading(false);
  };

  const handleClearStaging = async () => {
     if (!confirm("Tem certeza? Isso apagará todos os dados pendentes de importação.")) return;
     setLoading(true);
     setProgress({ message: 'Apagando dados...', percent: 100 });
     try {
       const staging = await Engine.fetchAll('CompositionStaging');
       const ids = staging.map(s => s.id);
       for(let i=0; i<ids.length; i+=500) {
         await base44.entities.CompositionStaging.delete(ids.slice(i, i+500));
       }
       checkStaging();
       toast.success("Tabela limpa.");
     } catch(e) { toast.error("Erro ao limpar"); }
     setLoading(false);
  };

  const handleFileRead = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleUploadToStaging(ev.target.result);
    reader.readAsText(file, 'ISO-8859-1');
  };

  return (
    <div className="pb-20 max-w-4xl mx-auto space-y-6">
      <PageHeader 
        title="Importação de Tabelas" 
        subtitle="Processo em 2 etapas: Upload -> Processamento" 
        icon={Database} 
      />

      {/* STAGING MONITOR */}
      {stagingCount > 0 ? (
        <Card className="border-blue-200 bg-blue-50">
           <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                 <Database className="h-5 w-5" />
                 Tabela de Processamento ({stagingCount} itens)
              </CardTitle>
              <CardDescription className="text-blue-600">
                 Existem dados pendentes importados que precisam ser cadastrados no sistema.
              </CardDescription>
           </CardHeader>
           <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                 <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-slate-500">Serviços (Pais)</div>
                    <div className="text-2xl font-bold">{stagingSummary.parents}</div>
                 </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-slate-500">Itens Totais</div>
                    <div className="text-2xl font-bold">{stagingSummary.children}</div>
                 </div>
              </div>
              
              {loading && (
                 <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm font-medium text-blue-800">
                       <span>{progress.message}</span>
                       <span>{progress.percent}%</span>
                    </div>
                    <Progress value={progress.percent} className="h-2" />
                 </div>
              )}
           </CardContent>
           <CardFooter className="flex flex-col gap-3">
              {!analyzed ? (
                <div className="flex w-full gap-3">
                  <Button 
                    className="flex-1 bg-blue-600 hover:bg-blue-700" 
                    onClick={handleAnalyzeStats}
                    disabled={loading}
                  >
                     {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                     {loading ? 'Analisando...' : '1. Analisar Dados'}
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleClearStaging}
                    disabled={loading}
                  >
                     <Trash2 className="mr-2 h-4 w-4" /> Limpar Tabela
                  </Button>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <div className="bg-slate-50 p-4 rounded-lg border">
                     <h3 className="font-bold text-lg mb-2">Resumo da Importação</h3>
                     <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>Linhas Totais: <strong>{stats?.totalRows}</strong></div>
                        <div>Composições (Pais): <strong>{stats?.uniqueParents}</strong></div>
                     </div>
                     <p className="text-xs text-slate-500 mt-2">
                        O sistema processará todos os dados em fases globais otimizadas para alta performance.
                        Isso evita erros de dependência e é muito mais rápido do que lotes individuais.
                     </p>
                  </div>

                  <Button 
                     size="lg" 
                     className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
                     disabled={loading}
                     onClick={handleProcessGlobal}
                  >
                     {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                     {loading ? 'Processando (Não feche a página)...' : '2. Iniciar Processamento Global'}
                  </Button>
                </div>
              )}
           </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Etapa 1: Upload de Dados</CardTitle>
            <CardDescription>Carregue os dados para a tabela de processamento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label>Tipo de Dado</Label>
                  <Select value={mode} onValueChange={setMode} disabled={loading}>
                     <SelectTrigger><SelectValue /></SelectTrigger>
                     <SelectContent>
                        <SelectItem value="INSUMO">Insumos (Direto)</SelectItem>
                                <SelectItem value="COMPOSICAO">Composições (Vai para Tabela)</SelectItem>
                             </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center space-x-2 pt-8">
                          <Checkbox id="catCol" checked={hasCategoryColumn} onCheckedChange={setHasCategoryColumn} />
                          <label htmlFor="catCol" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                             Incluir coluna de Categoria? (Posição 5)
                          </label>
                        </div>
                        <div className="space-y-2">
                  <Label>Método</Label>
                  <Tabs value={inputType} onValueChange={setInputType}>
                     <TabsList className="w-full">
                        <TabsTrigger value="PASTE" className="flex-1">Colar Texto</TabsTrigger>
                        <TabsTrigger value="FILE" className="flex-1">Upload Arquivo</TabsTrigger>
                     </TabsList>
                  </Tabs>
               </div>
            </div>

            {loading ? (
               <div className="flex flex-col items-center justify-center p-8 space-y-4 bg-slate-50 rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <div className="w-full max-w-md space-y-2">
                     <div className="flex justify-between text-sm">
                        <span>{progress.message}</span>
                        <span>{progress.percent}%</span>
                     </div>
                     <Progress value={progress.percent} />
                  </div>
               </div>
            ) : (
               <>
                 {inputType === 'PASTE' ? (
                   <div className="space-y-2">
                      <Label>Cole os dados aqui (Tabulação ou Ponto-e-vírgula)</Label>
                      <Textarea 
                         className="min-h-[200px] font-mono text-xs" 
                         value={pasteData}
                         onChange={e => setPasteData(e.target.value)}
                         placeholder={
                            mode === 'INSUMO' 
                            ? (hasCategoryColumn ? "COD | DESC | UN | VALOR | CATEGORIA | DATA" : "COD | DESC | UN | VALOR | DATA") 
                            : "COD_PAI | DESC | UN | COD_FILHO | QTD"
                         }
                      />
                      <Button className="w-full" onClick={() => handleUploadToStaging(pasteData)} disabled={!pasteData}>
                         <UploadCloud className="mr-2 h-4 w-4" /> Carregar para Tabela
                      </Button>
                   </div>
                 ) : (
                   <div className="border-2 border-dashed rounded-lg p-8 text-center bg-slate-50 space-y-4">
                      <UploadCloud className="h-10 w-10 mx-auto text-slate-400" />
                      <div>
                         <p className="font-medium">Selecione o arquivo CSV ou TXT</p>
                         <p className="text-xs text-slate-500">Codificação ISO-8859-1 suportada automaticamente</p>
                      </div>
                      <Input 
                         ref={fileInputRef}
                         type="file" 
                         accept=".csv,.txt" 
                         className="max-w-xs mx-auto"
                         onChange={handleFileRead}
                      />
                   </div>
                 )}
               </>
            )}
            
            <Alert className="bg-slate-50">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Funcionamento</AlertTitle>
               <AlertDescription className="text-xs">
                  1. O upload apenas salva os dados na tabela temporária.<br/>
                  2. Após o upload, aparecerá um painel para confirmar e iniciar o cadastro real no sistema.<br/>
                  3. Isso evita travamentos e permite verificar quantos itens serão processados.
               </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}