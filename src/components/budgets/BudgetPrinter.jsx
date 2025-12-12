import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

export const printBudget = async (budgetId, preloadedData = null) => {
  let header, stages, items, project, costCenter;

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtPct = (v) => new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(v || 0);

  if (preloadedData) {
    header = preloadedData.header;
    stages = preloadedData.stages;
    items = preloadedData.items;
    project = preloadedData.project;
    costCenter = preloadedData.costCenter;
  } else {
    // Fetch data
    const b = await base44.entities.Budget.filter({ id: budgetId }).then(r => r[0]);
    if (!b) return alert('Orçamento não encontrado');

    header = b;
    stages = (await base44.entities.BudgetStage.filter({ orcamento_id: budgetId })).sort((a, b) => a.ordem - b.ordem);
    items = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
    
    if (header.obra_id) {
      project = await base44.entities.Project.filter({ id: header.obra_id }).then(r => r[0]);
    }
    if (header.centro_custo_id) {
      costCenter = await base44.entities.CostCenter.filter({ id: header.centro_custo_id }).then(r => r[0]);
    }
  }

  const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg";
  const projectName = project?.nome || header.obra_nome || 'N/A';
  const dateStr = format(new Date(), 'dd/MM/yyyy');
  
  // Calculate Totals
  const calculateTotals = (itemList) => {
    return itemList.reduce((acc, item) => {
      acc.material += (item.custo_unitario_material || 0) * item.quantidade;
      acc.mao_obra += (item.custo_unitario_mao_obra || 0) * item.quantidade;
      acc.direto += (item.custo_direto_total || 0);
      acc.final += (item.subtotal || 0);
      
      // Calculate Material and Labor with BDI
      const unitCostTotal = (item.custo_unitario_material || 0) + (item.custo_unitario_mao_obra || 0);
      if (unitCostTotal > 0) {
        const matRatio = (item.custo_unitario_material || 0) / unitCostTotal;
        const moRatio = (item.custo_unitario_mao_obra || 0) / unitCostTotal;
        
        acc.materialWithBDI += (item.subtotal || 0) * matRatio;
        acc.laborWithBDI += (item.subtotal || 0) * moRatio;
      } else {
        // Fallback for items with 0 cost but maybe manual price? Unlikely but safe to add to material if unknown
         // If total is 0, split is irrelevant (0). 
         // If manual price override exists in subtotal but unit costs are 0... (edge case)
      }

      return acc;
    }, { material: 0, mao_obra: 0, direto: 0, final: 0, materialWithBDI: 0, laborWithBDI: 0 });
  };

  const globalTotals = calculateTotals(items);

  // Breakdown Calculations
  const totalWithBDI = globalTotals.final;
  
  const matPct = totalWithBDI ? (globalTotals.materialWithBDI / totalWithBDI) : 0;
  const moPct = totalWithBDI ? (globalTotals.laborWithBDI / totalWithBDI) : 0;

  let htmlBody = '';

  // Loop Stages
  stages.forEach(stage => {
    const stageItems = items.filter(i => i.stage_id === (stage.id || stage.tempId));
    if (stageItems.length === 0) return;

    const stageTotal = calculateTotals(stageItems).final;

    htmlBody += `
      <div class="stage-header">
        <span>${stage.ordem}. ${stage.nome}</span>
        <span>${fmt(stageTotal)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 10%">Código</th>
            <th style="width: 40%">Descrição</th>
            <th style="width: 10%">Unid</th>
            <th style="width: 10%; text-align: right">Qtd</th>
            <th style="width: 15%; text-align: right">Unitário (c/ BDI)</th>
            <th style="width: 15%; text-align: right">Total (c/ BDI)</th>
          </tr>
        </thead>
        <tbody>
    `;

    stageItems.forEach(item => {
      htmlBody += `
        <tr>
          <td>${item.codigo || ''}</td>
          <td>${item.descricao || ''}</td>
          <td style="text-align: center">${item.unidade || ''}</td>
          <td style="text-align: right">${item.quantidade}</td>
          <td style="text-align: right">${fmt(item.custo_com_bdi_unitario)}</td>
          <td style="text-align: right">${fmt(item.subtotal)}</td>
        </tr>
      `;
    });

    htmlBody += `
        </tbody>
      </table>
    `;
  });

  // Uncategorized
  const uncategorizedItems = items.filter(i => !i.stage_id);
  if (uncategorizedItems.length > 0) {
    const stageTotal = calculateTotals(uncategorizedItems).final;
    htmlBody += `
      <div class="stage-header">
        <span>Itens sem Etapa</span>
        <span>${fmt(stageTotal)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 10%">Código</th>
            <th style="width: 40%">Descrição</th>
            <th style="width: 10%">Unid</th>
            <th style="width: 10%; text-align: right">Qtd</th>
            <th style="width: 15%; text-align: right">Unitário (c/ BDI)</th>
            <th style="width: 15%; text-align: right">Total (c/ BDI)</th>
          </tr>
        </thead>
        <tbody>
    `;
    uncategorizedItems.forEach(item => {
      htmlBody += `
        <tr>
          <td>${item.codigo || ''}</td>
          <td>${item.descricao || ''}</td>
          <td style="text-align: center">${item.unidade || ''}</td>
          <td style="text-align: right">${item.quantidade}</td>
          <td style="text-align: right">${fmt(item.custo_com_bdi_unitario)}</td>
          <td style="text-align: right">${fmt(item.subtotal)}</td>
        </tr>
      `;
    });
    htmlBody += `</tbody></table>`;
  }

  // Breakdown HTML
  const breakdownHtml = `
    <div class="breakdown-section">
      <h3>Resumo de Custos</h3>
      <table class="breakdown-table">
        <thead>
          <tr>
            <th>Componente</th>
            <th style="text-align: right">Valor (c/ BDI)</th>
            <th style="text-align: right">% do Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Material</td>
            <td style="text-align: right">${fmt(globalTotals.materialWithBDI)}</td>
            <td style="text-align: right">${fmtPct(matPct)}</td>
          </tr>
          <tr>
            <td>Mão de Obra</td>
            <td style="text-align: right">${fmt(globalTotals.laborWithBDI)}</td>
            <td style="text-align: right">${fmtPct(moPct)}</td>
          </tr>
          <tr class="total-row-breakdown">
            <td><strong>VALOR TOTAL GERAL</strong></td>
            <td style="text-align: right"><strong>${fmt(totalWithBDI)}</strong></td>
            <td style="text-align: right"><strong>100%</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Orçamento - ${header.descricao}</title>
      <style>
        @page { margin: 15mm; size: A4; }
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10px; color: #333; line-height: 1.4; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
        .logo { height: 50px; }
        .company-info { text-align: right; }
        .company-name { font-size: 14px; font-weight: bold; text-transform: uppercase; }
        .project-info { margin-bottom: 5px; }
        
        .stage-header { background-color: #f1f5f9; padding: 5px 10px; font-weight: bold; font-size: 11px; border-bottom: 1px solid #cbd5e1; margin-top: 15px; display: flex; justify-content: space-between; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
        th { background-color: #fff; border-bottom: 1px solid #000; padding: 4px; text-align: left; font-weight: bold; }
        td { border-bottom: 1px solid #e2e8f0; padding: 4px; }
        tr:last-child td { border-bottom: none; }
        
        .breakdown-section { margin-top: 30px; page-break-inside: avoid; width: 50%; margin-left: auto; }
        .breakdown-table th { background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; }
        .breakdown-table td { border-bottom: 1px solid #e2e8f0; }
        .total-row-breakdown td { background-color: #f1f5f9; border-top: 2px solid #333; padding: 8px 4px; }
        
        @media print {
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoUrl}" class="logo" alt="Logo" />
        <div class="company-info">
          <div class="company-name">Virtual Construções</div>
          <div class="project-info">
            <div><strong>Obra:</strong> ${projectName}</div>
            <div><strong>Orçamento:</strong> ${header.descricao}</div>
            <div>Data: ${dateStr} | Versão: ${header.versao}</div>
          </div>
        </div>
      </div>
      
      ${htmlBody}
      
      ${breakdownHtml}
      
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(fullHtml);
    win.document.close();
  } else {
    alert('Permita popups para visualizar o PDF.');
  }
};