import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { UploadCloud, Loader2, Database, Play } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';

const fetchAllRecords = async (entity) => {
  const limit = 1000;
  let all = [];
  let skip = 0;
  while (true) {
    const batch = await entity.list('created_date', limit, skip);
    all = all.concat(batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return all;
};

// Executa atualizações em paralelo com limite de concorrência
const batchUpdate = async (items, updateFn, concurrency = 20, onProgress) => {
  let done = 0;
  const results = { success: 0, error: 0 };

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const promises = chunk.map(item =>
      updateFn(item).then(() => { results.success++; }).catch(() => { results.error++; })
    );
    await Promise.all(promises);
    done += chunk.length;
    if (onProgress) onProgress(done, items.length);
  }

  return results;
};

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
    if (val.includes('E')) { val = val.replace(',', '.'); return parseFloat(val) || 0; }
    if (val.includes(',')) { return parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0; }
    return parseFloat(val) || 0;
  };

  const parseCurrency = (str) => {
    if (!str) return 0;
    let val = str.trim().replace(/R\$\s*/g, '').replace(/"/g, '').replace(/\s/g, '');
    if (!val) return 0;
    if (val.includes(',')) { val = val.replace(/\./g, '').replace(',', '.'); }
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
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      toast.error("Erro no upload: " + err.message);
    } finally {
      setLoading(false);
      setProgress({ message: '', percent: 0 });
    }
  };

  const processInputsDirectly = async (lines, separator) => {
    setProgress({ message: 'Lendo insumos existentes...', percent: 5 });
    const allInputs = await fetchAllRecords(base44.entities.Input);
    const inputMapByCodigo = new Map(allInputs.map(i => [i.codigo?.trim(), i]));

    const creates = [];
    const updates = [];   // nova data_base: salvar histórico + atualizar
    const sameBase = [];  // mesma data_base: só atualizar valor
    let skipped = 0;

    setProgress({ message: 'Analisando linhas...', percent: 15 });

    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(separator).map(c => c?.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) continue;

      const codigo = cols[0]?.trim();
      const descricao = cols[1]?.trim();
      const unidade = cols[2]?.trim();
      const valorStr = cols[3];

      if (!codigo || /^c[oó]d/i.test(codigo)) { skipped++; continue; }

      let categoria = detectCategory(unidade);
      let dataBase = '';
      let fonte = 'PROPRIA';

      if (hasCategoryColumn) {
        const catRaw = (cols[4] || '').toUpperCase().trim();
        if (catRaw.startsWith('MAO') || catRaw.startsWith('MÃO') || catRaw === 'MO') categoria = 'MAO_OBRA';
        else if (catRaw.startsWith('MAT') || catRaw === 'M') categoria = 'MATERIAL';
        dataBase = cols[5]?.trim() || '';
        fonte = cols[6]?.trim() || 'PROPRIA';
      } else {
        dataBase = cols[4]?.trim() || '';
        fonte = cols[5]?.trim() || 'PROPRIA';
      }

      const valor = parseCurrency(valorStr);
      const newData = {
        codigo,
        descricao: (descricao || codigo).slice(0, 500),
        unidade: unidade || 'UN',
        valor_unitario: valor,
        categoria,
        data_base: dataBase,
        fonte,
      };

      const existing = inputMapByCodigo.get(codigo);
      if (!existing) {
        creates.push(newData);
      } else if (existing.data_base === dataBase) {
        sameBase.push({ id: existing.id, data: newData });
      } else {
        updates.push({ id: existing.id, data: newData, oldValue: existing.valor_unitario, oldDataBase: existing.data_base, insumoId: existing.id });
      }
    }

    const total = creates.length + updates.length + sameBase.length;
    if (total === 0) {
      toast.error('Nenhum insumo válido encontrado. Verifique o formato (separador, colunas).');
      return;
    }

    // --- Criar novos insumos ---
    if (creates.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < creates.length; i += CHUNK) {
        await base44.entities.Input.bulkCreate(creates.slice(i, i + CHUNK));
        setProgress({
          message: `Criando insumos... ${Math.min(i + CHUNK, creates.length)}/${creates.length}`,
          percent: 20 + Math.floor(((i + CHUNK) / creates.length) * 15)
        });
      }
    }

    // --- Atualizar com nova data_base: salvar histórico + atualizar ---
    if (updates.length > 0) {
      setProgress({ message: 'Verificando histórico existente...', percent: 35 });
      const existingHistory = await fetchAllRecords(base44.entities.InputPriceHistory);
      const existingHistorySet = new Set(existingHistory.map(h => `${h.insumo_id}|${h.data_base}`));

      // Salvar histórico dos valores ANTERIORES
      const historicos = updates
        .filter(u => u.oldDataBase && u.oldValue != null && !existingHistorySet.has(`${u.insumoId}|${u.oldDataBase}`))
        .map(u => ({
          insumo_id: u.insumoId,
          codigo: u.data.codigo,
          descricao: u.data.descricao,
          unidade: u.data.unidade,
          valor_unitario: u.oldValue,
          data_base: u.oldDataBase,
          categoria: u.data.categoria,
          fonte: u.data.fonte
        }));

      for (let i = 0; i < historicos.length; i += 100) {
        await base44.entities.InputPriceHistory.bulkCreate(historicos.slice(i, i + 100));
        setProgress({
          message: `Salvando histórico... ${Math.min(i + 100, historicos.length)}/${historicos.length}`,
          percent: 38 + Math.floor(((i + 100) / Math.max(historicos.length, 1)) * 12)
        });
      }

      // Atualizar insumos via parallel batch (sem backend)
      setProgress({ message: `Atualizando ${updates.length} insumos (nova data base)...`, percent: 50 });
      const { success, error } = await batchUpdate(
        updates,
        (u) => base44.entities.Input.update(u.id, u.data),
        20,
        (done, total) => setProgress({
          message: `Atualizando insumos... ${done}/${total}`,
          percent: 50 + Math.floor((done / total) * 25)
        })
      );
      if (error > 0) toast.warning(`${error} insumos falharam na atualização.`);
    }

    // --- Atualizar mesma data_base (re-importação) ---
    if (sameBase.length > 0) {
      setProgress({ message: `Atualizando ${sameBase.length} insumos (mesma data base)...`, percent: 75 });
      await batchUpdate(
        sameBase,
        (u) => base44.entities.Input.update(u.id, u.data),
        20,
        (done, total) => setProgress({
          message: `Re-importando... ${done}/${total}`,
          percent: 75 + Math.floor((done / total) * 20)
        })
      );
    }

    setProgress({ message: 'Concluído!', percent: 100 });
    toast.success(`Concluído! ${creates.length} criados, ${updates.length} atualizados (histórico salvo), ${sameBase.length} re-importados${skipped > 0 ? `, ${skipped} ignorados` : ''}.`);
  };

  const processCompositionsDirectly = async (lines, separator) => {
    toast.info("Iniciando processamento...");
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    setProgress({ message: 'Analisando linhas...', percent: 5 });
    const items = [];
    let skippedCount = 0;

    const looksLikeCode = (str) => str && str.length < 20 && !str.includes(' ');
    const looksLikeUnit = (str) => str && str.length <= 5;

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      let cols = [];
      let parsed = false;

      if (cleanLine.includes('\t')) {
        const parts = cleanLine.split('\t').map(c => c.trim());
        if (parts.length >= 5) {
          let p0 = parts[0], p1 = parts[1], p2 = parts[2], p3 = parts[3], p4 = parts[4];
          if (looksLikeCode(p0) && looksLikeCode(p3) && /[\d.,]+/.test(p4)) {
            cols = [p0, p1, p2, p3, p4]; parsed = true;
          } else {
            const qty = parts[parts.length - 1], child = parts[parts.length - 2];
            const parent = parts[0];
            if (looksLikeCode(parent) && looksLikeCode(child)) {
              const desc = parts.slice(1, parts.length - 3).join(' ');
              cols = [parent, desc, parts[parts.length - 3], child, qty]; parsed = true;
            }
          }
        }
      }

      if (!parsed && cleanLine.includes(';')) {
        const parts = cleanLine.split(';').map(c => c.trim());
        if (parts.length >= 5) {
          const qty = parts[parts.length - 1], child = parts[parts.length - 2];
          const unit = parts[parts.length - 3], parent = parts[0];
          const desc = parts.slice(1, parts.length - 3).join(' ');
          if (looksLikeCode(parent)) { cols = [parent, desc, unit, child, qty]; parsed = true; }
        }
      }

      if (!parsed) {
        let tokens = cleanLine.split(/\s{2,}/).map(c => c.trim()).filter(c => c);
        if (tokens.length < 5) tokens = cleanLine.split(' ').map(c => c.trim()).filter(c => c);
        if (tokens.length >= 5) {
          const qty = tokens[tokens.length - 1], child = tokens[tokens.length - 2];
          const unit = tokens[tokens.length - 3], parent = tokens[0];
          if (looksLikeCode(parent) && looksLikeCode(child) && /[\d.,]+/.test(qty)) {
            const desc = tokens.slice(1, tokens.length - 3).join(' ');
            cols = [parent, desc, unit, child, qty]; parsed = true;
          }
        }
      }

      if (parsed) {
        const qty = parseBrlNumber(cols[4]);
        if (!cols[0] || cols[0].length > 15 || !/^[A-Z0-9.-]+$/.test(cols[0])) { skippedCount++; continue; }
        items.push({
          codigo_pai: cols[0]?.trim(),
          descricao_pai: cols[1]?.trim()?.replace(/^["']|["']$/g, ''),
          unidade_pai: cols[2]?.trim() || 'UN',
          codigo_item: cols[3]?.trim(),
          quantidade: qty
        });
      } else { skippedCount++; }
    }

    if (items.length === 0) {
      throw new Error("Nenhuma linha válida identificada. Verifique se o formato está correto.");
    }

    setProgress({ message: 'Resolvendo códigos...', percent: 20 });
    const allCodes = new Set();
    const itemsInfo = {};
    items.forEach(i => {
      if (i.codigo_pai) { allCodes.add(i.codigo_pai); if (!itemsInfo[i.codigo_pai]) itemsInfo[i.codigo_pai] = { description: i.descricao_pai, unit: i.unidade_pai }; }
      if (i.codigo_item) { allCodes.add(i.codigo_item); }
    });

    const parentCodes = new Set(items.map(i => i.codigo_pai));
    const allInputsDb = await fetchAllRecords(base44.entities.Input);
    const allServicesDb = await fetchAllRecords(base44.entities.Service);

    let mapping = {};
    for (const code of allCodes) {
      const info = itemsInfo[code];
      const existingInput = allInputsDb.find(i => i.codigo === code);
      const existingService = allServicesDb.find(s => s.codigo === code);

      if (!existingInput && !existingService) {
        if (parentCodes.has(code)) {
          const service = await base44.entities.Service.create({ codigo: code, descricao: info?.description || code, unidade: info?.unit || 'UN', custo_total: 0, ativo: true });
          mapping[code] = { id: service.id, type: 'Service', unit: info?.unit || 'UN', cost: 0 };
        } else {
          const input = await base44.entities.Input.create({ codigo: code, descricao: info?.description || code, unidade: info?.unit || 'UN', valor_unitario: 0, categoria: 'MATERIAL' });
          mapping[code] = { id: input.id, type: 'Input', unit: info?.unit || 'UN', cost: 0 };
        }
      } else if (existingService) {
        mapping[code] = { id: existingService.id, type: 'Service', unit: existingService.unidade || 'UN', cost: existingService.custo_total || 0 };
      } else if (existingInput) {
        mapping[code] = { id: existingInput.id, type: 'Input', unit: existingInput.unidade || 'UN', cost: existingInput.valor_unitario || 0 };
      }
    }

    setProgress({ message: 'Preparando vínculos...', percent: 60 });
    const existingItems = await fetchAllRecords(base44.entities.ServiceItem);
    const existingMap = new Map(existingItems.map(item => [`${item.servico_id}|${item.tipo_item}|${item.item_id}`, item]));

    const linksToCreate = [];
    let skippedDuplicates = 0;

    for (const item of items) {
      const parentData = mapping[item.codigo_pai];
      const childData = mapping[item.codigo_item];
      if (!parentData || !childData) continue;

      const key = `${parentData.id}|${childData.type}|${childData.id}`;
      if (existingMap.has(key)) { skippedDuplicates++; continue; }

      let cat = 'MATERIAL';
      if (childData.unit) { const u = childData.unit.toUpperCase(); if (u.startsWith('H')) cat = 'MAO_OBRA'; }
      const unitCost = childData.cost || 0;

      linksToCreate.push({
        servico_id: parentData.id, tipo_item: childData.type, item_id: childData.id,
        quantidade: item.quantidade, categoria: cat, ordem: 0,
        custo_unitario_snapshot: unitCost, custo_total_item: unitCost * (item.quantidade || 0)
      });
    }

    let linksCreatedCount = 0;
    for (let i = 0; i < linksToCreate.length; i += 500) {
      const chunk = linksToCreate.slice(i, i + 500);
      await base44.entities.ServiceItem.bulkCreate(chunk);
      linksCreatedCount += chunk.length;
      setProgress({ message: `Salvando vínculos ${linksCreatedCount}/${linksToCreate.length}...`, percent: 60 + Math.floor((i / linksToCreate.length) * 30) });
      await yieldToMain();
    }

    setProgress({ message: 'Calculando custos dos serviços...', percent: 90 });
    const uniqueParentIds = [...new Set(items.map(i => mapping[i.codigo_pai]?.id).filter(Boolean))];
    let recalculated = 0;
    for (const parentId of uniqueParentIds) {
      await Engine.recalculateService(parentId);
      recalculated++;
      if (recalculated % 10 === 0) {
        setProgress({ message: `Calculando custos ${recalculated}/${uniqueParentIds.length}...`, percent: 90 + Math.floor((recalculated / uniqueParentIds.length) * 7) });
        await yieldToMain();
      }
    }

    setProgress({ message: 'Concluído!', percent: 100 });
    toast.success(`Importação finalizada! ${linksCreatedCount} vínculos criados, ${recalculated} serviços calculados${skippedDuplicates > 0 ? `, ${skippedDuplicates} duplicatas ignoradas` : ''}.`);
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
                        ? (hasCategoryColumn ? "COD | DESC | UN | VALOR | CATEGORIA | DATA | FONTE" : "COD | DESC | UN | VALOR | DATA | FONTE")
                        : "COD_PAI  |  DESCRIÇÃO_PAI  |  UN_PAI  |  COD_FILHO  |  QTD_FILHO"
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