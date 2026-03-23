import { jsPDF } from 'jspdf';

const EMPRESA = {
  nome: 'VIRTUAL CONSTRUÇÕES CIVIS LTDA',
  cnpj: '73.372.021/0001-01',
  endereco: 'AV. AYRTON SENNA DA SILVA, 300 SL 1205 – LONDRINA-PR',
  telefone: '43 3344-5387'
};

const fmt = (v) => v || '___________________________';
const fmtDate = (v) => {
  if (!v) return '__/__/____';
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
};
const fmtBool = (v) => v ? 'SIM' : 'NÃO';
const fmtMoney = (v) => v ? `R$ ${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

const HORARIO_PADRAO = [
  { dia: 'SEGUNDA', entrada: '07:00', saida_almoco: '11:00', volta_almoco: '12:00', intervalo_inicio: '-', intervalo_fim: '-', saida: '17:00' },
  { dia: 'TERÇA',   entrada: '07:00', saida_almoco: '11:00', volta_almoco: '12:00', intervalo_inicio: '-', intervalo_fim: '-', saida: '17:00' },
  { dia: 'QUARTA',  entrada: '07:00', saida_almoco: '11:00', volta_almoco: '12:00', intervalo_inicio: '-', intervalo_fim: '-', saida: '17:00' },
  { dia: 'QUINTA',  entrada: '07:00', saida_almoco: '11:00', volta_almoco: '12:00', intervalo_inicio: '-', intervalo_fim: '-', saida: '17:00' },
  { dia: 'SEXTA',   entrada: '07:00', saida_almoco: '11:00', volta_almoco: '12:00', intervalo_inicio: '-', intervalo_fim: '-', saida: '16:00' },
  { dia: 'SÁBADO',  entrada: '-',     saida_almoco: '-',     volta_almoco: '-',     intervalo_inicio: '-', intervalo_fim: '-', saida: '-' },
  { dia: 'DOMINGO', entrada: '-',     saida_almoco: '-',     volta_almoco: '-',     intervalo_inicio: '-', intervalo_fim: '-', saida: '-' },
];

const RACA_LABELS = { branca: 'BRANCA', parda: 'PARDA', preta: 'PRETA', amarela: 'AMARELA', indigena: 'INDÍGENA', nao_declarado: 'NÃO DECLARADO' };
const GRAU_LABELS = {
  analfabeto: 'ANALFABETO',
  fundamental_incompleto: 'ATÉ 5º ANO INCOMPLETO DO ENSINO FUNDAMENTAL',
  fundamental_completo: '5º ANO COMPLETO DO ENSINO FUNDAMENTAL',
  medio_incompleto: 'ENSINO MÉDIO INCOMPLETO',
  medio_completo: 'ENSINO MÉDIO COMPLETO',
  tecnico: 'TÉCNICO',
  superior_incompleto: 'SUPERIOR INCOMPLETO',
  superior_completo: 'SUPERIOR COMPLETO',
  pos_graduacao: 'PÓS-GRADUAÇÃO',
  mestrado: 'MESTRADO',
  doutorado: 'DOUTORADO'
};
const ESTADO_CIVIL_LABELS = {
  solteiro: 'SOLTEIRO(A)', casado: 'CASADO(A)', uniao_estavel: 'UNIÃO ESTÁVEL',
  divorciado: 'DIVORCIADO(A)', viuvo: 'VIÚVO(A)', separado: 'SEPARADO(A)'
};
const PCD_LABELS = {
  nao_portador: 'NÃO PORTADOR', mental: 'MENTAL', fisica: 'FÍSICA',
  multipla: 'MÚLTIPLA', auditiva: 'AUDITIVA', reabilitado: 'REABILITADO', visual: 'VISUAL'
};

export function exportEmployeePDF(emp) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const ML = 12, MR = 12;
  const CW = W - ML - MR;
  let y = 12;

  const checkNewPage = (needed = 8) => {
    if (y + needed > 280) { doc.addPage(); y = 12; }
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  const title = (text, size = 9) => {
    doc.setFontSize(size);
    doc.setFont(undefined, 'bold');
    doc.text(text, ML, y);
    doc.setFont(undefined, 'normal');
    y += 5;
  };

  const sectionHeader = (text) => {
    checkNewPage(10);
    doc.setFillColor(30, 64, 120);
    doc.rect(ML, y, CW, 6, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(text, ML + 2, y + 4.2);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    y += 8;
  };

  // linha simples: "LABEL: value"
  const row = (label, value, x = ML, width = CW, bold = false) => {
    checkNewPage(6);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text(`${label}: `, x, y);
    const lw = doc.getTextWidth(`${label}: `);
    doc.setFont(undefined, bold ? 'bold' : 'normal');
    doc.text(String(value || ''), x + lw, y);
    y += 5;
  };

  // linha com borda/fundo para destaque
  const infoBox = (lines) => {
    checkNewPage(lines.length * 5 + 4);
    doc.setFillColor(248, 250, 252);
    doc.rect(ML, y - 1, CW, lines.length * 5 + 2, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(ML, y - 1, CW, lines.length * 5 + 2, 'S');
    lines.forEach(({ label, value }) => {
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text(`${label}: `, ML + 2, y + 3);
      const lw = doc.getTextWidth(`${label}: `);
      doc.setFont(undefined, 'normal');
      doc.text(String(value || ''), ML + 2 + lw, y + 3);
      y += 5;
    });
    y += 3;
  };

  // múltiplos campos na mesma linha
  const cols = (items) => {
    checkNewPage(7);
    const colW = CW / items.length;
    items.forEach(({ label, value }, i) => {
      const x = ML + i * colW;
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.text(`${label}: `, x, y);
      const lw = doc.getTextWidth(`${label}: `);
      doc.setFont(undefined, 'normal');
      const maxW = colW - lw - 2;
      const val = String(value || '');
      doc.text(val, x + lw, y, { maxWidth: maxW });
    });
    y += 5.5;
  };

  const divider = () => {
    doc.setDrawColor(180, 180, 180);
    doc.line(ML, y, ML + CW, y);
    y += 3;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LOGO + CABEÇALHO
  // ══════════════════════════════════════════════════════════════════════════
  try {
    doc.addImage(
      'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6926eb0b6c1242bf806695a4/e482e0b04_logofundoclaro.jpg',
      'JPEG', ML, y, 50, 13
    );
  } catch (e) {}

  // Código funcionário (canto direito)
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.text('Código do Funcionário:', W - MR - 45, y + 5);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(11);
  doc.text(emp.codigo_funcionario || '________', W - MR - 45, y + 11);
  y += 18;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('FICHA DE ADMISSÃO', W / 2, y, { align: 'center' });
  y += 7;
  divider();

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS DA EMPRESA
  // ══════════════════════════════════════════════════════════════════════════
  sectionHeader('DADOS DA EMPRESA');
  cols([{ label: 'EMPREGADOR', value: EMPRESA.nome }, { label: 'CNPJ', value: EMPRESA.cnpj }]);
  cols([{ label: 'ENDEREÇO', value: EMPRESA.endereco }, { label: 'TELEFONE', value: EMPRESA.telefone }]);
  y += 1;

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS DO FUNCIONÁRIO
  // ══════════════════════════════════════════════════════════════════════════
  sectionHeader('DADOS DO FUNCIONÁRIO');
  row('NOME COMPLETO', emp.nome_completo?.toUpperCase());
  cols([{ label: 'CPF', value: emp.cpf }, { label: 'NÚMERO DE PIS', value: emp.pis }, { label: 'DATA DE NASCIMENTO', value: fmtDate(emp.data_nascimento) }]);
  cols([{ label: 'ENDEREÇO', value: emp.endereco }, { label: 'CEP', value: emp.cep }]);
  cols([{ label: 'CIDADE/ESTADO', value: `${emp.cidade || ''}/${emp.estado || ''}` }, { label: 'NATURALIDADE', value: emp.naturalidade_cidade }, { label: 'UF', value: emp.naturalidade_estado }]);
  cols([{ label: 'TELEFONE', value: emp.telefone }, { label: 'EMAIL', value: emp.email }]);
  cols([{ label: 'ALTURA', value: emp.altura }, { label: 'CALÇADO', value: emp.calcado }, { label: 'ROUPA', value: emp.roupa }]);
  row('RAÇA', RACA_LABELS[emp.raca] || emp.raca || '( ) INDÍGENA  ( ) BRANCA  ( ) PRETA  ( ) AMARELA  ( ) PARDA');
  row('GRAU DE INSTRUÇÃO', GRAU_LABELS[emp.grau_instrucao] || '');
  row('PORTADOR DE DEFICIÊNCIA', emp.pcd ? (PCD_LABELS[emp.pcd_tipo] || 'SIM') : 'NÃO PORTADOR');
  row('ESTADO CIVIL', ESTADO_CIVIL_LABELS[emp.estado_civil] || '');
  if (emp.estado_civil === 'casado' || emp.estado_civil === 'uniao_estavel') {
    cols([{ label: 'NOME DO CÔNJUGE', value: emp.conjuge_nome }, { label: 'DATA NASC.', value: fmtDate(emp.conjuge_data_nascimento) }, { label: 'CPF', value: emp.conjuge_cpf }]);
  } else {
    row('NOME DO CÔNJUGE', '');
  }
  row('NOME DO PAI', emp.nome_pai);
  row('NOME DA MÃE', emp.nome_mae);
  y += 1;

  // ══════════════════════════════════════════════════════════════════════════
  // DOCUMENTOS
  // ══════════════════════════════════════════════════════════════════════════
  sectionHeader('DOCUMENTOS DO FUNCIONÁRIO');
  cols([{ label: 'RG', value: emp.rg }, { label: 'DATA EMISSÃO', value: fmtDate(emp.rg_data_emissao) }, { label: 'ÓRGÃO EMISSOR', value: emp.rg_orgao_emissor }]);
  cols([{ label: 'TÍTULO ELEITORAL', value: emp.titulo_eleitoral }, { label: 'ZONA', value: emp.titulo_zona }, { label: 'SEÇÃO', value: emp.titulo_secao }]);
  cols([{ label: 'CNH', value: emp.cnh_numero }, { label: 'DATA EMISSÃO', value: fmtDate(emp.cnh_data_emissao) }, { label: 'VENC.', value: fmtDate(emp.cnh_vencimento) }, { label: 'UF', value: emp.cnh_estado }, { label: 'CATEG.', value: emp.cnh_categoria }]);
  cols([{ label: 'CTPS Nº', value: emp.ctps_numero }, { label: 'CATEGORIA', value: emp.ctps_categoria }, { label: 'EMISSOR', value: emp.ctps_emissor }, { label: 'DATA EMISSÃO', value: fmtDate(emp.ctps_data_emissao) }]);
  cols([{ label: 'RESERVISTA', value: emp.reservista }, { label: 'CATEGORIA', value: emp.reservista_categoria }]);
  row('SINDICATO', emp.sindicato);
  y += 1;

  // ══════════════════════════════════════════════════════════════════════════
  // CONTA BANCÁRIA
  // ══════════════════════════════════════════════════════════════════════════
  sectionHeader('CONTA BANCÁRIA PARA RECEBIMENTO DE SALÁRIO');
  cols([{ label: 'BANCO', value: emp.banco_nome }, { label: 'AGÊNCIA', value: emp.banco_agencia }]);
  cols([{ label: 'Nº CONTA', value: emp.banco_numero_conta }, { label: 'TIPO', value: emp.banco_tipo_conta === 'corrente' ? 'C/C' : emp.banco_tipo_conta === 'poupanca' ? 'POUPANÇA' : emp.banco_tipo_conta === 'salario' ? 'SALÁRIO' : '' }]);
  row('PIX', emp.banco_pix);
  y += 1;

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS DA CONTRATAÇÃO
  // ══════════════════════════════════════════════════════════════════════════
  sectionHeader('DADOS DA CONTRATAÇÃO');
  cols([
    { label: 'CONTRATO EXPERIÊNCIA', value: emp.contrato_experiencia === 'nao' ? 'NÃO' : (emp.contrato_experiencia || '') },
    { label: 'DEPARTAMENTO', value: 'OBRAS' }
  ]);
  cols([
    { label: 'DATA EXAME ADMISSIONAL', value: fmtDate(emp.data_exame_admissional) },
    { label: 'CRM MÉDICO', value: emp.crm_medico },
    { label: 'DATA DE ADMISSÃO', value: fmtDate(emp.data_admissao) }
  ]);
  const tipoAdm = { primeiro_emprego: 'PRIMEIRO EMPREGO', reemprego: 'REEMPREGO', prazo_determinado: 'CONTRATO POR PRAZO DETERMINADO' };
  row('TIPO DE ADMISSÃO', tipoAdm[emp.tipo_admissao] || '');
  cols([{ label: 'CARGO', value: emp.funcao?.toUpperCase() }, { label: 'CBO', value: emp.cbo }]);
  row('IRÁ UTILIZAR VALE TRANSPORTE', fmtBool(emp.vale_transporte));
  cols([
    { label: 'SALÁRIO', value: `${fmtMoney(emp.salario)}${emp.tipo_salario === 'hora' ? '/h' : '/mês'}` },
    { label: 'VALE COMPRAS', value: fmtMoney(emp.vale_compras) },
    { label: 'CAFÉ (dia útil)', value: fmtMoney(emp.cafe_manha_diario) }
  ]);

  // Outro emprego
  row('POSSUI OUTRO EMPREGO', fmtBool(emp.outro_emprego));
  if (emp.outro_emprego) {
    cols([
      { label: 'DATA ADM. OUTRO VÍNCULO', value: fmtDate(emp.outro_emprego_data_admissao) },
      { label: 'CNPJ', value: emp.outro_emprego_cnpj },
      { label: 'SALÁRIO', value: fmtMoney(emp.outro_emprego_salario) }
    ]);
  }
  y += 1;

  // ══════════════════════════════════════════════════════════════════════════
  // HORÁRIO DE TRABALHO
  // ══════════════════════════════════════════════════════════════════════════
  checkNewPage(70);
  sectionHeader('QUADRO DE HORÁRIOS');

  const horario = (emp.horario_trabalho && emp.horario_trabalho.length === 7) ? emp.horario_trabalho : HORARIO_PADRAO;

  // Tabela de horários
  const cols7 = [20, 24, 28, 28, 26, 26, 28]; // larguras das colunas
  const headers7 = ['DIA', 'ENTRADA', 'SAÍDA ALMOÇO', 'VOLTA ALMOÇO', 'INTERV. INÍCIO', 'INTERV. FIM', 'SAÍDA'];
  let tx = ML;
  const rowH = 6;

  // Header da tabela
  doc.setFillColor(220, 230, 245);
  doc.rect(ML, y, CW, rowH, 'F');
  doc.setDrawColor(150, 150, 180);
  doc.setFontSize(6.5);
  doc.setFont(undefined, 'bold');
  headers7.forEach((h, i) => {
    doc.rect(tx, y, cols7[i], rowH, 'S');
    doc.text(h, tx + cols7[i] / 2, y + 4, { align: 'center' });
    tx += cols7[i];
  });
  y += rowH;

  // Linhas da tabela
  doc.setFont(undefined, 'normal');
  horario.forEach((r, ri) => {
    checkNewPage(rowH + 1);
    const values = [r.dia, r.entrada || '-', r.saida_almoco || '-', r.volta_almoco || '-', r.intervalo_inicio || '-', r.intervalo_fim || '-', r.saida || '-'];
    tx = ML;
    if (ri % 2 === 0) { doc.setFillColor(250, 252, 255); doc.rect(ML, y, CW, rowH, 'F'); }
    values.forEach((v, i) => {
      doc.rect(tx, y, cols7[i], rowH, 'S');
      doc.text(String(v), tx + cols7[i] / 2, y + 4, { align: 'center' });
      tx += cols7[i];
    });
    y += rowH;
  });

  y += 3;
  cols([
    { label: 'CARGA HORÁRIA SEMANAL', value: emp.carga_horaria_semanal || '__________' },
    { label: 'COMPENSAÇÃO DE HORAS', value: emp.compensacao_horas ? 'SIM' : 'NÃO' }
  ]);
  row('OBSERVAÇÕES SOBRE O HORÁRIO', emp.obs_horario);
  y += 1;

  // ══════════════════════════════════════════════════════════════════════════
  // DEPENDENTES
  // ══════════════════════════════════════════════════════════════════════════
  checkNewPage(50);
  sectionHeader('DEPENDENTES');

  const depColW = [10, 70, 35, 45];
  const depHeaders = ['#', 'NOME', 'DATA DE NASC.', 'CPF'];
  tx = ML;
  doc.setFillColor(220, 230, 245);
  doc.rect(ML, y, CW, 6, 'F');
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  depHeaders.forEach((h, i) => {
    doc.rect(tx, y, depColW[i], 6, 'S');
    doc.text(h, tx + depColW[i] / 2, y + 4, { align: 'center' });
    tx += depColW[i];
  });
  y += 6;

  const deps = (emp.dependentes && emp.dependentes.length > 0) ? emp.dependentes : [];
  const totalDepRows = Math.max(deps.length, 5);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(7.5);
  for (let i = 0; i < totalDepRows; i++) {
    const dep = deps[i] || { nome: '', data_nascimento: '', cpf: '' };
    checkNewPage(6);
    tx = ML;
    const vals = [String(i + 1), dep.nome || '', fmtDate(dep.data_nascimento || ''), dep.cpf || ''];
    vals.forEach((v, j) => {
      doc.rect(tx, y, depColW[j], 6, 'S');
      doc.text(v, tx + depColW[j] / 2, y + 4, { align: 'center' });
      tx += depColW[j];
    });
    y += 6;
  }

  y += 3;
  const irText = 'INFORMAR SE OS DEPENDENTES SÃO PARA FINS DE ABATIMENTO DO IR:';
  doc.setFontSize(7.5);
  doc.setFont(undefined, 'bold');
  doc.text(irText, ML, y);
  y += 5;
  doc.setFont(undefined, 'normal');
  doc.text(emp.dependentes_ir ? '(X) SIM    ( ) NÃO' : '( ) SIM    (X) NÃO, POIS O CÔNJUGE JÁ DECLARA', ML, y);
  y += 8;

  // ══════════════════════════════════════════════════════════════════════════
  // ASSINATURA
  // ══════════════════════════════════════════════════════════════════════════
  checkNewPage(30);
  divider();
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text('NOME E ASSINATURA DO RESPONSÁVEL DA EMPRESA: _____________________________________________', ML, y);
  y += 8;
  doc.text('DATA: ______________________', ML, y);
  y += 10;
  doc.text('ASSINATURA DO FUNCIONÁRIO: _________________________________________________________________', ML, y);

  // ── rodapé em todas as páginas ───────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${pageCount}`, W / 2, 292, { align: 'center' });
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, ML, 292);
    doc.setTextColor(0);
  }

  const nomeSanitized = (emp.nome_completo || 'funcionario').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`FichaAdmissao_${nomeSanitized}.pdf`);
  return { success: true };
}