import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Database, Play, ClipboardPaste } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import * as Engine from '@/components/logic/CompositionEngine';
import InputImportProgressPanel from '@/components/imports/InputImportProgressPanel';

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


export default function TableImport() {
  const [mode, setMode] = useState('INSUMO');
  const [loading, setLoading] = useState(false);
  const [fonteDefault, setFonteDefault] = useState('SINAPI');
  const [progress, setProgress] = useState({ message: '', percent: 0 });
  const [pasteData, setPasteData] = useState('');

  // Estado do painel de progresso linha a linha (só insumos)
  const [importRows, setImportRows] = useState([]);
  const [importStartTime, setImportStartTime] = useState(null);
  const [importTotals, setImportTotals] = useState(null);
  const importRowsRef = useRef([]);

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
    } catch (err) {
      console.error(err);
      toast.error("Erro no upload: " + err.message);
    } finally {
      setLoading(false);
      setProgress({ message: '', percent: 0 });
    }
  };

  const processInputsDirectly = async (lines, separator) => {
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    // 1. Parsear todas as linhas válidas sem tocar na API
    setProgress({ message: 'Analisando linhas...', percent: 2 });
    const validRows = [];
    let skipped = 0;

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
      let fonte = fonteDefault;
      dataBase = cols[4]?.trim() || '';
      fonte = cols[5]?.trim() || fonteDefault;
      validRows.push({
        codigo,
        descricao: (descricao || codigo).slice(0, 500),
        unidade: unidade || 'UN',
        valor_unitario: parseCurrency(valorStr),
        categoria,
        data_base: dataBase,
        fonte,
        status: 'pending',
        action: null,
        errorMsg: null,
      });
    }

    if (validRows.length === 0) {
      toast.error('Nenhum insumo válido encontrado. Verifique o formato (separador, colunas).');
      return;
    }

    // 2. Inicializar painel
    importRowsRef.current = validRows.map(r => ({ ...r }));
    setImportRows([...importRowsRef.current]);
    setImportStartTime(Date.now());
    setImportTotals(null);

    const totalRows = validRows.length;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSameBase = 0;
    let totalErrors = 0;

    const updateRow = (idx, patch) => {
      importRowsRef.current[idx] = { ...importRowsRef.current[idx], ...patch };
    };

    const flushRows = () => setImportRows([...importRowsRef.current]);

    // 3. Carregar TODOS os insumos existentes de uma vez — evita 1 filter por linha
    setProgress({ message: 'Carregando insumos existentes...', percent: 10 });
    const allExisting = await fetchAllRecords(base44.entities.Input);
    const existingMap = new Map(allExisting.map(i => [i.codigo?.trim(), i]));

    // 4. Separar em lotes: creates, updates (nova data_base), samebase
    const creates = [];
    const updates = []; // { idx, existing, row }
    const sameBases = []; // { idx, existing, row }

    for (let idx = 0; idx < totalRows; idx++) {
      const row = validRows[idx];
      const existing = existingMap.get(row.codigo);
      if (!existing) {
        creates.push({ idx, row });
        updateRow(idx, { action: 'create' });
      } else if (existing.data_base === row.data_base) {
        sameBases.push({ idx, existing, row });
        updateRow(idx, { action: 'samebase' });
      } else {
        updates.push({ idx, existing, row });
        updateRow(idx, { action: 'update' });
      }
    }
    flushRows();

    setProgress({ message: `Criando ${creates.length} novos insumos...`, percent: 20 });

    // 5. CRIAR em bulk de 200
    const BULK = 200;
    for (let i = 0; i < creates.length; i += BULK) {
      const chunk = creates.slice(i, i + BULK);
      try {
        await base44.entities.Input.bulkCreate(chunk.map(c => c.row));
        chunk.forEach(c => { updateRow(c.idx, { status: 'create' }); totalCreated++; });
      } catch {
        // fallback individual
        for (const c of chunk) {
          try {
            await base44.entities.Input.create(c.row);
            updateRow(c.idx, { status: 'create' }); totalCreated++;
          } catch (err) {
            updateRow(c.idx, { status: 'error', errorMsg: err?.message }); totalErrors++;
          }
        }
      }
      setProgress({ message: `Criando... ${Math.min(i + BULK, creates.length)}/${creates.length}`, percent: 20 + Math.floor((i / Math.max(creates.length, 1)) * 25) });
      flushRows();
      await yieldToMain();
    }

    // Helper: executa com retry automático em caso de 429
    const withRetry = async (fn, retries = 5, delayMs = 300) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          if (err?.status === 429 && attempt < retries) {
            await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
          } else {
            throw err;
          }
        }
      }
    };

    // Helper: processa lista sequencialmente com delay entre items
    const processSeq = async (list, handler, delayMs = 80) => {
      for (let i = 0; i < list.length; i++) {
        await handler(list[i], i);
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
        if (i % 20 === 0) { flushRows(); await yieldToMain(); }
      }
    };

    // 6. ATUALIZAR (nova data_base) — salvar histórico sequencialmente, depois atualizar
    setProgress({ message: `Atualizando ${updates.length} insumos...`, percent: 45 });

    if (updates.length > 0) {
      // Histórico: bulk create dos que ainda não existem (carregar tudo de uma vez)
      const allHistExisting = await fetchAllRecords(base44.entities.InputPriceHistory);
      const histSet = new Set(allHistExisting.map(h => `${h.insumo_id}|${h.data_base}`));

      const historicos = updates
        .filter(({ existing }) => existing.data_base && existing.valor_unitario != null && !histSet.has(`${existing.id}|${existing.data_base}`))
        .map(({ existing }) => ({
          insumo_id: existing.id, codigo: existing.codigo, descricao: existing.descricao,
          unidade: existing.unidade, valor_unitario: existing.valor_unitario,
          data_base: existing.data_base, categoria: existing.categoria, fonte: existing.fonte,
        }));

      if (historicos.length > 0) {
        for (let i = 0; i < historicos.length; i += BULK) {
          await withRetry(() => base44.entities.InputPriceHistory.bulkCreate(historicos.slice(i, i + BULK)));
        }
      }

      // Atualizar sequencialmente com delay
      await processSeq(updates, async ({ idx, existing, row }, i) => {
        try {
          await withRetry(() => base44.entities.Input.update(existing.id, {
            descricao: row.descricao, unidade: row.unidade, valor_unitario: row.valor_unitario,
            categoria: row.categoria, fonte: row.fonte, data_base: row.data_base,
          }));
          updateRow(idx, { status: 'update' }); totalUpdated++;
        } catch (err) {
          updateRow(idx, { status: 'error', errorMsg: err?.message }); totalErrors++;
        }
        setProgress({ message: `Atualizando... ${i + 1}/${updates.length}`, percent: 45 + Math.floor(((i + 1) / Math.max(updates.length, 1)) * 30) });
      });
    }

    // 7. MESMA DATA BASE — atualizar sequencialmente
    setProgress({ message: `Re-importando ${sameBases.length} insumos...`, percent: 75 });
    await processSeq(sameBases, async ({ idx, existing, row }, i) => {
      try {
        await withRetry(() => base44.entities.Input.update(existing.id, {
          descricao: row.descricao, unidade: row.unidade, valor_unitario: row.valor_unitario,
          categoria: row.categoria, fonte: row.fonte, data_base: row.data_base,
        }));
        updateRow(idx, { status: 'samebase' }); totalSameBase++;
      } catch (err) {
        updateRow(idx, { status: 'error', errorMsg: err?.message }); totalErrors++;
      }
      setProgress({ message: `Re-importando... ${i + 1}/${sameBases.length}`, percent: 75 + Math.floor(((i + 1) / Math.max(sameBases.length, 1)) * 20) });
    });

    flushRows();
    setImportTotals({ created: totalCreated, updated: totalUpdated, samebase: totalSameBase, errors: totalErrors });
    setProgress({ message: 'Concluído!', percent: 100 });

    const parts = [
      totalCreated > 0 ? `${totalCreated} criados` : null,
      totalUpdated > 0 ? `${totalUpdated} atualizados` : null,
      totalSameBase > 0 ? `${totalSameBase} re-importados` : null,
      skipped > 0 ? `${skipped} ignorados` : null,
      totalErrors > 0 ? `${totalErrors} ERROS` : null,
    ].filter(Boolean).join(', ');

    if (totalErrors > 0) {
      toast.warning(`Concluído com ${totalErrors} erro(s): ${parts}.`);
    } else {
      toast.success(`Concluído! ${parts}.`);
    }
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

  // Colunas esperadas para o guia visual
  const insumoColumns = ['Código', 'Descrição', 'Unidade', 'Valor', 'Data Base', 'Fonte'];
  const composicaoColumns = ['Cód. Pai', 'Desc. Pai', 'Un. Pai', 'Cód. Filho', 'Quantidade'];

  const columns = mode === 'INSUMO' ? insumoColumns : composicaoColumns;

  return (
    <div className="pb-20 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Importação de Tabelas"
        subtitle="Copie as células do Excel e cole aqui"
        icon={Database}
      />

      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Linha de configuração */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs text-slate-500">O que você está importando?</Label>
              <Select value={mode} onValueChange={setMode} disabled={loading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INSUMO">Insumos</SelectItem>
                  <SelectItem value="COMPOSICAO">Composições</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'INSUMO' && (
              <div className="space-y-1 flex-1 min-w-[140px]">
                <Label className="text-xs text-slate-500">Fonte dos dados</Label>
                <Select value={fonteDefault} onValueChange={setFonteDefault} disabled={loading}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINAPI">SINAPI</SelectItem>
                    <SelectItem value="ORSE">ORSE</SelectItem>
                    <SelectItem value="SETOP">SETOP</SelectItem>
                    <SelectItem value="SICRO">SICRO</SelectItem>
                    <SelectItem value="PROPRIA">Própria</SelectItem>
                    <SelectItem value="OUTRO">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Guia visual de colunas */}
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3">
            <p className="text-xs text-slate-500 mb-2 font-medium">
              Monte sua planilha com estas colunas <span className="text-slate-400">(nesta ordem)</span>:
            </p>
            <div className="flex flex-wrap gap-2">
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-mono px-2 py-1 rounded shadow-sm">
                    {col}
                  </span>
                  {i < columns.length - 1 && <span className="text-slate-300 text-xs">→</span>}
                </div>
              ))}
            </div>
            {mode === 'INSUMO' && (
              <p className="text-xs text-slate-400 mt-2">Data Base e Fonte são opcionais. Cabeçalho é ignorado automaticamente.</p>
            )}
          </div>

          {/* Área de cole */}
          {loading ? (
            <div className="space-y-4">
              {mode === 'INSUMO' && importRows.length > 0 ? (
                <InputImportProgressPanel
                  rows={importRows}
                  startTime={importStartTime}
                  totals={importTotals}
                />
              ) : (
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
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                className="min-h-[220px] font-mono text-xs"
                value={pasteData}
                onChange={e => setPasteData(e.target.value)}
                placeholder={`Selecione as células no Excel → Ctrl+C → clique aqui → Ctrl+V`}
              />
              <Button
                className="w-full bg-green-600 hover:bg-green-700 h-11 text-base"
                onClick={() => handleImport(pasteData)}
                disabled={!pasteData.trim()}
              >
                <Play className="mr-2 h-5 w-5" /> Importar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}