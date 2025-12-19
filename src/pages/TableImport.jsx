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

          // Validador simples
          const looksLikeCode = (str) => str && str.length < 20 && !str.includes(' ');
          const looksLikeUnit = (str) => str && str.length <= 5;

          // Estratégia 1: Tabulação (Excel / Copy-Paste)
          if (cleanLine.includes('\t')) {
             // NÃO filtrar strings vazias para manter a posição das colunas
             const parts = cleanLine.split('\t').map(c => c.trim());
             
             // Esperado: COD_PAI | DESC | UN | COD_FILHO | QTD
             // Pode ter colunas extras, mas assumimos que as essenciais estão em posições relativas ou fixas
             if (parts.length >= 5) {
                // Se a linha tiver muitas colunas vazias no meio, o split preserva.
                
                // Assumindo as 5 primeiras colunas fixas se o arquivo for bem formatado
                // OU assumindo as últimas se for variável.
                // Vamos tentar pegar as posições fixas primeiro (0, 1, 2, 3, 4)
                
                // Tentativa A: Posições fixas (0 a 4)
                let p0 = parts[0]; // Pai
                let p1 = parts[1]; // Desc
                let p2 = parts[2]; // Unidade
                let p3 = parts[3]; // Filho
                let p4 = parts[4]; // Qtd

                if (looksLikeCode(p0) && looksLikeCode(p3) && /[\d.,]+/.test(p4)) {
                    cols = [p0, p1, p2, p3, p4];
                    parsed = true;
                } else {
                    // Tentativa B: Relativo ao final (caso a descrição quebre em colunas ou tenha colunas extras antes)
                    const qty = parts[parts.length - 1];
                    const child = parts[parts.length - 2];
                    const unitCandidate = parts[parts.length - 3];
                    const parent = parts[0];
                    
                    if (looksLikeCode(parent) && looksLikeCode(child)) {
                        const desc = parts.slice(1, parts.length - 3).join(' '); // Junta o meio como descrição
                        cols = [parent, desc, unitCandidate, child, qty];
                        parsed = true;
                    }
                }
             }
          }

          // Estratégia 2: Ponto e Vírgula (CSV)
          if (!parsed && cleanLine.includes(';')) {
              const parts = cleanLine.split(';').map(c => c.trim());
              if (parts.length >= 5) {
                  const qty = parts[parts.length - 1];
                  const child = parts[parts.length - 2];
                  const unit = parts[parts.length - 3];
                  const parent = parts[0];
                  const desc = parts.slice(1, parts.length - 3).join(' ');

                  if (looksLikeCode(parent)) { // child as vezes é vazio em linhas de cabeçalho
                      cols = [parent, desc, unit, child, qty];
                      parsed = true;
                  }
              }
          }

          // Estratégia 3: Espaços (PDF Copy-Paste) - O mais problemático
          if (!parsed) {
              // Tenta quebrar por múltiplos espaços primeiro (mais seguro)
              let tokens = cleanLine.split(/\s{2,}/).map(c => c.trim()).filter(c => c);

              // Se não deu certo, tenta espaço simples, mas com muito cuidado
              if (tokens.length < 5) {
                  tokens = cleanLine.split(' ').map(c => c.trim()).filter(c => c);
              }

              if (tokens.length >= 5) {
                  const qty = tokens[tokens.length - 1];
                  const child = tokens[tokens.length - 2];
                  const unit = tokens[tokens.length - 3];
                  const parent = tokens[0];

                  // Validar se parecem estar nos lugares certos
                  const parentIsCode = looksLikeCode(parent);
                  const childIsCode = looksLikeCode(child);
                  const unitIsUnit = looksLikeUnit(unit);
                  const qtyIsNum = /[\d.,]+/.test(qty);

                  if (parentIsCode && childIsCode && qtyIsNum) {
                      // Parece correto
                      const desc = tokens.slice(1, tokens.length - 3).join(' ');
                      cols = [parent, desc, unit, child, qty];
                      parsed = true;
                  } else if (parentIsCode && childIsCode && !unitIsUnit) {
                      // Pode ser que não tenha coluna de unidade?
                      // Ex: COD | DESC | CHILD | QTD
                      // tokens[length-3] seria parte da descrição
                      const potentialChild = tokens[tokens.length - 2];
                      const potentialQty = tokens[tokens.length - 1];

                      if (looksLikeCode(potentialChild) && /[\d.,]+/.test(potentialQty)) {
                         // Assumir sem unidade
                         const desc = tokens.slice(1, tokens.length - 2).join(' ');
                         cols = [parent, desc, 'UN', potentialChild, potentialQty];
                         parsed = true;
                      }
                  }
              }
          }

          if (parsed) {
             const qty = parseBrlNumber(cols[4]);
             // Filtro final para evitar lixo
             if (!cols[0] || cols[0].length > 15 || !/^[A-Z0-9.-]+$/.test(cols[0])) {
                 skippedCount++;
                 continue; 
             }

             items.push({
                 codigo_pai: cols[0]?.trim(),
                 descricao_pai: cols[1]?.trim()?.replace(/^["']|["']$/g, ''), 
                 unidade_pai: cols[2]?.trim() || 'UN',
                 codigo_item: cols[3]?.trim(),
                 quantidade: qty
             });
          } else {
             skippedCount++;
             // console.warn("Linha ignorada:", cleanLine);
          }
       }

       if (items.length === 0) {
          throw new Error("Nenhuma linha válida identificada. Verifique se o formato está correto: CÓD_PAI (TAB) DESCRIÇÃO (TAB) UN (TAB) CÓD_FILHO (TAB) QUANTIDADE");
       }

        // 2. Resolve Entities via Backend
        setProgress({ message: 'Resolvendo códigos e criando entidades faltantes (Server-Side)...', percent: 20 });

        const allCodes = new Set();
        const itemsInfo = {}; // Map code -> { description, unit }

        items.forEach(i => {
           if (i.codigo_pai) {
               allCodes.add(i.codigo_pai);
               if (!itemsInfo[i.codigo_pai]) {
                   itemsInfo[i.codigo_pai] = { description: i.descricao_pai, unit: i.unidade_pai };
               }
           }
           if (i.codigo_item) {
               allCodes.add(i.codigo_item);
               if (!itemsInfo[i.codigo_item]) {
                   itemsInfo[i.codigo_item] = { description: i.descricao_item, unit: i.unidade_item }; // Might be undefined if column missing
               }
           }
        });

        const codeList = Array.from(allCodes);
        
        // Identify which codes are parents (appear as codigo_pai)
        const parentCodes = new Set();
        items.forEach(i => {
           if (i.codigo_pai) parentCodes.add(i.codigo_pai);
        });

        let mapping = {};
        const chunkSize = 5000;

        for (let i = 0; i < codeList.length; i += chunkSize) {
            const chunk = codeList.slice(i, i + chunkSize);

            // Prepare chunk items_info
            const chunkInfo = {};
            chunk.forEach(c => chunkInfo[c] = itemsInfo[c]);

            setProgress({ message: `Resolvendo bloco ${Math.floor(i/chunkSize)+1}/${Math.ceil(codeList.length/chunkSize)}...`, percent: 20 + Math.floor((i/codeList.length)*30) });

            const response = await base44.functions.invoke('importHelpers', {
                action: 'resolve_and_create',
                codes: chunk,
                items_info: chunkInfo
            });

            if (response.data && response.data.mapping) {
                mapping = { ...mapping, ...response.data.mapping };
            } else {
                throw new Error("Falha ao resolver entidades no servidor.");
            }
        }

        // 3. Create Links
        setProgress({ message: 'Preparando vínculos...', percent: 60 });
        const linksToCreate = [];
        let linksCreatedCount = 0;

        // Helper to detect category if needed (though backend mapping might not have unit, we added unit to backend return)
        // mapping[code] = { id, type, unit }

        for (const item of items) {
            const parentData = mapping[item.codigo_pai];
            const childData = mapping[item.codigo_item];

            if (!parentData || !childData) {
                // Should not happen if backend did its job
                continue;
            }

            // Determine category based on child unit
            let cat = 'MATERIAL';
            if (childData.unit) {
               const u = childData.unit.toUpperCase();
               if (u.startsWith('H')) cat = 'MAO_OBRA';
            }

            const unitCost = childData.cost || 0;
            const totalCost = unitCost * (item.quantidade || 0);

            linksToCreate.push({
                servico_id: parentData.id,
                tipo_item: childData.type,
                item_id: childData.id,
                quantidade: item.quantidade,
                categoria: cat,
                ordem: 0,
                custo_unitario_snapshot: unitCost,
                custo_total_item: totalCost
            });
            }

        // 4. Batch Insert Links
        if (linksToCreate.length > 0) {
            for (let i = 0; i < linksToCreate.length; i+=500) {
                const chunk = linksToCreate.slice(i, i+500);
                await base44.entities.ServiceItem.bulkCreate(chunk);
                linksCreatedCount += chunk.length;
                setProgress({ message: `Salvando vínculos ${linksCreatedCount}/${linksToCreate.length}...`, percent: 60 + Math.floor((i/linksToCreate.length)*40) });
                await yieldToMain();
            }
        }

        setProgress({ message: 'Concluído!', percent: 100 });
        toast.success(`Importação finalizada! ${linksCreatedCount} vínculos processados.`);

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