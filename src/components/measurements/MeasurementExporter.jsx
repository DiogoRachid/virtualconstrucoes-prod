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
    const projectStages = await base44.entities.ProjectStage.filter({ orcamento_id: measurement.orcamento_id });

    // Criar mapa de itens do orçamento
    const budgetItemMap = {};
    budgetItems.forEach(item => {
      budgetItemMap[item.servico_id] = item;
    });

    // Criar mapa de etapas
    const stageMap = {};
    projectStages.forEach(stage => {
      stageMap[stage.id] = stage;
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

    // Criar hierarquia de etapas com numeração
    const createStageHierarchy = () => {
      const mainStages = projectStages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);
      const hierarchy = [];
      
      mainStages.forEach((mainStage, mainIdx) => {
        const mainStageItems = itemsEnriquecidos.filter(i => i.stage_id === mainStage.id);
        
        hierarchy.push({
          id: mainStage.id,
          nome: mainStage.nome,
          number: `${mainIdx + 1}.`,
          level: 0,
          items: mainStageItems,
          ordem: mainStage.ordem
        });
        
        const subStages = projectStages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
        subStages.forEach((subStage, subIdx) => {
          const subStageItems = itemsEnriquecidos.filter(i => i.stage_id === subStage.id);
          
          hierarchy.push({
            id: subStage.id,
            nome: subStage.nome,
            number: `${mainIdx + 1}.${subIdx + 1}`,
            level: 1,
            items: subStageItems,
            ordem: subStage.ordem
          });
        });
      });
      
      return hierarchy;
    };

    const stageHierarchy = createStageHierarchy();

    // Verificar se uma etapa principal tem serviços (diretos ou em subetapas)
    const hasItemsInHierarchy = (stageId) => {
      if (itemsEnriquecidos.some(i => i.stage_id === stageId)) return true;
      return projectStages.some(s => 
        s.parent_stage_id === stageId && itemsEnriquecidos.some(i => i.stage_id === s.id)
      );
    };

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
    const headers = ['Item', 'Código', 'Descrição', 'Unidade', 'Qtd Período', 'Material (R$)', 'Mão de Obra (R$)', 'Subtotal (R$)'];
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

    // Adicionar itens usando hierarquia com numeração
    stageHierarchy.forEach(stage => {
      // Para etapas principais (nível 0), mostrar sempre se tiver itens na hierarquia
      if (stage.level === 0 && !hasItemsInHierarchy(stage.id)) return;
      
      // Para subetapas (nível 1+), só mostrar se tiver itens diretos
      if (stage.level > 0 && stage.items.length === 0) return;
      
      // Linha da etapa com número hierárquico
      const stageRow = worksheet.getRow(currentRow);
      stageRow.getCell(1).value = `${stage.number} ${stage.nome}`;
      stageRow.getCell(1).font = { bold: true };
      stageRow.getCell(1).fill = { 
        type: 'pattern', 
        pattern: 'solid', 
        fgColor: { argb: stage.level === 0 ? 'FFD0D0D0' : 'FFE8E8E8' } 
      };
      for (let i = 1; i <= 8; i++) {
        stageRow.getCell(i).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      currentRow++;
      
      stage.items.forEach((item, itemIdx) => {
        const row = worksheet.getRow(currentRow);
        // Adicionar número hierárquico do item
        const itemNumber = `${stage.number}${itemIdx + 1}`;
        row.getCell(1).value = itemNumber;
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).value = item.codigo;
        row.getCell(3).value = item.descricao;
        row.getCell(4).value = item.unidade;
        row.getCell(5).value = parseFloat(item.quantidade_executada_periodo.toFixed(2));
        row.getCell(5).numFmt = '0.00';
        row.getCell(6).value = parseFloat(item.valor_material_periodo.toFixed(2));
        row.getCell(6).numFmt = 'R$ #,##0.00';
        row.getCell(7).value = parseFloat(item.valor_mao_obra_periodo.toFixed(2));
        row.getCell(7).numFmt = 'R$ #,##0.00';
        row.getCell(8).value = parseFloat((item.valor_material_periodo + item.valor_mao_obra_periodo).toFixed(2));
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
      row.getCell(8).value = parseFloat(value.toFixed(2));
      row.getCell(8).numFmt = 'R$ #,##0.00';
      row.getCell(8).font = { bold };
      row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      currentRow++;
    };

    addTotalRow('SUBTOTAL MATERIAL:', totalMaterialPeriodo);
    addTotalRow('SUBTOTAL MÃO DE OBRA:', totalMaoObraPeriodo);
    addTotalRow('SUBTOTAL GERAL:', subtotalPeriodo, true);
    addTotalRow(`BDI (${bdiPercentual.toFixed(2)}%):`, valorBDIPeriodo);
    addTotalRow('TOTAL COM BDI:', totalComBDIPeriodo, true);
    
    currentRow++;
    
    // Valores com BDI
    const bdiRow1 = worksheet.getRow(currentRow);
    bdiRow1.getCell(5).value = 'Material com BDI:';
    bdiRow1.getCell(5).font = { bold: true };
    bdiRow1.getCell(5).alignment = { horizontal: 'right' };
    bdiRow1.getCell(8).value = parseFloat((totalMaterialPeriodo + (totalMaterialPeriodo * bdiPercentual / 100)).toFixed(2));
    bdiRow1.getCell(8).numFmt = 'R$ #,##0.00';
    bdiRow1.getCell(8).font = { bold: true };
    bdiRow1.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0FF' } };
    currentRow++;
    
    const bdiRow2 = worksheet.getRow(currentRow);
    bdiRow2.getCell(5).value = 'Mão de Obra com BDI:';
    bdiRow2.getCell(5).font = { bold: true };
    bdiRow2.getCell(5).alignment = { horizontal: 'right' };
    bdiRow2.getCell(8).value = parseFloat((totalMaoObraPeriodo + (totalMaoObraPeriodo * bdiPercentual / 100)).toFixed(2));
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
    const projectStages = await base44.entities.ProjectStage.filter({ orcamento_id: measurement.orcamento_id });

    // Criar mapa de itens do orçamento
    const budgetItemMap = {};
    budgetItems.forEach(item => {
      budgetItemMap[item.servico_id] = item;
    });

    // Criar mapa de etapas
    const stageMap = {};
    projectStages.forEach(stage => {
      stageMap[stage.id] = stage;
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

    // Criar hierarquia de etapas com numeração
    const createStageHierarchy = () => {
      const mainStages = projectStages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);
      const hierarchy = [];
      
      mainStages.forEach((mainStage, mainIdx) => {
        const mainStageItems = itemsEnriquecidos.filter(i => i.stage_id === mainStage.id);
        
        hierarchy.push({
          id: mainStage.id,
          nome: mainStage.nome,
          number: `${mainIdx + 1}.`,
          level: 0,
          items: mainStageItems,
          ordem: mainStage.ordem
        });
        
        const subStages = projectStages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
        subStages.forEach((subStage, subIdx) => {
          const subStageItems = itemsEnriquecidos.filter(i => i.stage_id === subStage.id);
          
          hierarchy.push({
            id: subStage.id,
            nome: subStage.nome,
            number: `${mainIdx + 1}.${subIdx + 1}`,
            level: 1,
            items: subStageItems,
            ordem: subStage.ordem
          });
        });
      });
      
      return hierarchy;
    };

    const stageHierarchy = createStageHierarchy();

    // Verificar se uma etapa principal tem serviços (diretos ou em subetapas)
    const hasItemsInHierarchy = (stageId) => {
      if (itemsEnriquecidos.some(i => i.stage_id === stageId)) return true;
      return projectStages.some(s => 
        s.parent_stage_id === stageId && itemsEnriquecidos.some(i => i.stage_id === s.id)
      );
    };

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

    // Logo (mantendo proporção)
    const logoUrl = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6926eb0b6c1242bf806695a4/e482e0b04_logofundoclaro.jpg";
    try {
      doc.addImage(logoUrl, 'JPEG', 15, yPos, 70, 17);
    } catch (e) {
      console.log('Logo não carregada');
    }

    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('MEDIÇÃO DE OBRA', pageWidth / 2, yPos + 8, { align: 'center' });
    
    yPos += 25;
    
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

    // Cabeçalho da tabela
    doc.setFillColor(41, 98, 255);
    doc.rect(10, yPos, 277, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('Item', 12, yPos + 5);
    doc.text('Cód', 32, yPos + 5);
    doc.text('Descrição', 50, yPos + 5);
    doc.text('Un', 115, yPos + 5);
    doc.text('Qtd', 130, yPos + 5);
    doc.text('Material (R$)', 155, yPos + 5);
    doc.text('Mão Obra (R$)', 195, yPos + 5);
    doc.text('Subtotal (R$)', 240, yPos + 5);
    yPos += 8;

    // Renderizar itens usando hierarquia com numeração
    doc.setTextColor(0, 0, 0);
    stageHierarchy.forEach(stage => {
      // Para etapas principais (nível 0), mostrar sempre se tiver itens na hierarquia
      if (stage.level === 0 && !hasItemsInHierarchy(stage.id)) return;
      
      // Para subetapas (nível 1+), só mostrar se tiver itens diretos
      if (stage.level > 0 && stage.items.length === 0) return;

      // Verificar espaço
      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }

      // Nome da etapa com número hierárquico
      doc.setFillColor(stage.level === 0 ? 208 : 232, stage.level === 0 ? 208 : 232, stage.level === 0 ? 208 : 232);
      doc.rect(10, yPos, 277, 6, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      doc.text(`${stage.number} ${stage.nome}`, 12, yPos + 4);
      yPos += 7;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      
      stage.items.forEach((item, itemIdx) => {
        if (yPos > 185) {
          doc.addPage();
          yPos = 20;
        }

        const itemNumber = `${stage.number}${itemIdx + 1}`;
        doc.text(itemNumber, 12, yPos + 4);
        doc.text(item.codigo || '', 32, yPos + 4);
        doc.text((item.descricao || '').substring(0, 35), 50, yPos + 4);
        doc.text(item.unidade || '', 115, yPos + 4);
        doc.text(formatNumber(item.quantidade_executada_periodo), 145, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_material_periodo), 185, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_mao_obra_periodo), 225, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_material_periodo + item.valor_mao_obra_periodo), 270, yPos + 4, { align: 'right' });

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

export async function exportCronogramaXLSX(measurementId) {
  try {
    const measurement = (await base44.entities.Measurement.filter({ id: measurementId }))[0];
    const budget = (await base44.entities.Budget.filter({ id: measurement.orcamento_id }))[0];
    const project = (await base44.entities.Project.filter({ id: measurement.obra_id }))[0];
    const projectStages = await base44.entities.ProjectStage.filter({ orcamento_id: measurement.orcamento_id });
    const budgetItems = await base44.entities.BudgetItem.filter({ orcamento_id: measurement.orcamento_id });
    const scheduleData = await base44.entities.ServiceMonthlyDistribution.filter({ orcamento_id: measurement.orcamento_id });
    const allMeasurements = await base44.entities.Measurement.filter({ obra_id: measurement.obra_id, orcamento_id: measurement.orcamento_id });
    const mesAtual = measurement.numero_medicao || 1;
    const bdiPercentual = budget?.bdi_padrao || 30;

    const costMap = {};
    budgetItems.forEach(bi => {
      costMap[bi.servico_id] = { material: bi.custo_unitario_material || 0, mao_obra: bi.custo_unitario_mao_obra || 0 };
    });

    // Build historic map
    const histMap = {};
    const sortedMeds = allMeasurements.sort((a, b) => a.numero_medicao - b.numero_medicao);
    const prevMeds = sortedMeds.filter(m => m.numero_medicao < mesAtual);
    const mainStages = projectStages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);

    for (const prevMed of prevMeds) {
      const itemsFromMed = await base44.entities.MeasurementItem.filter({ medicao_id: prevMed.id });
      mainStages.forEach((mainStage, mainIdx) => {
        const mainStageItems = itemsFromMed.filter(i => i.stage_id === mainStage.id);
        mainStageItems.forEach((item, itemIdx) => {
          histMap[`${mainIdx + 1}.${itemIdx + 1}_${prevMed.numero_medicao}`] = item.quantidade_executada_periodo || 0;
        });
        const subStages = projectStages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
        subStages.forEach((subStage, subIdx) => {
          const subItems = itemsFromMed.filter(i => i.stage_id === subStage.id);
          subItems.forEach((item, itemIdx) => {
            histMap[`${mainIdx + 1}.${subIdx + 1}.${itemIdx + 1}_${prevMed.numero_medicao}`] = item.quantidade_executada_periodo || 0;
          });
        });
      });
    }

    // Get current measurement items
    const currentItems = await base44.entities.MeasurementItem.filter({ medicao_id: measurementId });

    // Build stage hierarchy
    const hierarchy = [];
    mainStages.forEach((mainStage, mainIdx) => {
      const mainStageItems = currentItems.filter(i => i.stage_id === mainStage.id);
      hierarchy.push({ id: mainStage.id, nome: mainStage.nome, number: `${mainIdx + 1}.`, level: 0, items: mainStageItems });
      const subStages = projectStages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
      subStages.forEach((subStage, subIdx) => {
        const subItems = currentItems.filter(i => i.stage_id === subStage.id);
        hierarchy.push({ id: subStage.id, nome: subStage.nome, number: `${mainIdx + 1}.${subIdx + 1}`, level: 1, items: subItems });
      });
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Cronograma', { views: [{ state: 'frozen', xSplit: 7, ySplit: 2 }] });

    // Build columns
    const cols = [
      { header: 'Nº', width: 8 }, { header: 'Código', width: 12 }, { header: 'Descrição', width: 45 },
      { header: 'Un', width: 6 }, { header: 'Mat. Unit.', width: 12 }, { header: 'M.O. Unit.', width: 12 }, { header: 'Qtd Prev.', width: 10 }
    ];
    for (let i = 1; i <= mesAtual; i++) {
      cols.push({ header: `Med${i} Qtd`, width: 10 }, { header: `Med${i} Mat`, width: 12 }, { header: `Med${i} M.O.`, width: 12 }, { header: `Med${i} Acum`, width: 10 }, { header: `Med${i} Saldo`, width: 10 });
    }
    cols.push({ header: 'Acum. Qtd', width: 10 }, { header: 'Acum. Mat', width: 14 }, { header: 'Acum. M.O.', width: 14 }, { header: 'Acum. Saldo', width: 12 });
    ws.columns = cols;

    // Header row 1 - merged per medição
    const row1 = ws.getRow(1);
    ['Nº','Código','Descrição','Un','Mat. Unit.','M.O. Unit.','Qtd Prev.'].forEach((h, i) => {
      const cell = row1.getCell(i + 1);
      cell.value = h; cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0D0D0' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    for (let i = 1; i <= mesAtual; i++) {
      const startCol = 7 + (i - 1) * 5 + 1;
      ws.mergeCells(1, startCol, 1, startCol + 4);
      const cell = row1.getCell(startCol);
      cell.value = `Medição ${i}`; cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E8FF' } };
      cell.alignment = { horizontal: 'center' };
    }
    const acumStart = 7 + mesAtual * 5 + 1;
    ws.mergeCells(1, acumStart, 1, acumStart + 3);
    const acumCell = row1.getCell(acumStart);
    acumCell.value = 'Acumulado'; acumCell.font = { bold: true };
    acumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
    acumCell.alignment = { horizontal: 'center' };

    // Header row 2 sub-headers
    const row2 = ws.getRow(2);
    for (let i = 1; i <= mesAtual; i++) {
      const base = 7 + (i - 1) * 5 + 1;
      ['Qtd Exec.','Vlr Mat.','Vlr M.O.','Qtd Acum.','Qtd a Medir'].forEach((h, j) => {
        const cell = row2.getCell(base + j);
        cell.value = h; cell.font = { bold: true, size: 8 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E8FF' } };
        cell.alignment = { horizontal: 'right' };
      });
    }
    ['Qtd Acum.','Vlr Mat.','Vlr M.O.','Qtd a Medir'].forEach((h, j) => {
      const cell = row2.getCell(acumStart + j);
      cell.value = h; cell.font = { bold: true, size: 8 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
      cell.alignment = { horizontal: 'right' };
    });

    let rowIdx = 3;
    const totaisPorMedicao = Array.from({ length: mesAtual }, () => ({ mat: 0, mo: 0 }));

    hierarchy.forEach(stage => {
      const hasItems = (sid) => currentItems.some(i => i.stage_id === sid) || projectStages.some(s => s.parent_stage_id === sid && currentItems.some(i => i.stage_id === s.id));
      if (stage.level === 0 && !hasItems(stage.id)) return;
      if (stage.level > 0 && stage.items.length === 0) return;

      const stageRow = ws.getRow(rowIdx++);
      stageRow.getCell(1).value = `${stage.number} ${stage.nome}`;
      stageRow.getCell(1).font = { bold: true };
      const totalCols = 7 + mesAtual * 5 + 4;
      for (let c = 1; c <= totalCols; c++) {
        stageRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stage.level === 0 ? 'FFD0D0D0' : 'FFE8E8E8' } };
      }

      stage.items.forEach((item, itemIdx) => {
        const costs = costMap[item.servico_id] || { material: 0, mao_obra: 0 };
        const itemNumber = `${stage.number}.${itemIdx + 1}`;
        const dataRow = ws.getRow(rowIdx++);
        dataRow.getCell(1).value = itemNumber;
        dataRow.getCell(2).value = item.codigo;
        dataRow.getCell(3).value = item.descricao;
        dataRow.getCell(4).value = item.unidade;
        dataRow.getCell(5).value = costs.material;
        dataRow.getCell(6).value = costs.mao_obra;
        dataRow.getCell(7).value = item.quantidade_orcada || 0;

        let qtdAcum = 0;
        for (let numMed = 1; numMed <= mesAtual; numMed++) {
          let qtdExec = numMed === mesAtual ? (item.quantidade_executada_periodo || 0) : (histMap[`${itemNumber}_${numMed}`] || 0);
          qtdAcum += qtdExec;
          const valMat = qtdExec * costs.material;
          const valMo = qtdExec * costs.mao_obra;
          totaisPorMedicao[numMed - 1].mat += valMat;
          totaisPorMedicao[numMed - 1].mo += valMo;
          const base = 7 + (numMed - 1) * 5 + 1;
          dataRow.getCell(base).value = qtdExec;
          dataRow.getCell(base + 1).value = valMat; dataRow.getCell(base + 1).numFmt = '#,##0.00';
          dataRow.getCell(base + 2).value = valMo; dataRow.getCell(base + 2).numFmt = '#,##0.00';
          dataRow.getCell(base + 3).value = qtdAcum;
          dataRow.getCell(base + 4).value = (item.quantidade_orcada || 0) - qtdAcum;
        }
        const vlrMatAcum = Array.from({ length: mesAtual }, (_, i) => {
          const qe = i + 1 === mesAtual ? (item.quantidade_executada_periodo || 0) : (histMap[`${itemNumber}_${i + 1}`] || 0);
          return qe * costs.material;
        }).reduce((a, b) => a + b, 0);
        const vlrMoAcum = Array.from({ length: mesAtual }, (_, i) => {
          const qe = i + 1 === mesAtual ? (item.quantidade_executada_periodo || 0) : (histMap[`${itemNumber}_${i + 1}`] || 0);
          return qe * costs.mao_obra;
        }).reduce((a, b) => a + b, 0);
        dataRow.getCell(acumStart).value = qtdAcum;
        dataRow.getCell(acumStart + 1).value = vlrMatAcum; dataRow.getCell(acumStart + 1).numFmt = '#,##0.00';
        dataRow.getCell(acumStart + 2).value = vlrMoAcum; dataRow.getCell(acumStart + 2).numFmt = '#,##0.00';
        dataRow.getCell(acumStart + 3).value = (item.quantidade_orcada || 0) - qtdAcum;
      });
    });

    // Totais rodapé
    rowIdx++;
    const totMatAcum = totaisPorMedicao.reduce((s, t) => s + t.mat, 0);
    const totMoAcum = totaisPorMedicao.reduce((s, t) => s + t.mo, 0);
    const subtAcum = totMatAcum + totMoAcum;
    const bdiAcum = subtAcum * (bdiPercentual / 100);

    [['SUBTOTAL MATERIAL:', totaisPorMedicao.map(t => t.mat), totMatAcum],
     ['SUBTOTAL MÃO DE OBRA:', totaisPorMedicao.map(t => t.mo), totMoAcum],
     [`BDI (${bdiPercentual}%):`, totaisPorMedicao.map(t => (t.mat + t.mo) * bdiPercentual / 100), bdiAcum],
     ['TOTAL COM BDI:', totaisPorMedicao.map(t => (t.mat + t.mo) * (1 + bdiPercentual / 100)), subtAcum + bdiAcum]
    ].forEach(([label, perMed, acum]) => {
      const r = ws.getRow(rowIdx++);
      r.getCell(7).value = label; r.getCell(7).font = { bold: true }; r.getCell(7).alignment = { horizontal: 'right' };
      perMed.forEach((v, i) => {
        const base = 7 + i * 5 + 2;
        r.getCell(base).value = v; r.getCell(base).numFmt = 'R$ #,##0.00'; r.getCell(base).font = { bold: true };
      });
      r.getCell(acumStart + 1).value = acum; r.getCell(acumStart + 1).numFmt = 'R$ #,##0.00'; r.getCell(acumStart + 1).font = { bold: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `Cronograma_Med${measurement.numero_medicao}_${measurement.obra_nome}.xlsx`.replace(/[/\\?%*:|"<>]/g, '_');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
    return { success: true, message: 'Cronograma XLSX exportado com sucesso!' };
  } catch (error) {
    console.error('Erro ao exportar cronograma XLSX:', error);
    return { success: false, message: 'Erro ao exportar: ' + error.message };
  }
}

export async function exportCronogramaPDF(measurementId) {
  try {
    const measurement = (await base44.entities.Measurement.filter({ id: measurementId }))[0];
    const budget = (await base44.entities.Budget.filter({ id: measurement.orcamento_id }))[0];
    const project = (await base44.entities.Project.filter({ id: measurement.obra_id }))[0];
    const projectStages = await base44.entities.ProjectStage.filter({ orcamento_id: measurement.orcamento_id });
    const budgetItems = await base44.entities.BudgetItem.filter({ orcamento_id: measurement.orcamento_id });
    const allMeasurements = await base44.entities.Measurement.filter({ obra_id: measurement.obra_id, orcamento_id: measurement.orcamento_id });
    const mesAtual = measurement.numero_medicao || 1;
    const bdiPercentual = budget?.bdi_padrao || 30;

    const costMap = {};
    budgetItems.forEach(bi => {
      costMap[bi.servico_id] = { material: bi.custo_unitario_material || 0, mao_obra: bi.custo_unitario_mao_obra || 0 };
    });

    // Historic map
    const histMap = {};
    const sortedMeds = allMeasurements.sort((a, b) => a.numero_medicao - b.numero_medicao);
    const prevMeds = sortedMeds.filter(m => m.numero_medicao < mesAtual);
    const mainStages = projectStages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);
    for (const prevMed of prevMeds) {
      const itemsFromMed = await base44.entities.MeasurementItem.filter({ medicao_id: prevMed.id });
      mainStages.forEach((mainStage, mainIdx) => {
        const mainStageItems = itemsFromMed.filter(i => i.stage_id === mainStage.id);
        mainStageItems.forEach((item, itemIdx) => {
          histMap[`${mainIdx + 1}.${itemIdx + 1}_${prevMed.numero_medicao}`] = item.quantidade_executada_periodo || 0;
        });
        const subStages = projectStages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
        subStages.forEach((subStage, subIdx) => {
          const subItems = itemsFromMed.filter(i => i.stage_id === subStage.id);
          subItems.forEach((item, itemIdx) => {
            histMap[`${mainIdx + 1}.${subIdx + 1}.${itemIdx + 1}_${prevMed.numero_medicao}`] = item.quantidade_executada_periodo || 0;
          });
        });
      });
    }

    const currentItems = await base44.entities.MeasurementItem.filter({ medicao_id: measurementId });

    const hierarchy = [];
    mainStages.forEach((mainStage, mainIdx) => {
      hierarchy.push({ id: mainStage.id, nome: mainStage.nome, number: `${mainIdx + 1}.`, level: 0, items: currentItems.filter(i => i.stage_id === mainStage.id) });
      const subStages = projectStages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
      subStages.forEach((subStage, subIdx) => {
        hierarchy.push({ id: subStage.id, nome: subStage.nome, number: `${mainIdx + 1}.${subIdx + 1}`, level: 1, items: currentItems.filter(i => i.stage_id === subStage.id) });
      });
    });

    const hasItems = (sid) => currentItems.some(i => i.stage_id === sid) || projectStages.some(s => s.parent_stage_id === sid && currentItems.some(i => i.stage_id === s.id));

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;

    // Logo
    try { doc.addImage("https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6926eb0b6c1242bf806695a4/e482e0b04_logofundoclaro.jpg", 'JPEG', 15, yPos, 70, 17); } catch(e) {}

    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text('CRONOGRAMA DE MEDIÇÕES', pageWidth / 2, yPos + 10, { align: 'center' });
    yPos += 25;

    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text(`Obra: ${measurement.obra_nome}  |  Orçamento: ${budget?.descricao || ''}  |  Medição: ${mesAtual}  |  Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 15, yPos);
    yPos += 10;

    // Dynamic column layout based on number of measurements
    // Fixed cols: Nº(8), Cód(12), Desc(40), Un(6), Mat(10), MO(10), Prev(8) = ~94
    // Per measurement: 5 cols * 10 = 50  |  Accumulated: 4 cols * 10 = 40
    // Total available: ~277mm
    const fixedW = 94;
    const perMedW = 48;
    const acumW = 40;
    const totalNeeded = fixedW + mesAtual * perMedW + acumW;
    const scale = Math.min(1, 270 / totalNeeded);
    const fw = (w) => w * scale;

    const colX = [];
    let cx = 10;
    [8,12,40,6,10,10,8].forEach(w => { colX.push(cx); cx += fw(w); });
    for (let m = 0; m < mesAtual; m++) {
      for (let c = 0; c < 5; c++) { colX.push(cx); cx += fw(9.6); }
    }
    for (let c = 0; c < 4; c++) { colX.push(cx); cx += fw(10); }

    const drawHeaders = () => {
      const hy = yPos;
      // Row 1
      doc.setFillColor(41, 98, 255); doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont(undefined, 'bold');
      doc.rect(10, hy, 270, 5, 'F');
      ['Nº','Cód','Descrição','Un','Mat.U','M.O.U','Prev'].forEach((h, i) => doc.text(h, colX[i] + 1, hy + 3.5));
      for (let m = 0; m < mesAtual; m++) {
        const base = 7 + m * 5;
        doc.text(`Medição ${m + 1}`, colX[base] + 1, hy + 3.5);
      }
      doc.setFillColor(40, 167, 69);
      const acumBaseX = colX[7 + mesAtual * 5];
      doc.rect(acumBaseX, hy, fw(40), 5, 'F');
      doc.text('Acumulado', acumBaseX + 1, hy + 3.5);
      // Row 2
      doc.setFillColor(100, 150, 255); doc.rect(colX[7], hy + 5, mesAtual * fw(48), 4, 'F');
      for (let m = 0; m < mesAtual; m++) {
        const base = 7 + m * 5;
        ['Qtd','Mat','M.O.','Acum','Saldo'].forEach((h, j) => doc.text(h, colX[base + j] + 1, hy + 8));
      }
      doc.setFillColor(60, 180, 80); doc.rect(acumBaseX, hy + 5, fw(40), 4, 'F');
      ['Qtd','Mat','M.O.','Saldo'].forEach((h, j) => doc.text(h, colX[7 + mesAtual * 5 + j] + 1, hy + 8));
      doc.setTextColor(0, 0, 0);
      yPos += 10;
    };

    drawHeaders();

    const totaisPorMedicao = Array.from({ length: mesAtual }, () => ({ mat: 0, mo: 0 }));

    hierarchy.forEach(stage => {
      if (stage.level === 0 && !hasItems(stage.id)) return;
      if (stage.level > 0 && stage.items.length === 0) return;

      if (yPos > 188) { doc.addPage(); yPos = 15; drawHeaders(); }
      doc.setFillColor(stage.level === 0 ? 208 : 232, stage.level === 0 ? 208 : 232, stage.level === 0 ? 208 : 232);
      doc.rect(10, yPos, 270, 5, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(7);
      doc.text(`${stage.number} ${stage.nome}`, 12, yPos + 3.5);
      yPos += 5;

      doc.setFont(undefined, 'normal'); doc.setFontSize(6);
      stage.items.forEach((item, itemIdx) => {
        if (yPos > 190) { doc.addPage(); yPos = 15; drawHeaders(); }
        const costs = costMap[item.servico_id] || { material: 0, mao_obra: 0 };
        const itemNumber = `${stage.number}.${itemIdx + 1}`;
        doc.text(itemNumber, colX[0] + 1, yPos + 3);
        doc.text((item.codigo || '').substring(0, 8), colX[1] + 1, yPos + 3);
        doc.text((item.descricao || '').substring(0, 24), colX[2] + 1, yPos + 3);
        doc.text(item.unidade || '', colX[3] + 1, yPos + 3);
        doc.text(costs.material.toFixed(1), colX[4] + 1, yPos + 3);
        doc.text(costs.mao_obra.toFixed(1), colX[5] + 1, yPos + 3);
        doc.text((item.quantidade_orcada || 0).toFixed(2), colX[6] + 1, yPos + 3);

        let qtdAcum = 0;
        for (let m = 0; m < mesAtual; m++) {
          const qtdExec = m + 1 === mesAtual ? (item.quantidade_executada_periodo || 0) : (histMap[`${itemNumber}_${m + 1}`] || 0);
          qtdAcum += qtdExec;
          const valMat = qtdExec * costs.material;
          const valMo = qtdExec * costs.mao_obra;
          totaisPorMedicao[m].mat += valMat;
          totaisPorMedicao[m].mo += valMo;
          const base = 7 + m * 5;
          doc.text(qtdExec.toFixed(2), colX[base] + 1, yPos + 3);
          doc.text(valMat.toFixed(0), colX[base + 1] + 1, yPos + 3);
          doc.text(valMo.toFixed(0), colX[base + 2] + 1, yPos + 3);
          doc.text(qtdAcum.toFixed(2), colX[base + 3] + 1, yPos + 3);
          doc.text(((item.quantidade_orcada || 0) - qtdAcum).toFixed(2), colX[base + 4] + 1, yPos + 3);
        }
        const vlrMatAcum = Array.from({ length: mesAtual }, (_, i) => {
          const qe = i + 1 === mesAtual ? (item.quantidade_executada_periodo || 0) : (histMap[`${itemNumber}_${i + 1}`] || 0);
          return qe * costs.material;
        }).reduce((a, b) => a + b, 0);
        const vlrMoAcum = Array.from({ length: mesAtual }, (_, i) => {
          const qe = i + 1 === mesAtual ? (item.quantidade_executada_periodo || 0) : (histMap[`${itemNumber}_${i + 1}`] || 0);
          return qe * costs.mao_obra;
        }).reduce((a, b) => a + b, 0);
        const acumBase = 7 + mesAtual * 5;
        doc.text(qtdAcum.toFixed(2), colX[acumBase] + 1, yPos + 3);
        doc.text(vlrMatAcum.toFixed(0), colX[acumBase + 1] + 1, yPos + 3);
        doc.text(vlrMoAcum.toFixed(0), colX[acumBase + 2] + 1, yPos + 3);
        doc.text(((item.quantidade_orcada || 0) - qtdAcum).toFixed(2), colX[acumBase + 3] + 1, yPos + 3);
        yPos += 5;
      });
    });

    // Totais
    if (yPos > 170) { doc.addPage(); yPos = 20; }
    yPos += 3;
    const totMatAcum = totaisPorMedicao.reduce((s, t) => s + t.mat, 0);
    const totMoAcum = totaisPorMedicao.reduce((s, t) => s + t.mo, 0);
    const subtAcum = totMatAcum + totMoAcum;
    const bdiAcum = subtAcum * (bdiPercentual / 100);

    [['SUBTOTAL MAT:', totaisPorMedicao.map(t => t.mat), totMatAcum],
     ['SUBTOTAL M.O.:', totaisPorMedicao.map(t => t.mo), totMoAcum],
     [`BDI (${bdiPercentual}%):`, totaisPorMedicao.map(t => (t.mat + t.mo) * bdiPercentual / 100), bdiAcum],
     ['TOTAL BDI:', totaisPorMedicao.map(t => (t.mat + t.mo) * (1 + bdiPercentual / 100)), subtAcum + bdiAcum]
    ].forEach(([label, perMed, acum]) => {
      doc.setFillColor(220, 220, 220); doc.rect(10, yPos, 270, 5, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(6.5);
      doc.text(label, colX[5] + 1, yPos + 3.5);
      perMed.forEach((v, i) => {
        const base = 7 + i * 5;
        doc.text(formatCurrency(v), colX[base + 1] + 1, yPos + 3.5);
      });
      const acumBase = 7 + mesAtual * 5;
      doc.setTextColor(0, 100, 0);
      doc.text(formatCurrency(acum), colX[acumBase + 1] + 1, yPos + 3.5);
      doc.setTextColor(0, 0, 0);
      yPos += 6;
    });

    // Rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(100);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
    }

    const fileName = `Cronograma_Med${measurement.numero_medicao}_${measurement.obra_nome}.pdf`.replace(/[/\\?%*:|"<>]/g, '_');
    doc.save(fileName);
    return { success: true, message: 'Cronograma PDF exportado com sucesso!' };
  } catch (error) {
    console.error('Erro ao exportar cronograma PDF:', error);
    return { success: false, message: 'Erro ao exportar: ' + error.message };
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