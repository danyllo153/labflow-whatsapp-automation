// BACKUP da versao COLORIDA do painel (06/10/2026). Para voltar a ela: node scripts/gerar-painel-powerbi-colorido.js
// Gera o painel do LabFlow no projeto do Power BI (powerbi/labflow.*, formato PBIP/PBIR):
// tema LabFlow, medidas e colunas calculadas no modelo (TMDL) e 6 páginas no relatório (JSON).
// Cabeçalho, cartões e barras de andamento são HTML montado por medida DAX e mostrado pelo visual
// "HTML Content Secure" (certificado pela Microsoft, do AppSource; sem scripts nem conteúdo externo).
// Uso (com o Power BI FECHADO): node scripts/gerar-painel-powerbi.js
// Pode rodar de novo: recria tema, páginas, medidas e colunas calculadas, sem duplicar.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..', 'powerbi');
const REL = path.join(RAIZ, 'labflow.Report');
const DEF = path.join(REL, 'definition');
const MOD = path.join(RAIZ, 'labflow.SemanticModel', 'definition', 'tables');
const VISUAL_HTML = 'htmlContent443BE3AD55E043BF878BED274D3A6865'; // HTML Content Secure (AppSource)
const id = () => crypto.randomBytes(10).toString('hex');
const guid = () => crypto.randomUUID();
const texto = (s) => `'${String(s).replace(/'/g, "''")}'`; // literal de texto do PBIR
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const cor = (hex) => ({ solid: { color: lit(`'${hex}'`) } });

// ---------------------------------------------------------------- cores
const COR = {
  fundo: '#0F2740', marinho: '#16324F', azul: '#0B5394', verde: '#2E7D32', laranja: '#EF6C00', vermelho: '#C62828',
  roxo: '#6A1B9A', magenta: '#AD1457', teal: '#00838F', cinza: '#607D8B', branco: '#FFFFFF',
};
// degradês dos cartões HTML
const GRAD = {
  vermelho: ['#B71C1C', '#E53935'], laranja: ['#E65100', '#FB8C00'], roxo: ['#4A148C', '#8E24AA'],
  magenta: ['#880E4F', '#D81B60'], teal: ['#006064', '#00ACC1'], azul: ['#0D47A1', '#1E88E5'],
  verde: ['#1B5E20', '#43A047'], marinho: ['#0B1F33', '#2B5C8A'],
};
// valores de status: [cor do texto, cor do fundo] (vira "pílula" colorida nas tabelas e cor das séries nos gráficos)
const PILULA = {
  'Atrasado': [COR.vermelho, '#FDE2E1'], 'Vence hoje': [COR.laranja, '#FFE9D2'], 'No prazo': [COR.azul, '#E3EEFB'],
  'Lido': [COR.verde, '#DFF3E3'], 'Concluído': [COR.verde, '#DFF3E3'],
  'Em confirmação': [COR.laranja, '#FFE9D2'], 'Em andamento': [COR.azul, '#E3EEFB'],
  'No caldo': [COR.azul, '#E3EEFB'], 'Estriado': [COR.teal, '#D9F2F2'], 'Incubado': [COR.roxo, '#EFE3F7'],
  'Positivo': [COR.vermelho, '#FDE2E1'], 'Confirmado': [COR.vermelho, '#FDE2E1'],
  'Negativo': [COR.verde, '#DFF3E3'], 'Não confirmado': [COR.verde, '#DFF3E3'], 'Sem desvio': [COR.cinza, '#ECEFF1'],
  'Alarme': [COR.vermelho, '#FDE2E1'], 'Normal': [COR.verde, '#DFF3E3'], 'Aguardando': [COR.cinza, '#ECEFF1'],
};
// valores de identificação: só a cor do texto
const ROTULO = {
  'Terra': COR.verde, 'Navio': COR.azul, 'Recebimento': COR.teal, 'Embarque': COR.azul, 'Tank farm': COR.verde,
  'TAB': COR.roxo, 'Coliformes': COR.magenta, 'Howard': COR.marinho, 'D5': COR.azul, 'D10': COR.roxo, 'D15': COR.laranja,
  'C.T 48h': COR.teal, 'B.L 72h': COR.azul, 'B.L 120h': COR.roxo, 'AQA': COR.azul, 'COL': COR.laranja, 'UCH': COR.roxo,
};
const COLS_PILULA = new Set(['situacao', 'status', 'resultado', 'desvio_resultado', 'Resultado ou andamento', 'Desvio do drop', 'Faixa']);
const COLS_ROTULO = new Set(['origem', 'teste', 'drop', 'Estágio', 'analise', 'fabrica']);
const SERIE_SITUACAO = Object.fromEntries(Object.entries(PILULA).map(([v, [t]]) => [v, t]));
const SERIE_ORIGEM = { Terra: COR.verde, Navio: COR.azul };
const SERIE_RESULTADO = { Positivo: COR.vermelho, Negativo: COR.verde, 'Em andamento': COR.azul };
const SERIE_FAIXA = { Alarme: COR.vermelho, Normal: COR.verde, Aguardando: '#90A4AE' };

// ---------------------------------------------------------------- tema LabFlow
const TEMA = {
  name: 'LabFlow',
  dataColors: [COR.azul, COR.verde, COR.laranja, COR.roxo, COR.teal, COR.vermelho, '#F9A825', COR.magenta, COR.cinza],
  foreground: COR.marinho, background: COR.branco, tableAccent: COR.azul,
  good: COR.verde, neutral: COR.laranja, bad: COR.vermelho,
  textClasses: {
    title: { fontFace: 'Segoe UI Semibold', fontSize: 13, color: COR.branco },
    label: { fontFace: 'Segoe UI', fontSize: 11, color: COR.marinho },
    callout: { fontFace: 'Segoe UI Semibold', fontSize: 32, color: COR.azul },
  },
  visualStyles: {
    '*': { '*': {
      background: [{ show: true, color: { solid: { color: COR.branco } }, transparency: 0 }],
      border: [{ show: true, color: { solid: { color: '#C9D8EA' } }, radius: 12 }],
      dropShadow: [{ show: true }],
      title: [{ show: true, fontColor: { solid: { color: COR.branco } }, background: { solid: { color: COR.azul } },
        fontSize: 13, bold: true }],
      categoryAxis: [{ show: true, labelColor: { solid: { color: '#37506B' } }, fontSize: 10, showAxisTitle: false }],
      valueAxis: [{ show: true, labelColor: { solid: { color: '#78909C' } }, fontSize: 9, showAxisTitle: false,
        gridlineShow: true, gridlineColor: { solid: { color: '#E6EDF5' } }, gridlineStyle: 'dotted' }],
      legend: [{ show: true, position: 'Top', labelColor: { solid: { color: '#37506B' } }, fontSize: 10 }],
    } },
    page: { '*': {
      background: [{ color: { solid: { color: COR.fundo } }, transparency: 0 }],
      outspace: [{ color: { solid: { color: COR.fundo } } }],
    } },
    tableEx: { '*': {
      columnHeaders: [{ backColor: { solid: { color: COR.azul } }, fontColor: { solid: { color: COR.branco } }, bold: true }],
      values: [{ backColorPrimary: { solid: { color: COR.branco } }, backColorSecondary: { solid: { color: '#F2F6FB' } },
        fontColorPrimary: { solid: { color: '#22384F' } }, fontColorSecondary: { solid: { color: '#22384F' } } }],
      grid: [{ gridHorizontal: true, gridHorizontalColor: { solid: { color: '#E1E9F3' } }, gridVertical: false }],
    } },
    slicer: { '*': {
      header: [{ fontColor: { solid: { color: COR.marinho } }, bold: true }],
      items: [{ fontColor: { solid: { color: COR.marinho } } }],
    } },
  },
};
const TEMA_ARQ = 'LabFlow.json';
const pastaTema = path.join(REL, 'StaticResources', 'RegisteredResources');
fs.mkdirSync(pastaTema, { recursive: true });
fs.writeFileSync(path.join(pastaTema, TEMA_ARQ), JSON.stringify(TEMA, null, 2), 'utf8');
const report = JSON.parse(fs.readFileSync(path.join(DEF, 'report.json'), 'utf8'));
report.themeCollection.customTheme = {
  name: TEMA_ARQ, reportVersionAtImport: report.themeCollection.baseTheme.reportVersionAtImport, type: 'RegisteredResources',
};
report.resourcePackages = (report.resourcePackages || []).filter((r) => r.type !== 'RegisteredResources');
report.resourcePackages.push({ name: 'RegisteredResources', type: 'RegisteredResources',
  items: [{ name: TEMA_ARQ, path: TEMA_ARQ, type: 'CustomTheme' }] });
report.publicCustomVisuals = [...new Set([...(report.publicCustomVisuals || []), VISUAL_HTML])];
fs.writeFileSync(path.join(DEF, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

// ---------------------------------------------------------------- HTML em DAX
const dax = (s) => `"${s.replace(/"/g, '""')}"`; // texto -> literal DAX
const junta = (...partes) => partes.join(' & '); // concatenação DAX
const FONTE = 'font-family:Segoe UI,sans-serif';
const degrade = (k) => `linear-gradient(135deg,${GRAD[k][0]} 0%,${GRAD[k][1]} 100%)`;

const cabecalhoHtml = (titulo, sub, icone) => dax(
  `<div style='height:74px;box-sizing:border-box;display:flex;align-items:center;gap:16px;padding:0 28px;${FONTE};color:#fff;`
  + `background:linear-gradient(90deg,#071726 0%,#0F3354 45%,#0B5394 100%);border-bottom:3px solid #00B3A4'>`
  + `<div style='width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;`
  + `background:linear-gradient(135deg,#00B3A4,#1E88E5);box-shadow:0 4px 14px rgba(0,0,0,.35)'>${icone}</div>`
  + `<div><div style='font-size:11px;letter-spacing:2.5px;text-transform:uppercase;opacity:.7'>LabFlow · Microbiologia</div>`
  + `<div style='font-size:22px;font-weight:700;line-height:1.15'>${titulo}</div>`
  + `<div style='font-size:12px;opacity:.78'>${sub} · dados fictícios de demonstração</div></div></div>`);

// cartão: indicador de alerta fica na cor dele (com um ponto piscando) quando > 0 e verde quando zerado;
// indicador "neutro" (contagem, média) fica sempre na cor dele
const cartaoHtml = ({ rotulo, valor, sub, icone, cor: c, neutro, formato = '0', sufixo = '', zero = 'Tudo em dia' }) => {
  const v = `COALESCE(${valor}, 0)`;
  const se = (sim, nao) => (neutro ? sim : `IF(${v} > 0, ${sim}, ${nao})`);
  const ponto = "<span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:#fff;margin-right:7px;"
    + "vertical-align:middle;animation:lfPulso 1.4s infinite'></span>";
  return junta(
    dax("<div style='flex:1;min-width:0;position:relative;overflow:hidden;border-radius:16px;padding:10px 16px;color:#fff;"
      + "box-shadow:0 8px 20px rgba(0,0,0,.30);background:"),
    se(dax(degrade(c)), dax(degrade('verde'))),
    dax("'><div style='position:absolute;right:-26px;bottom:-40px;width:120px;height:120px;border-radius:50%;"
      + "background:rgba(255,255,255,.09)'></div><div style='position:absolute;top:12px;right:14px;width:38px;height:38px;"
      + "border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;"
      + `font-size:20px'>${icone}</div><div style='font-size:12px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;`
      + "opacity:.95;padding-right:44px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>"),
    neutro ? dax('') : se(dax(ponto), dax('')),
    dax(`${rotulo}</div><div style='font-size:34px;font-weight:700;line-height:1.1;margin-top:2px'>`),
    `FORMAT(${v}, "${formato}")`,
    dax(`${sufixo}</div><div style='font-size:11.5px;opacity:.9;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>`),
    se(dax(sub), dax(`✓ ${zero}`)),
    dax('</div></div>'),
  );
};
const faixaHtml = (...cartoes) => junta(
  dax('<style>@keyframes lfPulso{0%{opacity:1}50%{opacity:.2}100%{opacity:1}}</style>'
    + `<div style='display:flex;gap:12px;width:100%;height:104px;padding:0 8px 0 0;box-sizing:border-box;${FONTE}'>`),
  ...cartoes.map(cartaoHtml),
  dax('</div>'));

// uma linha por "linha do relatório": barra verde (lidas), vermelha (atrasadas) e laranja (hoje)
const PROGRESSO_LEITURAS = 'VAR linha = SELECTEDVALUE(\'bi leituras_nfc\'[linha_relatorio]) '
  + 'VAR total = COALESCE([Leituras], 0) VAR lidas = COALESCE([Leituras lidas], 0) '
  + 'VAR atras = COALESCE([Leituras atrasadas], 0) VAR hoje = COALESCE([Leituras que vencem hoje], 0) '
  + 'VAR pl = FORMAT(ROUND(DIVIDE(lidas, total, 0) * 100, 0), "0") VAR pa = FORMAT(ROUND(DIVIDE(atras, total, 0) * 100, 0), "0") '
  + 'VAR ph = FORMAT(ROUND(DIVIDE(hoje, total, 0) * 100, 0), "0") RETURN ' + junta(
  dax(`<div style='margin:2px 6px 12px 6px;${FONTE}'><div style='display:flex;justify-content:space-between;align-items:baseline;`
    + "font-size:13px;color:#16324F'><b>"), 'linha',
  dax("</b><span style='font-size:12px;color:#455A64'><b style='color:#2E7D32'>"), 'pl',
  dax('% lidas</b> · '), 'lidas', dax(' de '), 'total',
  dax("</span></div><div style='height:12px;border-radius:7px;background:#E3EAF3;overflow:hidden;display:flex;margin-top:5px'>"
    + "<div style='width:"), 'pl', dax("%;background:linear-gradient(90deg,#1B5E20,#43A047)'></div><div style='width:"), 'pa',
  dax("%;background:linear-gradient(90deg,#B71C1C,#E53935)'></div><div style='width:"), 'ph',
  dax("%;background:linear-gradient(90deg,#E65100,#FB8C00)'></div></div><div style='font-size:11px;margin-top:4px'>"
    + "<span style='color:#C62828'>● "), 'atras', dax(" atrasadas</span>&nbsp;&nbsp;<span style='color:#EF6C00'>● "), 'hoje',
  dax(' para hoje</span></div></div>'));

// ---------------------------------------------------------------- medidas
const CALC = (tabela, ...filtros) => `CALCULATE(COUNTROWS('${tabela}'), ${filtros.join(', ')})`;
const HTML = { pasta: 'Painel HTML', oculta: true };
const PAGINA_HTML = {
  'Visão geral': ['Visão geral', 'O que precisa de atenção hoje: NFC, concentrado e drops', '🧫'],
  Coletas: ['Coletas', 'Tanques coletados por mês, por dia e por analista, de terra e de navio', '🛢️'],
  Tanques: ['Tanques (NFC)', 'Leituras de C.T, B.L e Psicrotróficos dos tanques de terra e de navio', '🧪'],
  Drops: ['Drops e desvios', 'D5, D10 e D15 e os desvios com repetição em 7, 13 e 25 °C', '💧'],
  Recebimento: ['Recebimento de concentrado', 'FCOJ: lotes recebidos e C.T e B.L por fábrica, item e load', '📦'],
  Embarque: ['Embarque de concentrado', 'FCOJ: amostras, C.T e B.L e Howard por navio, linha e fase', '⚓'],
  TAB: ['TAB', 'Do caldo ao resultado: recebimento, embarque e tanques de terra', '🦠'],
  Coliformes: ['Coliformes', 'Do caldo ao resultado: recebimento e embarque', '🧫'],
};
// cartões de alerta do C.T e B.L (a página já filtra recebimento ou embarque)
const CARTOES_CTBL = [
  { rotulo: 'C.T e B.L com alarme', valor: '[Resultados com alarme]', sub: 'B.L ≥ 50 ou C.T ≥ 200', icone: '🚨', cor: 'vermelho', zero: 'Nenhum alarme' },
  { rotulo: 'C.T e B.L atrasados', valor: '[C.T e B.L atrasados]', sub: 'Leitura passou do prazo', icone: '⏰', cor: 'laranja' },
];
// etapas do TAB e dos Coliformes (a página já filtra o teste)
const cartoesTeste = (meio) => [
  { rotulo: 'No caldo', valor: '[Testes no caldo]', sub: 'Aguardando a próxima etapa', icone: '🧪', cor: 'azul', neutro: true },
  meio,
  { rotulo: 'Em confirmação', valor: '[Testes em confirmação]', sub: 'Colônia na placa', icone: '🔎', cor: 'laranja', zero: 'Nada em confirmação' },
  { rotulo: 'Positivos', valor: '[Testes positivos]', sub: 'Resultado final', icone: '🚨', cor: 'vermelho', zero: 'Nenhum positivo' },
  { rotulo: 'Negativos', valor: '[Testes negativos]', sub: 'Resultado final', icone: '✅', cor: 'verde', neutro: true },
];
const CARTOES = {
  'Visão geral': [
    { rotulo: 'Leituras atrasadas', valor: '[Leituras atrasadas]', sub: 'NFC: passaram da data prevista', icone: '🚨', cor: 'vermelho' },
    { rotulo: 'Leituras para hoje', valor: '[Leituras que vencem hoje]', sub: 'NFC: ler até o fim do dia', icone: '⏰', cor: 'laranja', zero: 'Nada para hoje' },
    { rotulo: 'Drops atrasados', valor: '[Drops atrasados]', sub: 'D5, D10 e D15 pendentes', icone: '💧', cor: 'vermelho' },
    { rotulo: 'C.T e B.L com alarme', valor: '[Resultados com alarme]', sub: 'B.L ≥ 50 ou C.T ≥ 200', icone: '🧪', cor: 'vermelho', zero: 'Nenhum alarme' },
    { rotulo: 'Testes positivos', valor: '[Testes positivos]', sub: 'TAB e Coliformes', icone: '🦠', cor: 'roxo', zero: 'Nenhum positivo' },
    { rotulo: 'Desvios abertos', valor: '[Desvios abertos]', sub: 'Repetição em 7, 13 e 25 °C', icone: '🌡️', cor: 'laranja', zero: 'Nenhum aberto' },
  ],
  Coletas: [
    { rotulo: 'Tanques coletados', valor: '[Tanques coletados]', sub: 'No período e nos filtros escolhidos', icone: '🧫', cor: 'azul', neutro: true },
    { rotulo: 'Tanques de terra', valor: '[Tanques de terra]', sub: 'Tank farm', icone: '🛢️', cor: 'verde', neutro: true },
    { rotulo: 'Tanques de navio', valor: '[Tanques de navio]', sub: 'Coletas nos navios', icone: '🚢', cor: 'teal', neutro: true },
    { rotulo: 'Analistas', valor: '[Analistas]', sub: 'Pessoas que coletaram', icone: '🔬', cor: 'marinho', neutro: true },
  ],
  Tanques: [
    { rotulo: 'Leituras atrasadas', valor: '[Leituras atrasadas]', sub: 'Passaram da data prevista', icone: '🚨', cor: 'vermelho' },
    { rotulo: 'Leituras para hoje', valor: '[Leituras que vencem hoje]', sub: 'Ler até o fim do dia', icone: '⏰', cor: 'laranja', zero: 'Nada para hoje' },
    { rotulo: 'Leituras feitas', valor: '[% de leituras lidas]', formato: '0%', sub: 'Do total previsto', icone: '✅', cor: 'verde', neutro: true },
    { rotulo: 'Leituras previstas', valor: '[Leituras]', sub: 'Nos filtros escolhidos', icone: '🧪', cor: 'azul', neutro: true },
  ],
  Drops: [
    { rotulo: 'Drops atrasados', valor: '[Drops atrasados]', sub: 'Passaram da data prevista', icone: '💧', cor: 'vermelho' },
    { rotulo: 'Drops para hoje', valor: '[Drops que vencem hoje]', sub: 'Concluir até o fim do dia', icone: '⏰', cor: 'laranja', zero: 'Nada para hoje' },
    { rotulo: 'Desvios abertos', valor: '[Desvios abertos]', sub: 'Em confirmação', icone: '🌡️', cor: 'laranja', zero: 'Nenhum aberto' },
    { rotulo: 'Desvios confirmados', valor: '[Desvios confirmados]', sub: 'Cresceu em alguma temperatura', icone: '⚠️', cor: 'magenta', zero: 'Nenhum confirmado' },
  ],
  Recebimento: [
    { rotulo: 'Lotes recebidos', valor: '[Lotes e amostras]', sub: 'Nos filtros escolhidos', icone: '📦', cor: 'azul', neutro: true },
    { rotulo: 'Loads', valor: '[Loads no período]', sub: 'Com lotes no período', icone: '🏭', cor: 'teal', neutro: true },
    ...CARTOES_CTBL,
  ],
  Embarque: [
    { rotulo: 'Amostras', valor: '[Lotes e amostras]', sub: 'Nos filtros escolhidos', icone: '⚓', cor: 'azul', neutro: true },
    ...CARTOES_CTBL,
    { rotulo: 'Howard médio', valor: '[Howard médio (%)]', formato: '0.0', sufixo: '%', sub: 'Campos positivos x 2', icone: '🔍', cor: 'marinho', neutro: true },
  ],
  TAB: cartoesTeste({ rotulo: 'Incubados', valor: '[Testes incubados]', sub: 'Espalhados, na estufa', icone: '🌡️', cor: 'roxo', neutro: true }),
  Coliformes: cartoesTeste({ rotulo: 'Estriados', valor: '[Testes estriados]', sub: 'Na placa, aguardando leitura', icone: '🧫', cor: 'teal', neutro: true }),
};
const MEDIDAS = {
  'bi coletas': [
    ['Tanques coletados', "COUNTROWS('bi coletas')", { formato: '0' }],
    ['Tanques de terra', CALC('bi coletas', "'bi coletas'[origem] = \"Terra\""), { formato: '0' }],
    ['Tanques de navio', CALC('bi coletas', "'bi coletas'[origem] = \"Navio\""), { formato: '0' }],
    ['Analistas', "DISTINCTCOUNT('bi coletas'[registrado_por])", { formato: '0' }],
    ...Object.entries(PAGINA_HTML).map(([pag, args]) => [`HTML cabeçalho - ${pag}`, cabecalhoHtml(...args), HTML]),
    ...Object.entries(CARTOES).map(([pag, cartoes]) => [`HTML cartões - ${pag}`, faixaHtml(...cartoes), HTML]),
  ],
  'bi leituras_nfc': [
    ['Leituras', "COUNTROWS('bi leituras_nfc')", { formato: '0' }],
    ['Leituras lidas', CALC('bi leituras_nfc', "'bi leituras_nfc'[situacao] = \"Lido\""), { formato: '0' }],
    ['Leituras atrasadas', CALC('bi leituras_nfc', "'bi leituras_nfc'[situacao] = \"Atrasado\""), { formato: '0' }],
    ['Leituras que vencem hoje', CALC('bi leituras_nfc', "'bi leituras_nfc'[situacao] = \"Vence hoje\""), { formato: '0' }],
    ['% de leituras lidas', 'DIVIDE([Leituras lidas], [Leituras])', { formato: '0%' }],
    ['HTML andamento das leituras', PROGRESSO_LEITURAS, HTML],
  ],
  'bi drops': [
    ['Drops', "COUNTROWS('bi drops')", { formato: '0' }],
    ['Drops atrasados', CALC('bi drops', "'bi drops'[situacao] = \"Atrasado\""), { formato: '0' }],
    ['Drops que vencem hoje', CALC('bi drops', "'bi drops'[situacao] = \"Vence hoje\""), { formato: '0' }],
  ],
  'bi contagens': [
    ['C.T e B.L', "COUNTROWS('bi contagens')", { formato: '0' }],
    ['Resultados com alarme', CALC('bi contagens', "'bi contagens'[alarme] = TRUE()"), { formato: '0' }],
    ['C.T e B.L atrasados', CALC('bi contagens', "'bi contagens'[situacao] = \"Atrasado\""), { formato: '0' }],
    // lote (recebimento) ou amostra (embarque) conta uma vez, mesmo com C.T, B.L 72h e B.L 120h
    ['Lotes e amostras', "COUNTROWS(SUMMARIZE('bi contagens', 'bi contagens'[origem], 'bi contagens'[load], "
      + "'bi contagens'[Embarque], 'bi contagens'[lote_amostra]))", { formato: '0' }],
    ['Loads no período', "DISTINCTCOUNT('bi contagens'[load])", { formato: '0' }],
    // cor do resultado na tabela (vermelho se passou do limite, verde se normal)
    ['Cor do resultado', `IF(${CALC('bi contagens', "KEEPFILTERS('bi contagens'[alarme] = TRUE())")} > 0, "${COR.vermelho}", `
      + `IF(${CALC('bi contagens', "KEEPFILTERS('bi contagens'[lido] = TRUE())")} > 0, "${COR.verde}"))`, { oculta: true }],
    ['Fundo do resultado', `IF(${CALC('bi contagens', "KEEPFILTERS('bi contagens'[alarme] = TRUE())")} > 0, "#FDE2E1", `
      + `IF(${CALC('bi contagens', "KEEPFILTERS('bi contagens'[lido] = TRUE())")} > 0, "#DFF3E3"))`, { oculta: true }],
  ],
  'bi testes': [
    ['Testes', "COUNTROWS('bi testes')", { formato: '0' }],
    ['Testes no caldo', CALC('bi testes', "'bi testes'[status] = \"No caldo\""), { formato: '0' }],
    ['Testes incubados', CALC('bi testes', "'bi testes'[status] = \"Incubado\""), { formato: '0' }],
    ['Testes estriados', CALC('bi testes', "'bi testes'[status] = \"Estriado\""), { formato: '0' }],
    ['Testes em confirmação', CALC('bi testes', "'bi testes'[status] = \"Em confirmação\""), { formato: '0' }],
    ['Testes positivos', CALC('bi testes', "'bi testes'[resultado] = \"Positivo\""), { formato: '0' }],
    ['Testes negativos', CALC('bi testes', "'bi testes'[resultado] = \"Negativo\""), { formato: '0' }],
    ['Testes em andamento', CALC('bi testes', "'bi testes'[status] <> \"Concluído\""), { formato: '0' }],
    ['Testes atrasados', CALC('bi testes', "'bi testes'[situacao] = \"Atrasado\""), { formato: '0' }],
    ['Howard médio (%)', "AVERAGE('bi testes'[howard_percentual])", { formato: '0.0' }],
  ],
  'bi desvios': [
    ['Desvios', "COUNTROWS('bi desvios')", { formato: '0' }],
    ['Desvios abertos', CALC('bi desvios', "'bi desvios'[status] = \"Em confirmação\""), { formato: '0' }],
    ['Desvios confirmados', CALC('bi desvios', "'bi desvios'[resultado] = \"Confirmado\""), { formato: '0' }],
  ],
};
// colunas calculadas (texto limpo para tabelas, filtros e gráficos)
const colunaTmdl = (nome, expr, tipo, extra = '') =>
  `\tcolumn '${nome}' = ${expr}\n\t\tdataType: ${tipo}\n${extra}\t\tlineageTag: ${guid()}\n\t\tsummarizeBy: none\n`;
const local = (t) => colunaTmdl('Local', `IF(ISBLANK('${t}'[navio]), "Terra (tank farm)", '${t}'[navio])`, 'string');
const COLUNAS = {
  'bi coletas': [
    colunaTmdl('Mês', 'FORMAT(\'bi coletas\'[data_coleta], "mmm/yyyy")', 'string', "\t\tsortByColumn: 'Mês (ordem)'\n"),
    colunaTmdl('Mês (ordem)', "YEAR('bi coletas'[data_coleta]) * 100 + MONTH('bi coletas'[data_coleta])", 'int64', '\t\tisHidden\n'),
    local('bi coletas'),
  ],
  'bi leituras_nfc': [local('bi leituras_nfc')],
  'bi drops': [
    local('bi drops'),
    colunaTmdl('Estágio', "'bi drops'[drop]", 'string', "\t\tsortByColumn: 'Estágio (ordem)'\n"),
    colunaTmdl('Estágio (ordem)', "INT(VALUE(MID('bi drops'[drop], 2, 3)))", 'int64', '\t\tisHidden\n'),
    colunaTmdl('Desvio do drop', "IF('bi drops'[desvio], COALESCE('bi drops'[desvio_resultado], \"Em confirmação\"), \"Sem desvio\")", 'string'),
  ],
  'bi desvios': [local('bi desvios')],
  'bi testes': [
    colunaTmdl('Resultado ou andamento', "IF(NOT ISBLANK('bi testes'[resultado]), 'bi testes'[resultado], "
      + "IF('bi testes'[teste] = \"Howard\", \"Concluído\", \"Em andamento\"))", 'string'),
    // navio do embarque ("DEMO OCEAN 901 linha 1 fase 1" -> "DEMO OCEAN 901"), para filtrar por navio
    colunaTmdl('Navio', "IF('bi testes'[origem] = \"Embarque\", TRIM(LEFT('bi testes'[embarque], "
      + "SEARCH(\" linha\", 'bi testes'[embarque], 1, LEN('bi testes'[embarque]) + 1) - 1)))", 'string'),
    // de onde é a amostra, numa coluna só: load do recebimento, linha do embarque ou tanque de terra
    colunaTmdl('Identificação', "SWITCH('bi testes'[origem], \"Tank farm\", \"Tanque \" & 'bi testes'[tanque], "
      + "\"Embarque\", 'bi testes'[embarque], \"Load \" & 'bi testes'[load])", 'string'),
  ],
  // "DEMO OCEAN 901 linha 1 fase 1", como o bot escreve (bi.testes já traz pronta na coluna embarque)
  'bi contagens': [
    colunaTmdl('Embarque', "IF('bi contagens'[origem] = \"Embarque\", 'bi contagens'[navio] & \" linha \" & 'bi contagens'[linha] & \" fase \" & 'bi contagens'[fase])", 'string'),
    colunaTmdl('Faixa', "IF('bi contagens'[alarme], \"Alarme\", IF('bi contagens'[lido], \"Normal\", \"Aguardando\"))", 'string'),
    // dia do recebimento do lote (ou do embarque da amostra): os prazos contam dele (C.T +2, B.L 72h +3, B.L 120h +5)
    colunaTmdl('Data da amostra', "'bi contagens'[prevista] - SWITCH('bi contagens'[analise], \"C.T 48h\", 2, \"B.L 72h\", 3, 5)",
      'dateTime', '\t\tformatString: dd/MM/yyyy\n'),
  ],
};
// formato de coluna que já vem do banco
const FORMATOS = { 'bi testes': { howard_percentual: '0.0' } };
const formatoColuna = (t, coluna, formato) => t.replace(
  new RegExp(`(\\tcolumn ${coluna}\\n(?:\\t\\t[^\\n]*\\n)*?)(?:\\t\\tformatString: [^\\n]*\\n)?(\\t\\tlineageTag:)`),
  `$1\t\tformatString: ${formato}\n$2`);
const medidaTmdl = ([nome, expr, { formato, pasta, oculta } = {}]) => `\tmeasure '${nome}' = ${expr}\n`
  + (formato ? `\t\tformatString: ${formato}\n` : '') + (pasta ? `\t\tdisplayFolder: ${pasta}\n` : '')
  + (oculta ? '\t\tisHidden\n' : '') + `\t\tlineageTag: ${guid()}\n`;
// confere os nomes antes de gravar: no Power BI maiúscula e minúscula são o mesmo nome, então coluna
// calculada ou medida não pode repetir coluna do banco ('Desvio' x 'desvio'), e medida não se repete no modelo
const medidasDoModelo = new Map();
for (const [tabela, medidas] of Object.entries(MEDIDAS)) {
  const t = fs.readFileSync(path.join(MOD, `${tabela}.tmdl`), 'utf8').replace(/\r\n/g, '\n');
  const naTabela = new Map([...t.matchAll(/^\tcolumn (?:'([^']+)'|(\S+))$/gm)]
    .map((m) => [(m[1] || m[2]).toLowerCase(), 'coluna do banco']));
  const novos = [...medidas.map(([nome]) => ['medida', nome]),
    ...(COLUNAS[tabela] || []).map((bloco) => ['coluna calculada', bloco.match(/^\tcolumn '([^']+)'/)[1]])];
  for (const [tipo, nome] of novos) {
    const chave = nome.toLowerCase();
    const repetido = naTabela.get(chave) || (tipo === 'medida' && medidasDoModelo.get(chave));
    if (repetido) throw new Error(`${tipo} '${nome}' em '${tabela}' tem o mesmo nome de: ${repetido}`);
    naTabela.set(chave, `${tipo} de '${tabela}'`);
    if (tipo === 'medida') medidasDoModelo.set(chave, `medida de '${tabela}'`);
  }
}
for (const [tabela, medidas] of Object.entries(MEDIDAS)) {
  const arq = path.join(MOD, `${tabela}.tmdl`);
  let t = fs.readFileSync(arq, 'utf8').replace(/\r\n/g, '\n');
  // remove as geradas antes; ao salvar, o Power BI tira as aspas dos nomes simples (measure Analistas)
  // e pode deixar linha em branco antes de "annotation", então o bloco vai até a próxima linha sem recuo duplo
  t = t.replace(/^\t(?:measure|column) (?:'[^']+'|[^\s=']+) = [^\n]*\n(?:\t\t[^\n]*\n|\n(?=\t\t))*\n?/gm, '');
  const bloco = [...medidas.map(medidaTmdl), ...(COLUNAS[tabela] || [])].join('\n');
  t = t.replace(/^(table [^\n]+\n\tlineageTag: [^\n]+\n)\n/, `$1\n${bloco}\n`);
  // datas curtas (o "quarta-feira, 16 de setembro de 2026" alarga demais as tabelas)
  t = t.replace(/formatString: Long Date/g, 'formatString: dd/MM/yyyy')
    .replace(/formatString: General Date/g, 'formatString: dd/MM/yyyy HH:mm');
  for (const [coluna, formato] of Object.entries(FORMATOS[tabela] || {})) t = formatoColuna(t, coluna, formato);
  fs.writeFileSync(arq, t, 'utf8');
}

// ---------------------------------------------------------------- campos
const ref = (e, p) => ({ Column: { Expression: { SourceRef: { Entity: e } }, Property: p } });
const col = (e, p, nome) => ({ field: ref(e, p), queryRef: `${e}.${p}`, nativeQueryRef: p, ...(nome ? { displayName: nome } : {}) });
const med = (e, p) => ({
  field: { Measure: { Expression: { SourceRef: { Entity: e } }, Property: p } }, queryRef: `${e}.${p}`, nativeQueryRef: p,
});
const filtroEm = (e, p, valores) => ({
  name: id(), type: 'Categorical', field: ref(e, p),
  filter: { Version: 2, From: [{ Name: 'f', Entity: e, Type: 0 }],
    Where: [{ Condition: { In: {
      Expressions: [{ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: p } }],
      Values: valores.map((v) => [{ Literal: { Value: v } }]),
    } } }] },
});
// cor por valor (série de gráfico): seletor "coluna = valor"
const corPorValor = (e, p, mapa) => Object.entries(mapa).map(([valor, hex]) => ({ properties: { fill: cor(hex) },
  selector: { data: [{ scopeId: { Comparison: { ComparisonKind: 0, Left: ref(e, p), Right: { Literal: { Value: texto(valor) } } } } }] } }));
// formatação condicional das tabelas
const seletorColuna = (e, p) => ({ data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: `${e}.${p}` });
const casos = (e, p, mapa, pega) => ({ expr: { Conditional: { Cases: Object.entries(mapa).map(([valor, cores]) => ({
  Condition: { Comparison: { ComparisonKind: 0, Left: ref(e, p), Right: { Literal: { Value: texto(valor) } } } },
  Value: { Literal: { Value: `'${pega(cores)}'` } },
})) } } });
const pilula = (e, p) => ({ selector: seletorColuna(e, p), properties: {
  fontColor: { solid: { color: casos(e, p, PILULA, (c) => c[0]) } }, backColor: { solid: { color: casos(e, p, PILULA, (c) => c[1]) } } } });
const rotulo = (e, p) => ({ selector: seletorColuna(e, p), properties: { fontColor: { solid: { color: casos(e, p, ROTULO, (c) => c) } } } });
const porMedida = (e, p, medTexto, medFundo) => ({ selector: seletorColuna(e, p), properties: {
  fontColor: { solid: { color: { expr: { Measure: { Expression: { SourceRef: { Entity: e } }, Property: medTexto } } } } },
  backColor: { solid: { color: { expr: { Measure: { Expression: { SourceRef: { Entity: e } }, Property: medFundo } } } } } } });

// ---------------------------------------------------------------- visuais
const NENHUM = [{ properties: { show: lit('false') } }];
const moldura = ({ titulo, corTitulo, semMoldura }) => (semMoldura
  ? { title: NENHUM, subTitle: NENHUM, background: NENHUM, border: NENHUM, dropShadow: NENHUM, visualHeader: NENHUM }
  : { title: [{ properties: titulo
    ? { show: lit('true'), text: lit(texto(titulo)), fontColor: cor(COR.branco), background: cor(corTitulo || COR.azul), bold: lit('true') }
    : { show: lit('false') } }],
  subTitle: NENHUM });
const visual = (tipo, pos, queryState, extras = {}) => ({
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.13.0/schema.json',
  name: id(),
  position: { x: pos[0], y: pos[1], z: 0, width: pos[2], height: pos[3], tabOrder: 0 },
  visual: {
    visualType: tipo,
    ...(queryState ? { query: { queryState, ...(extras.sort ? { sortDefinition: { sort: extras.sort } } : {}) } } : {}),
    ...(extras.objects ? { objects: extras.objects } : {}),
    visualContainerObjects: moldura(extras),
    drillFilterOtherVisuals: true,
  },
  ...(extras.filtros ? { filterConfig: { filters: extras.filtros } } : {}),
});
// HTML (medida) sem moldura: cabeçalho e faixa de cartões
const html = (pos, e, m, extras = {}) => visual(VISUAL_HTML, pos, {
  content: { projections: [med(e, m)] }, ...(extras.linhas ? { sampling: { projections: [extras.linhas] } } : {}),
}, { semMoldura: !extras.titulo, ...extras });
const navegador = (pos) => visual('pageNavigator', pos, null, { semMoldura: true, objects: {
  fill: [
    { properties: { show: lit('true'), fillColor: cor('#0F3354'), transparency: lit('0D') }, selector: { id: 'default' } },
    { properties: { fillColor: cor('#1E5A8C') }, selector: { id: 'hover' } },
    { properties: { fillColor: cor('#00B3A4') }, selector: { id: 'selected' } },
  ],
  text: [
    { properties: { show: lit('true'), fontColor: cor('#CFE3F7'), fontSize: lit('12D'), bold: lit('true') }, selector: { id: 'default' } },
    { properties: { fontColor: cor(COR.branco) }, selector: { id: 'selected' } },
  ],
  outline: NENHUM,
} });
// largura de cada coluna (quanto texto costuma ter); o resto vale 1.2
const PESO = { tanque: 0.8, frasco: 0.9, drop: 0.7, load: 0.9, teste: 0.8, origem: 1.2, analise: 1, lotes: 1.1,
  navio: 1.5, Local: 1.6, linha_relatorio: 1.7, metodo: 1.3, situacao: 1.2, status: 1.1, resultado: 1.4, temperaturas: 1.6,
  alvo: 1.4, lote_amostra: 1, proxima_etapa: 1.2, registrado_em: 1.6, data_resultado: 1.2, howard_percentual: 1,
  Embarque: 2.1, embarque: 2.1, 'Estágio': 0.8, 'Desvio do drop': 1.2, 'Resultado ou andamento': 1.3, data_feito: 1.1, data_coleta: 1.1,
  prevista: 1.1, data_leitura: 1.1, fabrica: 0.8, item: 0.7, 'Identificação': 1.9, 'Data da amostra': 1.1, Navio: 1.4 };
const peso = (c) => PESO[c.nativeQueryRef] || (/_por$/.test(c.nativeQueryRef) ? 1.5 : 1.2);
// tabela: as colunas ocupam toda a largura do visual; status viram "pílulas" coloridas e
// identificações (origem, teste, drop, análise) ganham cor no texto
const K = 'bi contagens';
const tabela = (pos, titulo, campos, filtros, corTitulo) => {
  const util = pos[2] - 50 - 12 * campos.length; // desconta rolagem, bordas e o espaço interno de cada célula
  const total = campos.reduce((s, c) => s + peso(c), 0);
  const larguras = campos.map((c) => ({
    properties: { value: lit(`${Math.floor(util * peso(c) / total)}D`) }, selector: { metadata: c.queryRef },
  }));
  const cores = campos.flatMap((c) => {
    const e = c.field.Column.Expression.SourceRef.Entity;
    const p = c.field.Column.Property;
    if (e === K && p === 'resultado') return [porMedida(e, p, 'Cor do resultado', 'Fundo do resultado')];
    if (COLS_PILULA.has(p)) return [pilula(e, p)];
    if (COLS_ROTULO.has(p)) return [rotulo(e, p)];
    return [];
  });
  const fonte = pos[2] >= 1500 ? '14D' : pos[2] >= 900 ? '12D' : '11D';
  return visual('tableEx', pos, { Values: { projections: campos } }, { titulo, filtros, corTitulo,
    objects: {
      values: [{ properties: { fontSize: lit(fonte) } }, ...cores],
      columnHeaders: [{ properties: { fontSize: lit(fonte), backColor: cor(corTitulo || COR.azul), fontColor: cor(COR.branco),
        autoSizeColumnWidth: lit('false'), wordWrap: lit('true') } }],
      columnWidth: larguras,
      total: [{ properties: { totals: lit('false') } }], // sem linha de "Total" no fim
    } });
};
// filtro: "Lista" (Basic), "Blocos" (botões lado a lado), "Dropdown" ou "Between" (intervalo de datas)
const segmentacao = (pos, e, p, nome, modo) =>
  visual('slicer', pos, { Values: { projections: [col(e, p, nome)] } }, { objects: {
    data: [{ properties: { mode: lit(texto(modo === 'Blocos' ? 'Basic' : modo)) } }],
    ...(modo === 'Blocos' ? { general: [{ properties: { orientation: lit('1D') } }] } : {}),
    header: [{ properties: { show: lit('true'), fontColor: cor(COR.marinho), textSize: lit('10D') } }],
    items: [{ properties: { textSize: lit('10D') } }],
  } });
// gráfico: papéis Category / Series / Y (Category e Y no donut); séries empilhadas levam rótulo branco
const grafico = (tipo, pos, titulo, papeis, op = {}) => {
  const queryState = {};
  for (const [papel, campos] of Object.entries(papeis)) if (campos) queryState[papel] = { projections: [].concat(campos) };
  const empilhado = /^(columnChart|barChart)$/.test(tipo);
  return visual(tipo, pos, queryState, {
    titulo, corTitulo: op.corTitulo, sort: op.sort, filtros: op.filtros,
    objects: {
      ...(op.cores ? { dataPoint: op.cores } : {}),
      ...(op.corUnica ? { dataPoint: [{ properties: { fill: cor(op.corUnica) } }] } : {}),
      labels: [{ properties: { show: lit(op.semRotulos ? 'false' : 'true'), fontSize: lit('10D'),
        color: cor(empilhado ? COR.branco : COR.marinho) } }],
      legend: [{ properties: { show: lit(op.semLegenda ? 'false' : 'true'), position: lit(texto(op.legenda || 'Top')) } }],
      ...(tipo === 'lineChart' ? { lineStyles: [{ properties: { strokeWidth: lit('3D'), showMarker: lit('true') } }] } : {}),
    },
  });
};

// ---------------------------------------------------------------- páginas
// Todas seguem o padrão da página Coletas: cabeçalho, cartões e filtros no topo, 3 gráficos e UMA tabela.
const C = 'bi coletas', L = 'bi leituras_nfc', D = 'bi drops', T = 'bi testes', V = 'bi desvios';
// tabelas de apoio criadas pelo MCP do Power BI (ligadas às tabelas do painel): um filtro nelas vale para a página inteira
const LOADS = 'Loads', EMBARQUES = 'Embarques', CAL = 'Calendário';
const PENDENTE = ["'Atrasado'", "'Vence hoje'"];
const so = (e, origem) => filtroEm(e, 'origem', [texto(origem)]);
const doTeste = (...testes) => filtroEm(T, 'teste', testes.map(texto));
const crescente = (e, p) => [{ field: ref(e, p), direction: 'Ascending' }];
const porMes = (serie, valor, cores) => ({ papeis: { Category: col(CAL, 'Mês', 'Mês'), Series: serie, Y: valor },
  op: { cores, sort: crescente(CAL, 'Mês') } });
const SERIE_FABRICA = { AQA: COR.azul, COL: COR.laranja, UCH: COR.roxo };
const SERIE_ORIGEM_TESTE = { Recebimento: COR.teal, Embarque: COR.azul, 'Tank farm': COR.verde };
// cor de cada medida num gráfico com várias medidas
const corPorMedida = (lista) => lista.map(([m, hex]) => ({ properties: { fill: cor(hex) }, selector: { metadata: m.queryRef } }));

// topo: cabeçalho HTML, navegação entre as páginas, faixa de cartões e os filtros à direita
// (em 2 linhas; a largura de cada filtro se ajusta à quantidade)
const topo = (pagina, larguraCartoes, filtros = []) => {
  const x0 = 24 + larguraCartoes + 16;
  const colunas = Math.max(1, Math.ceil(filtros.length / 2));
  const larg = Math.floor((1896 - x0 - (colunas - 1) * 12) / colunas);
  return [
    html([0, 0, 1920, 96], C, `HTML cabeçalho - ${pagina}`),
    navegador([760, 24, 1136, 44]),
    html([24, 108, larguraCartoes, 128], C, `HTML cartões - ${pagina}`),
    ...filtros.map(([e, p, nome, modo], i) =>
      segmentacao([x0 + (i % colunas) * (larg + 12), 108 + Math.floor(i / colunas) * 68, larg, 60], e, p, nome, modo)),
  ];
};
// os 3 gráficos do meio e a tabela de baixo (mesmas posições em todas as páginas)
const G = [[24, 252, 560, 330], [600, 252, 700, 330], [1316, 252, 580, 330]];
const TABELA = [24, 598, 1872, 466];

// página de TAB ou de Coliformes: a página inteira já vem filtrada pelo teste
const paginaTeste = (teste, etapa, filtros) => [
  ...topo(teste, 900, filtros),
  grafico('clusteredColumnChart', G[0], `${teste} por mês`,
    ...Object.values(porMes(col(T, 'origem', 'Origem'), med(T, 'Testes'), corPorValor(T, 'origem', SERIE_ORIGEM_TESTE)))),
  grafico('clusteredBarChart', G[1], `${teste} por etapa (${etapa})`,
    { Category: col(T, 'status', 'Etapa'), Y: med(T, 'Testes') },
    { cores: corPorValor(T, 'status', SERIE_SITUACAO), semLegenda: true, corTitulo: COR.roxo }),
  grafico('donutChart', G[2], `Resultado do ${teste}`,
    { Category: col(T, 'Resultado ou andamento', 'Resultado'), Y: med(T, 'Testes') },
    { cores: corPorValor(T, 'Resultado ou andamento', SERIE_RESULTADO), legenda: 'Right', semRotulos: true, corTitulo: COR.marinho }),
  tabela(TABELA, `${teste}: um por composta${teste === 'TAB' ? ' ou tanque' : ''}`,
    [col(T, 'origem', 'Origem'), col(T, 'Identificação', 'Identificação'), col(T, 'fabrica', 'Fábrica'), col(T, 'item', 'Item'),
     col(T, 'lotes', 'Lotes / amostras'), col(T, 'data_feito', 'Feito em'), col(T, 'status', 'Etapa'),
     col(T, 'proxima_etapa', 'Próxima etapa'), col(T, 'resultado', 'Resultado'), col(T, 'situacao', 'Situação')],
    undefined, teste === 'TAB' ? COR.roxo : COR.magenta),
];

// [nome, visuais, filtros da página inteira]
const PAGINAS = [
  ['Visão geral', [
    ...topo('Visão geral', 1872),
    html([24, 252, 620, 330], L, 'HTML andamento das leituras',
      { titulo: 'Andamento das leituras de NFC', corTitulo: COR.verde, linhas: col(L, 'linha_relatorio', 'Leitura') }),
    grafico('clusteredBarChart', [660, 252, 600, 330], 'Atrasados por área',
      { Y: [med(L, 'Leituras atrasadas'), med(D, 'Drops atrasados'), med(K, 'C.T e B.L atrasados'), med(T, 'Testes atrasados')] },
      { cores: corPorMedida([[med(L, 'Leituras atrasadas'), COR.vermelho], [med(D, 'Drops atrasados'), COR.laranja],
        [med(K, 'C.T e B.L atrasados'), COR.teal], [med(T, 'Testes atrasados'), COR.roxo]]), corTitulo: COR.vermelho }),
    grafico('donutChart', [1276, 252, 620, 330], 'Situação das leituras de NFC',
      { Category: col(L, 'situacao', 'Situação'), Y: med(L, 'Leituras') },
      { cores: corPorValor(L, 'situacao', SERIE_SITUACAO), legenda: 'Right', semRotulos: true, corTitulo: COR.marinho }),
    grafico('columnChart', [24, 598, 920, 466], 'Coletas por dia (terra e navio)',
      { Category: col(C, 'data_coleta', 'Dia'), Series: col(C, 'origem', 'Origem'), Y: med(C, 'Tanques coletados') },
      { cores: corPorValor(C, 'origem', SERIE_ORIGEM), semRotulos: true }),
    grafico('clusteredColumnChart', [960, 598, 936, 466], 'Testes por mês (TAB, Coliformes e Howard)',
      ...Object.values(porMes(col(T, 'teste', 'Teste'), med(T, 'Testes'),
        corPorValor(T, 'teste', { TAB: COR.roxo, Coliformes: COR.magenta, Howard: COR.marinho })))),
  ]],
  ['Coletas', [
    ...topo('Coletas', 1100, [[C, 'origem', 'Origem', 'Blocos'], [C, 'Local', 'Navio / terra', 'Dropdown'],
      [C, 'registrado_por', 'Quem coletou', 'Dropdown'], [CAL, 'Date', 'Período da coleta', 'Between']]),
    grafico('clusteredColumnChart', G[0], 'Tanques coletados por mês',
      { Category: col(C, 'Mês', 'Mês'), Series: col(C, 'origem', 'Origem'), Y: med(C, 'Tanques coletados') },
      { cores: corPorValor(C, 'origem', SERIE_ORIGEM), sort: crescente(C, 'Mês') }),
    grafico('columnChart', G[1], 'Coletas por dia',
      { Category: col(C, 'data_coleta', 'Dia'), Series: col(C, 'origem', 'Origem'), Y: med(C, 'Tanques coletados') },
      { cores: corPorValor(C, 'origem', SERIE_ORIGEM), semRotulos: true, corTitulo: COR.teal }),
    grafico('barChart', G[2], 'Tanques coletados por analista',
      { Category: col(C, 'registrado_por', 'Analista'), Series: col(C, 'origem', 'Origem'), Y: med(C, 'Tanques coletados') },
      { cores: corPorValor(C, 'origem', SERIE_ORIGEM), corTitulo: COR.marinho }),
    tabela(TABELA, 'Quem coletou cada tanque',
      [col(C, 'origem', 'Origem'), col(C, 'Local', 'Navio / terra'), col(C, 'tanque', 'Tanque'), col(C, 'data_coleta', 'Data da coleta'),
       col(C, 'registrado_por', 'Quem coletou'), col(C, 'registrado_em', 'Registrado em')], undefined, COR.verde),
  ]],
  ['Tanques', [
    ...topo('Tanques', 900, [[L, 'origem', 'Origem', 'Blocos'], [L, 'Local', 'Navio / terra', 'Dropdown'],
      [L, 'tanque', 'Tanque', 'Dropdown'], [L, 'situacao', 'Situação', 'Dropdown'], [CAL, 'Date', 'Período da coleta', 'Between']]),
    grafico('columnChart', G[0], 'Leituras por mês da coleta',
      ...Object.values(porMes(col(L, 'situacao', 'Situação'), med(L, 'Leituras'), corPorValor(L, 'situacao', SERIE_SITUACAO)))),
    grafico('columnChart', G[1], 'Leituras por tanque e situação',
      { Category: col(L, 'tanque', 'Tanque'), Series: col(L, 'situacao', 'Situação'), Y: med(L, 'Leituras') },
      { cores: corPorValor(L, 'situacao', SERIE_SITUACAO), sort: crescente(L, 'tanque'), semRotulos: true, corTitulo: COR.teal }),
    grafico('donutChart', G[2], 'Situação das leituras',
      { Category: col(L, 'situacao', 'Situação'), Y: med(L, 'Leituras') },
      { cores: corPorValor(L, 'situacao', SERIE_SITUACAO), legenda: 'Right', semRotulos: true, corTitulo: COR.marinho }),
    tabela(TABELA, 'Leituras de NFC (C.T, B.L e Psicrotróficos)',
      [col(L, 'tanque', 'Tanque'), col(L, 'Local', 'Navio / terra'), col(L, 'data_coleta', 'Coleta'), col(L, 'frasco', 'Frasco'),
       col(L, 'linha_relatorio', 'Leitura'), col(L, 'metodo', 'Método'), col(L, 'prevista', 'Prevista'),
       col(L, 'situacao', 'Situação'), col(L, 'lida_por', 'Lida por')], undefined, COR.azul),
  ]],
  ['Drops', [
    ...topo('Drops', 900, [[D, 'origem', 'Origem', 'Blocos'], [D, 'Local', 'Navio / terra', 'Dropdown'], [D, 'tanque', 'Tanque', 'Dropdown'],
      [D, 'Estágio', 'Drop', 'Blocos'], [D, 'situacao', 'Situação', 'Dropdown'], [CAL, 'Date', 'Período da coleta', 'Between']]),
    grafico('columnChart', G[0], 'Drops por mês da coleta',
      ...Object.values(porMes(col(D, 'situacao', 'Situação'), med(D, 'Drops'), corPorValor(D, 'situacao', SERIE_SITUACAO)))),
    grafico('columnChart', G[1], 'Drops por estágio e situação',
      { Category: col(D, 'Estágio', 'Drop'), Series: col(D, 'situacao', 'Situação'), Y: med(D, 'Drops') },
      { cores: corPorValor(D, 'situacao', SERIE_SITUACAO), sort: crescente(D, 'Estágio'), corTitulo: COR.teal }),
    grafico('donutChart', G[2], 'Desvios por resultado',
      { Category: col(V, 'resultado', 'Resultado'), Y: med(V, 'Desvios') },
      { cores: corPorValor(V, 'resultado', { Confirmado: COR.vermelho, 'Não confirmado': COR.verde, 'Em confirmação': COR.laranja }),
        legenda: 'Right', semRotulos: true, corTitulo: COR.laranja }),
    tabela(TABELA, 'Drops D5, D10 e D15',
      [col(D, 'tanque', 'Tanque'), col(D, 'Local', 'Navio / terra'), col(D, 'data_coleta', 'Coleta'), col(D, 'Estágio', 'Drop'),
       col(D, 'prevista', 'Prevista'), col(D, 'situacao', 'Situação'), col(D, 'concluido_por', 'Concluído por'),
       col(D, 'Desvio do drop', 'Desvio')], undefined, COR.teal),
  ]],
  ['Recebimento', [
    ...topo('Recebimento', 1100, [[K, 'fabrica', 'Fábrica', 'Dropdown'], [K, 'item', 'Item', 'Dropdown'],
      [K, 'load', 'Load', 'Dropdown'], [CAL, 'Date', 'Período', 'Between']]),
    grafico('clusteredColumnChart', G[0], 'Lotes recebidos por mês e fábrica',
      ...Object.values(porMes(col(K, 'fabrica', 'Fábrica'), med(K, 'Lotes e amostras'), corPorValor(K, 'fabrica', SERIE_FABRICA)))),
    grafico('columnChart', G[1], 'C.T e B.L por fábrica',
      { Category: col(K, 'fabrica', 'Fábrica'), Series: col(K, 'Faixa', 'Faixa'), Y: med(K, 'C.T e B.L') },
      { cores: corPorValor(K, 'Faixa', SERIE_FAIXA), corTitulo: COR.teal }),
    grafico('columnChart', G[2], 'C.T e B.L por análise',
      { Category: col(K, 'analise', 'Análise'), Series: col(K, 'Faixa', 'Faixa'), Y: med(K, 'C.T e B.L') },
      { cores: corPorValor(K, 'Faixa', SERIE_FAIXA), corTitulo: COR.marinho }),
    tabela(TABELA, 'C.T e B.L por lote',
      [col(K, 'fabrica', 'Fábrica'), col(K, 'item', 'Item'), col(K, 'load', 'Load'), col(K, 'lote_amostra', 'Lote'),
       col(K, 'analise', 'Análise'), col(K, 'Data da amostra', 'Recebido em'), col(K, 'prevista', 'Prevista'),
       col(K, 'resultado', 'Resultado'), col(K, 'lido_por', 'Lido por'), col(K, 'situacao', 'Situação')], undefined, COR.azul),
  ], [so(K, 'Recebimento')]],
  ['Embarque', [
    ...topo('Embarque', 1100, [[EMBARQUES, 'Embarque', 'Embarque', 'Dropdown'], [K, 'load', 'Load', 'Dropdown'],
      [K, 'analise', 'Análise', 'Blocos'], [CAL, 'Date', 'Período', 'Between']]),
    grafico('clusteredColumnChart', G[0], 'Amostras por mês e navio',
      ...Object.values(porMes(col(K, 'navio', 'Navio'), med(K, 'Lotes e amostras')))),
    grafico('columnChart', G[1], 'C.T e B.L por análise',
      { Category: col(K, 'analise', 'Análise'), Series: col(K, 'Faixa', 'Faixa'), Y: med(K, 'C.T e B.L') },
      { cores: corPorValor(K, 'Faixa', SERIE_FAIXA), corTitulo: COR.teal }),
    grafico('columnChart', G[2], 'Howard por composta (%)',
      { Category: col(T, 'alvo', 'Composta'), Series: col(T, 'embarque', 'Embarque'), Y: med(T, 'Howard médio (%)') },
      { filtros: [doTeste('Howard')], corTitulo: COR.marinho }),
    tabela(TABELA, 'C.T e B.L por amostra',
      [col(K, 'Embarque', 'Embarque'), col(K, 'load', 'Load'), col(K, 'lote_amostra', 'Amostra'), col(K, 'analise', 'Análise'),
       col(K, 'Data da amostra', 'Embarcado em'), col(K, 'prevista', 'Prevista'), col(K, 'resultado', 'Resultado'),
       col(K, 'lido_por', 'Lido por'), col(K, 'situacao', 'Situação')], undefined, COR.azul),
  ], [so(K, 'Embarque'), so(T, 'Embarque')]],
  ['TAB', paginaTeste('TAB', 'caldo, incubado, confirmação', [[T, 'origem', 'Origem', 'Dropdown'], [T, 'Navio', 'Navio', 'Dropdown'],
    [T, 'tanque', 'Tanque de terra', 'Dropdown'], [T, 'load', 'Load', 'Dropdown'], [T, 'fabrica', 'Fábrica', 'Dropdown'],
    [T, 'item', 'Item', 'Dropdown'], [CAL, 'Date', 'Período', 'Between']]), [doTeste('TAB')]],
  ['Coliformes', paginaTeste('Coliformes', 'caldo, estriado, confirmação', [[T, 'origem', 'Origem', 'Dropdown'],
    [T, 'Navio', 'Navio', 'Dropdown'], [T, 'load', 'Load', 'Dropdown'], [T, 'fabrica', 'Fábrica', 'Dropdown'],
    [T, 'item', 'Item', 'Dropdown'], [CAL, 'Date', 'Período', 'Between']]), [doTeste('Coliformes')]],
];

// ---------------------------------------------------------------- grava (recria todas as páginas)
const PAGS = path.join(DEF, 'pages');
for (const p of fs.readdirSync(PAGS)) {
  if (fs.statSync(path.join(PAGS, p)).isDirectory()) fs.rmSync(path.join(PAGS, p), { recursive: true, force: true });
}
const ordem = [];
for (const [nome, visuais, filtrosDaPagina] of PAGINAS) {
  const pid = id();
  const dir = path.join(PAGS, pid);
  fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json',
    name: pid, displayName: nome, displayOption: 'FitToPage', height: 1080, width: 1920,
    ...(filtrosDaPagina ? { filterConfig: { filters: filtrosDaPagina } } : {}),
  }, null, 2), 'utf8');
  visuais.forEach((v, i) => {
    v.position.z = (i + 1) * 1000;
    v.position.tabOrder = (i + 1) * 1000;
    fs.mkdirSync(path.join(dir, 'visuals', v.name), { recursive: true });
    fs.writeFileSync(path.join(dir, 'visuals', v.name, 'visual.json'), JSON.stringify(v, null, 2), 'utf8');
  });
  ordem.push(pid);
}
fs.writeFileSync(path.join(PAGS, 'pages.json'), JSON.stringify({
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json',
  pageOrder: ordem, activePageName: ordem[0],
}, null, 2), 'utf8');
console.log('painel gerado:', PAGINAS.length, 'páginas,', PAGINAS.reduce((s, [, v]) => s + v.length, 0), 'visuais,',
  Object.values(MEDIDAS).flat().length, 'medidas,', Object.values(COLUNAS).flat().length, 'colunas calculadas, tema', TEMA.name);
