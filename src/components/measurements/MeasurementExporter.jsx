import * as XLSX from 'xlsx';
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

    // Criar mapa de itens do orçamento para obter custos de material e mão de obra
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

    // Criar planilha única
    const data = [];
    
    // Formatar datas
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('pt-BR');
    };

    // Cabeçalho formatado
    data.push(['MEDIÇÃO DE OBRA']);
    data.push([]);
    data.push(['DADOS DA OBRA']);
    data.push(['Obra:', measurement.obra_nome]);
    data.push(['Endereço:', project?.endereco || '-']);
    data.push(['Cidade/Estado:', `${project?.cidade || ''} / ${project?.estado || ''}`]);
    data.push([]);
    data.push(['DADOS DA MEDIÇÃO']);
    data.push(['Medição Nº:', measurement.numero_medicao]);
    data.push(['Período:', measurement.periodo_referencia]);
    data.push(['Data Início:', formatDate(measurement.data_inicio)]);
    data.push(['Data Fim:', formatDate(measurement.data_fim)]);
    data.push(['Emissão:', new Date().toLocaleDateString('pt-BR')]);
    data.push([]);
    
    // Cabeçalho da tabela
    data.push([
      'Etapa',
      'Código',
      'Descrição',
      'Unidade',
      'Qtd Período',
      'Material (R$)',
      'Mão de Obra (R$)',
      'Subtotal (R$)'
    ]);

    // Agrupar por etapa
    const itemsByStage = {};
    itemsEnriquecidos.forEach(item => {
      const stageName = item.stage_nome || 'Sem Etapa';
      if (!itemsByStage[stageName]) {
        itemsByStage[stageName] = [];
      }
      itemsByStage[stageName].push(item);
    });

    // Adicionar itens agrupados
    Object.keys(itemsByStage).forEach(stageName => {
      const stageItems = itemsByStage[stageName];
      
      // Linha da etapa
      data.push([stageName, '', '', '', '', '', '', '']);
      
      stageItems.forEach(item => {
        data.push([
          '',
          item.codigo,
          item.descricao,
          item.unidade,
          item.quantidade_executada_periodo,
          item.valor_material_periodo,
          item.valor_mao_obra_periodo,
          item.valor_material_periodo + item.valor_mao_obra_periodo
        ]);
      });
      
      data.push([]); // Linha em branco entre etapas
    });

    // Totais
    data.push([]);
    data.push(['', '', '', '', 'SUBTOTAL MATERIAL:', '', '', totalMaterialPeriodo]);
    data.push(['', '', '', '', 'SUBTOTAL MÃO DE OBRA:', '', '', totalMaoObraPeriodo]);
    data.push(['', '', '', '', 'SUBTOTAL GERAL:', '', '', subtotalPeriodo]);
    data.push(['', '', '', '', `BDI (${bdiPercentual}%):`, '', '', valorBDIPeriodo]);
    data.push(['', '', '', '', 'TOTAL COM BDI:', '', '', totalComBDIPeriodo]);
    data.push([]);
    data.push(['', '', '', '', 'Material com BDI:', '', '', totalMaterialPeriodo + (totalMaterialPeriodo * bdiPercentual / 100)]);
    data.push(['', '', '', '', 'Mão de Obra com BDI:', '', '', totalMaoObraPeriodo + (totalMaoObraPeriodo * bdiPercentual / 100)]);

    // Criar worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Largura das colunas
    ws['!cols'] = [
      { wch: 20 }, // Etapa
      { wch: 10 }, // Código
      { wch: 45 }, // Descrição
      { wch: 8 },  // Unidade
      { wch: 12 }, // Qtd
      { wch: 15 }, // Material
      { wch: 15 }, // Mão de Obra
      { wch: 15 }  // Subtotal
    ];

    // Criar workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Medição');

    // Exportar
    const fileName = `Medicao_${measurement.numero_medicao}_${measurement.obra_nome}_${measurement.periodo_referencia}.xlsx`.replace(/[/\\?%*:|"<>]/g, '_');
    XLSX.writeFile(wb, fileName);

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