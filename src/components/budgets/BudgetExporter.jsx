import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';

export async function exportBudgetXLSX(budgetId) {
  try {
    // Buscar dados
    const budget = (await base44.entities.Budget.filter({ id: budgetId }))[0];
    const stages = (await base44.entities.ProjectStage.filter({ orcamento_id: budgetId })).sort((a, b) => a.ordem - b.ordem);
    const items = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
    const project = budget.obra_id ? (await base44.entities.Project.filter({ id: budget.obra_id }))[0] : null;

    // Calcular totais
    let totalMaterial = 0;
    let totalMaoObra = 0;
    
    const itemsEnriquecidos = items.map(item => {
      const valorMaterial = (item.custo_unitario_material || 0) * item.quantidade;
      const valorMaoObra = (item.custo_unitario_mao_obra || 0) * item.quantidade;
      
      totalMaterial += valorMaterial;
      totalMaoObra += valorMaoObra;
      
      return {
        ...item,
        valor_material: valorMaterial,
        valor_mao_obra: valorMaoObra
      };
    });

    const subtotalDireto = totalMaterial + totalMaoObra;
    const bdiPercentual = budget?.bdi_padrao || 0;
    const valorBDI = subtotalDireto * (bdiPercentual / 100);
    const totalComBDI = subtotalDireto + valorBDI;

    // Formatar data
    const formatDate = () => new Date().toLocaleDateString('pt-BR');

    // Criar workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Orçamento');

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
    titleCell.value = 'ORÇAMENTO DE OBRA';
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
    worksheet.getRow(currentRow).getCell(2).value = project?.nome || budget.obra_nome || '-';
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Endereço:';
    worksheet.getRow(currentRow).getCell(2).value = project?.endereco || '-';
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'Cidade/Estado:';
    worksheet.getRow(currentRow).getCell(2).value = `${project?.cidade || ''} / ${project?.estado || ''}`;
    currentRow += 2;

    // Dados do Orçamento
    const headerRow2 = worksheet.getRow(currentRow);
    headerRow2.getCell(1).value = 'DADOS DO ORÇAMENTO';
    headerRow2.getCell(1).font = { bold: true, size: 12 };
    headerRow2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } };
    currentRow++;

    worksheet.getRow(currentRow).getCell(1).value = 'Descrição:';
    worksheet.getRow(currentRow).getCell(2).value = budget.descricao;
    worksheet.getRow(currentRow).getCell(4).value = 'Versão:';
    worksheet.getRow(currentRow).getCell(5).value = budget.versao;
    currentRow++;
    worksheet.getRow(currentRow).getCell(1).value = 'BDI:';
    worksheet.getRow(currentRow).getCell(2).value = `${bdiPercentual.toFixed(2)}%`;
    worksheet.getRow(currentRow).getCell(4).value = 'Emissão:';
    worksheet.getRow(currentRow).getCell(5).value = formatDate();
    currentRow += 2;

    // Cabeçalho da tabela
    const tableHeaderRow = worksheet.getRow(currentRow);
    const headers = ['Etapa', 'Código', 'Descrição', 'Unidade', 'Quantidade', 'Material (R$)', 'Mão de Obra (R$)', 'Total c/ BDI (R$)'];
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

    // Criar hierarquia de etapas com numeração
    const createHierarchy = (stages) => {
      const mainStages = stages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);
      const hierarchy = [];
      
      mainStages.forEach((mainStage, mainIdx) => {
        hierarchy.push({
          ...mainStage,
          level: 0,
          number: `${mainIdx + 1}.`
        });
        
        const subStages = stages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
        subStages.forEach((subStage, subIdx) => {
          hierarchy.push({
            ...subStage,
            level: 1,
            number: `${mainIdx + 1}.${subIdx + 1}`
          });
        });
      });
      
      return hierarchy;
    };

    const hierarchyStages = createHierarchy(stages);
    
    // Mapear itens com numeração
    const itemsByStage = {};
    hierarchyStages.forEach(stage => {
      itemsByStage[stage.id] = {
        nome: stage.nome,
        ordem: stage.ordem,
        level: stage.level,
        number: stage.number,
        items: []
      };
    });
    
    itemsEnriquecidos.forEach(item => {
      if (item.stage_id && itemsByStage[item.stage_id]) {
        itemsByStage[item.stage_id].items.push(item);
      }
    });

    // Itens sem etapa
    const uncategorized = itemsEnriquecidos.filter(i => !i.stage_id);
    if (uncategorized.length > 0) {
      itemsByStage['uncategorized'] = {
        nome: 'Sem Etapa',
        ordem: 999,
        level: 0,
        number: '',
        items: uncategorized
      };
    }

    // Verificar se etapas principais têm serviços (diretos ou em sub-etapas)
    const hasItemsInHierarchy = (stageId) => {
      // Verificar se a própria etapa tem itens
      if (itemsByStage[stageId] && itemsByStage[stageId].items.length > 0) return true;
      
      // Verificar se alguma sub-etapa tem itens
      const hasSubItems = stages.some(s => {
        return s.parent_stage_id === stageId && itemsByStage[s.id] && itemsByStage[s.id].items.length > 0;
      });
      
      return hasSubItems;
    };

    // Adicionar itens
    hierarchyStages.forEach(stage => {
      const stageData = itemsByStage[stage.id];
      
      // Para etapas principais (nível 0), sempre mostrar se tiver itens na hierarquia
      if (stageData.level === 0 && !hasItemsInHierarchy(stage.id)) return;
      
      // Para sub-etapas (nível 1+), só mostrar se tiver itens diretos
      if (stageData.level > 0 && (!stageData || stageData.items.length === 0)) return;
      
      // Linha da etapa
      const stageRow = worksheet.getRow(currentRow);
      const indent = '  '.repeat(stageData.level);
      stageRow.getCell(1).value = `${indent}${stageData.number} ${stageData.nome}`;
      stageRow.getCell(1).font = { bold: true };
      stageRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stageData.level === 0 ? 'FFE0E0E0' : 'FFF0F0F0' } };
      for (let i = 1; i <= 8; i++) {
        stageRow.getCell(i).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      currentRow++;
      
      // Só adicionar itens se a etapa realmente tiver itens
      if (stageData.items && stageData.items.length > 0) {
        stageData.items.forEach((item, itemIdx) => {
        const row = worksheet.getRow(currentRow);
        const itemIndent = '  '.repeat(stageData.level + 1);
        row.getCell(1).value = `${itemIndent}${stageData.number}.${itemIdx + 1}`;
        row.getCell(2).value = item.codigo;
        row.getCell(3).value = item.descricao;
        row.getCell(4).value = item.unidade;
        row.getCell(5).value = parseFloat(item.quantidade.toFixed(2));
        row.getCell(5).numFmt = '0.00';
        row.getCell(6).value = parseFloat(item.valor_material.toFixed(2));
        row.getCell(6).numFmt = 'R$ #,##0.00';
        row.getCell(7).value = parseFloat(item.valor_mao_obra.toFixed(2));
        row.getCell(7).numFmt = 'R$ #,##0.00';
        row.getCell(8).value = parseFloat((item.subtotal || 0).toFixed(2));
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
      }
    });
    
    // Itens não categorizados
    if (uncategorized.length > 0) {
      const stageRow = worksheet.getRow(currentRow);
      stageRow.getCell(1).value = 'Sem Etapa';
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
      
      uncategorized.forEach((item, itemIdx) => {
        const row = worksheet.getRow(currentRow);
        row.getCell(1).value = `  ${itemIdx + 1}`;
        row.getCell(2).value = item.codigo;
        row.getCell(3).value = item.descricao;
        row.getCell(4).value = item.unidade;
        row.getCell(5).value = parseFloat(item.quantidade.toFixed(2));
        row.getCell(5).numFmt = '0.00';
        row.getCell(6).value = parseFloat(item.valor_material.toFixed(2));
        row.getCell(6).numFmt = 'R$ #,##0.00';
        row.getCell(7).value = parseFloat(item.valor_mao_obra.toFixed(2));
        row.getCell(7).numFmt = 'R$ #,##0.00';
        row.getCell(8).value = parseFloat((item.subtotal || 0).toFixed(2));
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
    }

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

    addTotalRow('SUBTOTAL MATERIAL:', totalMaterial);
    addTotalRow('SUBTOTAL MÃO DE OBRA:', totalMaoObra);
    addTotalRow('SUBTOTAL DIRETO:', subtotalDireto, true);
    addTotalRow(`BDI (${bdiPercentual.toFixed(2)}%):`, valorBDI);
    addTotalRow('TOTAL COM BDI:', totalComBDI, true);
    
    currentRow++;
    
    // Valores com BDI
    const bdiRow1 = worksheet.getRow(currentRow);
    bdiRow1.getCell(5).value = 'Material com BDI:';
    bdiRow1.getCell(5).font = { bold: true };
    bdiRow1.getCell(5).alignment = { horizontal: 'right' };
    bdiRow1.getCell(8).value = parseFloat((totalMaterial + (totalMaterial * bdiPercentual / 100)).toFixed(2));
    bdiRow1.getCell(8).numFmt = 'R$ #,##0.00';
    bdiRow1.getCell(8).font = { bold: true };
    bdiRow1.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0FF' } };
    currentRow++;
    
    const bdiRow2 = worksheet.getRow(currentRow);
    bdiRow2.getCell(5).value = 'Mão de Obra com BDI:';
    bdiRow2.getCell(5).font = { bold: true };
    bdiRow2.getCell(5).alignment = { horizontal: 'right' };
    bdiRow2.getCell(8).value = parseFloat((totalMaoObra + (totalMaoObra * bdiPercentual / 100)).toFixed(2));
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
    const fileName = `Orcamento_${budget.descricao}_v${budget.versao}.xlsx`.replace(/[/\\?%*:|"<>]/g, '_');
    
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

export async function exportBudgetPDF(budgetId) {
  try {
    // Buscar dados
    const budget = (await base44.entities.Budget.filter({ id: budgetId }))[0];
    const stages = (await base44.entities.ProjectStage.filter({ orcamento_id: budgetId })).sort((a, b) => a.ordem - b.ordem);
    const items = await base44.entities.BudgetItem.filter({ orcamento_id: budgetId });
    const project = budget.obra_id ? (await base44.entities.Project.filter({ id: budget.obra_id }))[0] : null;

    // Calcular totais
    let totalMaterial = 0;
    let totalMaoObra = 0;
    
    const itemsEnriquecidos = items.map(item => {
      const valorMaterial = (item.custo_unitario_material || 0) * item.quantidade;
      const valorMaoObra = (item.custo_unitario_mao_obra || 0) * item.quantidade;
      
      totalMaterial += valorMaterial;
      totalMaoObra += valorMaoObra;
      
      return {
        ...item,
        valor_material: valorMaterial,
        valor_mao_obra: valorMaoObra
      };
    });

    const subtotalDireto = totalMaterial + totalMaoObra;
    const bdiPercentual = budget?.bdi_padrao || 0;
    const valorBDI = subtotalDireto * (bdiPercentual / 100);
    const totalComBDI = subtotalDireto + valorBDI;

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
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('ORÇAMENTO DE OBRA', pageWidth / 2, yPos + 8, { align: 'center' });
    
    yPos += 25;
    
    // Dados da obra
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DA OBRA', 15, yPos);
    yPos += 7;
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Obra: ${project?.nome || budget.obra_nome || '-'}`, 15, yPos);
    yPos += 5;
    doc.text(`Endereço: ${project?.endereco || '-'}`, 15, yPos);
    yPos += 5;
    doc.text(`Cidade/Estado: ${project?.cidade || ''} / ${project?.estado || ''}`, 15, yPos);
    
    yPos += 10;
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DO ORÇAMENTO', 15, yPos);
    yPos += 7;
    
    doc.setFont(undefined, 'normal');
    doc.text(`Descrição: ${budget.descricao}`, 15, yPos);
    doc.text(`Versão: ${budget.versao}`, 100, yPos);
    yPos += 5;
    doc.text(`BDI: ${bdiPercentual.toFixed(2)}%`, 15, yPos);
    doc.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 100, yPos);
    
    yPos += 12;

    // Criar hierarquia de etapas com numeração
    const createHierarchy = (stages) => {
      const mainStages = stages.filter(s => !s.parent_stage_id).sort((a, b) => a.ordem - b.ordem);
      const hierarchy = [];
      
      mainStages.forEach((mainStage, mainIdx) => {
        hierarchy.push({
          ...mainStage,
          level: 0,
          number: `${mainIdx + 1}.`
        });
        
        const subStages = stages.filter(s => s.parent_stage_id === mainStage.id).sort((a, b) => a.ordem - b.ordem);
        subStages.forEach((subStage, subIdx) => {
          hierarchy.push({
            ...subStage,
            level: 1,
            number: `${mainIdx + 1}.${subIdx + 1}`
          });
        });
      });
      
      return hierarchy;
    };

    const hierarchyStages = createHierarchy(stages);
    
    // Mapear itens
    const itemsByStage = {};
    hierarchyStages.forEach(stage => {
      itemsByStage[stage.id] = {
        nome: stage.nome,
        ordem: stage.ordem,
        level: stage.level,
        number: stage.number,
        items: []
      };
    });
    
    itemsEnriquecidos.forEach(item => {
      if (item.stage_id && itemsByStage[item.stage_id]) {
        itemsByStage[item.stage_id].items.push(item);
      }
    });

    const uncategorized = itemsEnriquecidos.filter(i => !i.stage_id);

    // Cabeçalho da tabela
    doc.setFillColor(41, 98, 255);
    doc.rect(10, yPos, 277, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('Cód', 12, yPos + 5);
    doc.text('Descrição', 32, yPos + 5);
    doc.text('Un', 160, yPos + 5);
    doc.text('Qtd', 175, yPos + 5, { align: 'right' });
    doc.text('Material (R$)', 205, yPos + 5, { align: 'right' });
    doc.text('Mão Obra (R$)', 240, yPos + 5, { align: 'right' });
    doc.text('Total c/ BDI (R$)', 277, yPos + 5, { align: 'right' });
    yPos += 8;

    // Verificar se etapas principais têm serviços (diretos ou em sub-etapas)
    const hasItemsInHierarchy = (stageId) => {
      // Verificar se a própria etapa tem itens
      if (itemsByStage[stageId] && itemsByStage[stageId].items.length > 0) return true;
      
      // Verificar se alguma sub-etapa tem itens
      const hasSubItems = stages.some(s => {
        return s.parent_stage_id === stageId && itemsByStage[s.id] && itemsByStage[s.id].items.length > 0;
      });
      
      return hasSubItems;
    };

    // Renderizar itens
    doc.setTextColor(0, 0, 0);
    hierarchyStages.forEach(stage => {
      const stageData = itemsByStage[stage.id];
      
      // Para etapas principais (nível 0), sempre mostrar se tiver itens na hierarquia
      if (stageData.level === 0 && !hasItemsInHierarchy(stage.id)) return;
      
      // Para sub-etapas (nível 1+), só mostrar se tiver itens diretos
      if (stageData.level > 0 && (!stageData || stageData.items.length === 0)) return;

      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }

      // Nome da etapa
      const indent = stageData.level * 3;
      doc.setFillColor(stageData.level === 0 ? 230 : 240, stageData.level === 0 ? 230 : 240, stageData.level === 0 ? 230 : 240);
      doc.rect(10, yPos, 277, 6, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      doc.text(`${stageData.number} ${stageData.nome}`, 12 + indent, yPos + 4);
      yPos += 7;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      
      // Só adicionar itens se a etapa realmente tiver itens
      if (stageData.items && stageData.items.length > 0) {
        stageData.items.forEach((item, itemIdx) => {
        if (yPos > 185) {
          doc.addPage();
          yPos = 20;
        }

        // Número do item
        const itemNumber = `${stageData.number}.${itemIdx + 1}`;
        doc.setFont(undefined, 'bold');
        doc.setFontSize(6);
        doc.text(itemNumber, 12 + indent + 3, yPos + 4);
        
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);
        
        // Código
        doc.text(item.codigo || '', 22 + indent, yPos + 4);
        
        // Descrição (com wrapping)
        const descMaxWidth = 115 - indent;
        const descLines = doc.splitTextToSize(item.descricao || '', descMaxWidth);
        doc.text(descLines.slice(0, 2), 32 + indent, yPos + 4);
        
        // Unidade
        doc.text(item.unidade || '', 160, yPos + 4);
        
        // Quantidade
        doc.text((item.quantidade || 0).toFixed(2), 175, yPos + 4, { align: 'right' });
        
        // Material
        doc.text(formatCurrency(item.valor_material), 205, yPos + 4, { align: 'right' });
        
        // Mão de Obra
        doc.text(formatCurrency(item.valor_mao_obra), 240, yPos + 4, { align: 'right' });
        
        // Total
        doc.text(formatCurrency(item.subtotal || 0), 277, yPos + 4, { align: 'right' });

        yPos += descLines.length > 1 ? 7 : 5;
        });
      }

      yPos += 3;
    });
    
    // Itens não categorizados
    if (uncategorized.length > 0) {
      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFillColor(230, 230, 230);
      doc.rect(10, yPos, 277, 6, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      doc.text('Sem Etapa', 12, yPos + 4);
      yPos += 7;
      
      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      
      uncategorized.forEach((item, itemIdx) => {
        if (yPos > 185) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.text(`${itemIdx + 1}`, 12, yPos + 4);
        doc.text(item.codigo || '', 22, yPos + 4);
        
        const descMaxWidth = 125;
        const descLines = doc.splitTextToSize(item.descricao || '', descMaxWidth);
        doc.text(descLines.slice(0, 2), 32, yPos + 4);
        
        doc.text(item.unidade || '', 160, yPos + 4);
        doc.text((item.quantidade || 0).toFixed(2), 175, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_material), 205, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.valor_mao_obra), 240, yPos + 4, { align: 'right' });
        doc.text(formatCurrency(item.subtotal || 0), 277, yPos + 4, { align: 'right' });

        yPos += descLines.length > 1 ? 7 : 5;
      });
      
      yPos += 3;
    }

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
    doc.text(formatCurrency(totalMaterial), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.text('SUBTOTAL MÃO DE OBRA:', 180, yPos);
    doc.text(formatCurrency(totalMaoObra), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.text('SUBTOTAL DIRETO:', 180, yPos);
    doc.text(formatCurrency(subtotalDireto), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.text(`BDI (${bdiPercentual.toFixed(2)}%):`, 180, yPos);
    doc.text(formatCurrency(valorBDI), 260, yPos, { align: 'right' });
    yPos += 6;
    doc.setFontSize(10);
    doc.text('TOTAL COM BDI:', 180, yPos);
    doc.text(formatCurrency(totalComBDI), 260, yPos, { align: 'right' });

    yPos += 12;
    doc.setFillColor(220, 240, 255);
    doc.rect(10, yPos, 277, 10, 'F');
    doc.setFontSize(9);
    yPos += 6;
    doc.text('Material com BDI:', 20, yPos);
    doc.text(formatCurrency(totalMaterial + (totalMaterial * bdiPercentual / 100)), 90, yPos);
    doc.text('Mão de Obra com BDI:', 150, yPos);
    doc.text(formatCurrency(totalMaoObra + (totalMaoObra * bdiPercentual / 100)), 230, yPos);

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
      doc.text(
        `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
        10,
        doc.internal.pageSize.getHeight() - 10
      );
    }

    // Salvar
    const fileName = `Orcamento_${budget.descricao}_v${budget.versao}.pdf`.replace(/[/\\?%*:|"<>]/g, '_');
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