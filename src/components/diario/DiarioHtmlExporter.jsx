const DIAS_SEMANA = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
const DEFAULT_LOGO_CLARA = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg";

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

function generateDiarioHtml(diario, companySettings, preenchidoPor) {
  const nomEmpresa = companySettings?.nome_empresa || 'Virtual Construções Civis';
  const logoUrl = companySettings?.logo_url_clara || DEFAULT_LOGO_CLARA;
  const autor = preenchidoPor || getCurrentUser();

  const efetivo = [
    { label: 'Mestre de Obras', qty: diario.mestre_obras || 0 },
    { label: 'Pedreiros', qty: diario.pedreiros || 0 },
    { label: 'Carpinteiros', qty: diario.carpinteiros || 0 },
    { label: 'Armadores', qty: diario.armadores || 0 },
    { label: 'Eletricistas', qty: diario.eletricistas || 0 },
    { label: 'Encanadores', qty: diario.encanadores || 0 },
    { label: 'Pintores', qty: diario.pintores || 0 },
    { label: 'Ajudantes', qty: diario.ajudantes || 0 },
  ];
  if (diario.outros_funcao || diario.outros_quantidade) {
    efetivo.push({ label: `Outros – ${diario.outros_funcao || ''}`, qty: diario.outros_quantidade || 0 });
  }
  const totalEfetivo = efetivo.reduce((acc, e) => acc + Number(e.qty), 0);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diário de Obra - ${diario.obra_nome} - ${formatDate(diario.data)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; background: #f5f5f5; zoom: 120%; }
    .page { 
      width: 210mm; 
      height: 297mm; 
      margin: 10px auto; 
      padding: 10mm; 
      background: white; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    @media print {
      body { background: none; zoom: 100%; }
      .page { width: 210mm; height: 297mm; margin: 0; padding: 10mm; box-shadow: none; page-break-after: always; }
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      border-bottom: 2px solid #1450a0;
      padding-bottom: 8px;
    }
    .logo { height: 30px; object-fit: contain; max-width: 80px; }
    .header-text h1 { font-size: 18px; color: #1450a0; font-weight: bold; }
    .header-text p { font-size: 11px; color: #666; margin-top: 2px; }

    /* Info box */
    .info-box {
      background: #f0f5ff;
      border: 1px solid #b4c8e6;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 15px;
      font-size: 10px;
      line-height: 1.6;
    }
    .info-row { display: flex; gap: 20px; margin-bottom: 5px; }
    .info-item { flex: 1; }
    .info-label { font-weight: bold; color: #1450a0; }

    /* Section title */
    .section-title {
      font-size: 12px;
      font-weight: bold;
      color: #1450a0;
      margin-top: 15px;
      margin-bottom: 8px;
      border-bottom: 1px solid #1450a0;
      padding-bottom: 4px;
    }

    /* Efetivo grid */
    .efetivo-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }
    .efetivo-cell {
      background: #fcfdff;
      border: 1px solid #d2dce7;
      border-radius: 4px;
      padding: 8px;
      text-align: center;
      font-size: 9px;
    }
    .efetivo-cell.even { background: #f7f9fd; }
    .efetivo-label { font-size: 8px; color: #555; display: block; margin-bottom: 4px; }
    .efetivo-value { font-size: 14px; font-weight: bold; color: #1450a0; }

    /* Total bar */
    .total-bar {
      background: #1450a0;
      color: white;
      padding: 8px 10px;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 10px;
      margin-bottom: 15px;
    }

    /* Text sections */
    .text-section {
      margin-bottom: 12px;
    }
    .text-box {
      background: #fcfcfc;
      border: 1px solid #c8d2e1;
      border-radius: 4px;
      padding: 8px;
      font-size: 9px;
      line-height: 1.5;
      min-height: 40px;
    }
    .text-box.empty { color: #999; }

    /* Signatures */
    .signatures {
      margin-top: 20px;
      display: flex;
      justify-content: space-around;
      font-size: 9px;
    }
    .signature-line {
      text-align: center;
      width: 100px;
    }
    .line { border-top: 1px solid #666; margin-bottom: 4px; }

    /* Footer */
    .footer {
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 8px;
      color: #999;
      text-align: center;
    }

    @media print {
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo">` : ''}
      <div class="header-text">
        <h1>${nomEmpresa}</h1>
        <p>DIÁRIO DE OBRA</p>
      </div>
    </div>

    <!-- Info Box -->
    <div class="info-box">
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">OBRA:</span> ${diario.obra_nome || '—'}
        </div>
        <div class="info-item">
          <span class="info-label">TEMPO:</span> ${diario.tempo || '—'}
        </div>
      </div>
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">DATA:</span> ${formatDate(diario.data)} – ${getDiaSemana(diario.data)}
        </div>
        <div class="info-item">
          <span class="info-label">DIA DE OBRA:</span> ${diario.dia_obra || '—'}
        </div>
      </div>
      <div class="info-row">
        <div class="info-item">
          <span class="info-label">PREENCHIDO POR:</span> ${autor}
        </div>
        ${diario.dias_restantes !== undefined && diario.dias_restantes !== null && diario.dias_restantes !== '' ? 
          `<div class="info-item"><span class="info-label">DIAS RESTANTES:</span> ${diario.dias_restantes}</div>` 
          : ''}
      </div>
    </div>

    <!-- Efetivo -->
    <div class="section-title">EFETIVO DE MÃO DE OBRA</div>
    <div class="efetivo-grid">
      ${efetivo.map((e, i) => `
        <div class="efetivo-cell ${i % 2 === 0 ? 'even' : ''}">
          <span class="efetivo-label">${e.label}</span>
          <span class="efetivo-value">${e.qty}</span>
        </div>
      `).join('')}
    </div>
    <div class="total-bar">
      <span>TOTAL DE FUNCIONÁRIOS</span>
      <span>${totalEfetivo}</span>
    </div>

    <!-- Serviços em Execução -->
    <div class="section-title">SERVIÇOS EM EXECUÇÃO</div>
    <div class="text-box ${!diario.servicos_execucao ? 'empty' : ''}">
      ${diario.servicos_execucao || '—'}
    </div>

    <!-- Serviços Concluídos -->
    <div class="section-title">SERVIÇOS CONCLUÍDOS</div>
    <div class="text-box ${!diario.servicos_concluidos ? 'empty' : ''}">
      ${diario.servicos_concluidos || '—'}
    </div>

    <!-- Ocorrências -->
    <div class="section-title">OCORRÊNCIAS</div>
    <div class="text-box ${!diario.ocorrencias ? 'empty' : ''}">
      ${diario.ocorrencias || '—'}
    </div>

    <!-- Signatures -->
    <div class="signatures">
      <div class="signature-line">
        <div class="line"></div>
        <div>Mestre de Obras</div>
      </div>
      <div class="signature-line">
        <div class="line"></div>
        <div>Eng. Responsável</div>
      </div>
      <div class="signature-line">
        <div class="line"></div>
        <div>Fiscalização</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>${nomEmpresa} – Diário de Obra | Preenchido por: ${autor}</p>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 500);
    });
  </script>
</body>
</html>
  `;
}

export async function exportDiarioPDF(diario, companySettings, preenchidoPor) {
  const html = generateDiarioHtml(diario, companySettings, preenchidoPor);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDiariosLotePDF(diarios, companySettings, preenchidoPor) {
  const htmlPages = diarios.map(d => 
    generateDiarioHtml(d, companySettings, preenchidoPor)
      .replace('</head>', '<style>.page { page-break-after: always; }</style></head>')
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diários de Obra - Lote</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; }
    @media print {
      body { background: none; }
    }
  </style>
</head>
<body>
  ${diarios.map(d => generateDiarioHtml(d, companySettings, preenchidoPor)).join('')}
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 500);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}