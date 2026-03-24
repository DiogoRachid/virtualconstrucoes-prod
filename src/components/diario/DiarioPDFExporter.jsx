import jsPDF from 'jspdf';
import 'jspdf-autotable';

const DIAS_SEMANA = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getDiaSemana(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return DIAS_SEMANA[date.getDay()];
}

export async function exportDiarioPDF(diario, companySettings) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const marginX = 15;
  const contentW = pageW - marginX * 2;

  const nomEmpresa = companySettings?.nome_empresa || 'Virtual Construções Civis';
  const logoUrl = companySettings?.logo_url_clara;

  // ── CABEÇALHO ──
  let headerEndY = 15;

  // Logo
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      const logoH = 18;
      const logoW = (img.width / img.height) * logoH;
      doc.addImage(img, 'PNG', marginX, 10, logoW, logoH);
      headerEndY = 32;
    } catch {
      // sem logo
    }
  }

  // Nome da empresa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(nomEmpresa, pageW / 2, headerEndY - 12, { align: 'center' });

  // Título do documento
  doc.setFontSize(13);
  doc.setTextColor(20, 80, 160);
  doc.text('DIÁRIO DE OBRA', pageW / 2, headerEndY - 4, { align: 'center' });

  // Linha separadora
  doc.setDrawColor(20, 80, 160);
  doc.setLineWidth(0.8);
  doc.line(marginX, headerEndY + 1, pageW - marginX, headerEndY + 1);

  // ── INFORMAÇÕES DA OBRA ──
  let y = headerEndY + 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);

  // Box de info da obra
  doc.setFillColor(240, 245, 255);
  doc.setDrawColor(180, 200, 230);
  doc.roundedRect(marginX, y, contentW, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 80, 160);
  doc.text('OBRA:', marginX + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.text(diario.obra_nome || '—', marginX + 18, y + 6);

  const diaSemana = getDiaSemana(diario.data);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 80, 160);
  doc.text('DATA:', marginX + 4, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.text(`${formatDate(diario.data)} – ${diaSemana}`, marginX + 18, y + 13);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 80, 160);
  doc.text('TEMPO:', marginX + 90, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.text(diario.tempo || '—', marginX + 108, y + 6);

  if (diario.dia_obra) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 80, 160);
    doc.text('DIA DE OBRA:', marginX + 90, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(String(diario.dia_obra), marginX + 120, y + 13);
  }

  y += 28;

  // ── EFETIVO DE MÃO DE OBRA ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 80, 160);
  doc.text('EFETIVO DE MÃO DE OBRA', marginX, y);
  doc.setDrawColor(20, 80, 160);
  doc.setLineWidth(0.3);
  doc.line(marginX, y + 1.5, pageW - marginX, y + 1.5);
  y += 5;

  const efetivo = [
    ['Mestre de Obras', diario.mestre_obras || 0],
    ['Pedreiros', diario.pedreiros || 0],
    ['Carpinteiros', diario.carpinteiros || 0],
    ['Armadores', diario.armadores || 0],
    ['Eletricistas', diario.eletricistas || 0],
    ['Encanadores', diario.encanadores || 0],
    ['Pintores', diario.pintores || 0],
    ['Ajudantes', diario.ajudantes || 0],
  ];

  if (diario.outros_funcao || diario.outros_quantidade) {
    efetivo.push([`Outros – ${diario.outros_funcao || ''}`, diario.outros_quantidade || 0]);
  }

  const totalEfetivo = efetivo.reduce((acc, [, q]) => acc + Number(q), 0);

  // Grid 4 colunas
  const cols = 4;
  const cellW = contentW / cols;
  const cellH = 8;
  efetivo.forEach(([label, qty], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = marginX + col * cellW;
    const cy = y + row * cellH;

    doc.setFillColor(col % 2 === 0 ? 248 : 255, col % 2 === 0 ? 250 : 255, 255);
    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.rect(cx, cy, cellW, cellH, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    doc.text(label, cx + 2, cy + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 80, 160);
    doc.text(String(qty), cx + cellW - 8, cy + 5.5, { align: 'right' });
  });

  const efetivoRows = Math.ceil(efetivo.length / cols);
  y += efetivoRows * cellH + 2;

  // Total
  doc.setFillColor(20, 80, 160);
  doc.rect(marginX, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL DE FUNCIONÁRIOS:', marginX + 3, y + 5);
  doc.text(String(totalEfetivo), pageW - marginX - 3, y + 5, { align: 'right' });
  y += 12;

  // ── SEÇÕES DE TEXTO ──
  const secoes = [
    { titulo: 'SERVIÇOS EM EXECUÇÃO', conteudo: diario.servicos_execucao },
    { titulo: 'SERVIÇOS CONCLUÍDOS', conteudo: diario.servicos_concluidos },
    { titulo: 'OCORRÊNCIAS', conteudo: diario.ocorrencias },
  ];

  for (const secao of secoes) {
    // Verifica se precisa de nova página
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 80, 160);
    doc.text(secao.titulo, marginX, y);
    doc.setLineWidth(0.3);
    doc.line(marginX, y + 1.5, pageW - marginX, y + 1.5);
    y += 5;

    const texto = secao.conteudo || '—';
    const linhas = doc.splitTextToSize(texto, contentW - 4);
    const boxH = Math.max(linhas.length * 5 + 6, 14);

    doc.setFillColor(252, 252, 252);
    doc.setDrawColor(200, 210, 225);
    doc.setLineWidth(0.2);
    doc.rect(marginX, y, contentW, boxH, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(linhas, marginX + 3, y + 5);
    y += boxH + 6;
  }

  // ── ASSINATURAS ──
  if (y > 240) { doc.addPage(); y = 20; }
  y += 8;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);

  const assinaturas = ['Mestre de Obras', 'Eng. Responsável', 'Fiscalização'];
  const sigW = contentW / 3;
  assinaturas.forEach((label, i) => {
    const sx = marginX + i * sigW + sigW * 0.1;
    const lineW = sigW * 0.8;
    doc.line(sx, y, sx + lineW, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(label, sx + lineW / 2, y + 4, { align: 'center' });
  });

  // ── RODAPÉ ──
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`${nomEmpresa} – Diário de Obra – ${formatDate(diario.data)}`, marginX, 292);
    doc.text(`Página ${p} de ${totalPages}`, pageW - marginX, 292, { align: 'right' });
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(marginX, 289, pageW - marginX, 289);
  }

  doc.save(`Diario_Obra_${diario.obra_nome?.replace(/\s+/g, '_')}_${diario.data}.pdf`);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}