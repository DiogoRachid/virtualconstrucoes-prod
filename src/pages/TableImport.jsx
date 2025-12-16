import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadCloud, Loader2, Clipboard, AlertCircle, Play, Trash2, Database, RefreshCw } from 'lucide-react';
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
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '', percent: 0 });
  const [pasteData, setPasteData] = useState('');
  const fileInputRef = useRef(null);
  
  // Staging State
  const [stagingCount, setStagingCount] = useState(0);
  const [stagingSummary, setStagingSummary] = useState({ parents: 0, children: 0 });

  // 1. Initial Check & Refresh
  const checkStaging = async () => {
    try {
      // Get total count
      // Need a way to count efficiently. For now list with limit 1 to check existence or assume small list? 
      // Actually we need the real count. 
      // Base44 list returns array. 
      // Let's fetch all IDs (lightweight) if possible, or just fetch chunks.
      // Or just fetch first 5000 to see if work exists.
      const staging = await Engine.fetchAll('CompositionStaging');
      setStagingCount(staging.length);
      
      if (staging.length > 0) {
         const parents = new Set(staging.map(s => s.codigo_pai)).size;
         setStagingSummary({ parents, children: staging.length });
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
    if (u === 'H' || u === 'HORA' || u.startsWith('H')) return 'MAO_DE_OBRA';
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
      // ... (Same logic as before for inputs)
      // Re-implemented briefly for completeness
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
        
        // ... parse logic
        const codigo = cols[0];
        const descricao = cols[1];
        const unidade = cols[2];
        const valorStr = cols[3];
        const dataBase = cols[4] || '09/2025';

        if (!codigo) continue;
        const valor = valorStr ? parseFloat(valorStr.replace('R$', '').replace('.', '').replace(',', '.')) : 0;

        const data = { codigo, descricao: descricao.slice(0, 500), unidade: unidade || 'UN', valor_unitario: valor || 0, data_base: dataBase, fonte: 'SINAPI' };

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


  // 3. Step 2: Process Staging (The Core Request)
  const handleProcessStaging = async () => {
    setLoading(true);
    setProgress({ message: 'Carregando dados da tabela temporária...', percent: 5, current: 0, total: 0 });

    try {
      const staging = await Engine.fetchAll('CompositionStaging');
      if (staging.length === 0) {
        toast.info("Nada para processar.");
        setLoading(false);
        return;
      }

      // 1. Prepare Data
      const distinctParents = [...new Set(staging.map(s => s.codigo_pai))];
      const PARENT_BATCH_SIZE = 2000;
      
      setProgress({ message: 'Carregando banco de dados atual...', percent: 10 });
      const allServices = await Engine.fetchAll('Service');
      const serviceMap = new Map(allServices.map(s => [s.codigo, s]));
      const allInputs = await Engine.fetchAll('Input');
      const inputMap = new Map(allInputs.map(i => [i.codigo, { id: i.id, un: i.unidade }]));

      // 2. Loop Batches
      const totalBatches = Math.ceil(distinctParents.length / PARENT_BATCH_SIZE);
      
      for (let batchIdx = 0; batchIdx < distinctParents.length; batchIdx += PARENT_BATCH_SIZE) {
         // Yield
         await new Promise(r => setTimeout(r, 0));

         const currentParents = distinctParents.slice(batchIdx, batchIdx + PARENT_BATCH_SIZE);
         const currentParentsSet = new Set(currentParents);
         
         const currentBatchNum = Math.floor(batchIdx / PARENT_BATCH_SIZE) + 1;
         const percent = 10 + Math.round((currentBatchNum / totalBatches) * 80); // 10% to 90%
         
         setProgress({ 
            message: `Processando lote ${currentBatchNum}/${totalBatches} (${currentParents.length} serviços)...`, 
            percent 
         });

         // A. Register Services (Parents)
         const newServices = [];
         const updatesServices = [];

         for (const pCode of currentParents) {
            const sample = staging.find(s => s.codigo_pai === pCode);
            const existing = serviceMap.get(pCode);
            
            if (!existing) {
              newServices.push({
                codigo: pCode,
                descricao: sample.descricao_pai || `[TEMP] Serviço ${pCode}`,
                unidade: sample.unidade_pai,
                ativo: true
              });
            } else {
               // Update descriptions if needed
               if (existing.descricao.startsWith('[TEMP]') && sample.descricao_pai && !sample.descricao_pai.startsWith('[TEMP]')) {
                  updatesServices.push({ id: existing.id, data: { descricao: sample.descricao_pai, unidade: sample.unidade_pai } });
               }
            }
         }

         if (newServices.length > 0) {
            for (let i=0; i<newServices.length; i+=100) {
               const created = await base44.entities.Service.bulkCreate(newServices.slice(i, i+100));
               created?.forEach(c => serviceMap.set(c.codigo, c));
            }
         }
         if (updatesServices.length > 0) {
            for (let i=0; i<updatesServices.length; i+=50) {
               await Promise.all(updatesServices.slice(i, i+50).map(u => base44.entities.Service.update(u.id, u.data)));
            }
         }

         // B. Stubs for missing children
         const relevantStaging = staging.filter(s => currentParentsSet.has(s.codigo_pai));
         const missingChildrenCodes = new Set();
         for (const item of relevantStaging) {
            if (!inputMap.has(item.codigo_item) && !serviceMap.has(item.codigo_item)) {
               missingChildrenCodes.add(item.codigo_item);
            }
         }

         if (missingChildrenCodes.size > 0) {
            const childrenStubs = Array.from(missingChildrenCodes).map(c => ({
               codigo: c,
               descricao: `[TEMP] Sub-Serviço ${c}`,
               unidade: 'UN',
               ativo: true
            }));
            for (let i=0; i<childrenStubs.length; i+=100) {
               const created = await base44.entities.Service.bulkCreate(childrenStubs.slice(i, i+100));
               created?.forEach(c => serviceMap.set(c.codigo, c));
            }
         }

         // C. Create Links
         const linksToCreate = [];
         for (const item of relevantStaging) {
            const parent = serviceMap.get(item.codigo_pai);
            if (!parent) continue;

            let childId = null;
            let type = 'SERVICO';
            let category = 'MATERIAL';

            if (inputMap.has(item.codigo_item)) {
               const inp = inputMap.get(item.codigo_item);
               childId = inp.id;
               type = 'INSUMO';
               category = detectCategory(inp.un);
            } else if (serviceMap.has(item.codigo_item)) {
               const svc = serviceMap.get(item.codigo_item);
               childId = svc.id;
               type = 'SERVICO';
               category = detectCategory(svc.unidade);
            }

            if (childId) {
               linksToCreate.push({
                  servico_id: parent.id,
                  tipo_item: type,
                  item_id: childId,
                  quantidade: item.quantidade,
                  categoria: category,
                  ordem: 0,
                  custo_unitario_snapshot: 0,
                  custo_total_item: 0
               });
            }
         }

         if (linksToCreate.length > 0) {
            for (let i=0; i<linksToCreate.length; i+=200) {
               await base44.entities.ServiceItem.bulkCreate(linksToCreate.slice(i, i+200));
               // Important yield
               if (i % 1000 === 0) await new Promise(r => setTimeout(r, 0));
            }
         }
      }

      // 3. Clear Staging
      setProgress({ message: 'Limpando tabela temporária...', percent: 95 });
      const stagingIds = staging.map(s => s.id);
      for(let i=0; i<stagingIds.length; i+=500) {
         await base44.entities.CompositionStaging.delete(stagingIds.slice(i, i+500));
         await new Promise(r => setTimeout(r, 0));
      }

      setProgress({ message: 'Processamento concluído!', percent: 100 });
      toast.success("Cadastro finalizado com sucesso!");
      checkStaging(); // Should be 0 now

    } catch (err) {
       console.error(err);
       toast.error("Erro no processamento: " + err.message);
    } finally {
       setLoading(false);
    }
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
           <CardFooter className="flex gap-3">
              <Button 
                className="flex-1 bg-blue-600 hover:bg-blue-700" 
                onClick={handleProcessStaging}
                disabled={loading}
              >
                 {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                 {loading ? 'Processando...' : 'Iniciar Cadastro dos Serviços'}
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleClearStaging}
                disabled={loading}
              >
                 <Trash2 className="mr-2 h-4 w-4" /> Limpar Tabela
              </Button>
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
                         placeholder={mode === 'INSUMO' ? "COD | DESC | UN | VALOR" : "COD_PAI | DESC | UN | COD_FILHO | QTD"}
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