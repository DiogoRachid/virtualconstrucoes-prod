import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadCloud, Loader2, Database, AlertCircle, Play } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

export default function TableImport() {
  const [mode, setMode] = useState('INSUMO');
  const [inputType, setInputType] = useState('PASTE');
  const [loading, setLoading] = useState(false);
  const [hasCategoryColumn, setHasCategoryColumn] = useState(false);
  const [progress, setProgress] = useState({ message: '', percent: 0 });
  const [pasteData, setPasteData] = useState('');
  const fileInputRef = useRef(null);

  const detectCategory = (unit) => {
    if (!unit) return 'MATERIAL';
    const u = unit.toUpperCase().trim();
    if (u === 'H' || u === 'HORA' || u.startsWith('H')) return 'MAO_OBRA';
    return 'MATERIAL';
  };

  const parseBrlNumber = (str) => {
     if (!str) return 0;
     let val = str.trim().replace(/\s/g, '').toUpperCase();
     if (val.includes('E')) {
        val = val.replace(',', '.');
        return parseFloat(val) || 0;
     }
     if (val.includes(',')) {
        const normalized = val.replace(/\./g, '').replace(',', '.');
        return parseFloat(normalized) || 0;
     }
     return parseFloat(val) || 0;
  };

  const handleImport = async (textData) => {
    if (!textData) return;
    setLoading(true);
    setProgress({ message: 'Iniciando...', percent: 0 });

    try {
      const lines = textData.split('\n');
      const separator = lines[0].includes(';') ? ';' : '\t';
      
      if (mode === 'INSUMO') {
        await processInputsDirectly(lines, separator);
      } else {
        await processCompositionsDirectly(lines, separator);
      }
      
      setPasteData('');
      if(fileInputRef.current) fileInputRef.current.value = '';

    } catch (err) {
      console.error(err);
      toast.error("Erro no upload: " + err.message);
    } finally {
      setLoading(false);
      setProgress({ message: '', percent: 0 });
    }
  };

  const processInputsDirectly = async (lines, separator) => {
      const allInputs = await Engine.fetchAll('Input');
      const inputMap = new Map(allInputs.map(i => [i.codigo, i.id]));
      const updates = [];
      const creates = [];
    
      let processed = 0;
    
      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = line.split(separator).map(c => c?.trim().replace(/"/g, ''));
        if (cols.length < 3) continue;
    
        const codigo = cols[0];
        const descricao = cols[1];
        const unidade = cols[2];
        const valorStr = cols[3];
    
        let categoria = 'MATERIAL';
        let dataBase = '09/2025';
    
        if (hasCategoryColumn) {
           const catRaw = (cols[4] || '').toUpperCase().trim();
           if (catRaw.startsWith('MAO') || catRaw.startsWith('MÃO')) categoria = 'MAO_OBRA';
           else if (catRaw.startsWith('MAT')) categoria = 'MATERIAL';
           dataBase = cols[5] || '09/2025';
        } else {
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
    
      if (creates.length > 0) {
         setProgress({ message: `Criando ${creates.length} insumos...`, percent: 50 });
         for (let i=0; i<creates.length; i+=100) await base44.entities.Input.bulkCreate(creates.slice(i, i+100));
      }
      if (updates.length > 0) {
         setProgress({ message: `Atualizando ${updates.length} insumos...`, percent: 75 });
         for (let i=0; i<updates.length; i+=50) {
            await Promise.all(updates.slice(i, i+50).map(u => base44.entities.Input.update(u.id, u.data)));
         }
      }
      toast.success(`${processed} insumos processados.`);
  };

  const processCompositionsDirectly = async (lines, separator) => {
     try {
        toast.info("Iniciando processamento...");
        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

        // 1. Parse Lines
        setProgress({ message: 'Analisando linhas...', percent: 5 });
        const items = [];
        let skippedCount = 0;
        
        for (const line of lines) {
           const cleanLine = line.trim();
           if (!cleanLine) continue;
           
           let cols = [];
           let parsed = false;
           
           // 1. Exact Tab Split
           if (cleanLine.includes('\t')) {
              const parts = cleanLine.split('\t').map(c => c.trim()).filter(c => c.length > 0);
              if (parts.length === 5) {
                 cols = parts;
                 parsed = true;
              } else if (parts.length > 5) {
                 // Assume Description got split
                 cols = [
                    parts[0], 
                    parts.slice(1, parts.length - 3).join(' '), 
                    parts[parts.length - 3], 
                    parts[parts.length - 2], 
                    parts[parts.length - 1]
                 ];
                 parsed = true;
              }
           }

           // 2. Whitespace Tokenizer (Fallback)
           if (!parsed) {
               const tokens = cleanLine.split(/\s+/);
               if (tokens.length >= 5) {
                   const qty = tokens[tokens.length - 1];
                   const child = tokens[tokens.length - 2];
                   const unit = tokens[tokens.length - 3];
                   const parent = tokens[0];
                   const desc = tokens.slice(1, tokens.length - 3).join(' ');
                   cols = [parent, desc, unit, child, qty];
                   parsed = true;
               }
           }

           if (parsed) {
              const qty = parseBrlNumber(cols[4]);
              items.push({
                  codigo_pai: cols[0],
                  descricao_pai: cols[1],
                  unidade_pai: cols[2],
                  codigo_item: cols[3],
                  quantidade: qty
              });
           } else {
              skippedCount++;
              console.warn("Ignorado:", cleanLine);
           }
        }

        if (items.length === 0) {
           throw new Error("Nenhum item válido encontrado. Verifique a formatação.");
        }

        // 2. Load Data
        setProgress({ message: 'Carregando dados...', percent: 15 });
        const [existingServices, existingInputs] = await Promise.all([
           Engine.fetchAll('Service'),
           Engine.fetchAll('Input')
        ]);
        
        const serviceMap = new Map(existingServices.map(s => [s.codigo, s]));
        const inputMap = new Map(existingInputs.map(i => [i.codigo, i]));
        
        // 3. Create/Update Parents
        setProgress({ message: 'Sincronizando serviços pais...', percent: 30 });
        const parentsToCreate = new Map();
        
        for (const item of items) {
            if (!serviceMap.has(item.codigo_pai)) {
                parentsToCreate.set(item.codigo_pai, {
                    codigo: item.codigo_pai,
                    descricao: item.descricao_pai,
                    unidade: item.unidade_pai,
                    ativo: true,
                    custo_total: 0
                });
            }
        }

        if (parentsToCreate.size > 0) {
            const arr = Array.from(parentsToCreate.values());
            for (let i = 0; i < arr.length; i+=100) {
                const chunk = arr.slice(i, i+100);
                const created = await base44.entities.Service.bulkCreate(chunk);
                if (created) created.forEach(c => serviceMap.set(c.codigo, c));
            }
            toast.success(`${arr.length} novos serviços criados.`);
        }

        // 4. Ensure Children Exist
        setProgress({ message: 'Verificando itens filhos...', percent: 50 });
        const missingChildren = new Set();
        for (const item of items) {
            if (!inputMap.has(item.codigo_item) && !serviceMap.has(item.codigo_item)) {
                missingChildren.add(item.codigo_item);
            }
        }

        if (missingChildren.size > 0) {
            const arr = Array.from(missingChildren).map(code => ({
                codigo: code,
                descricao: `[AUTO] Item ${code}`,
                unidade: 'UN',
                valor_unitario: 0,
                categoria: 'MATERIAL',
                data_base: '09/2025',
                fonte: 'SINAPI-AUTO'
            }));

            for (let i = 0; i < arr.length; i+=100) {
                const chunk = arr.slice(i, i+100);
                const created = await base44.entities.Input.bulkCreate(chunk);
                if (created) created.forEach(c => inputMap.set(c.codigo, c));
            }
            toast.warning(`${arr.length} itens desconhecidos criados automaticamente.`);
        }

        // 5. Create Links
        setProgress({ message: 'Criando vínculos...', percent: 70 });
        const linksToCreate = [];
        let linksCreatedCount = 0;

        for (const item of items) {
            const parent = serviceMap.get(item.codigo_pai);
            if (!parent) continue;
            
            let childId = null;
            let type = 'SERVICO';
            let cat = 'MATERIAL';
            let cost = 0;

            if (inputMap.has(item.codigo_item)) {
                const inp = inputMap.get(item.codigo_item);
                childId = inp.id;
                type = 'INSUMO';
                cat = detectCategory(inp.unidade);
                cost = inp.valor_unitario || 0;
            } else if (serviceMap.has(item.codigo_item)) {
                const svc = serviceMap.get(item.codigo_item);
                childId = svc.id;
                type = 'SERVICO';
                cat = detectCategory(svc.unidade);
                cost = svc.custo_total || 0;
            }

            if (childId) {
                linksToCreate.push({
                    servico_id: parent.id,
                    tipo_item: type,
                    item_id: childId,
                    quantidade: item.quantidade,
                    categoria: cat,
                    ordem: 0,
                    custo_unitario_snapshot: cost,
                    custo_total_item: cost * item.quantidade
                });
            }
        }

        if (linksToCreate.length > 0) {
            for (let i = 0; i < linksToCreate.length; i+=200) {
                const chunk = linksToCreate.slice(i, i+200);
                await base44.entities.ServiceItem.bulkCreate(chunk);
                linksCreatedCount += chunk.length;
                setProgress({ message: `Salvando vínculos ${linksCreatedCount}/${linksToCreate.length}...`, percent: 70 + Math.floor((i/linksToCreate.length)*20) });
                await yieldToMain();
            }
        }

        setProgress({ message: 'Concluído!', percent: 100 });
        toast.success(`Importação finalizada! ${linksCreatedCount} vínculos criados.`);

     } catch (err) {
        console.error("Erro fatal:", err);
        toast.error(`Falha: ${err.message}`);
     }
  };

  const handleFileRead = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleImport(ev.target.result);
    reader.readAsText(file, 'ISO-8859-1');
  };

  return (
    <div className="pb-20 max-w-4xl mx-auto space-y-6">
      <PageHeader 
        title="Importação de Tabelas" 
        subtitle="Importe Insumos ou Composições diretamente" 
        icon={Database} 
      />

      <Card>
        <CardHeader>
          <CardTitle>Importação de Dados</CardTitle>
          <CardDescription>Carregue dados do Excel ou SINAPI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label>Tipo de Dado</Label>
                <Select value={mode} onValueChange={setMode} disabled={loading}>
                   <SelectTrigger><SelectValue /></SelectTrigger>
                   <SelectContent>
                      <SelectItem value="INSUMO">Insumos (Direto)</SelectItem>
                      <SelectItem value="COMPOSICAO">Composições (Direto)</SelectItem>
                   </SelectContent>
                </Select>
             </div>
             
             {mode === 'INSUMO' && (
                <div className="flex items-center space-x-2 pt-8">
                  <Checkbox id="catCol" checked={hasCategoryColumn} onCheckedChange={setHasCategoryColumn} />
                  <label htmlFor="catCol" className="text-sm font-medium leading-none">
                     Incluir coluna de Categoria? (Posição 5)
                  </label>
                </div>
             )}

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
                   <div className="flex justify-between text-sm font-medium text-blue-800">
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
                          : "COD_PAI  |  DESCRIÇÃO_PAI  |  UN_PAI  |  COD_FILHO  |  QTD_FILHO\nExemplo:\n87339\tARGAMASSA...\tM3\t88404\t7,94"
                       }
                    />
                    <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => handleImport(pasteData)} disabled={!pasteData}>
                       <Play className="mr-2 h-4 w-4" /> Processar Importação
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
        </CardContent>
      </Card>
    </div>
  );
}