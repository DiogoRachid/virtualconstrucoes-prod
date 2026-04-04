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
import InputImportProgressPanel from '@/components/imports/InputImportProgressPanel';
import CompositionImportProgressPanel from '@/components/imports/CompositionImportProgressPanel';

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

  // Estado do painel de progresso de composições
  const [compPhase, setCompPhase] = useState('');
  const [compProgress, setCompProgress] = useState({ message: '', percent: 0 });
  const [compTotals, setCompTotals] = useState({});
  const [compLog, setCompLog] = useState([]);
  const [compStartTime, setCompStartTime] = useState(null);

  const addLog = (msg, type = 'info') => {
    setCompLog(prev => [...prev, { msg, type, ts: Date.now() }]);
  };

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

      // Atualizar em bulk (muito mais rápido)
const updatePayloads = updates.map(({ existing, row }) => ({
  id: existing.id,
  descricao: row.descricao, unidade: row.unidade, valor_unitario: row.valor_unitario,
  categoria: row.categoria, fonte: row.fonte, data_base: row.data_base,
}));
for (let i = 0; i < updatePayloads.length; i += BULK) {
  await withRetry(() => base44.entities.Input.bulkUpdate(updatePayloads.slice(i, i + BULK)));
  updates.slice(i, i + BULK).forEach(({ idx }) => { updateRow(idx, { status: 'update' }); totalUpdated++; });
  setProgress({ message: `Atualizando... ${Math.min(i + BULK, updates.length)}/${updates.length}`, percent: 45 + Math.floor((Math.min(i + BULK, updates.length) / Math.max(updates.length, 1)) * 30) });
  flushRows();
  await yieldToMain();
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
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Detecta erros de rate limit ou rede independente do formato
    const isRetryable = (err) => {
      if (!err) return false;
      if (err?.status === 429) return true;
      const msg = (err?.message || err?.toString() || '').toLowerCase();
      return msg.includes('rate limit') || msg.includes('too many') || msg.includes('network') || msg.includes('timeout') || msg.includes('503') || msg.includes('502');
    };

    // Retry com backoff exponencial — espera mais a cada tentativa
    const withRetry = async (fn, retries = 6, baseDelay = 2000) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try { return await fn(); }
        catch (err) {
          if (isRetryable(err) && attempt < retries) {
            const wait = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s, 16s...
            await sleep(Math.min(wait, 30000)); // máx 30s
          } else {
            throw err;
          }
        }
      }
    };

    // Reset painel de composições
    setCompStartTime(Date.now());
    setCompLog([]);
    setCompTotals({});
    setCompPhase('parsing');

    const log = (msg, type = 'info') => {
      setCompLog(prev => [...prev.slice(-200), { msg, type }]); // manter últimas 200 linhas
    };
    const setTotals = (patch) => setCompTotals(prev => ({ ...prev, ...patch }));

    // ─── FASE 1: PARSE ───────────────────────────────────────────────────────
    setCompProgress({ message: 'Analisando linhas...', percent: 3 });
    log('▶ FASE 1: Parse de linhas', 'phase');

    const items = [];
    let skippedCount = 0;
    const looksLikeCode = (str) => str && str.length < 25 && !/\s{2,}/.test(str);

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      let cols = [];
      let parsed = false;

      if (cleanLine.includes('\t')) {
        const parts = cleanLine.split('\t').map(c => c.trim());
        if (parts.length >= 5) {
          const [p0, p1, p2, p3, p4] = parts;
          if (looksLikeCode(p0) && looksLikeCode(p3) && /[\d.,]+/.test(p4)) {
            cols = [p0, p1, p2, p3, p4]; parsed = true;
          } else {
            const qty = parts[parts.length - 1], child = parts[parts.length - 2], parent = parts[0];
            if (looksLikeCode(parent) && looksLikeCode(child)) {
              cols = [parent, parts.slice(1, parts.length - 3).join(' '), parts[parts.length - 3], child, qty];
              parsed = true;
            }
          }
        }
      }

      if (!parsed && cleanLine.includes(';')) {
        const parts = cleanLine.split(';').map(c => c.trim());
        if (parts.length >= 5) {
          const qty = parts[parts.length - 1], child = parts[parts.length - 2];
          const unit = parts[parts.length - 3], parent = parts[0];
          if (looksLikeCode(parent)) {
            cols = [parent, parts.slice(1, parts.length - 3).join(' '), unit, child, qty];
            parsed = true;
          }
        }
      }

      if (!parsed) {
        let tokens = cleanLine.split(/\s{2,}/).map(c => c.trim()).filter(c => c);
        if (tokens.length < 5) tokens = cleanLine.split(' ').map(c => c.trim()).filter(c => c);
        if (tokens.length >= 5) {
          const qty = tokens[tokens.length - 1], child = tokens[tokens.length - 2];
          const unit = tokens[tokens.length - 3], parent = tokens[0];
          if (looksLikeCode(parent) && looksLikeCode(child) && /[\d.,]+/.test(qty)) {
            cols = [parent, tokens.slice(1, tokens.length - 3).join(' '), unit, child, qty];
            parsed = true;
          }
        }
      }

      if (parsed) {
        const codigoPai = cols[0]?.trim();
        if (!codigoPai || codigoPai.length > 20 || !/^[A-Z0-9.\-_]+$/i.test(codigoPai)) { skippedCount++; continue; }
        items.push({
          codigo_pai: codigoPai,
          descricao_pai: cols[1]?.trim()?.replace(/^["']|["']$/g, '') || codigoPai,
          unidade_pai: cols[2]?.trim() || 'UN',
          codigo_item: cols[3]?.trim(),
          quantidade: parseBrlNumber(cols[4]),
        });
      } else {
        skippedCount++;
      }
    }

    if (items.length === 0) throw new Error("Nenhuma linha válida identificada. Verifique o formato.");

    setTotals({ parsed: items.length, skipped: skippedCount });
    log(`✔ ${items.length.toLocaleString('pt-BR')} linhas válidas, ${skippedCount} ignoradas`, 'success');
    await yieldToMain();

    // ─── FASE 2: CARGA DO BANCO ──────────────────────────────────────────────
    setCompPhase('loading');
    setCompProgress({ message: 'Carregando dados do banco...', percent: 8 });
    log('▶ FASE 2: Carregando insumos, serviços e vínculos existentes', 'phase');

    const [allInputsDb, allServicesDb, existingServiceItems] = await Promise.all([
      fetchAllRecords(base44.entities.Input),
      fetchAllRecords(base44.entities.Service),
      fetchAllRecords(base44.entities.ServiceItem),
    ]);

    const inputByCodigo = new Map(allInputsDb.map(i => [i.codigo?.trim(), i]));
    const serviceByCodigo = new Map(allServicesDb.map(s => [s.codigo?.trim(), s]));
    // Chave de duplicata: servico_id|tipo|item_codigo (usa código estável)
    const existingKey = new Set(
      existingServiceItems
        .filter(i => i.item_codigo)
        .map(i => `${i.servico_id}|${i.tipo_item}|${i.item_codigo}`)
    );
    // Fallback por item_id para itens sem item_codigo
    const existingKeyById = new Set(
      existingServiceItems.map(i => `${i.servico_id}|${i.tipo_item}|${i.item_id}`)
    );

    log(`✔ ${allInputsDb.length.toLocaleString('pt-BR')} insumos | ${allServicesDb.length.toLocaleString('pt-BR')} serviços | ${existingServiceItems.length.toLocaleString('pt-BR')} vínculos existentes`, 'success');
    await yieldToMain();

    // ─── FASE 3: RESOLVER CÓDIGOS (bulk) ────────────────────────────────────
    setCompPhase('resolving');
    setCompProgress({ message: 'Resolvendo códigos desconhecidos...', percent: 15 });
    log('▶ FASE 3: Identificando códigos novos para criação em bulk', 'phase');

    const parentCodes = new Map(); // codigo_pai -> { descricao, unidade }
    const childCodes = new Set();

    for (const item of items) {
      if (!parentCodes.has(item.codigo_pai))
        parentCodes.set(item.codigo_pai, { description: item.descricao_pai, unit: item.unidade_pai });
      if (item.codigo_item) childCodes.add(item.codigo_item);
    }

    // Códigos que precisam ser criados
    const missingServices = [];
    const missingInputs = [];

    for (const [code, info] of parentCodes) {
      if (!serviceByCodigo.has(code) && !inputByCodigo.has(code)) {
        missingServices.push({ codigo: code, descricao: info.description || code, unidade: info.unit || 'UN', custo_total: 0, ativo: true });
      }
    }
    for (const code of childCodes) {
      if (!inputByCodigo.has(code) && !serviceByCodigo.has(code) && !parentCodes.has(code)) {
        missingInputs.push({ codigo: code, descricao: code, unidade: 'UN', valor_unitario: 0, categoria: 'MATERIAL' });
      }
    }

    log(`  ${missingServices.length} serviços novos | ${missingInputs.length} insumos novos a criar`, 'info');

    // Bulk create serviços novos
    const BULK = 200;
    if (missingServices.length > 0) {
      log(`  Criando ${missingServices.length} serviços em bulk...`, 'info');
      for (let i = 0; i < missingServices.length; i += BULK) {
        const chunk = missingServices.slice(i, i + BULK);
        const created = await withRetry(() => base44.entities.Service.bulkCreate(chunk));
        // bulkCreate retorna array com ids
        if (Array.isArray(created)) {
          created.forEach((s, idx) => {
            const original = chunk[idx];
            serviceByCodigo.set(original.codigo, { ...original, id: s.id || s });
          });
        }
        setCompProgress({ message: `Criando serviços ${Math.min(i + BULK, missingServices.length)}/${missingServices.length}...`, percent: 15 + Math.floor((i / missingServices.length) * 8) });
        await yieldToMain();
      }
      // Recarregar serviços para ter IDs corretos
      const freshServices = await fetchAllRecords(base44.entities.Service);
      freshServices.forEach(s => serviceByCodigo.set(s.codigo?.trim(), s));
      log(`  ✔ ${missingServices.length} serviços criados`, 'success');
      setTotals({ newServices: missingServices.length });
    }

    // Bulk create insumos novos
    if (missingInputs.length > 0) {
      log(`  Criando ${missingInputs.length} insumos em bulk...`, 'info');
      for (let i = 0; i < missingInputs.length; i += BULK) {
        await withRetry(() => base44.entities.Input.bulkCreate(missingInputs.slice(i, i + BULK)));
        setCompProgress({ message: `Criando insumos ${Math.min(i + BULK, missingInputs.length)}/${missingInputs.length}...`, percent: 23 + Math.floor((i / missingInputs.length) * 7) });
        await yieldToMain();
      }
      // Recarregar insumos
      const freshInputs = await fetchAllRecords(base44.entities.Input);
      freshInputs.forEach(i => inputByCodigo.set(i.codigo?.trim(), i));
      log(`  ✔ ${missingInputs.length} insumos criados`, 'success');
      setTotals({ newInputs: missingInputs.length });
    }

    await yieldToMain();

    // ─── FASE 4: PREPARAR VÍNCULOS ──────────────────────────────────────────
    setCompPhase('linking');
    setCompProgress({ message: 'Preparando vínculos...', percent: 32 });
    log('▶ FASE 4: Montando vínculos (ServiceItems)', 'phase');

    const linksToCreate = [];
    let skippedDuplicates = 0;
    let unmapped = 0;
    let ordem = 0;

    for (const item of items) {
      const parentData = serviceByCodigo.get(item.codigo_pai) || inputByCodigo.get(item.codigo_pai);
      const childAsInput = inputByCodigo.get(item.codigo_item);
      const childAsService = serviceByCodigo.get(item.codigo_item);
      const childData = childAsInput || childAsService;

      if (!parentData || !childData) { unmapped++; continue; }

      const tipo_item = childAsInput ? 'INSUMO' : 'SERVICO';
      const itemCodigo = item.codigo_item;

      // Verificar duplicata por código estável primeiro
      const keyByCodigo = `${parentData.id}|${tipo_item}|${itemCodigo}`;
      const keyById = `${parentData.id}|${tipo_item}|${childData.id}`;
      if (existingKey.has(keyByCodigo) || existingKeyById.has(keyById)) {
        skippedDuplicates++;
        continue;
      }

      // Marcar como existente para evitar duplicatas dentro do mesmo lote
      existingKey.add(keyByCodigo);
      existingKeyById.add(keyById);

      const unitCost = childAsInput ? (childAsInput.valor_unitario || 0) : (childAsService.custo_total || 0);
      let cat = 'MATERIAL';
      const unit = (childData.unidade || childData.unit || 'UN').toUpperCase();
      if (unit.startsWith('H')) cat = 'MAO_OBRA';
      if (childAsInput?.categoria === 'MAO_OBRA') cat = 'MAO_OBRA';

      linksToCreate.push({
        servico_id: parentData.id,
        servico_codigo: item.codigo_pai,
        tipo_item,
        item_id: childData.id,
        item_codigo: itemCodigo,
        quantidade: item.quantidade,
        categoria: cat,
        ordem: ordem++,
        custo_unitario_snapshot: unitCost,
        custo_total_item: unitCost * (item.quantidade || 0),
      });
    }

    log(`  ${linksToCreate.length.toLocaleString('pt-BR')} vínculos a criar | ${skippedDuplicates.toLocaleString('pt-BR')} duplicatas | ${unmapped} sem mapeamento`, 'info');
    setTotals({ duplicates: skippedDuplicates });
    await yieldToMain();

    // ─── FASE 5: SALVAR VÍNCULOS EM BULK (com retry em cascata) ─────────────
    const LINK_BULK = 500;
    let linksCreated = 0;
    let linkErrors = 0;
    let totalRetries = 0;
    const totalBatches = Math.ceil(linksToCreate.length / LINK_BULK);

    // Salva um lote com retry em cascata: 500 → 100 → 10 → 1 por vez
    const saveBatchWithFallback = async (batch, batchLabel) => {
      // Tentativa 1: bulk completo
      try {
        await withRetry(() => base44.entities.ServiceItem.bulkCreate(batch));
        linksCreated += batch.length;
        return;
      } catch (err) {
        log(`  ↺ Lote ${batchLabel} falhou (${batch.length} itens): ${err.message} — tentando sub-lotes de 100`, 'retry');
        totalRetries++;
      }

      // Tentativa 2: sub-lotes de 100 (com pausa entre eles)
      const failedFrom100 = [];
      for (let j = 0; j < batch.length; j += 100) {
        const sub = batch.slice(j, j + 100);
        try {
          await withRetry(() => base44.entities.ServiceItem.bulkCreate(sub));
          linksCreated += sub.length;
        } catch (e) {
          failedFrom100.push(...sub);
          log(`    ✗ Sub-lote 100 falhou: ${e.message}`, 'warn');
        }
        await sleep(600);
        await yieldToMain();
      }

      if (failedFrom100.length === 0) return;
      log(`  ↺ ${failedFrom100.length} itens ainda falharam — tentando sub-lotes de 10`, 'retry');
      totalRetries++;

      // Tentativa 3: sub-lotes de 10 (com pausa)
      const failedFrom10 = [];
      for (let j = 0; j < failedFrom100.length; j += 10) {
        const sub = failedFrom100.slice(j, j + 10);
        try {
          await withRetry(() => base44.entities.ServiceItem.bulkCreate(sub));
          linksCreated += sub.length;
        } catch (e) {
          failedFrom10.push(...sub);
        }
        await sleep(400);
        await yieldToMain();
      }

      if (failedFrom10.length === 0) return;
      log(`  ↺ ${failedFrom10.length} itens ainda falharam — tentando um por um`, 'retry');
      totalRetries++;

      // Tentativa 4: um por um (com pausa de 1s entre cada)
      for (const item of failedFrom10) {
        try {
          await withRetry(() => base44.entities.ServiceItem.create(item), 5, 3000);
          linksCreated++;
        } catch (err) {
          linkErrors++;
          log(`    ✗ Falha definitiva: servico=${item.servico_codigo} item=${item.item_codigo} — ${err.message}`, 'error');
        }
        await sleep(1000);
      }
    };

    for (let i = 0; i < linksToCreate.length; i += LINK_BULK) {
      const chunk = linksToCreate.slice(i, i + LINK_BULK);
      const batchNum = Math.ceil((i + 1) / LINK_BULK);

      await saveBatchWithFallback(chunk, `${batchNum}/${totalBatches}`);

      log(`  ✔ ${linksCreated.toLocaleString('pt-BR')}/${linksToCreate.length.toLocaleString('pt-BR')} vínculos salvos`, 'success');

      setTotals({ links: linksCreated, errors: linkErrors, retries: totalRetries });
      setCompProgress({
        message: `Salvando vínculos ${linksCreated.toLocaleString('pt-BR')}/${linksToCreate.length.toLocaleString('pt-BR')}...`,
        percent: 32 + Math.floor((linksCreated / Math.max(linksToCreate.length, 1)) * 65),
      });

      // Pausa entre lotes para não estourar o rate limit
      await sleep(800);
      await yieldToMain();
    }

    // ─── CONCLUÍDO — sem recálculo automático (calculado on-demand na página Serviços) ───
    setCompPhase('done');
    setCompProgress({ message: 'Concluído!', percent: 100 });
    log(`✅ Importação finalizada! ${linksCreated.toLocaleString('pt-BR')} vínculos salvos.`, 'success');
    log(`ℹ️ Os custos serão calculados quando você abrir cada serviço, ou use "Recalcular Tudo" na página Serviços.`, 'info');

    const parts = [
      `${linksCreated.toLocaleString('pt-BR')} vínculos`,
      missingServices.length > 0 ? `${missingServices.length} serviços criados` : null,
      missingInputs.length > 0 ? `${missingInputs.length} insumos criados` : null,
      skippedDuplicates > 0 ? `${skippedDuplicates.toLocaleString('pt-BR')} duplicatas ignoradas` : null,
      linkErrors > 0 ? `${linkErrors} erros` : null,
    ].filter(Boolean).join(', ');

    if (linkErrors > 0) {
      toast.warning(`Concluído com erros: ${parts}.`);
    } else {
      toast.success(`Importação finalizada! ${parts}. Use "Recalcular Tudo" em Serviços para atualizar os custos.`);
    }
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
              ) : mode === 'COMPOSICAO' ? (
                <CompositionImportProgressPanel
                  phase={compPhase}
                  progress={compProgress}
                  startTime={compStartTime}
                  totals={compTotals}
                  log={compLog}
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
