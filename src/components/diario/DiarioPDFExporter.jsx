import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const DIAS_SEMANA = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getDiaSemana(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return DIAS_SEMANA[new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
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

function totalEfetivo(d) {
  return (d.mestre_obras || 0) + (d.pedreiros || 0) + (d.carpinteiros || 0) +
    (d.armadores || 0) + (d.eletricistas || 0) + (d.encanadores || 0) +
    (d.pintores || 0) + (d.ajudantes || 0) + (d.outros_quantidade || 0);
}

// Monta o HTML de um diário para renderização
function buildDiarioHtml(diario, companySettings, autor) {
  const logoUrl = companySettings?.logo_url_clara || '';
  const nomeEmpresa = companySettings?.nome_empresa || 'Virtual Construções Civis';

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
  const total = totalEfetivo(diario);

  const efetivoHtml = efetivo.map(([label, qty], i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:${i % 2 === 0 ? '#f0f5ff' : '#f8faff'};border:1px solid #d0dcee;border-radius:4px;">
      <span style="font-size:9px;color:#444;">${label}</span>
      <span style="font-size:12px;font-weight:bold;color:#1450a0;">${qty}</span>
    </div>
  `).join('');

  const secoesHtml = [
    { titulo: 'SERVIÇOS EM EXECUÇÃO', conteudo: diario.servicos_execucao },
    { titulo: 'SERVIÇOS CONCLUÍDOS', conteudo: diario.servicos_concluidos },
    { titulo: 'OCORRÊNCIAS', conteudo: diario.ocorrencias },
  ].map(s => `
    <div style="margin-bottom:12px;">
      <div style="font-weight:bold;font-size:10px;color:#1450a0;border-bottom:1.5px solid #1450a0;padding-bottom:3px;margin-bottom:6px;">${s.titulo}</div>
      <div style="background:#fcfcfc;border:1px solid #ccd8e8;border-radius:4px;padding:8px;font-size:9px;color:#333;min-height:36px;white-space:pre-wrap;">${s.conteudo || '—'}</div>
    </div>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;width:794px;padding:28px 32px;box-sizing:border-box;background:#fff;color:#333;">
      <!-- HEADER -->
      <div style="display:flex;align-items:center;padding-bottom:10px;border-bottom:2px solid #1450a0;margin-bottom:14px;">
        ${logoUrl ? `<img src="${logoUrl}" crossorigin="anonymous" style="height:52px;max-width:140px;object-fit:contain;margin-right:16px;" />` : ''}
        <div>
          <div style="font-weight:bold;font-size:15px;color:#222;">${nomeEmpresa}</div>
          <div style="font-size:12px;color:#1450a0;font-weight:bold;letter-spacing:1px;">DIÁRIO DE OBRA</div>
        </div>
      </div>

      <!-- INFO BOX -->
      <div style="background:#f0f5ff;border:1px solid #b4c8e6;border-radius:6px;padding:10px 14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;">
        <div><span style="font-weight:bold;font-size:9px;color:#1450a0;">OBRA: </span><span style="font-size:9px;">${diario.obra_nome || '—'}</span></div>
        <div><span style="font-weight:bold;font-size:9px;color:#1450a0;">TEMPO: </span><span style="font-size:9px;">${diario.tempo || '—'}</span></div>
        <div><span style="font-weight:bold;font-size:9px;color:#1450a0;">DATA: </span><span style="font-size:9px;">${formatDate(diario.data)} – ${getDiaSemana(diario.data)}</span></div>
        <div><span style="font-weight:bold;font-size:9px;color:#1450a0;">DIA DE OBRA: </span><span style="font-size:9px;">${diario.dia_obra || '—'}</span></div>
        <div><span style="font-weight:bold;font-size:9px;color:#1450a0;">PREENCHIDO POR: </span><span style="font-size:9px;">${autor || '—'}</span></div>
        ${diario.dias_restantes !== undefined && diario.dias_restantes !== null && diario.dias_restantes !== ''
          ? `<div><span style="font-weight:bold;font-size:9px;color:#1450a0;">DIAS RESTANTES: </span><span style="font-size:9px;">${diario.dias_restantes}</span></div>`
          : '<div></div>'}
      </div>

      <!-- EFETIVO -->
      <div style="font-weight:bold;font-size:10px;color:#1450a0;border-bottom:1.5px solid #1450a0;padding-bottom:3px;margin-bottom:8px;">EFETIVO DE MÃO DE OBRA</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:6px;">
        ${efetivoHtml}
      </div>
      <div style="background:#1450a0;color:#fff;padding:5px 10px;border-radius:4px;display:flex;justify-content:space-between;margin-bottom:14px;">
        <span style="font-size:9px;font-weight:bold;">TOTAL DE FUNCIONÁRIOS:</span>
        <span style="font-size:12px;font-weight:bold;">${total}</span>
      </div>

      <!-- SEÇÕES -->
      ${secoesHtml}

      <!-- ASSINATURAS -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:24px;">
        ${['Mestre de Obras', 'Eng. Responsável', 'Fiscalização'].map(l => `
          <div style="text-align:center;">
            <div style="border-top:1px solid #999;margin-bottom:4px;"></div>
            <span style="font-size:8px;color:#666;">${l}</span>
          </div>
        `).join('')}
      </div>

      <!-- FOOTER -->
      <div style="border-top:1px solid #ccc;margin-top:16px;padding-top:6px;display:flex;justify-content:space-between;font-size:7px;color:#999;">
        <span>${nomeEmpresa} – Diário de Obra</span>
        ${autor ? `<span>Preenchido por: ${autor}</span>` : ''}
        <span>${formatDate(diario.data)}</span>
      </div>
    </div>
  `;
}

// Renderiza um diário como imagem e adiciona no jsPDF
async function renderDiarioToDoc(doc, diario, companySettings, autor, addPageBefore) {
  const html = buildDiarioHtml(diario, companySettings, autor);

  // Cria container off-screen
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
  container.innerHTML = html;
  document.body.appendChild(container);

  // Aguarda imagem carregar (se houver logo)
  const img = container.querySelector('img');
  if (img) {
    await new Promise(resolve => {
      if (img.complete) return resolve();
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 3000); // timeout de segurança
    });
  }

  const canvas = await html2canvas(container.firstElementChild, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  document.body.removeChild(container);

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pageW = 210, pageH = 297;

  if (addPageBefore) doc.addPage();
  doc.addImage(imgData, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
}

// Exportação individual
export async function exportDiarioPDF(diario, companySettings, preenchidoPor) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const autor = preenchidoPor || getCurrentUser();
  await renderDiarioToDoc(doc, diario, companySettings, autor, false);
  doc.save(`Diario_${(diario.obra_nome || 'Obra').replace(/\s+/g, '_')}_${diario.data}.pdf`);
}

// Exportação em lote (múltiplos diários, 1 PDF único)
export async function exportDiariosLotePDF(diarios, companySettings, preenchidoPor) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const autor = preenchidoPor || getCurrentUser();

  for (let i = 0; i < diarios.length; i++) {
    await renderDiarioToDoc(doc, diarios[i], companySettings, autor, i > 0);
  }

  doc.save(`Diarios_Lote_${new Date().toISOString().split('T')[0]}.pdf`);
}