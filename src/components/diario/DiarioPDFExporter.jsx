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

export function getCurrentUser() {
  try {
    const admin = sessionStorage.getItem('portal_admin_auth');
    if (admin) { const p = JSON.parse(admin); return p.nome || p.email || 'Administrador'; }
    const colab = sessionStorage.getItem('portal_colaborador_auth');
    if (colab) { const p = JSON.parse(colab); return p.nome || p.email || 'Colaborador'; }
  } catch {}
  return '';
}

// Carrega imagem e converte para base64 via canvas (a imagem já está no DOM como <img> renderizada)
// Usa allorigins como proxy para evitar CORS
async function loadImageBase64(url) {
  // Tenta 1: buscar via proxy allorigins (sempre funciona, sem CORS)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('proxy failed');
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => resolve({ width: 200, height: 60 });
      img.src = dataUrl;
    });
    return { dataUrl, width: dims.width, height: dims.height };
  } catch {}

  // Tenta 2: fetch direto (funciona se o servidor tiver CORS)
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('direct failed');
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => resolve({ width: 200, height: 60 });
      img.src = dataUrl;
    });
    return { dataUrl, width: dims.width, height: dims.height };
  } catch {}

  return null;
}

// Pré-carrega a logo UMA vez antes de gerar o PDF
async function preloadLogo(companySettings) {
  const logoUrl = companySettings?.logo_url_clara;
  if (!logoUrl) return null;
  return await loadImageBase64(logoUrl);
}

function drawHeader(doc, companySettings, logoData, pageW, marginX, contentW) {
  const nomEmpresa = companySettings?.nome_empresa || 'Virtual Construções Civis';

  const LOGO_H = 18;
  const LOGO_MAX_W = 52;
  let logoW = 0;

  if (logoData) {
    logoW = Math.min((logoData.width / logoData.height) * LOGO_H, LOGO_MAX_W);
    doc.addImage(logoData.dataUrl, 'PNG', marginX, 7, logoW, LOGO_H);
  }

  // Texto ao lado da logo ou centralizado
  const textX = logoW > 0 ? marginX + logoW + 5 : pageW / 2;
  const textAlign = logoW > 0 ? 'left' : 'center';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  if (textAlign === 'center') {
    doc.text(nomEmpresa, pageW / 2, 14, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(20, 80, 160);
    doc.text('DIÁRIO DE OBRA', pageW / 2, 21, { align: 'center' });
  } else {
    doc.text(nomEmpresa, textX, 13);
    doc.setFontSize(11);
    doc.setTextColor(20, 80, 160);
    doc.text('DIÁRIO DE OBRA', textX, 21);
  }

  const lineY = 28;
  doc.setDrawColor(20, 80, 160);
  doc.setLineWidth(0.8);
  doc.line(marginX, lineY, pageW - marginX, lineY);

  return lineY + 5; // Y onde começa o conteúdo
}

function drawDiario(doc, diario, companySettings, logoData, pageW, marginX, contentW) {
  const startY = drawHeader(doc, companySettings, logoData, pageW, marginX, contentW);
  let y = startY;

  // ── BOX INFO DA OBRA ──
  const infoBoxH = 32;
  doc.setFillColor(240, 245, 255);
  doc.setDrawColor(180, 200, 230);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, contentW, infoBoxH, 2, 2, 'FD');

  const col2X = marginX + contentW * 0.52;

  // Linha 1: Obra | Tempo
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(20, 80, 160);
  doc.text('OBRA:', marginX + 3, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  const obraNome = doc.splitTextToSize(diario.obra_nome || '—', contentW * 0.48 - 16);
  doc.text(obraNome[0], marginX + 17, y + 7);

  doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 80, 160);
  doc.text('TEMPO:', col2X, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  doc.text(diario.tempo || '—', col2X + 16, y + 7);

  // Linha 2: Data | Dia de Obra
  doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 80, 160);
  doc.text('DATA:', marginX + 3, y + 15);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  doc.text(`${formatDate(diario.data)} – ${getDiaSemana(diario.data)}`, marginX + 17, y + 15);

  doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 80, 160);
  doc.text('DIA DE OBRA:', col2X, y + 15);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  doc.text(diario.dia_obra ? String(diario.dia_obra) : '—', col2X + 28, y + 15);

  // Linha 3: Preenchido por | Dias Restantes
  doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 80, 160);
  doc.text('PREENCHIDO POR:', marginX + 3, y + 23);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  doc.text(diario.preenchido_por || '—', marginX + 36, y + 23);

  if (diario.dias_restantes !== undefined && diario.dias_restantes !== null && diario.dias_restantes !== '') {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 80, 160);
    doc.text('DIAS RESTANTES:', col2X, y + 23);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(String(diario.dias_restantes), col2X + 32, y + 23);
  }

  y += infoBoxH + 6;

  // ── EFETIVO ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 80, 160);
  doc.text('EFETIVO DE MÃO DE OBRA', marginX, y);
  doc.setDrawColor(20, 80, 160); doc.setLineWidth(0.3);
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

  const cols = 4;
  const cellW = contentW / cols;
  const cellH = 8;
  efetivo.forEach(([label, qty], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = marginX + col * cellW;
    const cy = y + row * cellH;
    doc.setFillColor(col % 2 === 0 ? 247 : 252, col % 2 === 0 ? 249 : 253, 255);
    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.rect(cx, cy, cellW, cellH, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(70, 70, 70);
    doc.text(label, cx + 2, cy + 5.2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 80, 160);
    doc.text(String(qty), cx + cellW - 4, cy + 5.5, { align: 'right' });
  });

  const efetivoRows = Math.ceil(efetivo.length / cols);
  y += efetivoRows * cellH + 1;

  // Total bar
  doc.setFillColor(20, 80, 160);
  doc.rect(marginX, y, contentW, 7, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  doc.text('TOTAL DE FUNCIONÁRIOS:', marginX + 3, y + 5);
  doc.text(String(totalEfetivo), pageW - marginX - 3, y + 5, { align: 'right' });
  y += 10;

  // ── SEÇÕES DE TEXTO ──
  const secoes = [
    { titulo: 'SERVIÇOS EM EXECUÇÃO', conteudo: diario.servicos_execucao },
    { titulo: 'SERVIÇOS CONCLUÍDOS', conteudo: diario.servicos_concluidos },
    { titulo: 'OCORRÊNCIAS', conteudo: diario.ocorrencias },
  ];

  for (const secao of secoes) {
    if (y > 238) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 80, 160);
    doc.text(secao.titulo, marginX, y);
    doc.setLineWidth(0.3);
    doc.line(marginX, y + 1.5, pageW - marginX, y + 1.5);
    y += 5;

    const texto = secao.conteudo || '—';
    const linhas = doc.splitTextToSize(texto, contentW - 5);
    const boxH = Math.max(linhas.length * 4.8 + 6, 14);

    doc.setFillColor(252, 252, 252); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
    doc.rect(marginX, y, contentW, boxH, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40, 40, 40);
    doc.text(linhas, marginX + 3, y + 5);
    y += boxH + 5;
  }

  // ── ASSINATURAS ──
  if (y > 245) { doc.addPage(); y = 20; }
  y += 6;
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);
  const sigW = contentW / 3;
  ['Mestre de Obras', 'Eng. Responsável', 'Fiscalização'].forEach((label, i) => {
    const sx = marginX + i * sigW + sigW * 0.1;
    const lw = sigW * 0.8;
    doc.line(sx, y, sx + lw, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80, 80, 80);
    doc.text(label, sx + lw / 2, y + 4, { align: 'center' });
  });

  return y + 10;
}

function drawFooters(doc, nomEmpresa, preenchidoPor, pageW, marginX) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
    doc.line(marginX, 286, pageW - marginX, 286);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(130, 130, 130);
    doc.text(`${nomEmpresa} – Diário de Obra`, marginX, 290);
    if (preenchidoPor) {
      doc.text(`Preenchido por: ${preenchidoPor}`, pageW / 2, 290, { align: 'center' });
    }
    doc.text(`Página ${p} de ${totalPages}`, pageW - marginX, 290, { align: 'right' });
  }
}

// Exportação individual
export async function exportDiarioPDF(diario, companySettings, preenchidoPor) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, marginX = 14, contentW = pageW - marginX * 2;
  const autor = preenchidoPor || getCurrentUser();
  const logoData = await preloadLogo(companySettings);

  drawDiario(doc, { ...diario, preenchido_por: autor }, companySettings, logoData, pageW, marginX, contentW);
  drawFooters(doc, companySettings?.nome_empresa || 'Virtual Construções Civis', autor, pageW, marginX);

  doc.save(`Diario_${(diario.obra_nome || 'Obra').replace(/\s+/g, '_')}_${diario.data}.pdf`);
}

// Exportação em lote (múltiplos diários, 1 PDF único)
export async function exportDiariosLotePDF(diarios, companySettings, preenchidoPor) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, marginX = 14, contentW = pageW - marginX * 2;
  const autor = preenchidoPor || getCurrentUser();
  const logoData = await preloadLogo(companySettings);

  for (let i = 0; i < diarios.length; i++) {
    if (i > 0) doc.addPage();
    drawDiario(doc, { ...diarios[i], preenchido_por: autor }, companySettings, logoData, pageW, marginX, contentW);
  }

  drawFooters(doc, companySettings?.nome_empresa || 'Virtual Construções Civis', autor, pageW, marginX);
  doc.save(`Diarios_Lote_${new Date().toISOString().split('T')[0]}.pdf`);
}