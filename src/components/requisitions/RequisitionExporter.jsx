
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';

export async function exportRequisitionToXLSX(requisition, items = []) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['PEDIDO DE MATERIAIS'],
    [],
    ['Número do Pedido:', requisition.numero_pedido],
    ['Obra:', requisition.obra_nome],
    ['Data do Pedido:', requisition.data_pedido],
    ['Status:', requisition.status],
    [],
    ['MATERIAIS SOLICITADOS'],
    ['Material', 'Unidade', 'Quantidade'],
    ...items.map(item => [
      item.insumo_nome,
      item.unidade,
      item.quantidade_solicitada
    ])
  ]);

  ws['!cols'] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 15 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido');
  XLSX.writeFile(wb, `PED-${requisition.numero_pedido}.xlsx`);
}

export async function exportRequisitionToPDF(requisition, items = []) {
  const { jsPDF } = await import('jspdf');
  const autoTable = await import('jspdf-autotable');

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cabeçalho
  doc.setFontSize(16);
  doc.text('PEDIDO DE MATERIAIS', pageWidth / 2, 15, { align: 'center' });

  // Dados do pedido
  doc.setFontSize(10);
  let yPosition = 25;
  const lineHeight = 7;

  doc.text(`Número: ${requisition.numero_pedido}`, 15, yPosition);
  yPosition += lineHeight;
  doc.text(`Obra: ${requisition.obra_nome}`, 15, yPosition);
  yPosition += lineHeight;
  doc.text(`Data: ${requisition.data_pedido}`, 15, yPosition);
  yPosition += lineHeight;
  doc.text(`Status: ${requisition.status}`, 15, yPosition);
  yPosition += lineHeight * 2;

  // Tabela de materiais
  doc.autoTable({
    startY: yPosition,
    head: [['Material', 'Unidade', 'Quantidade']],
    body: items.map(item => [
      item.insumo_nome,
      item.unidade,
      item.quantidade_solicitada.toString()
    ]),
    margin: { left: 15, right: 15 },
    didDrawPage: function (data) {
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.getHeight();
      const pageWidth = pageSize.getWidth();
      const footerY = pageHeight - 10;

      doc.setFontSize(9);
      doc.text(
        `Página ${data.pageNumber}`,
        pageWidth / 2,
        footerY,
        { align: 'center' }
      );
    }
  });

  doc.save(`PED-${requisition.numero_pedido}.pdf`);
}
