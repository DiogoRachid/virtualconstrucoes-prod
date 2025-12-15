import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Save,
  Ban,
  FileText
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
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
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { format } from 'date-fns';

// Helper for batch processing with concurrency
const processBatches = async (items, batchSize, fn) => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
    // Small delay to yield to event loop
    await new Promise(r => setTimeout(r, 50));
  }
};

// Helper to fetch entities by codes in chunks (Parallelized)
const fetchByCodes = async (entity, codes) => {
  const uniqueCodes = [...new Set(codes.filter(Boolean))];
  const results = [];
  const chunkSize = 500; // Increased chunk size
  const concurrency = 5; // Parallel requests
  
  const chunks = [];
  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    chunks.push(uniqueCodes.slice(i, i + chunkSize));
  }

  // Process chunks in batches of 'concurrency'
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const promises = batch.map(chunk => 
      base44.entities[entity].filter({
        codigo: { "$in": chunk }
      }, null, 1000)
        .catch(e => {
          console.error(`Error fetching ${entity} chunk`, e);
          return [];
        })
    );
    
    const batchResults = await Promise.all(promises);
    batchResults.forEach(r => results.push(...r));
  }
  
  return results;
};

export default function TableImport() {
  const [file, setFile] = useState(null);
  const [config, setConfig] = useState({
    origem: 'SINAPI',
    tipo: 'INSUMOS', // INSUMOS or COMPOSICOES
    updateBudgets: false,
    data_base: '09/2025'
  });
  const [batchId, setBatchId] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mappedColumns, setMappedColumns] = useState({});
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [logs, setLogs] = useState([]);
  
  const fileInputRef = useRef(null);

  // Column Mapping Helpers
  const identifyColumn = (headerName, type) => {
    const h = headerName.toUpperCase().trim();
    if (type === 'INSUMOS') {
      if (['COD', 'CODIGO', 'CÓDIGO', 'ID'].some(x => h.includes(x))) return 'codigo';
      if (['DESCR', 'DESCRIÇÃO', 'DESCRICAO', 'NOME'].some(x => h.includes(x))) return 'descricao';
      if (['UND', 'UNID', 'UNIDADE'].some(x => h === x)) return 'unidade';
      if (['PRECO', 'PREÇO', 'VALOR', 'CUSTO'].some(x => h.includes(x))) return 'valor_referencia';
    } else { // COMPOSICOES
      // Identifying Composite vs Component
      if (['COD_SERV', 'CODIGO_SERVICO', 'CODIGO SERVICO'].some(x => h.includes(x))) return 'codigo_servico';
      if (['DESC_SERV', 'DESCRICAO_SERVICO'].some(x => h.includes(x))) return 'descricao_servico';
      if (['UND_SERV', 'UNIDADE_SERVICO'].some(x => h.includes(x))) return 'unidade_servico';
      if (['COD_ITEM', 'CODIGO_ITEM', 'CODIGO INSUMO'].some(x => h.includes(x))) return 'codigo_item';
      if (['QTD', 'QUANTIDADE', 'COEFICIENTE'].some(x => h.includes(x))) return 'quantidade';
      // Custo unitário removido da importação de serviços/composições
      if (['UNIDADE_ITEM', 'UND_ITEM', 'UNID_ITEM', 'UN_ITEM'].some(x => h.includes(x))) return 'unidade_item';
    }
    return null;
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewData([]);
      setLogs([]);
      setProgress('');
    }
  };

  const processFile = () => {
    if (!file) return;
    setProcessing(true);
    setProgress('Lendo arquivo...');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n');
      
      // Basic CSV parsing (handles ; or ,)
      // Find separator based on first line
      const firstLine = lines[0];
      const separator = firstLine.includes(';') ? ';' : ',';
      
      const rawHeaders = lines[0].split(separator).map(h => h.replace(/"/g, '').trim());
      setHeaders(rawHeaders);

      // Map columns automatically
      const mapping = {};
      rawHeaders.forEach((h, index) => {
        const field = identifyColumn(h, config.tipo);
        if (field) mapping[field] = index;
      });
      setMappedColumns(mapping);

      // Parse preview data (first 20 lines)
      const preview = lines.slice(1, 21).map(line => {
        if (!line.trim()) return null;
        const cols = line.split(separator).map(c => c.replace(/"/g, '').trim());
        return cols;
      }).filter(Boolean);

      setPreviewData(preview);
      setProcessing(false);
      setProgress('Pré-visualização gerada. Verifique as colunas.');
    };
    
    reader.readAsText(file, 'ISO-8859-1'); // Default to latin1 for legacy systems usually, or try UTF-8
  };

  const processStaging = async (currentBatchId) => {
    setProgress('Carregando dados temporários...');
    
    try {
      // 1. Fetch ALL Staging Records (Chunked)
      const stagingRecords = [];
      let page = 0;
      while(true) {
         // Limit 1000 per page
         const res = await base44.entities.CompositionStaging.filter({ batch_id: currentBatchId, processado: false }, null, 1000, page * 1000);
         if (!res || res.length === 0) break;
         stagingRecords.push(...res);
         if (res.length < 1000) break;
         page++;
         setProgress(`Carregando staging... ${stagingRecords.length} registros`);
         await new Promise(r => setTimeout(r, 0));
      }

      if (stagingRecords.length === 0) {
         toast.success("Nenhum registro pendente.");
         return;
      }

      // 2. Analyze Codes
      const allItemCodes = new Set(stagingRecords.map(r => r.codigo_item));
      const allServiceCodes = new Set(stagingRecords.map(r => r.codigo_servico));
      
      setProgress(`Analisando ${allServiceCodes.size} serviços e ${allItemCodes.size} itens...`);
      
      // 3. Parallel Fetch Context (Inputs & Services)
      const [existingInputs, existingServices] = await Promise.all([
         fetchByCodes('Input', Array.from(allItemCodes)),
         fetchByCodes('Service', [...Array.from(allServiceCodes), ...Array.from(allItemCodes)])
      ]);

      const inputMap = new Map(existingInputs.map(i => [i.codigo, i]));
      const serviceMap = new Map(existingServices.map(s => [s.codigo, s]));

      // 4. PASS 1: Create/Update ALL Service Headers
      // This ensures we have IDs for everything (parents and child services)
      // Identify services that need creation (allServiceCodes)
      
      const servicesToCreate = [];
      const servicesToUpdate = [];

      // Group staging by Service Code to get descriptions
      const serviceDefinitions = {};
      stagingRecords.forEach(r => {
        if (!serviceDefinitions[r.codigo_servico]) {
           serviceDefinitions[r.codigo_servico] = {
              codigo: r.codigo_servico,
              descricao: r.descricao_servico,
              unidade: r.unidade_servico
           };
        }
      });

      for (const code of allServiceCodes) {
         const def = serviceDefinitions[code];
         if (serviceMap.has(code)) {
            servicesToUpdate.push({ id: serviceMap.get(code).id, data: def });
         } else {
            servicesToCreate.push({
               ...def,
               fonte: config.origem,
               data_base: config.data_base,
               custo_material: 0,
               custo_mao_obra: 0,
               custo_total: 0
            });
         }
      }

      setProgress(`Passo 1/3: Criando/Atualizando ${allServiceCodes.size} serviços...`);
      
      // Execute Creates
      if (servicesToCreate.length > 0) {
         // Create in chunks
         const chunk = 50;
         for (let i = 0; i < servicesToCreate.length; i += chunk) {
            const batch = servicesToCreate.slice(i, i + chunk);
            const created = await base44.entities.Service.bulkCreate(batch);
            if (created) created.forEach(s => serviceMap.set(s.codigo, s));
            setProgress(`Criando serviços... ${Math.min(i + chunk, servicesToCreate.length)}/${servicesToCreate.length}`);
         }
      }
      
      // Execute Updates (Async Background?)
      // We update descriptions/units. 
      if (servicesToUpdate.length > 0) {
         // Process in parallel batches
         await processBatches(servicesToUpdate, 20, s => base44.entities.Service.update(s.id, s.data));
      }

      // 5. PASS 2: Resolve Items & Create Placeholders
      // Check items that are NOT in inputMap and NOT in serviceMap
      const missingCodes = new Set();
      allItemCodes.forEach(code => {
         if (!inputMap.has(code) && !serviceMap.has(code)) {
            missingCodes.add(code);
         }
      });

      if (missingCodes.size > 0) {
         setProgress(`Passo 2/3: Criando ${missingCodes.size} itens ausentes (Placeholders)...`);
         // We create them as Services? Or Inputs?
         // Safer to create as Inputs if they are leaf nodes, but we don't know.
         // Let's create as Inputs with specific flag?
         // Actually, if it's missing, creating as Input is standard for "Material not found".
         const placeholders = Array.from(missingCodes).map(code => ({
            codigo: code,
            descricao: `[AUTO-GERADO] Item ${code}`,
            unidade: 'UN',
            valor_referencia: 0,
            fonte: 'SISTEMA',
            data_base: config.data_base
         }));

         for (let i = 0; i < placeholders.length; i += 100) {
            const batch = placeholders.slice(i, i + 100);
            const created = await base44.entities.Input.bulkCreate(batch);
            if (created) created.forEach(i => inputMap.set(i.codigo, i));
         }
      }

      // 6. PASS 3: Create Compositions
      setProgress(`Passo 3/3: Vinculando ${stagingRecords.length} composições...`);
      
      // First, delete OLD compositions for these services to avoid duplicates
      // We have all parent IDs in serviceMap
      // We can iterate parents and delete.
      // This might be slow if 5000 services.
      // Optim: Only delete if we are updating? Yes.
      // We already identified updates.
      const serviceIdsToClean = servicesToUpdate.map(u => u.id);
      
      // Batch delete old comps
      if (serviceIdsToClean.length > 0) {
         setProgress('Limpando composições antigas...');
         // Fetch all comps for these services (Chunked)
         // Assuming logic to bulk delete by ID or loop
         // We'll skip complex delete optimization for now and rely on user knowing this overwrites?
         // Better: Delete.
         // Fetch IDs
         const allCompsToDelete = [];
         const chunk = 100;
         for(let i=0; i<serviceIdsToClean.length; i+=chunk) {
             const batchIds = serviceIdsToClean.slice(i, i+chunk);
             try {
                const found = await base44.entities.ServiceComposition.filter({ servico_id: { "$in": batchIds } });
                allCompsToDelete.push(...found);
             } catch(e) {}
         }
         
         if (allCompsToDelete.length > 0) {
            await processBatches(allCompsToDelete, 50, c => base44.entities.ServiceComposition.delete(c.id));
         }
      }

      // Build New Compositions
      const compsToCreate = [];
      
      for (const r of stagingRecords) {
         const service = serviceMap.get(r.codigo_servico);
         if (!service) continue; // Should exist now

         // Determine Item Type and ID
         let itemType = 'INSUMO';
         let itemId = null;
         let itemCost = 0;
         let itemName = '';
         let itemUnit = '';

         if (inputMap.has(r.codigo_item)) {
            const i = inputMap.get(r.codigo_item);
            itemType = 'INSUMO';
            itemId = i.id;
            itemCost = i.valor_referencia;
            itemName = i.descricao;
            itemUnit = i.unidade;
         } else if (serviceMap.has(r.codigo_item)) {
            const s = serviceMap.get(r.codigo_item);
            itemType = 'SERVICO';
            itemId = s.id;
            itemCost = s.custo_total;
            itemName = s.descricao;
            itemUnit = s.unidade;
         }

         if (!itemId) continue; // Should not happen given placeholder logic

         // Cost Calc
         const qtd = r.quantidade || 0;
         const totalItem = qtd * itemCost;
         
         // Category
         let cat = 'MATERIAL';
         const u = (r.unidade_item || itemUnit || 'UN').toUpperCase();
         if (u.includes('H') || u.includes('HORA')) cat = 'MAO_DE_OBRA';

         compsToCreate.push({
            servico_id: service.id,
            tipo_item: itemType,
            item_id: itemId,
            quantidade: qtd,
            custo_unitario: itemCost,
            custo_total_item: totalItem,
            tipo_custo: cat,
            descricao_snapshot: itemName,
            unidade_snapshot: r.unidade_item || itemUnit,
            item_nome: itemName,
            unidade: r.unidade_item || itemUnit,
            nivel: itemType === 'SERVICO' ? 2 : 1
         });
      }

      // Bulk Insert Comps
      setProgress(`Inserindo ${compsToCreate.length} itens de composição...`);
      for (let i = 0; i < compsToCreate.length; i += 200) {
         await base44.entities.ServiceComposition.bulkCreate(compsToCreate.slice(i, i + 200));
         if (i % 2000 === 0) {
            setProgress(`Inserindo... ${i}/${compsToCreate.length}`);
            await new Promise(r => setTimeout(r, 0));
         }
      }

      // Mark Staging as Processed
      // Optional: Clean up staging table?
      // Or verify.
      // Let's mark.
      const stagingIds = stagingRecords.map(r => r.id);
      await processBatches(stagingIds, 50, id => base44.entities.CompositionStaging.delete(id)); // DELETE to keep table clean

      toast.success(`Importação realizada com sucesso! ${compsToCreate.length} itens processados.`);
      setProgress('Concluído.');
      
      // Optional: Prompt for Recalculation
      setTimeout(() => {
        if(confirm("Importação finalizada. Deseja recalcular os custos agora? (Recomendado)")) {
           window.location.href = '/Services'; // Or trigger logic
        }
      }, 500);

    } catch (e) {
      console.error(e);
      toast.error('Erro no processamento: ' + e.message);
      setProgress('Erro fatal.');
    } finally {
      setProcessing(false);
    }
  };

  const confirmImport = async () => {
    if (!file) return;
    
    // Validation
    const requiredFields = config.tipo === 'INSUMOS' 
      ? ['codigo', 'descricao', 'valor_referencia'] 
      : ['codigo_servico', 'codigo_item', 'quantidade'];
    
    const missing = requiredFields.filter(f => mappedColumns[f] === undefined);

    if (missing.length > 0) {
      toast.error(`Colunas obrigatórias não identificadas: ${missing.join(', ')}. Por favor, mapeie manualmente.`);
      return;
    }

    setProcessing(true);
    setProgress('Lendo arquivo...');
    
    const logEntries = [];
    let processed = 0;
    let inserted = 0;
    let updated = 0;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        const separator = lines[0].includes(';') ? ';' : ',';

        if (config.tipo === 'INSUMOS') {
          setProgress('Iniciando processamento de insumos...');
          
          // 1. Parse all lines to memory (Chunked)
          const parsedItems = [];
          const chunkSize = 1000;
          const totalLines = lines.length;

          for (let i = 1; i < totalLines; i += chunkSize) {
            const end = Math.min(i + chunkSize, totalLines);
            setProgress(`Lendo linhas ${i} a ${end} de ${totalLines}...`);
            await new Promise(r => setTimeout(r, 0)); // Yield to UI

            for (let j = i; j < end; j++) {
              const line = lines[j];
              if (!line.trim()) continue;
              const cols = line.split(separator).map(c => c.replace(/"/g, '').trim());
              
              const codigo = cols[mappedColumns['codigo']];
              const descricao = cols[mappedColumns['descricao']];
              
              if (!codigo || !descricao) continue;

              let valorStr = cols[mappedColumns['valor_referencia']];
              if (valorStr) {
                 valorStr = valorStr.replace('R$', '').trim();
                 if (valorStr.includes(',') && valorStr.includes('.')) {
                    valorStr = valorStr.replace(/\./g, '').replace(',', '.');
                 } else if (valorStr.includes(',')) {
                    valorStr = valorStr.replace(',', '.');
                 }
              }
              const valor = parseFloat(valorStr) || 0;
              const unidade = mappedColumns['unidade'] !== undefined ? cols[mappedColumns['unidade']] : 'UN';

              parsedItems.push({
                 codigo,
                 descricao: descricao.slice(0, 500),
                 unidade: unidade || 'UN',
                 valor_referencia: valor,
                 fonte: config.origem,
                 data_base: config.data_base,
                 data_atualizacao: new Date().toISOString()
              });
            }
          }

          // 2. Fetch existing items
          setProgress(`Verificando existência de ${parsedItems.length} insumos...`);
          const allCodes = parsedItems.map(i => i.codigo);
          const existingItems = await fetchByCodes('Input', allCodes);
          const existingMap = new Map(existingItems.map(i => [i.codigo, i]));

          // 3. Split
          const toCreate = [];
          const toUpdate = [];
          
          for (const item of parsedItems) {
             const existing = existingMap.get(item.codigo);
             if (existing) {
                toUpdate.push({ id: existing.id, data: item });
             } else {
                toCreate.push(item);
             }
             processed++;
          }

          // 4. Execute
          if (toCreate.length > 0) {
            setProgress(`Criando ${toCreate.length} novos insumos...`);
            // Bulk create in chunks of 50
            for (let i = 0; i < toCreate.length; i += 50) {
               await base44.entities.Input.bulkCreate(toCreate.slice(i, i + 50));
               inserted += Math.min(50, toCreate.length - i);
               setProgress(`Criando insumos... ${inserted}/${toCreate.length}`);
            }
          }

          if (toUpdate.length > 0) {
            setProgress(`Atualizando ${toUpdate.length} insumos...`);
            await processBatches(toUpdate, 10, async (item) => {
               await base44.entities.Input.update(item.id, item.data);
               updated++;
            });
          }

        } else if (config.tipo === 'COMPOSICOES') {
          // New "Ordered Import" Logic
          setProgress('Lendo arquivo de composições...');
          
          const newBatchId = new Date().getTime().toString();
          setBatchId(newBatchId);
          
          // 1. Ingest to CompositionStaging (Chunked)
          const stagingItems = [];
          const chunkSize = 1000;
          const totalLines = lines.length;

          for (let i = 1; i < totalLines; i += chunkSize) {
            const end = Math.min(i + chunkSize, totalLines);
            setProgress(`Analisando linhas ${i} a ${end} de ${totalLines}...`);
            await new Promise(r => setTimeout(r, 0)); // Yield

            for (let j = i; j < end; j++) {
              const line = lines[j];
              if (!line.trim()) continue;
              const cols = line.split(separator).map(c => c.replace(/"/g, '').trim());
              
              const codServ = cols[mappedColumns['codigo_servico']];
              const codItem = cols[mappedColumns['codigo_item']];
              
              if (!codServ || !codItem) continue;
              
              let qtdStr = cols[mappedColumns['quantidade']];
              if (qtdStr) qtdStr = qtdStr.replace(',', '.');
              const quantidade = parseFloat(qtdStr) || 0;

              const descServ = mappedColumns['descricao_servico'] ? cols[mappedColumns['descricao_servico']] : `Serviço ${codServ}`;
              const unidServ = mappedColumns['unidade_servico'] ? cols[mappedColumns['unidade_servico']] : 'UN';
              const unidItem = mappedColumns['unidade_item'] ? cols[mappedColumns['unidade_item']] : '';
              
              stagingItems.push({
                batch_id: newBatchId,
                codigo_servico: codServ,
                descricao_servico: descServ,
                unidade_servico: unidServ,
                codigo_item: codItem,
                tipo_item: 'INSUMO', // Placeholder, will resolve in logic
                quantidade,
                unidade_item: unidItem,
                processado: false
              });
            }
          }

          setProgress(`Enviando ${stagingItems.length} registros para tabela temporária...`);
          
          // Bulk Insert Staging in chunks
          // Using a larger chunk size for insert might be better for network, but let's keep progress smooth
          const insertChunkSize = 200; 
          for (let i = 0; i < stagingItems.length; i += insertChunkSize) {
             const batch = stagingItems.slice(i, i + insertChunkSize);
             await base44.entities.CompositionStaging.bulkCreate(batch);
             processed += batch.length;
             // Update progress every 1000 items to avoid UI flicker
             if (i % 1000 === 0 || i + insertChunkSize >= stagingItems.length) {
                setProgress(`Upload de registros... ${processed}/${stagingItems.length}`);
                await new Promise(r => setTimeout(r, 0));
             }
          }

          // Trigger Processing
          await processStaging(newBatchId);
        }

        // 5. Finalize
        await base44.entities.ImportLog.create({
          data_importacao: new Date().toISOString(),
          origem: config.origem,
          tipo: config.tipo,
          nome_arquivo: file.name,
          linhas_processadas: processed,
          linhas_inseridas: inserted,
          linhas_atualizadas: updated,
          usuario_responsavel: (await base44.auth.me())?.full_name || 'Usuário',
          log_inconsistencias: logEntries.join('\n').slice(0, 5000)
        });

        setProcessing(false);
        setProgress('Importação concluída com sucesso!');
        toast.success('Importação finalizada!');
        setLogs(logEntries);
        setFile(null);
        setPreviewData([]);
        if (fileInputRef.current) fileInputRef.current.value = '';

      } catch (err) {
        console.error(err);
        toast.error('Erro na importação: ' + err.message);
        setProcessing(false);
      }
    };
    
    reader.onerror = () => { toast.error('Erro ao ler arquivo'); setProcessing(false); };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const getRequiredFields = () => config.tipo === 'INSUMOS' 
    ? ['codigo', 'descricao', 'valor_referencia', 'unidade'] 
    : ['codigo_servico', 'descricao_servico', 'unidade_servico', 'codigo_item', 'quantidade', 'unidade_item'];

  const handleMapChange = (field, colIndex) => {
     setMappedColumns(prev => ({...prev, [field]: parseInt(colIndex)}));
  };

  return (
    <div className="pb-20">
      <PageHeader
        title="Importação de Tabelas"
        subtitle="Importe insumos e composições do SINAPI, TCPO e outras fontes"
        icon={UploadCloud}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuração da Importação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Arquivo (CSV ou TXT)</Label>
                <div className="mt-2">
                  <Input 
                    ref={fileInputRef}
                    type="file" 
                    accept=".csv,.txt" 
                    onChange={handleFileChange} 
                    disabled={processing}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Formatos suportados: CSV separado por vírgula ou ponto e vírgula.
                  </p>
                </div>
              </div>

              <div>
                <Label>Origem dos Dados</Label>
                <Select 
                  value={config.origem} 
                  onValueChange={(v) => setConfig(prev => ({...prev, origem: v}))}
                  disabled={processing}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINAPI">SINAPI</SelectItem>
                    <SelectItem value="TCPO">TCPO</SelectItem>
                    <SelectItem value="CDHU">CDHU</SelectItem>
                    <SelectItem value="OUTROS">OUTROS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipo de Tabela</Label>
                <Select 
                  value={config.tipo} 
                  onValueChange={(v) => setConfig(prev => ({...prev, tipo: v}))}
                  disabled={processing}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INSUMOS">Insumos (Materiais/MO)</SelectItem>
                    <SelectItem value="COMPOSICOES">Composições de Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Data Base (MM/AAAA)</Label>
                <Input
                  value={config.data_base}
                  onChange={(e) => setConfig(prev => ({...prev, data_base: e.target.value}))}
                  disabled={processing}
                  placeholder="Ex: 09/2025"
                />
              </div>

              {config.tipo === 'COMPOSICOES' && (
                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-slate-50">
                  <Checkbox 
                    id="updateBudgets" 
                    checked={config.updateBudgets}
                    onCheckedChange={(v) => setConfig(prev => ({...prev, updateBudgets: v}))}
                    disabled={processing}
                  />
                  <Label htmlFor="updateBudgets" className="text-sm font-normal">
                    Atualizar orçamentos existentes
                  </Label>
                </div>
              )}

              {!processing ? (
                <div className="space-y-2">
                  <Button className="w-full" onClick={processFile} disabled={!file}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Ler Arquivo e Pré-visualizar
                  </Button>
                </div>
              ) : (
                <div className="bg-blue-50 p-4 rounded-lg flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-2" />
                  <p className="text-sm font-medium text-blue-800">{progress}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-amber-600 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Inconsistências ({logs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-60 overflow-y-auto text-xs bg-slate-50 p-2 font-mono">
                {logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {previewData.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Pré-visualização (20 primeiras linhas)</CardTitle>
                <Button onClick={confirmImport} disabled={processing} className="bg-green-600 hover:bg-green-700">
                  <Save className="h-4 w-4 mr-2" />
                  Confirmar Importação
                </Button>
              </CardHeader>
              <CardContent>
                <Alert className="mb-4 bg-blue-50 border-blue-200">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <AlertTitle>Mapeamento Automático</AlertTitle>
                  <AlertDescription className="text-xs text-blue-700 mt-1">
                    Verifique se todas as colunas foram mapeadas corretamente. Caso contrário, ajuste manualmente abaixo.
                  </AlertDescription>
                </Alert>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-50 p-4 rounded-lg border">
                  {getRequiredFields().map(field => (
                     <div key={field}>
                        <Label className="text-xs font-semibold uppercase text-slate-500 mb-1 block">
                          {field.replace('_', ' ')} {['codigo','descricao','valor_referencia','codigo_servico','codigo_item','quantidade'].includes(field) && '*'}
                        </Label>
                        <Select 
                           value={mappedColumns[field] !== undefined ? String(mappedColumns[field]) : ''}
                           onValueChange={(v) => handleMapChange(field, v)}
                        >
                           <SelectTrigger className="h-8 text-xs bg-white">
                              <SelectValue placeholder="Selecione a coluna..." />
                           </SelectTrigger>
                           <SelectContent>
                              {headers.map((h, i) => (
                                 <SelectItem key={i} value={String(i)}>{i + 1}: {h}</SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                  ))}
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        {headers.map((h, i) => (
                          <TableHead key={i} className="whitespace-nowrap px-3 py-2 text-xs">
                            {h}
                            {Object.entries(mappedColumns).find(([k, v]) => v === i) && (
                              <span className="block text-[10px] text-blue-600 font-bold uppercase">
                                [{Object.entries(mappedColumns).find(([k, v]) => v === i)[0]}]
                              </span>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j} className="whitespace-nowrap px-3 py-2 text-xs">
                              {cell}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {!previewData.length && !processing && (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed rounded-xl bg-slate-50/50">
              <UploadCloud className="h-12 w-12 mb-3 opacity-50" />
              <p>Carregue um arquivo para visualizar os dados</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}