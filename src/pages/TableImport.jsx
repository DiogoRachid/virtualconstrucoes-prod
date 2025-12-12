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

// Helper for batch processing to avoid rate limits
const processBatches = async (items, batchSize, fn) => {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
    // Add a significant delay between batches
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, 1000)); 
  }
};

export default function TableImport() {
  const [file, setFile] = useState(null);
  const [config, setConfig] = useState({
    origem: 'SINAPI',
    tipo: 'INSUMOS', // INSUMOS or COMPOSICOES
    updateBudgets: false
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
      if (['VALOR_UNIT', 'CUSTO_UNIT', 'PRECO_UNIT'].some(x => h.includes(x))) return 'custo_unitario';
      if (['TIPO', 'TIPO_ITEM'].some(x => h.includes(x))) return 'tipo_item'; // Material/Mão de Obra
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
    try {

    setProgress('Iniciando importação... Isso pode levar alguns minutos.');
    const logEntries = [];
    let processed = 0;
    let inserted = 0;
    let updated = 0;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const lines = text.split('\n');
      const separator = lines[0].includes(';') ? ';' : ',';

      // Load existing data for caching to avoid N+1 queries per line
      setProgress('Carregando dados existentes...');
      let existingInputs = [];
      let existingServices = [];
      
      try {
        if (config.tipo === 'INSUMOS') {
          existingInputs = await base44.entities.Input.list();
        } else {
          existingServices = await base44.entities.Service.list();
          existingInputs = await base44.entities.Input.list();
        }
      } catch (err) {
        console.error("Erro ao carregar dados", err);
      }

      const inputsMap = new Map(existingInputs.map(i => [i.codigo, i]));
      const servicesMap = new Map(existingServices.map(s => [s.codigo, s]));
      
      // Process Data
      setProgress('Processando registros...');
      
      if (config.tipo === 'INSUMOS') {
        const toCreate = [];
        const toUpdate = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;
          
          const cols = line.split(separator).map(c => c.replace(/"/g, '').trim());
          const codigo = cols[mappedColumns['codigo']];
          const descricao = cols[mappedColumns['descricao']];
          const unidade = mappedColumns['unidade'] !== undefined ? cols[mappedColumns['unidade']] : 'UN';
          
          // Parse Value: handle 1.000,00 or 1000.00
          let valorStr = cols[mappedColumns['valor_referencia']];
          if (valorStr) {
             valorStr = valorStr.replace('R$', '').trim();
             if (valorStr.includes(',') && valorStr.includes('.')) {
                // assume 1.000,00 format -> replace . with nothing, , with .
                valorStr = valorStr.replace(/\./g, '').replace(',', '.');
             } else if (valorStr.includes(',')) {
                valorStr = valorStr.replace(',', '.');
             }
          }
          const valor = parseFloat(valorStr) || 0;

          if (!codigo || !descricao) {
            logEntries.push(`Linha ${i + 1}: Código ou descrição faltando.`);
            continue;
          }

          const existing = inputsMap.get(codigo);
          const data = {
            codigo,
            descricao: descricao.slice(0, 500), 
            unidade: unidade || 'UN',
            valor_referencia: valor,
            fonte: config.origem,
            data_atualizacao: new Date().toISOString()
          };

          if (existing) {
            toUpdate.push({ id: existing.id, data });
          } else {
            toCreate.push(data);
          }
          processed++;
        }

        // Bulk Insert
        if (toCreate.length > 0) {
          setProgress(`Criando ${toCreate.length} novos insumos...`);
          for (let i = 0; i < toCreate.length; i += 50) {
            const chunk = toCreate.slice(i, i + 50);
            await base44.entities.Input.bulkCreate(chunk);
            inserted += chunk.length;
            setProgress(`Criando insumos... ${Math.min(i + 50, toCreate.length)}/${toCreate.length}`);
            await new Promise(r => setTimeout(r, 500));
          }
        }

        // Batch Update
        if (toUpdate.length > 0) {
          setProgress(`Atualizando ${toUpdate.length} insumos existentes...`);
          await processBatches(toUpdate, 5, async (item) => {
            await base44.entities.Input.update(item.id, item.data);
            updated++;
          });
        }
      } 
      else if (config.tipo === 'COMPOSICOES') {
        // Strategy: Group by Service Code first
        const serviceGroups = {};
        
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
          
          // Parse quantity
          let qtdStr = cols[mappedColumns['quantidade']];
          if (qtdStr) qtdStr = qtdStr.replace(',', '.');
          const quantidade = parseFloat(qtdStr) || 0;

          // Parse unit cost if available
          let costStr = mappedColumns['custo_unitario'] ? cols[mappedColumns['custo_unitario']] : '0';
          if (costStr) costStr = costStr.replace(',', '.');
          const custoUnit = parseFloat(costStr) || 0;

          serviceGroups[codServ].items.push({
            codItem: cols[mappedColumns['codigo_item']],
            quantidade,
            custoUnit,
            tipo: mappedColumns['tipo_item'] ? cols[mappedColumns['tipo_item']] : 'MATERIAL'
          });
        }

        // Process Groups
        const serviceCodes = Object.keys(serviceGroups);
        let count = 0;
        
        // Batch process services to respect rate limits
        await processBatches(serviceCodes, 1, async (codServ) => {
          count++;
          if (count % 10 === 0) setProgress(`Processando serviços... ${count}/${serviceCodes.length}`);
          
          const group = serviceGroups[codServ];
          let service = servicesMap.get(codServ);
          
          // 1. Ensure Service Exists
          if (!service) {
            service = await base44.entities.Service.create({
              codigo: codServ,
              descricao: group.descricao,
              unidade: group.unidade,
              fonte: config.origem,
              custo_material: 0,
              custo_mao_obra: 0,
              custo_total: 0
            });
            servicesMap.set(codServ, service);
            inserted++;
          } else {
             await base44.entities.Service.update(service.id, {
                descricao: group.descricao,
                unidade: group.unidade,
                fonte: config.origem
             });
             updated++;
          }

          // 2. Process Items
          // Clean existing items
          const oldComps = await base44.entities.ServiceComposition.filter({ servico_id: service.id });
          if (oldComps.length > 0) {
             // Batch delete in chunks of 5
             await processBatches(oldComps, 5, async (c) => base44.entities.ServiceComposition.delete(c.id));
          }

          let totalMat = 0;
          let totalMO = 0;
          const compsToCreate = [];

          for (const item of group.items) {
            let itemId;
            let itemType = 'INSUMO';
            let itemCost = item.custoUnit;

            let input = inputsMap.get(item.codItem);
            if (input) {
              itemId = input.id;
              if (itemCost === 0) itemCost = input.valor_referencia;
            } else {
              // Try service
              const subService = servicesMap.get(item.codItem);
              if (subService) {
                itemId = subService.id;
                itemType = 'SERVICO';
                if (itemCost === 0) itemCost = subService.custo_total;
              } else {
                // Create missing Input placeholder (immediately to reuse ID)
                const newInput = await base44.entities.Input.create({
                  codigo: item.codItem,
                  descricao: `ITEM IMPORTADO ${item.codItem}`,
                  unidade: 'UN',
                  valor_referencia: itemCost,
                  fonte: config.origem,
                  data_atualizacao: new Date().toISOString()
                });
                inputsMap.set(item.codItem, newInput);
                itemId = newInput.id;
                input = newInput;
                logEntries.push(`Aviso: Item ${item.codItem} não existia e foi criado automaticamente.`);
              }
            }
            
            let costType = 'MATERIAL';
            if (item.tipo && (item.tipo.toUpperCase().includes('MAO') || item.tipo.toUpperCase().includes('MO') || item.tipo.toUpperCase().includes('HORA'))) {
               costType = 'MAO_DE_OBRA';
            }

            const totalItem = item.quantidade * itemCost;
            
            compsToCreate.push({
              servico_id: service.id,
              tipo_item: itemType,
              item_id: itemId,
              item_nome: input ? input.descricao : (itemType === 'SERVICO' ? 'Serviço Auxiliar' : 'Item'),
              unidade: input ? input.unidade : 'UN',
              quantidade: item.quantidade,
              custo_unitario: itemCost,
              custo_total_item: totalItem,
              tipo_custo: costType
            });

            if (costType === 'MATERIAL') totalMat += totalItem;
            else totalMO += totalItem;
          }
          
          if (compsToCreate.length > 0) {
             await base44.entities.ServiceComposition.bulkCreate(compsToCreate);
          }

          // 3. Update Service Totals
          await base44.entities.Service.update(service.id, {
            custo_material: totalMat,
            custo_mao_obra: totalMO,
            custo_total: totalMat + totalMO
          });
          processed++;
        });
      }

      // Update Budgets if requested
      if (config.updateBudgets) {
        setProgress('Recalculando orçamentos...');
        // Logic to find budgets that use updated services and recalculate them
        // Fetch all budgets? Or filter?
        // Simple approach: Fetch all budgets in 'rascunho' or 'revisado'?
        // Prompt says "opção não atualizar orçamentos antigos". Default implies updating everything?
        // Let's only update active budgets or all.
        
        // This is complex and potentially heavy. We will iterate all BudgetItems, check if their service was updated, and update the item.
        // Optimization: Get IDs of updated services (we didn't track them strictly above, but we can assume mostly all if large import)
        // Or just fetch all BudgetItems.
        
        const budgetItems = await base44.entities.BudgetItem.list(); // Warning: Limit might apply
        let budgetsAffected = new Set();
        
        for (const bi of budgetItems) {
           const service = servicesMap.get(bi.codigo); // Assuming bi.codigo is service code, or link via servico_id
           // Ideally link via ID, but import uses Codes.
           // Let's use servico_id if valid.
           let currentService = null;
           if (bi.servico_id) {
              // We need to fetch service to get new cost. 
              // We can't use servicesMap values if they are old objects, but we updated them in DB.
              // Actually we updated servicesMap values in memory? No, only servicesMap.set(cod, service) on creation.
              // We need to re-fetch or trust that we updated the DB.
              // Let's assume we need to re-fetch the service for this item.
              const freshService = await base44.entities.Service.filter({id: bi.servico_id}).then(r => r[0]);
              currentService = freshService;
           }

           if (currentService && Math.abs(currentService.custo_total - bi.custo_unitario_total) > 0.01) {
              // Update Item
              const custoDiretoTotal = currentService.custo_total * bi.quantidade;
              const bdiMult = 1 + (bi.bdi_percentual / 100);
              const subtotal = custoDiretoTotal * bdiMult;
              
              await base44.entities.BudgetItem.update(bi.id, {
                 custo_unitario_material: currentService.custo_material,
                 custo_unitario_mao_obra: currentService.custo_mao_obra,
                 custo_unitario_total: currentService.custo_total,
                 custo_direto_total: custoDiretoTotal,
                 custo_com_bdi_unitario: currentService.custo_total * bdiMult,
                 subtotal: subtotal
              });
              budgetsAffected.add(bi.orcamento_id);
           }
        }
        
        // Recalculate Budget Totals for affected budgets
        for (const budgetId of budgetsAffected) {
           const items = await base44.entities.BudgetItem.filter({orcamento_id: budgetId});
           const totalMat = items.reduce((sum, i) => sum + (i.custo_unitario_material * i.quantidade), 0);
           const totalMO = items.reduce((sum, i) => sum + (i.custo_unitario_mao_obra * i.quantidade), 0);
           const totalDireto = items.reduce((sum, i) => sum + i.custo_direto_total, 0);
           const totalFinal = items.reduce((sum, i) => sum + i.subtotal, 0);
           const totalBDI = totalFinal - totalDireto;
           
           await base44.entities.Budget.update(budgetId, {
              total_material: totalMat,
              total_mao_obra: totalMO,
              total_direto: totalDireto,
              total_bdi: totalBDI,
              total_final: totalFinal,
              data_atualizacao: new Date().toISOString()
           });
        }
      }

      // Log Creation
      await base44.entities.ImportLog.create({
        data_importacao: new Date().toISOString(),
        origem: config.origem,
        tipo: config.tipo,
        nome_arquivo: file.name,
        linhas_processadas: processed,
        linhas_inseridas: inserted,
        linhas_atualizadas: updated,
        usuario_responsavel: (await base44.auth.me())?.full_name || 'Usuário',
        log_inconsistencias: logEntries.join('\n').slice(0, 5000) // Truncate if too long
      });

      setProcessing(false);
      setProgress('Importação concluída com sucesso!');
      toast.success('Importação finalizada!');
      setLogs(logEntries);
      
      // Cleanup
      setFile(null);
      setPreviewData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
       toast.error('Erro ao ler o arquivo.');
       setProcessing(false);
    };
    reader.readAsText(file, 'ISO-8859-1');
    } catch (error) {
       console.error(error);
       toast.error('Erro ao iniciar importação: ' + error.message);
       setProcessing(false);
    }
  };

  // Manual Mapping
  const getRequiredFields = () => config.tipo === 'INSUMOS' 
    ? ['codigo', 'descricao', 'valor_referencia', 'unidade'] 
    : ['codigo_servico', 'descricao_servico', 'unidade_servico', 'codigo_item', 'quantidade', 'custo_unitario', 'tipo_item'];

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