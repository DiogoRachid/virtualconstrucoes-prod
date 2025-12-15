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

// Helper to fetch entities by codes in chunks
const fetchByCodes = async (entity, codes) => {
  const uniqueCodes = [...new Set(codes.filter(Boolean))];
  const results = [];
  const chunkSize = 100; // Safe limit for $in query
  
  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    const chunk = uniqueCodes.slice(i, i + chunkSize);
    try {
      // Use $in query
      const found = await base44.entities[entity].filter({
        codigo: { "$in": chunk }
      }, null, 1000); // Set high limit for the chunk result
      results.push(...found);
    } catch (e) {
      console.error(`Error fetching ${entity} chunk`, e);
    }
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
          setProgress('Processando linhas de insumos...');
          
          // 1. Parse all lines to memory
          const parsedItems = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
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
          setProgress('Processando arquivo de composições...');
          
          // 1. Group by Service
          const serviceGroups = {};
          const allItemCodes = new Set();
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            const cols = line.split(separator).map(c => c.replace(/"/g, '').trim());
            
            const codServ = cols[mappedColumns['codigo_servico']];
            if (!codServ) continue;
            
            if (!serviceGroups[codServ]) {
              serviceGroups[codServ] = {
                descricao: mappedColumns['descricao_servico'] ? cols[mappedColumns['descricao_servico']] : `Serviço ${codServ}`,
                unidade: mappedColumns['unidade_servico'] ? cols[mappedColumns['unidade_servico']] : 'UN',
                items: []
              };
            }
            
            let qtdStr = cols[mappedColumns['quantidade']];
            if (qtdStr) qtdStr = qtdStr.replace(',', '.');
            const quantidade = parseFloat(qtdStr) || 0;
            
            const codItem = cols[mappedColumns['codigo_item']];
            if (codItem) allItemCodes.add(codItem);

            serviceGroups[codServ].items.push({
              codItem,
              quantidade,
              unidade: mappedColumns['unidade_item'] ? cols[mappedColumns['unidade_item']] : ''
            });
          }

          const serviceCodes = Object.keys(serviceGroups);
          setProgress(`Encontrados ${serviceCodes.length} serviços com composições.`);

          // 2. Fetch Context Data (Services & Inputs)
          setProgress('Carregando dados relacionados...');
          
          const existingServices = await fetchByCodes('Service', serviceCodes);
          const servicesMap = new Map(existingServices.map(s => [s.codigo, s]));
          
          // Fetch inputs referenced in items
          // If 55k items, allItemCodes might be large.
          const existingInputs = await fetchByCodes('Input', Array.from(allItemCodes));
          const inputsMap = new Map(existingInputs.map(i => [i.codigo, i]));
          
          // We also need to check if items are sub-services.
          // We can fetch services by item codes too.
          const potentialSubServices = await fetchByCodes('Service', Array.from(allItemCodes));
          const subServicesMap = new Map(potentialSubServices.map(s => [s.codigo, s]));

          // 3. Create missing Services Headers first
          const missingServices = serviceCodes.filter(c => !servicesMap.has(c));
          if (missingServices.length > 0) {
             setProgress(`Criando ${missingServices.length} serviços ausentes...`);
             const newServicesData = missingServices.map(code => ({
                codigo: code,
                descricao: serviceGroups[code].descricao,
                unidade: serviceGroups[code].unidade,
                fonte: config.origem,
                custo_material: 0, 
                custo_mao_obra: 0,
                custo_total: 0,
                data_base: config.data_base
             }));
             
             // Create in batches and update map
             for (let i = 0; i < newServicesData.length; i += 50) {
                const batch = newServicesData.slice(i, i + 50);
                // bulkCreate returns array of created items? Assuming yes or we fetch them.
                // Base44 bulkCreate returns the created items usually.
                try {
                  const created = await base44.entities.Service.bulkCreate(batch);
                  if (created) {
                     created.forEach(s => servicesMap.set(s.codigo, s));
                  }
                } catch(e) {
                   // Fallback if bulk fails or not supported (it is supported per instructions)
                   console.error('Bulk create failed', e);
                }
                inserted += batch.length;
             }
             // Re-fetch to be sure we have IDs if bulkCreate didn't return them properly
             // (Optimistic approach: assume it worked. If map missing, we fail later)
             const reFetch = await fetchByCodes('Service', missingServices);
             reFetch.forEach(s => servicesMap.set(s.codigo, s));
          }

          // 4. Process Compositions per Service
          let processedCount = 0;
          
          // Chunk services to process
          const serviceCodeChunks = [];
          for (let i = 0; i < serviceCodes.length; i += 20) {
             serviceCodeChunks.push(serviceCodes.slice(i, i + 20));
          }

          for (const chunk of serviceCodeChunks) {
             // Fetch all existing compositions for these services to delete them
             const serviceIds = chunk.map(c => servicesMap.get(c)?.id).filter(Boolean);
             
             if (serviceIds.length > 0) {
                try {
                   // This $in might be heavy if many comps, but usually manageable for 20 services
                   const oldComps = await base44.entities.ServiceComposition.filter({
                      servico_id: { "$in": serviceIds }
                   }, null, 10000); 
                   
                   // Delete old comps in parallel
                   if (oldComps.length > 0) {
                      await processBatches(oldComps, 20, c => base44.entities.ServiceComposition.delete(c.id));
                   }
                } catch (e) { console.error('Error clearing old comps', e); }
             }

             // Build new compositions
             const newCompsToCreate = [];
             const serviceUpdates = [];

             for (const code of chunk) {
                const service = servicesMap.get(code);
                if (!service) continue;
                const group = serviceGroups[code];
                
                let totalMat = 0;
                let totalMO = 0;

                for (const item of group.items) {
                   let itemId;
                   let itemType = 'INSUMO';
                   let itemCost = 0;
                   let itemName = '';

                   let input = inputsMap.get(item.codItem);
                   if (input) {
                      itemId = input.id;
                      itemCost = input.valor_referencia;
                      itemName = input.descricao;
                   } else {
                      // Try to find in sub-services (DB) OR in the current services map (which includes newly created services in this batch)
                      let sub = subServicesMap.get(item.codItem) || servicesMap.get(item.codItem);
                      
                      if (sub) {
                         itemId = sub.id;
                         itemType = 'SERVICO';
                         itemCost = sub.custo_total;
                         itemName = sub.descricao;
                      } else {
                         // Missing item -> Log and Skip
                         logEntries.push(`Item ${item.codItem} não encontrado (nem insumo nem serviço) para o serviço ${code}`);
                         continue;
                      }
                   }

                   // Cost Type
                   let costType = 'MATERIAL';
                   const u = (item.unidade || (input ? input.unidade : 'UN')).toUpperCase();
                   if (u.includes('H') || u.includes('HORA')) costType = 'MAO_DE_OBRA';

                   const totalItem = Math.round((item.quantidade * itemCost) * 100) / 100;

                   newCompsToCreate.push({
                      servico_id: service.id,
                      tipo_item: itemType,
                      item_id: itemId,
                      // New Snapshot Fields
                      descricao_snapshot: itemName || (itemType === 'SERVICO' ? 'Serviço Auxiliar' : 'Insumo'),
                      unidade_snapshot: item.unidade || u,
                      custo_unitario: itemCost, // This acts as snapshot too
                      
                      // Legacy Fields
                      item_nome: itemName || (itemType === 'SERVICO' ? 'Serviço Auxiliar' : 'Insumo'),
                      unidade: item.unidade || u,
                      
                      quantidade: item.quantidade,
                      custo_total_item: totalItem,
                      tipo_custo: costType,
                      nivel: itemType === 'SERVICO' ? 2 : 1 // Simple assumption for import. Logic Engine will fix later.
                   });

                   if (costType === 'MATERIAL') totalMat += totalItem;
                   else totalMO += totalItem;
                }

                // Prepare service update
                serviceUpdates.push({
                   id: service.id,
                   data: {
                      custo_material: totalMat,
                      custo_mao_obra: totalMO,
                      custo_total: totalMat + totalMO,
                      data_base: config.data_base
                   }
                });
                
                processed++;
                processedCount++;
             }

             // Execute Bulk Create Comps
             if (newCompsToCreate.length > 0) {
                // Chunk to 100
                for (let k = 0; k < newCompsToCreate.length; k += 100) {
                   await base44.entities.ServiceComposition.bulkCreate(newCompsToCreate.slice(k, k+100));
                }
             }

             // Execute Service Updates
             await processBatches(serviceUpdates, 10, s => base44.entities.Service.update(s.id, s.data));
             
             updated += serviceUpdates.length;
             setProgress(`Processando serviços... ${processedCount}/${serviceCodes.length}`);
          }
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