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

  // 2. Step 1: Upload to Staging (Backend Function)
  const handleUploadToStaging = async (textData, fileUrl = null) => {
    if (!textData && !fileUrl) return;
    setLoading(true);
    setProgress({ current: 0, total: 100, message: 'Enviando dados para o servidor...', percent: 10 });

    try {
      const batchId = Date.now().toString();
      
      const result = await base44.functions.IngestComposition({
        textData,
        fileUrl,
        encoding: 'iso-8859-1', // Default encoding for uploaded files
        mode,
        batchId,
        hasCategoryColumn
      });

      if (result && result.success) {
         toast.success(`${result.count} itens enviados com sucesso.`);
         setPasteData('');
         if(fileInputRef.current) fileInputRef.current.value = '';
         checkStaging();
      } else {
         toast.error("Erro no processamento do servidor: " + (result?.message || 'Desconhecido'));
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro no upload: " + err.message);
    } finally {
      setLoading(false);
      setProgress({ percent: 0, message: '' });
    }
  };


  // 3. Optimized Global Strategy (Batch Processing via Backend Function)
  const handleProcessGlobal = async () => {
    setLoading(true);
    setProgress({ message: 'Iniciando processamento no servidor...', percent: 0 });

    try {
      let processedBatches = 0;
      let totalProcessedParents = 0;
      let finished = false;

      while (!finished) {
        // Invoke backend function
        const result = await base44.functions.ProcessComposition({ limit: 200 });
        
        if (!result) {
            throw new Error("Falha na comunicação com o servidor.");
        }

        const { processedParents, finished: isFinished } = result;
        
        processedBatches++;
        totalProcessedParents += processedParents;
        
        setProgress({ 
            message: `Lote ${processedBatches} concluído. ${totalProcessedParents} composições processadas.`, 
            percent: isFinished ? 100 : Math.min(95, processedBatches * 5)
        });

        if (isFinished || processedParents === 0) {
            finished = true;
        }
      }

      toast.success(`Importação finalizada! ${totalProcessedParents} composições processadas com sucesso.`);
      setAnalyzed(false);
      setStats(null);
      checkStaging();

    } catch (e) {
       console.error(e);
       toast.error("Erro no processamento: " + e.message);
    } finally {
       setLoading(false);
       setProgress({ message: '', percent: 0 });
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
     setProgress({ message: 'Apagando dados...', percent: 0 });
     try {
       let deletedTotal = 0;
       while (true) {
         // Fetch in batches to avoid memory issues
         const batch = await base44.entities.CompositionStaging.list({ limit: 1000 });
         if (!batch || batch.length === 0) break;
         
         const ids = batch.map(s => s.id);
         await base44.entities.CompositionStaging.delete(ids);
         
         deletedTotal += ids.length;
         setProgress({ message: `Apagando dados... (${deletedTotal} removidos)`, percent: 50 });
       }
       
       checkStaging();
       toast.success("Tabela limpa.");
     } catch(e) { 
       console.error(e);
       toast.error("Erro ao limpar: " + e.message); 
     }
     setLoading(false);
  };

  const handleFileRead = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setLoading(true);
    setProgress({ message: 'Fazendo upload do arquivo...', percent: 20 });

    try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (!file_url) throw new Error("Falha no upload do arquivo.");
        
        await handleUploadToStaging(null, file_url);
    } catch (err) {
        console.error(err);
        toast.error("Erro ao preparar arquivo: " + err.message);
        setLoading(false);
    }
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
                      <Button className="w-full" onClick={() => handleUploadToStaging(pasteData, null)} disabled={!pasteData}>
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