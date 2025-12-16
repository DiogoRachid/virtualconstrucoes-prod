import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadCloud, Loader2, Clipboard, AlertCircle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

export default function TableImport() {
  const [mode, setMode] = useState('INSUMO'); // INSUMO | COMPOSICAO
  const [inputType, setInputType] = useState('PASTE'); // PASTE | FILE
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [pasteData, setPasteData] = useState('');
  const fileInputRef = useRef(null);

  const detectCategory = (unit) => {
    if (!unit) return 'MATERIAL';
    const u = unit.toUpperCase().trim();
    if (u === 'H' || u === 'HORA' || u.startsWith('H')) return 'MAO_DE_OBRA';
    return 'MATERIAL';
  };

  const processImport = async (textData) => {
    if (!textData) return;
    setLoading(true);
    
    try {
      const lines = textData.split('\n');
      const separator = lines[0].includes(';') ? ';' : '\t';
      
      setProgress(`Iniciando processamento de ${lines.length} linhas...`);

      if (mode === 'INSUMO') {
        const BATCH_SIZE = 1000;
        let processed = 0;
        const allInputs = await Engine.fetchAll('Input');
        const inputMap = new Map(allInputs.map(i => [i.codigo, i.id]));

        const updates = [];
        const creates = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          const cols = line.split(separator).map(c => c?.trim().replace(/"/g, ''));
          if (cols.length < 3) continue;

          const codigo = cols[0];
          const descricao = cols[1];
          const unidade = cols[2];
          const valorStr = cols[3];
          const dataBase = cols[4] || '09/2025';

          if (!codigo) continue;
          const valor = valorStr ? parseFloat(valorStr.replace('R$', '').replace('.', '').replace(',', '.')) : 0;

          const data = {
            codigo,
            descricao: descricao.slice(0, 500),
            unidade: unidade || 'UN',
            valor_unitario: valor || 0,
            data_base: dataBase,
            fonte: 'SINAPI'
          };

          if (inputMap.has(codigo)) {
            updates.push({ id: inputMap.get(codigo), data });
          } else {
            creates.push(data);
          }
          processed++;
        }

        if (creates.length > 0) {
           setProgress(`Criando ${creates.length} novos insumos...`);
           for (let i = 0; i < creates.length; i += 100) {
             await base44.entities.Input.bulkCreate(creates.slice(i, i + 100));
             setProgress(`Criando insumos: ${Math.min(i + 100, creates.length)}/${creates.length}`);
           }
        }
        if (updates.length > 0) {
           setProgress(`Atualizando ${updates.length} insumos existentes...`);
           const chunks = [];
           for (let i=0; i<updates.length; i+=50) chunks.push(updates.slice(i, i+50));
           let updatedCount = 0;
           for (const chunk of chunks) {
              await Promise.all(chunk.map(u => base44.entities.Input.update(u.id, u.data)));
              updatedCount += chunk.length;
              setProgress(`Atualizando insumos: ${updatedCount}/${updates.length}`);
           }
        }
        toast.success(`${processed} insumos processados!`);
      } 
      else if (mode === 'COMPOSICAO') {
        const batchId = Date.now().toString();
        const staging = [];
        
        setProgress('Analisando linhas...');
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

          staging.push({
            batch_id: batchId,
            codigo_pai: codPai,
            descricao_pai: descPai,
            unidade_pai: unPai,
            codigo_item: codFilho,
            quantidade: qtdStr ? parseFloat(qtdStr.replace(',', '.')) : 0,
            status: 'pendente'
          });
        }

        setProgress(`Carregando ${staging.length} itens para memória temporária...`);
        for (let i=0; i<staging.length; i+=500) {
           await base44.entities.CompositionStaging.bulkCreate(staging.slice(i, i+500));
           setProgress(`Upload: ${Math.min(i+500, staging.length)}/${staging.length}`);
        }

        // BATCH PROCESS PARENTS
        const distinctParents = [...new Set(staging.map(s => s.codigo_pai))];
        const PARENT_BATCH_SIZE = 2000; // Reduced for safety
        
        // Load Maps once (Optimized)
        setProgress('Carregando dados existentes...');
        const allServices = await Engine.fetchAll('Service');
        const serviceMap = new Map(allServices.map(s => [s.codigo, s]));
        const allInputs = await Engine.fetchAll('Input');
        const inputMap = new Map(allInputs.map(i => [i.codigo, { id: i.id, un: i.unidade }]));

        for (let batchIdx = 0; batchIdx < distinctParents.length; batchIdx += PARENT_BATCH_SIZE) {
           // YIELD TO UI
           await new Promise(r => setTimeout(r, 0));

           const currentParents = distinctParents.slice(batchIdx, batchIdx + PARENT_BATCH_SIZE);
           const currentParentsSet = new Set(currentParents); // Optim: O(1) lookup
           
           setProgress(`Processando lote de serviços ${batchIdx + 1} a ${Math.min(batchIdx + PARENT_BATCH_SIZE, distinctParents.length)} de ${distinctParents.length}...`);

           // 1. Create/Update Services (Parents)
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
             const chunks = [];
             for (let i=0; i<updatesServices.length; i+=50) chunks.push(updatesServices.slice(i, i+50));
             for (const chunk of chunks) {
                await Promise.all(chunk.map(u => base44.entities.Service.update(u.id, u.data)));
             }
           }

           // 2. Resolve Children Stubs
           // Optim: Use Set for filtering to avoid O(N*M)
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

           // 3. Create Links
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
                // YIELD to avoid freeze
                if (i % 1000 === 0) await new Promise(r => setTimeout(r, 0));
             }
           }
        }

        // Cleanup Staging
        setProgress('Limpando dados temporários...');
        const stagingIds = staging.map(s => s.id);
        for(let i=0; i<stagingIds.length; i+=500) {
           await base44.entities.CompositionStaging.delete(stagingIds.slice(i, i+500));
           if (i % 2000 === 0) {
             setProgress(`Limpando temporários: ${Math.min(i+500, stagingIds.length)}/${stagingIds.length}`);
             await new Promise(r => setTimeout(r, 0));
           }
        }
        
        // Recalculate
        setProgress('Recalculando custos (isso pode demorar)...');
        // Re-fetch service list to get accurate IDs of parents if any were missing (though map handles it)
        const parentIdsToRecalc = [...new Set(staging.map(s => serviceMap.get(s.codigo_pai)?.id).filter(Boolean))];
        
        for (let i=0; i<parentIdsToRecalc.length; i++) {
           await Engine.recalculateService(parentIdsToRecalc[i]);
           if (i % 50 === 0) {
             setProgress(`Recalculando custos: ${i}/${parentIdsToRecalc.length}...`);
             await new Promise(r => setTimeout(r, 0));
           }
        }

        // Explicit Success Message via Alert/Dialog needed? 
        // Toast might be missed. Let's rely on setProgress('Concluído!') and maybe delay the close.
      }
      
      setProgress('Concluído com sucesso!');
      await new Promise(r => setTimeout(r, 1000)); // Show success for 1s
      
      toast.success("Processo finalizado com sucesso!");
      setPasteData('');
      if(fileInputRef.current) fileInputRef.current.value = '';

    } catch (err) {
      console.error(err);
      toast.error("Erro no processamento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileRead = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => processImport(ev.target.result);
    reader.readAsText(file);
  };

  return (
    <div className="pb-20 max-w-4xl mx-auto">
      <PageHeader 
        title="Importação Rápida" 
        subtitle="Copie e cole dados do SINAPI ou Excel (suporta grandes volumes)" 
        icon={UploadCloud} 
      />

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Escolha o tipo de dado e o método de entrada</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label>O que você vai importar?</Label>
                <Select value={mode} onValueChange={setMode} disabled={loading}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                      <SelectItem value="INSUMO">1. Insumos (Material/MO)</SelectItem>
                      <SelectItem value="COMPOSICAO">2. Composições (Estrutura)</SelectItem>
                   </SelectContent>
                </Select>
             </div>
             <div className="space-y-2">
                <Label>Método de Entrada</Label>
                <Tabs value={inputType} onValueChange={setInputType}>
                   <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="PASTE" disabled={loading}>Copiar e Colar</TabsTrigger>
                      <TabsTrigger value="FILE" disabled={loading}>Arquivo CSV/TXT</TabsTrigger>
                   </TabsList>
                </Tabs>
             </div>
          </div>

          {loading ? (
             <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 flex flex-col items-center justify-center text-blue-700 space-y-3">
                <Loader2 className="h-10 w-10 animate-spin" />
                <p className="font-medium text-lg">{progress}</p>
                <p className="text-xs opacity-75">Por favor aguarde, processando grandes volumes de dados...</p>
             </div>
          ) : (
             <>
               {inputType === 'PASTE' ? (
                 <div className="space-y-2">
                    <Label className="flex justify-between">
                       <span>Área de Transferência</span>
                       <span className="text-xs text-slate-500 font-normal">
                          {mode === 'INSUMO' 
                            ? 'Colunas: CÓDIGO | DESCRIÇÃO | UNIDADE | VALOR | DATA_BASE' 
                            : 'Colunas: COD_PAI | DESC_PAI | UN_PAI | COD_FILHO | QTD'}
                       </span>
                    </Label>
                    <Textarea 
                       className="min-h-[300px] font-mono text-xs" 
                       placeholder={mode === 'INSUMO' 
                          ? "Ex:\n101\tCIMENTO PORTLAND\tKG\t0,95\t09/2025\n102\tPEDREIRO\tH\t25,00\t09/2025" 
                          : "Ex:\n9001\tPAREDE 15CM\tM2\t101\t10.5\n9001\tPAREDE 15CM\tM2\t102\t2.0"}
                       value={pasteData}
                       onChange={e => setPasteData(e.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                       Dica: Copie diretamente do Excel e cole aqui. O sistema detecta Tabulações ou Ponto-e-vírgula automaticamente.
                    </p>
                    <Button className="w-full" onClick={() => processImport(pasteData)} disabled={!pasteData}>
                       <Clipboard className="mr-2 h-4 w-4" /> Processar Texto
                    </Button>
                 </div>
               ) : (
                 <div className="space-y-4 border-2 border-dashed rounded-lg p-8 text-center bg-slate-50">
                    <UploadCloud className="h-12 w-12 mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 mb-4">Arraste seu arquivo ou clique para selecionar</p>
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

          <Alert className="bg-amber-50 border-amber-200">
             <AlertCircle className="h-4 w-4 text-amber-600" />
             <AlertTitle className="text-amber-800">Dicas para Importação Segura</AlertTitle>
             <AlertDescription className="text-amber-700 text-xs mt-1 space-y-1">
                <p>• Insumos com unidade "H" ou "HORA" serão classificados automaticamente como Mão de Obra.</p>
                <p>• Se uma composição referenciar um serviço filho que não existe, ele será criado como [TEMP] (Stub) e atualizado depois.</p>
                <p>• Para arquivos muito grandes (55k+ linhas), prefira a opção de Upload de Arquivo ao invés de Colar.</p>
             </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}