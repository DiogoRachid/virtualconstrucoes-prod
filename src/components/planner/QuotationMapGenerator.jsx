import { format } from 'date-fns';
import * as XLSX from 'xlsx';

// Exportar para PDF (HTML estático)
export const exportToPDF = (analysisData, budgetData) => {
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtNum = (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
  
  const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg";
  const dateStr = format(new Date(), 'dd/MM/yyyy');
  
  const projectName = budgetData?.obra_nome || 'N/A';
  const budgetName = budgetData?.descricao || 'N/A';
  
  // Filtrar apenas A e B
  const filteredData = analysisData.filter(item => item.classe === 'A' || item.classe === 'B');
  
  // Agrupar por classe
  const classA = filteredData.filter(item => item.classe === 'A');
  const classB = filteredData.filter(item => item.classe === 'B');
  
  const totalA = classA.reduce((sum, item) => sum + item.valor_total, 0);
  const totalB = classB.reduce((sum, item) => sum + item.valor_total, 0);
  const totalGeral = totalA + totalB;
  
  const renderTable = (items, className) => {
    return `
      <table>
        <thead>
          <tr>
            <th style="width: 10%">Código</th>
            <th style="width: 35%">Descrição</th>
            <th style="width: 8%">Unid.</th>
            <th style="width: 10%; text-align: right">Qtd Total</th>
            <th style="width: 12%; text-align: right">Valor Unit.</th>
            <th style="width: 12%; text-align: right">Valor Total</th>
            <th style="width: 13%; text-align: right">Cotação</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.codigo || ''}</td>
              <td>${item.descricao || ''}</td>
              <td style="text-align: center">${item.unidade || ''}</td>
              <td style="text-align: right">${fmtNum(item.quantidade_total)}</td>
              <td style="text-align: right">${fmt(item.valor_unitario)}</td>
              <td style="text-align: right">${fmt(item.valor_total)}</td>
              <td class="cotacao-cell"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };
  
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Mapa de Cotações - ${budgetName}</title>
      <style>
        @page { margin: 15mm; size: A4; }
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10px; color: #333; line-height: 1.4; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
        .logo { height: 50px; }
        .company-info { text-align: right; }
        .company-name { font-size: 14px; font-weight: bold; text-transform: uppercase; }
        .project-info { margin-bottom: 5px; }
        
        .section-title { background-color: #f1f5f9; padding: 8px 10px; font-weight: bold; font-size: 11px; border-bottom: 2px solid #cbd5e1; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
        .class-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; }
        .class-A { background-color: #ef4444; color: white; }
        .class-B { background-color: #f59e0b; color: white; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th { background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 6px 4px; text-align: left; font-weight: bold; font-size: 9px; }
        td { border-bottom: 1px solid #e2e8f0; padding: 5px 4px; font-size: 9px; }
        tr:last-child td { border-bottom: none; }
        
        .cotacao-cell { background-color: #fef3c7; border: 1px solid #fbbf24; min-height: 25px; }
        
        .summary-box { margin-top: 30px; border: 2px solid #333; padding: 15px; width: 50%; margin-left: auto; page-break-inside: avoid; }
        .summary-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e2e8f0; }
        .summary-row.total { border-top: 2px solid #333; font-weight: bold; font-size: 11px; padding-top: 10px; margin-top: 5px; }
        
        .instructions { margin-top: 20px; padding: 10px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; font-size: 9px; }
        
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
            <div><strong>Orçamento:</strong> ${budgetName}</div>
            <div><strong>Data:</strong> ${dateStr}</div>
          </div>
        </div>
      </div>
      
      <h2 style="text-align: center; margin-bottom: 20px; color: #1e40af;">MAPA DE COTAÇÕES - INSUMOS PRIORITÁRIOS</h2>
      
      <div class="instructions">
        <strong>Instruções:</strong> Este mapa contém os insumos das classes A e B (curva ABC), que representam os itens de maior impacto no custo total. 
        Utilize a coluna "Cotação" para registrar os preços obtidos junto aos fornecedores.
      </div>
      
      ${classA.length > 0 ? `
        <div class="section-title">
          <div>
            <span class="class-badge class-A">CLASSE A</span>
            <span style="margin-left: 10px; font-size: 9px; color: #64748b;">Alta prioridade - ${classA.length} itens</span>
          </div>
          <span>${fmt(totalA)}</span>
        </div>
        ${renderTable(classA, 'A')}
      ` : ''}
      
      ${classB.length > 0 ? `
        <div class="section-title">
          <div>
            <span class="class-badge class-B">CLASSE B</span>
            <span style="margin-left: 10px; font-size: 9px; color: #64748b;">Média prioridade - ${classB.length} itens</span>
          </div>
          <span>${fmt(totalB)}</span>
        </div>
        ${renderTable(classB, 'B')}
      ` : ''}
      
      <div class="summary-box">
        <h3 style="margin-top: 0; margin-bottom: 10px;">Resumo do Mapa</h3>
        <div class="summary-row">
          <span>Total Classe A:</span>
          <span>${fmt(totalA)}</span>
        </div>
        <div class="summary-row">
          <span>Total Classe B:</span>
          <span>${fmt(totalB)}</span>
        </div>
        <div class="summary-row total">
          <span>TOTAL GERAL:</span>
          <span>${fmt(totalGeral)}</span>
        </div>
      </div>
      
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

// Exportar para Excel formatado
export const exportToExcel = (analysisData, budgetData) => {
  // Filtrar apenas A e B
  const filteredData = analysisData.filter(item => item.classe === 'A' || item.classe === 'B');
  
  // Agrupar por classe
  const classA = filteredData.filter(item => item.classe === 'A');
  const classB = filteredData.filter(item => item.classe === 'B');
  
  // Criar workbook
  const wb = XLSX.utils.book_new();
  
  // Função para criar sheet com formatação
  const createSheet = (items, className, classColor) => {
    // Cabeçalho
    const header = [
      ['MAPA DE COTAÇÕES - INSUMOS CLASSE ' + className],
      ['Obra:', budgetData?.obra_nome || 'N/A'],
      ['Orçamento:', budgetData?.descricao || 'N/A'],
      ['Data:', format(new Date(), 'dd/MM/yyyy')],
      [],
      ['Código', 'Descrição', 'Unidade', 'Qtd Total', 'Valor Unit.', 'Valor Total', 'Cotação 1', 'Fornecedor 1', 'Cotação 2', 'Fornecedor 2', 'Cotação 3', 'Fornecedor 3', 'Melhor Preço', 'Observações']
    ];
    
    // Dados
    const data = items.map(item => [
      item.codigo || '',
      item.descricao || '',
      item.unidade || '',
      item.quantidade_total,
      item.valor_unitario,
      item.valor_total,
      '', // Cotação 1
      '', // Fornecedor 1
      '', // Cotação 2
      '', // Fornecedor 2
      '', // Cotação 3
      '', // Fornecedor 3
      '', // Melhor Preço
      ''  // Observações
    ]);
    
    // Totais
    const totalRow = [
      '', '', 'TOTAL:', 
      items.reduce((sum, item) => sum + item.quantidade_total, 0),
      '',
      items.reduce((sum, item) => sum + item.valor_total, 0),
      '', '', '', '', '', '', '', ''
    ];
    
    // Combinar tudo
    const sheetData = [...header, ...data, [], totalRow];
    
    // Criar worksheet
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    
    // Largura das colunas
    ws['!cols'] = [
      { wch: 12 },  // Código
      { wch: 40 },  // Descrição
      { wch: 8 },   // Unidade
      { wch: 12 },  // Qtd Total
      { wch: 12 },  // Valor Unit.
      { wch: 14 },  // Valor Total
      { wch: 12 },  // Cotação 1
      { wch: 20 },  // Fornecedor 1
      { wch: 12 },  // Cotação 2
      { wch: 20 },  // Fornecedor 2
      { wch: 12 },  // Cotação 3
      { wch: 20 },  // Fornecedor 3
      { wch: 12 },  // Melhor Preço
      { wch: 30 }   // Observações
    ];
    
    // Formatação de números (valores)
    const numFmt = '#,##0.00';
    const currencyFmt = 'R$ #,##0.00';
    
    // Aplicar formato de moeda nas colunas apropriadas
    for (let row = 6; row < 6 + data.length; row++) {
      const rowIdx = row + 1; // Excel é 1-indexed
      
      // Quantidade
      if (ws[`D${rowIdx}`]) ws[`D${rowIdx}`].z = numFmt;
      // Valor Unitário
      if (ws[`E${rowIdx}`]) ws[`E${rowIdx}`].z = currencyFmt;
      // Valor Total
      if (ws[`F${rowIdx}`]) ws[`F${rowIdx}`].z = currencyFmt;
      // Cotações
      if (ws[`G${rowIdx}`]) ws[`G${rowIdx}`].z = currencyFmt;
      if (ws[`I${rowIdx}`]) ws[`I${rowIdx}`].z = currencyFmt;
      if (ws[`K${rowIdx}`]) ws[`K${rowIdx}`].z = currencyFmt;
      if (ws[`M${rowIdx}`]) ws[`M${rowIdx}`].z = currencyFmt;
    }
    
    // Linha de total
    const totalRowIdx = 6 + data.length + 2;
    if (ws[`D${totalRowIdx}`]) ws[`D${totalRowIdx}`].z = numFmt;
    if (ws[`F${totalRowIdx}`]) ws[`F${totalRowIdx}`].z = currencyFmt;
    
    return ws;
  };
  
  // Adicionar sheets
  if (classA.length > 0) {
    const wsA = createSheet(classA, 'A', 'FF0000');
    XLSX.utils.book_append_sheet(wb, wsA, 'Classe A');
  }
  
  if (classB.length > 0) {
    const wsB = createSheet(classB, 'B', 'FFA500');
    XLSX.utils.book_append_sheet(wb, wsB, 'Classe B');
  }
  
  // Sheet de resumo
  const summaryData = [
    ['RESUMO DO MAPA DE COTAÇÕES'],
    [],
    ['Classe', 'Qtd Itens', 'Valor Total'],
    ['A', classA.length, classA.reduce((sum, item) => sum + item.valor_total, 0)],
    ['B', classB.length, classB.reduce((sum, item) => sum + item.valor_total, 0)],
    [],
    ['TOTAL', classA.length + classB.length, classA.reduce((sum, item) => sum + item.valor_total, 0) + classB.reduce((sum, item) => sum + item.valor_total, 0)]
  ];
  
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 18 }];
  
  // Formatar valores monetários no resumo
  if (wsSummary['C4']) wsSummary['C4'].z = 'R$ #,##0.00';
  if (wsSummary['C5']) wsSummary['C5'].z = 'R$ #,##0.00';
  if (wsSummary['C7']) wsSummary['C7'].z = 'R$ #,##0.00';
  
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');
  
  // Download
  const fileName = `Mapa_Cotacoes_${budgetData?.descricao || 'Orcamento'}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
  XLSX.writeFile(wb, fileName);
};