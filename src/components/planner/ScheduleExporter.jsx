import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';

export async function exportScheduleXLSX(schedule, stages, items, months, budgetData) {
  try {
    // Criar workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cronograma');

    let currentRow = 1;

    // Logo
    try {
      const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6926eb0b6c1242bf806695a4/e482e0b04_logofundoclaro.jpg";
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      const imageId = workbook.addImage({
        buffer: arrayBuffer,
        extension: 'jpeg',
      });
      
      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 250, height: 60 }
      });
      
      currentRow = 5;
    } catch (e) {
      console.log('Logo não carregada');
    }

    // Título
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(65 + months + 1)}${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = 'CRONOGRAMA FÍSICO-FINANCEIRO';
    titleCell.font = { size: 18, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow += 2;

    // Dados
    worksheet.getRow(currentRow).getCell(1).value = 'Obra:';
    worksheet.getRow(currentRow).getCell(1).font = { bold: true };
    worksheet.getRow(currentRow).getCell(2).value = budgetData?.obra_nome || '-';
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Orçamento:';
    worksheet.getRow(currentRow).getCell(1).font = { bold: true };
    worksheet.getRow(currentRow).getCell(2).value = budgetData?.descricao || '-';
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Duração:';
    worksheet.getRow(currentRow).getCell(1).font = { bold: true };
    worksheet.getRow(currentRow).getCell(2).value = `${months} meses`;
    currentRow += 2;

    // Cabeçalho da tabela
    const headerRow = worksheet.getRow(currentRow);
    headerRow.getCell(1).value = 'Etapa';
    headerRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2962FF' } };
    headerRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    
    headerRow.getCell(2).value = 'Valor Total';
    headerRow.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2962FF' } };
    headerRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.getCell(2).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    
    for (let m = 1; m <= months; m++) {
      const cell = headerRow.getCell(m + 2);
      cell.value = `Mês ${m}`;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2962FF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    }
    
    headerRow.getCell(months + 3).value = 'Total %';
    headerRow.getCell(months + 3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.getCell(months + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2962FF' } };
    headerRow.getCell(months + 3).alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.getCell(months + 3).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    currentRow++;

    // Calcular valor de cada etapa
    const getStageValue = (stageId) => {
      let value = items
        .filter(item => item.stage_id === stageId)
        .reduce((sum, item) => sum + (item.subtotal || 0), 0);
      
      const subStages = stages.filter(s => s.parent_stage_id === stageId);
      subStages.forEach(subStage => {
        value += getStageValue(subStage.id);
      });
      
      return value;
    };

    // Dados das etapas
    const sortedStages = stages
      .filter(stage => !stage.parent_stage_id && getStageValue(stage.id) > 0)
      .sort((a, b) => a.ordem - b.ordem);
    
    sortedStages.forEach(stage => {
      const stageSchedule = schedule[stage.id] || { percentages: Array(months).fill(0), total: 0 };
      const stageValue = getStageValue(stage.id);
      
      // Linha da etapa com valor total
      const row = worksheet.getRow(currentRow);
      row.getCell(1).value = stage.nome;
      row.getCell(1).font = { bold: true };
      row.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      
      row.getCell(2).value = parseFloat(stageValue.toFixed(2));
      row.getCell(2).numFmt = 'R$ #,##0.00';
      row.getCell(2).font = { bold: true };
      row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(2).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      
      for (let m = 0; m < months; m++) {
        const cell = row.getCell(m + 3);
        const percentValue = stageSchedule.percentages[m] || 0;
        const monthValue = (stageValue * percentValue) / 100;
        
        // Mostrar percentual e valor
        cell.value = `${percentValue.toFixed(2)}%\nR$ ${monthValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        
        if (percentValue > 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        }
      }
      
      const totalCell = row.getCell(months + 3);
      totalCell.value = parseFloat((stageSchedule.total / 100).toFixed(4));
      totalCell.numFmt = '0.00%';
      totalCell.font = { bold: true };
      totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
      totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      totalCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      
      row.height = 30;
      currentRow++;
    });

    currentRow++;

    // TOTAL MENSAL
    const totalMensalRow = worksheet.getRow(currentRow);
    totalMensalRow.getCell(1).value = 'TOTAL MENSAL';
    totalMensalRow.getCell(1).font = { bold: true, size: 11 };
    totalMensalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    totalMensalRow.getCell(2).value = parseFloat((budgetData?.total_final || 0).toFixed(2));
    totalMensalRow.getCell(2).numFmt = 'R$ #,##0.00';
    totalMensalRow.getCell(2).font = { bold: true };
    totalMensalRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    
    for (let m = 0; m < months; m++) {
      const monthTotal = sortedStages.reduce((sum, stage) => {
        const stageValue = getStageValue(stage.id);
        const percentValue = (schedule[stage.id]?.percentages[m] || 0);
        return sum + (stageValue * percentValue) / 100;
      }, 0);
      
      const cell = totalMensalRow.getCell(m + 3);
      cell.value = parseFloat(monthTotal.toFixed(2));
      cell.numFmt = 'R$ #,##0.00';
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    }
    currentRow++;

    // ACUMULADO
    const acumuladoRow = worksheet.getRow(currentRow);
    acumuladoRow.getCell(1).value = 'ACUMULADO';
    acumuladoRow.getCell(1).font = { bold: true, size: 11 };
    acumuladoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
    acumuladoRow.getCell(2).value = '';
    acumuladoRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
    
    let accumulated = 0;
    for (let m = 0; m < months; m++) {
      const monthTotal = sortedStages.reduce((sum, stage) => {
        const stageValue = getStageValue(stage.id);
        const percentValue = (schedule[stage.id]?.percentages[m] || 0);
        return sum + (stageValue * percentValue) / 100;
      }, 0);
      
      accumulated += monthTotal;
      const cell = acumuladoRow.getCell(m + 3);
      cell.value = parseFloat(accumulated.toFixed(2));
      cell.numFmt = 'R$ #,##0.00';
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
    }
    currentRow++;

    // % ACUMULADO
    const percentAcumuladoRow = worksheet.getRow(currentRow);
    percentAcumuladoRow.getCell(1).value = '% ACUMULADO';
    percentAcumuladoRow.getCell(1).font = { bold: true, size: 11 };
    percentAcumuladoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    percentAcumuladoRow.getCell(2).value = '';
    percentAcumuladoRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    
    const totalBudget = budgetData?.total_final || 0;
    accumulated = 0;
    for (let m = 0; m < months; m++) {
      const monthTotal = sortedStages.reduce((sum, stage) => {
        const stageValue = getStageValue(stage.id);
        const percentValue = (schedule[stage.id]?.percentages[m] || 0);
        return sum + (stageValue * percentValue) / 100;
      }, 0);
      
      accumulated += monthTotal;
      const cell = percentAcumuladoRow.getCell(m + 3);
      cell.value = totalBudget > 0 ? parseFloat(((accumulated / totalBudget) * 100).toFixed(2)) / 100 : 0;
      cell.numFmt = '0.00%';
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    }
    currentRow++;

    // Largura das colunas
    const columns = [{ width: 30 }, { width: 16 }];
    for (let i = 0; i < months; i++) {
      columns.push({ width: 16 });
    }
    columns.push({ width: 12 });
    worksheet.columns = columns;

    // Exportar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `Cronograma_${budgetData?.descricao || 'Orcamento'}.xlsx`.replace(/[/\\?%*:|"<>]/g, '_');
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);

    return { success: true, message: 'Cronograma exportado em XLSX!' };
  } catch (error) {
    console.error('Erro ao exportar XLSX:', error);
    return { success: false, message: 'Erro: ' + error.message };
  }
}

export async function exportSchedulePDF(schedule, stages, items, months, budgetData) {
  try {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // Logo
    const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6926eb0b6c1242bf806695a4/e482e0b04_logofundoclaro.jpg";
    try {
      doc.addImage(logoUrl, 'JPEG', 15, yPos, 70, 17);
    } catch (e) {
      console.log('Logo não carregada');
    }

    // Título
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('CRONOGRAMA FÍSICO-FINANCEIRO', pageWidth / 2, yPos + 8, { align: 'center' });
    
    yPos += 25;
    
    // Dados
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Obra: ${budgetData?.obra_nome || '-'}`, 15, yPos);
    yPos += 5;
    doc.text(`Orçamento: ${budgetData?.descricao || '-'}`, 15, yPos);
    yPos += 5;
    doc.text(`Duração: ${months} meses`, 15, yPos);
    
    yPos += 10;

    // Calcular valor de cada etapa
    const getStageValue = (stageId) => {
      let value = items
        .filter(item => item.stage_id === stageId)
        .reduce((sum, item) => sum + (item.subtotal || 0), 0);
      
      const subStages = stages.filter(s => s.parent_stage_id === stageId);
      subStages.forEach(subStage => {
        value += getStageValue(subStage.id);
      });
      
      return value;
    };

    // Cabeçalho da tabela
    const colWidth = Math.min(18, (pageWidth - 100) / months);
    const tableStartX = 10;
    const valueColWidth = 30;
    
    doc.setFillColor(41, 98, 255);
    doc.rect(tableStartX, yPos, 40, 7, 'F');
    doc.rect(tableStartX + 40, yPos, valueColWidth, 7, 'F');
    for (let m = 1; m <= months; m++) {
      doc.rect(tableStartX + 40 + valueColWidth + (m - 1) * colWidth, yPos, colWidth, 7, 'F');
    }
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont(undefined, 'bold');
    doc.text('Etapa', tableStartX + 2, yPos + 4.5);
    doc.text('Valor Total', tableStartX + 42, yPos + 4.5);
    
    for (let m = 1; m <= months; m++) {
      doc.text(`M${m}`, tableStartX + 40 + valueColWidth + (m - 1) * colWidth + colWidth / 2, yPos + 4.5, { align: 'center' });
    }
    yPos += 8;

    // Dados
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(6);
    
    const sortedStages = stages
      .filter(stage => !stage.parent_stage_id && getStageValue(stage.id) > 0)
      .sort((a, b) => a.ordem - b.ordem);
    
    sortedStages.forEach(stage => {
      if (yPos > 175) {
        doc.addPage();
        yPos = 20;
      }

      const stageSchedule = schedule[stage.id] || { percentages: Array(months).fill(0), total: 0 };
      const stageValue = getStageValue(stage.id);
      
      doc.setFont(undefined, 'bold');
      const stageName = stage.nome.substring(0, 20);
      doc.text(stageName, tableStartX + 2, yPos + 3);
      
      // Valor total
      doc.setFont(undefined, 'normal');
      doc.text(formatCurrency(stageValue), tableStartX + 42, yPos + 3);
      
      for (let m = 0; m < months; m++) {
        const percentValue = stageSchedule.percentages[m] || 0;
        const monthValue = (stageValue * percentValue) / 100;
        
        if (percentValue > 0) {
          doc.setFillColor(224, 242, 254);
          doc.rect(tableStartX + 40 + valueColWidth + m * colWidth, yPos, colWidth, 7, 'F');
        }
        
        doc.setFontSize(6);
        doc.text(`${percentValue.toFixed(1)}%`, tableStartX + 40 + valueColWidth + m * colWidth + colWidth / 2, yPos + 2.5, { align: 'center' });
        doc.setFontSize(5);
        doc.text(formatCurrencyShort(monthValue), tableStartX + 40 + valueColWidth + m * colWidth + colWidth / 2, yPos + 5.5, { align: 'center' });
      }
      
      yPos += 8;
    });

    yPos += 2;

    // TOTAL MENSAL
    if (yPos > 170) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFillColor(226, 232, 240);
    doc.rect(tableStartX, yPos, 40 + valueColWidth + months * colWidth, 6, 'F');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.text('TOTAL MENSAL', tableStartX + 2, yPos + 4);
    doc.text(formatCurrency(budgetData?.total_final || 0), tableStartX + 42, yPos + 4);
    
    for (let m = 0; m < months; m++) {
      const monthTotal = sortedStages.reduce((sum, stage) => {
        const stageValue = getStageValue(stage.id);
        const percentValue = (schedule[stage.id]?.percentages[m] || 0);
        return sum + (stageValue * percentValue) / 100;
      }, 0);
      
      doc.setFontSize(6);
      doc.text(formatCurrencyShort(monthTotal), tableStartX + 40 + valueColWidth + m * colWidth + colWidth / 2, yPos + 4, { align: 'center' });
    }
    yPos += 7;

    // ACUMULADO
    doc.setFillColor(203, 213, 225);
    doc.rect(tableStartX, yPos, 40 + valueColWidth + months * colWidth, 6, 'F');
    doc.text('ACUMULADO', tableStartX + 2, yPos + 4);
    
    let accumulated = 0;
    for (let m = 0; m < months; m++) {
      const monthTotal = sortedStages.reduce((sum, stage) => {
        const stageValue = getStageValue(stage.id);
        const percentValue = (schedule[stage.id]?.percentages[m] || 0);
        return sum + (stageValue * percentValue) / 100;
      }, 0);
      
      accumulated += monthTotal;
      doc.setFontSize(6);
      doc.text(formatCurrencyShort(accumulated), tableStartX + 40 + valueColWidth + m * colWidth + colWidth / 2, yPos + 4, { align: 'center' });
    }
    yPos += 7;

    // % ACUMULADO
    doc.setFillColor(219, 234, 254);
    doc.rect(tableStartX, yPos, 40 + valueColWidth + months * colWidth, 6, 'F');
    doc.text('% ACUMULADO', tableStartX + 2, yPos + 4);
    
    const totalBudget = budgetData?.total_final || 0;
    accumulated = 0;
    for (let m = 0; m < months; m++) {
      const monthTotal = sortedStages.reduce((sum, stage) => {
        const stageValue = getStageValue(stage.id);
        const percentValue = (schedule[stage.id]?.percentages[m] || 0);
        return sum + (stageValue * percentValue) / 100;
      }, 0);
      
      accumulated += monthTotal;
      const percentAccum = totalBudget > 0 ? (accumulated / totalBudget) * 100 : 0;
      doc.setFontSize(6);
      doc.text(`${percentAccum.toFixed(2)}%`, tableStartX + 40 + valueColWidth + m * colWidth + colWidth / 2, yPos + 4, { align: 'center' });
    }
    yPos += 7;

    // Rodapé
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
    }

    const fileName = `Cronograma_${budgetData?.descricao || 'Orcamento'}.pdf`.replace(/[/\\?%*:|"<>]/g, '_');
    doc.save(fileName);

    return { success: true, message: 'Cronograma exportado em PDF!' };
  } catch (error) {
    console.error('Erro ao exportar PDF:', error);
    return { success: false, message: 'Erro: ' + error.message };
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
}

function formatCurrencyShort(value) {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`;
  }
  return `R$ ${value.toFixed(0)}`;
}