import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';

export async function exportMeasurementXLSX(measurementId) {
  try {
    // Buscar dados
    const measurement = (await base44.entities.Measurement.filter({ id: measurementId }))[0];
    const measurementItems = await base44.entities.MeasurementItem.filter({ medicao_id: measurementId });
    const budget = (await base44.entities.Budget.filter({ id: measurement.orcamento_id }))[0];
    const budgetItems = await base44.entities.BudgetItem.filter({ orcamento_id: measurement.orcamento_id });
    const project = (await base44.entities.Project.filter({ id: measurement.obra_id }))[0];

    // Criar mapa de itens do orçamento
    const budgetItemMap = {};
    budgetItems.forEach(item => {
      budgetItemMap[item.servico_id] = item;
    });

    // Calcular totais
    let totalMaterialPeriodo = 0;
    let totalMaoObraPeriodo = 0;
    
    const itemsEnriquecidos = measurementItems.map(item => {
      const budgetItem = budgetItemMap[item.servico_id];
      const custoUnitMaterial = budgetItem?.custo_unitario_material || 0;
      const custoUnitMaoObra = budgetItem?.custo_unitario_mao_obra || 0;
      
      const valorMaterialPeriodo = item.quantidade_executada_periodo * custoUnitMaterial;
      const valorMaoObraPeriodo = item.quantidade_executada_periodo * custoUnitMaoObra;
      
      totalMaterialPeriodo += valorMaterialPeriodo;
      totalMaoObraPeriodo += valorMaoObraPeriodo;
      
      return {
        ...item,
        valor_material_periodo: valorMaterialPeriodo,
        valor_mao_obra_periodo: valorMaoObraPeriodo
      };
    });

    const subtotalPeriodo = totalMaterialPeriodo + totalMaoObraPeriodo;
    const bdiPercentual = budget?.bdi_padrao || 0;
    const valorBDIPeriodo = subtotalPeriodo * (bdiPercentual / 100);
    const totalComBDIPeriodo = subtotalPeriodo + valorBDIPeriodo;

    // Formatar datas
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('pt-BR');
    };

    // Criar workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Medição');

    let currentRow = 1;

    // Logo
    try {
      const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg";
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      const imageId = workbook.addImage({
        buffer: arrayBuffer,
        extension: 'jpeg',
      });
      
      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 200, height: 80 }
      });
      
      currentRow = 6;
    } catch (e) {
      console.log('Logo não carregada');
    }

    // Título
    worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = 'MEDIÇÃO DE OBRA';
    titleCell.font = { size: 18, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow += 2;

    // Dados da Obra
    const headerRow1 = worksheet.getRow(currentRow);
    headerRow1.getCell(1).value = 'DADOS DA OBRA';
    headerRow1.getCell(1).font = { bold: true, size: 12 };
    headerRow1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } };
    currentRow++;

    worksheet.getRow(currentRow).getCell(1).value = 'Obra:';
    worksheet.getRow(currentRow).getCell(2).value = measurement.obra_nome;
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Endereço:';
    worksheet.getRow(currentRow).getCell(2).value = project?.endereco || '-';
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Cidade/Estado:';
    worksheet.getRow(currentRow).getCell(2).value = `${project?.cidade || ''} / ${project?.estado || ''}`;
    currentRow += 2;

    // Dados da Medição
    const headerRow2 = worksheet.getRow(currentRow);
    headerRow2.getCell(1).value = 'DADOS DA MEDIÇÃO';
    headerRow2.getCell(1).font = { bold: true, size: 12 };
    headerRow2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } };
    currentRow++;

    worksheet.getRow(currentRow).getCell(1).value = 'Medição Nº:';
    worksheet.getRow(currentRow).getCell(2).value = measurement.numero_medicao;
    worksheet.getRow(currentRow).getCell(4).value = 'Período:';
    worksheet.getRow(currentRow).getCell(5).value = measurement.periodo_referencia;
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Data Início:';
    worksheet.getRow(currentRow).getCell(2).value = formatDate(measurement.data_inicio);
    worksheet.getRow(currentRow).getCell(4).value = 'Data Fim:';
    worksheet.getRow(currentRow).getCell(5).value = formatDate(measurement.data_fim);
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Emissão:';
    worksheet.getRow(currentRow).getCell(2).value = new Date().toLocaleDateString('pt-BR');
    currentRow += 2;

    // Cabeçalho da tabela
    const tableHeaderRow = worksheet.getRow(currentRow);
    const headers = ['Etapa', 'Código', 'Descrição', 'Unidade', 'Qtd Período', 'Material (R$)', 'Mão de Obra (R$)', 'Subtotal (R$)'];
    headers.forEach((header, idx) => {
      const cell = tableHeaderRow.getCell(idx + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2962FF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    currentRow++;

    // Agrupar por etapa
    const itemsByStage = {};
    itemsEnriquecidos.forEach(item => {
      const stageName = item.stage_nome || 'Sem Etapa';
      if (!itemsByStage[stageName]) {
        itemsByStage[stageName] = [];
      }
      itemsByStage[stageName].push(item);
    });

    // Adicionar itens
    Object.keys(itemsByStage).forEach(stageName => {
      const stageItems = itemsByStage[stageName];
      
      // Linha da etapa
      const stageRow = worksheet.getRow(currentRow);
      stageRow.getCell(1).value = stageName;
      stageRow.getCell(1).font = { bold: true };
      stageRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      for (let i = 1; i <= 8; i++) {
        stageRow.getCell(i).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      currentRow++;
      
      stageItems.forEach(item => {
        const row = worksheet.getRow(currentRow);
        row.getCell(2).value = item.codigo;
        row.getCell(3).value = item.descricao;
        row.getCell(4).value = item.unidade;
        row.getCell(5).value = item.quantidade_executada_periodo;
        row.getCell(6).value = item.valor_material_periodo;
        row.getCell(6).numFmt = 'R$ #,##0.00';
        row.getCell(7).value = item.valor_mao_obra_periodo;
        row.getCell(7).numFmt = 'R$ #,##0.00';
        row.getCell(8).value = item.valor_material_periodo + item.valor_mao_obra_periodo;
        row.getCell(8).numFmt = 'R$ #,##0.00';
        
        for (let i = 1; i <= 8; i++) {
          row.getCell(i).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
        currentRow++;
      });
    });

    currentRow += 2;

    // Totais
    const addTotalRow = (label, value, bold = false) => {
      const row = worksheet.getRow(currentRow);
      row.getCell(5).value = label;
      row.getCell(5).font = { bold };
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(8).value = value;
      row.getCell(8).numFmt = 'R$ #,##0.00';
      row.getCell(8).font = { bold };
      row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      currentRow++;
    };

    addTotalRow('SUBTOTAL MATERIAL:', totalMaterialPeriodo);
    addTotalRow('SUBTOTAL MÃO DE OBRA:', totalMaoObraPeriodo);
    addTotalRow('SUBTOTAL GERAL:', subtotalPeriodo, true);
    addTotalRow(`BDI (${bdiPercentual}%):`, valorBDIPeriodo);
    addTotalRow('TOTAL COM BDI:', totalComBDIPeriodo, true);
    
    currentRow++;
    
    // Valores com BDI
    const bdiRow1 = worksheet.getRow(currentRow);
    bdiRow1.getCell(5).value = 'Material com BDI:';
    bdiRow1.getCell(5).font = { bold: true };
    bdiRow1.getCell(5).alignment = { horizontal: 'right' };
    bdiRow1.getCell(8).value = totalMaterialPeriodo + (totalMaterialPeriodo * bdiPercentual / 100);
    bdiRow1.getCell(8).numFmt = 'R$ #,##0.00';
    bdiRow1.getCell(8).font = { bold: true };
    bdiRow1.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0FF' } };
    currentRow++;
    
    const bdiRow2 = worksheet.getRow(currentRow);
    bdiRow2.getCell(5).value = 'Mão de Obra com BDI:';
    bdiRow2.getCell(5).font = { bold: true };
    bdiRow2.getCell(5).alignment = { horizontal: 'right' };
    bdiRow2.getCell(8).value = totalMaoObraPeriodo + (totalMaoObraPeriodo * bdiPercentual / 100);
    bdiRow2.getCell(8).numFmt = 'R$ #,##0.00';
    bdiRow2.getCell(8).font = { bold: true };
    bdiRow2.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0FF' } };

    // Largura das colunas
    worksheet.columns = [
      { width: 20 },
      { width: 12 },
      { width: 50 },
      { width: 10 },
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 16 }
    ];

    // Exportar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `Medicao_${measurement.numero_medicao}_${measurement.obra_nome}_${measurement.periodo_referencia}.xlsx`.replace(/[/\\?%*:|"<>]/g, '_');
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);

    return { success: true, message: 'XLSX exportado com sucesso!' };
  } catch (error) {
    console.error('Erro ao exportar XLSX:', error);
    return { success: false, message: 'Erro ao exportar XLSX: ' + error.message };
  }
}

export async function exportMeasurementPDF(measurementId) {
  try {
    // Buscar dados
    const measurement = (await base44.entities.Measurement.filter({ id: measurementId }))[0];
    const measurementItems = await base44.entities.MeasurementItem.filter({ medicao_id: measurementId });
    const budget = (await base44.entities.Budget.filter({ id: measurement.orcamento_id }))[0];
    const budgetItems = await base44.entities.BudgetItem.filter({ orcamento_id: measurement.orcamento_id });
    const project = (await base44.entities.Project.filter({ id: measurement.obra_id }))[0];

    // Criar mapa de itens do orçamento
    const budgetItemMap = {};
    budgetItems.forEach(item => {
      budgetItemMap[item.servico_id] = item;
    });

    // Calcular totais
    let totalMaterialPeriodo = 0;
    let totalMaoObraPeriodo = 0;
    
    const itemsEnriquecidos = measurementItems.map(item => {
      const budgetItem = budgetItemMap[item.servico_id];
      const custoUnitMaterial = budgetItem?.custo_unitario_material || 0;
      const custoUnitMaoObra = budgetItem?.custo_unitario_mao_obra || 0;
      
      const valorMaterialPeriodo = item.quantidade_executada_periodo * custoUnitMaterial;
      const valorMaoObraPeriodo = item.quantidade_executada_periodo * custoUnitMaoObra;
      
      totalMaterialPeriodo += valorMaterialPeriodo;
      totalMaoObraPeriodo += valorMaoObraPeriodo;
      
      return {
        ...item,
        valor_material_periodo: valorMaterialPeriodo,
        valor_mao_obra_periodo: valorMaoObraPeriodo
      };
    });

    const subtotalPeriodo = totalMaterialPeriodo + totalMaoObraPeriodo;
    const bdiPercentual = budget?.bdi_padrao || 0;
    const valorBDIPeriodo = subtotalPeriodo * (bdiPercentual / 100);
    const totalComBDIPeriodo = subtotalPeriodo + valorBDIPeriodo;

    // Formatar datas
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('pt-BR');
    };

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // Logo (tamanho maior)
    const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg";
    try {
      doc.addImage(logoUrl, 'JPEG', 15, yPos, 60, 25);
    } catch (e) {
      console.log('Logo não carregada');
    }

    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('MEDIÇÃO DE OBRA', pageWidth / 2, yPos + 10, { align: 'center' });
    
    yPos += 30;
    
    // Cabeçalho com dados da obra
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DA OBRA', 15, yPos);
    yPos += 7;
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Obra: ${measurement.obra_nome}`, 15, yPos);
    yPos += 5;
    doc.text(`Endereço: ${project?.endereco || '-'}`, 15, yPos);
    yPos += 5;
    doc.text(`Cidade/Estado: ${project?.cidade || ''} / ${project?.estado || ''}`, 15, yPos);
    
    yPos += 10;
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DA MEDIÇÃO', 15, yPos);
    yPos += 7;
    
    doc.setFont(undefined, 'normal');
    doc.text(`Medição Nº: ${measurement.numero_medicao}`, 15, yPos);
    doc.text(`Período: ${measurement.periodo_referencia}`, 100, yPos);
    yPos += 5;
    doc.text(`Data Início: ${formatDate(measurement.data_inicio)}`, 15, yPos);
    doc.text(`Data Fim: ${formatDate(measurement.data_fim)}`, 100, yPos);
    doc.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 180, yPos);
    
    yPos += 12;

    // Agrupar por etapa
    const itemsByStage = {};
    itemsEnriquecidos.forEach(item => {
      const stageName = item.stage_nome || 'Sem Etapa';
      if (!itemsByStage[stageName]) {
        itemsByStage[stageName] = [];
      }
      itemsByStage[stageName].push(item);
    });

    // Cabeçalho da tabela
    doc.setFillColor(41, 98, 255);
    doc.rect(10, yPos, 277, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('Cód', 12, yPos + 5);
    doc.text('Descrição', 28, yPos + 5);
    doc.text('Un', 95, yPos + 5);
    doc.text('Qtd', 110, yPos + 5);
    doc.text('Material (R$)', 135, yPos + 5);
    doc.text('Mão Obra (R$)', 175, yPos + 5);
    doc.text('Subtotal (R$)', 220, yPos + 5);
    yPos += 8;

    // Renderizar itens por etapa
    doc.setTextColor(0, 0, 0);
    Object.keys(itemsByStage).forEach(stageName => {
      const stageItems = itemsByStage[stageName];

      // Verificar espaço
      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }

      // Nome da etapa
      doc.setFillColor(230, 230, 230);
      doc.rect(10, yPos, 277, 6, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      doc.text(stageName, 12, yPos + 4);
      yPos += 7;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      
      stageItems.forEach(item => {
        if (yPos > 185) {
          doc.addPage();
          yPos = 20;
        }

        doc.text(item.codigo || '', 12, yPos + 4);
        doc.text((item.descricao || '').substring(0, 40), 28, yPos + 4);
        doc.text(item.unidade || '', 95, yPos + 4);
        doc.text(formatNumber(item.quantidade_executada_periodo), 110, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_material_periodo), 135, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_mao_obra_periodo), 175, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_material_periodo + item.valor_mao_obra_periodo), 220, yPos + 4, { align: 'right' });

        yPos += 5;
      });

      yPos += 3;
    });

    // Totais
    if (yPos > 150) {
      doc.addPage();
      yPos = 20;
    }

    yPos += 5;
    doc.setFillColor(245, 245, 245);
    doc.rect(10, yPos, 277, 30, 'F');
    
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9);
    yPos += 6;
    doc.text('SUBTOTAL MATERIAL:', 180, yPos);
    doc.text(formatCurrency(totalMaterialPeriodo), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.text('SUBTOTAL MÃO DE OBRA:', 180, yPos);
    doc.text(formatCurrency(totalMaoObraPeriodo), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.text('SUBTOTAL GERAL:', 180, yPos);
    doc.text(formatCurrency(subtotalPeriodo), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.text(`BDI (${bdiPercentual}%):`, 180, yPos);
    doc.text(formatCurrency(valorBDIPeriodo), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.setFontSize(10);
    doc.text('TOTAL COM BDI:', 180, yPos);
    doc.text(formatCurrency(totalComBDIPeriodo), 260, yPos, { align: 'right' });

    yPos += 12;
    doc.setFillColor(220, 240, 255);
    doc.rect(10, yPos, 277, 10, 'F');
    doc.setFontSize(9);
    yPos += 6;
    doc.text('Material com BDI:', 20, yPos);
    doc.text(formatCurrency(totalMaterialPeriodo + (totalMaterialPeriodo * bdiPercentual / 100)), 90, yPos);
    doc.text('Mão de Obra com BDI:', 150, yPos);
    doc.text(formatCurrency(totalMaoObraPeriodo + (totalMaoObraPeriodo * bdiPercentual / 100)), 230, yPos);

    // Rodapé em todas as páginas
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
      doc.text(
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        10,
        doc.internal.pageSize.getHeight() - 10
      );
    }

    // Salvar
    const fileName = `Medicao_${measurement.numero_medicao}_${measurement.obra_nome}_${measurement.periodo_referencia}.pdf`.replace(/[/\\?%*:|"<>]/g, '_');
    doc.save(fileName);

    return { success: true, message: 'PDF exportado com sucesso!' };
  } catch (error) {
    console.error('Erro ao exportar PDF:', error);
    return { success: false, message: 'Erro ao exportar PDF: ' + error.message };
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
}

function formatNumber(value) {
  return (value || 0).toFixed(2);
}