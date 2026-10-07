// Gera o painel do LabFlow no projeto do Power BI (powerbi/labflow.*, formato PBIP/PBIR):
// tema LabFlow, medidas e colunas calculadas no modelo (TMDL) e 8 páginas no relatório (JSON).
// Cabeçalho, cartões e barras de andamento são HTML montado por medida DAX e mostrado pelo visual
// "HTML Content Secure" (certificado pela Microsoft, do AppSource; sem scripts nem conteúdo externo).
// Uso (com o Power BI FECHADO): node scripts/gerar-painel-powerbi.js
// Só o visual (páginas, gráficos, filtros, tema), com o Power BI ABERTO e já salvo:
//   node scripts/gerar-painel-powerbi.js --so-relatorio   (depois aceitar "recarregar" no Power BI)
// Pode rodar de novo: recria tema, páginas, medidas e colunas calculadas, sem duplicar.
'use strict';
const SO_RELATORIO = process.argv.includes('--so-relatorio'); // não toca no modelo (medidas, colunas, ligações)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..', 'powerbi');
const REL = path.join(RAIZ, 'labflow.Report');
const DEF = path.join(REL, 'definition');
const MOD = path.join(RAIZ, 'labflow.SemanticModel', 'definition', 'tables');
const VISUAL_HTML = 'htmlContent443BE3AD55E043BF878BED274D3A6865'; // HTML Content Secure (AppSource)
const id = () => crypto.randomBytes(10).toString('hex');
// identificador fixo (formato GUID) tirado de um texto: rodar o gerador de novo não muda os arquivos à toa
const guid = (texto) => { const h = crypto.createHash('sha1').update(texto).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const texto = (s) => `'${String(s).replace(/'/g, "''")}'`; // literal de texto do PBIR
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const cor = (hex) => ({ solid: { color: lit(`'${hex}'`) } });

// ---------------------------------------------------------------- cores (modo escuro)
// fundo quase preto, cartões grafite com borda fina e cores vivas só onde há significado
const COR = {
  fundo: '#0A0A0B', cartao: '#141416', cartao2: '#18181B', borda: '#26262B', grade: '#27272A',
  texto: '#F4F4F5', texto2: '#A1A1AA', apagado: '#71717A',
  marinho: '#94A3B8', azul: '#3B82F6', verde: '#22C55E', laranja: '#F59E0B', vermelho: '#EF4444',
  roxo: '#8B5CF6', magenta: '#EC4899', teal: '#14B8A6', cinza: '#71717A', branco: '#FFFFFF',
};
// valores de status: [cor do texto, cor do fundo] (vira "pílula" colorida nas tabelas e cor das séries nos gráficos)
const PILULA = {
  'Atrasado': [COR.vermelho, '#2A1416'], 'Vence hoje': [COR.laranja, '#2A2010'], 'No prazo': [COR.azul, '#131D33'],
  'Lido': [COR.verde, '#112419'], 'Concluído': [COR.verde, '#112419'],
  'Em confirmação': [COR.laranja, '#2A2010'], 'Em andamento': [COR.azul, '#131D33'],
  'No caldo': [COR.azul, '#131D33'], 'Estriado': [COR.teal, '#0F2523'], 'Incubado': [COR.roxo, '#1E1733'],
  'Positivo': [COR.vermelho, '#2A1416'], 'Confirmado': [COR.vermelho, '#2A1416'],
  'Negativo': [COR.verde, '#112419'], 'Não confirmado': [COR.verde, '#112419'], 'Sem desvio': [COR.texto2, '#1C1C1F'],
  'Alarme': [COR.vermelho, '#2A1416'], 'Normal': [COR.verde, '#112419'], 'Aguardando': [COR.texto2, '#1C1C1F'],
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
const SERIE_ORIGEM = { Terra: COR.teal, Navio: COR.azul };
const SERIE_RESULTADO = { Positivo: COR.vermelho, Negativo: COR.verde, 'Em andamento': COR.azul };
const SERIE_FAIXA = { Alarme: COR.vermelho, Normal: COR.teal, Aguardando: '#3F3F46' };

// ---------------------------------------------------------------- tema LabFlow (escuro)
const solido = (hex) => ({ solid: { color: hex } });
const TEMA = {
  name: 'LabFlow escuro',
  dataColors: [COR.azul, COR.teal, COR.laranja, COR.roxo, COR.magenta, COR.vermelho, COR.verde, '#EAB308', COR.marinho],
  foreground: COR.texto, foregroundNeutralSecondary: COR.texto2, background: COR.cartao, backgroundLight: COR.cartao2,
  backgroundNeutral: COR.borda, tableAccent: COR.azul,
  good: COR.verde, neutral: COR.laranja, bad: COR.vermelho,
  textClasses: {
    title: { fontFace: 'Segoe UI Semibold', fontSize: 13, color: COR.texto },
    label: { fontFace: 'Segoe UI', fontSize: 10, color: COR.texto2 },
    callout: { fontFace: 'Segoe UI Semibold', fontSize: 30, color: COR.texto },
    header: { fontFace: 'Segoe UI Semibold', fontSize: 12, color: COR.texto },
  },
  visualStyles: {
    '*': { '*': {
      background: [{ show: true, color: solido(COR.cartao), transparency: 0 }],
      border: [{ show: true, color: solido(COR.borda), radius: 16 }],
      dropShadow: [{ show: false }],
      title: [{ show: true, fontColor: solido(COR.texto), background: solido(COR.cartao), fontSize: 13, bold: true }],
      categoryAxis: [{ show: true, labelColor: solido(COR.texto2), fontSize: 9, showAxisTitle: false }],
      valueAxis: [{ show: true, labelColor: solido(COR.apagado), fontSize: 9, showAxisTitle: false,
        gridlineShow: true, gridlineColor: solido(COR.grade), gridlineStyle: 'dashed' }],
      legend: [{ show: true, position: 'Top', labelColor: solido(COR.texto2), fontSize: 10 }],
      visualHeader: [{ background: solido(COR.cartao), foreground: solido(COR.texto2), border: solido(COR.borda) }],
    } },
    page: { '*': {
      background: [{ color: solido(COR.fundo), transparency: 0 }],
      outspace: [{ color: solido(COR.fundo) }],
    } },
    tableEx: { '*': {
      columnHeaders: [{ backColor: solido(COR.cartao2), fontColor: solido(COR.texto2), bold: true }],
      values: [{ backColorPrimary: solido(COR.cartao), backColorSecondary: solido(COR.cartao2),
        fontColorPrimary: solido('#E4E4E7'), fontColorSecondary: solido('#E4E4E7') }],
      grid: [{ gridHorizontal: true, gridHorizontalColor: solido(COR.grade), gridVertical: false, outlineColor: solido(COR.borda) }],
    } },
    slicer: { '*': {
      header: [{ fontColor: solido(COR.texto2), bold: false }],
      items: [{ fontColor: solido('#E4E4E7'), background: solido(COR.cartao2), outlineColor: solido(COR.borda) }],
      date: [{ fontColor: solido('#E4E4E7'), background: solido(COR.cartao2) }],
      numericInputStyle: [{ fontColor: solido('#E4E4E7'), background: solido(COR.cartao2) }],
      slider: [{ color: solido(COR.azul) }],
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
// cor com transparência (para o fundo das pílulas e dos ícones)
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

// barra de cima: marca à esquerda e título grande da página (a navegação fica à direita, por cima)
const cabecalhoHtml = (titulo, sub, icone) => dax(
  `<div style='height:70px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:0 24px;${FONTE};`
  + `background:${COR.fundo};border-bottom:1px solid ${COR.borda}'>`
  + `<div style='width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;`
  + `background:linear-gradient(135deg,#2563EB,#3B82F6);box-shadow:0 0 0 4px ${rgba(COR.azul, 0.15)}'>${icone}</div>`
  + `<div><div style='font-size:11px;font-weight:600;color:${COR.texto2};letter-spacing:.3px'>LabFlow · Microbiologia</div>`
  + `<div style='font-size:20px;font-weight:700;color:${COR.texto};line-height:1.2;letter-spacing:-.3px'>${titulo}</div>`
  + `<div style='font-size:11px;color:${COR.apagado};line-height:1.3'>${sub} · dados fictícios de demonstração</div></div></div>`);

// cartão: grafite com borda fina, rótulo cinza, número grande branco, ícone colorido no canto e uma "pílula"
// embaixo: na cor do alerta quando > 0 (com ponto piscando) e verde quando zerado; indicador neutro fica na cor dele
const cartaoHtml = ({ rotulo, valor, sub, icone, cor: c, neutro, formato = '0', sufixo = '', zero = 'Tudo em dia' }) => {
  const v = `COALESCE(${valor}, 0)`;
  const k = COR[c] || COR.azul;
  const se = (sim, nao) => (neutro ? sim : `IF(${v} > 0, ${sim}, ${nao})`);
  const pilula = (hex, texto, ponto) => `<span style='display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 9px;`
    + `border-radius:999px;font-size:11px;font-weight:600;color:${hex};background:${rgba(hex, 0.14)};white-space:nowrap;`
    + "overflow:hidden;text-overflow:ellipsis'>"
    + (ponto ? `<span style='width:7px;height:7px;border-radius:50%;background:${hex};animation:lfPulso 1.4s infinite'></span>` : '')
    + `${texto}</span>`;
  return junta(
    dax(`<div style='flex:1;min-width:0;position:relative;box-sizing:border-box;border-radius:16px;padding:12px 16px;`
      + `background:${COR.cartao};border:1px solid ${COR.borda}'>`
      + `<div style='position:absolute;top:12px;right:14px;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;`
      + `justify-content:center;font-size:15px;background:${rgba(k, 0.14)};color:${k}'>${icone}</div>`
      + `<div style='font-size:12px;color:${COR.texto2};padding-right:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>`
      + `${rotulo}</div><div style='font-size:30px;font-weight:700;color:${COR.texto};line-height:1.15;margin:4px 0 6px;letter-spacing:-.5px'>`),
    `FORMAT(${v}, "${formato}")`,
    dax(`${sufixo}</div>`),
    se(dax(pilula(k, sub, !neutro)), dax(pilula(COR.verde, `✓ ${zero}`, false))),
    dax('</div>'),
  );
};
const faixaHtml = (...cartoes) => junta(
  dax('<style>@keyframes lfPulso{0%{opacity:1}50%{opacity:.25}100%{opacity:1}}</style>'
    + `<div style='display:flex;gap:12px;width:100%;height:104px;padding:0 8px 0 0;box-sizing:border-box;${FONTE}'>`),
  ...cartoes.map(cartaoHtml),
  dax('</div>'));

// atrasados por área: uma barra por área, proporcional à maior; zerada vira "✓ em dia" em verde
const AREAS_ATRASADAS = [['Leituras de NFC', '[Leituras atrasadas]', COR.vermelho], ['Drops', '[Drops atrasados]', COR.laranja],
  ['C.T e B.L do concentrado', '[C.T e B.L atrasados]', COR.teal], ['TAB e Coliformes', '[Testes atrasados]', COR.roxo]];
const ATRASADOS_POR_AREA = AREAS_ATRASADAS.map(([, m], i) => `VAR v${i} = COALESCE(${m}, 0) `).join('')
  + 'VAR mx = MAX(MAX(MAX(v0, v1), MAX(v2, v3)), 1) RETURN ' + junta(
  dax(`<div style='${FONTE};padding:4px 6px'>`),
  ...AREAS_ATRASADAS.flatMap(([nome, , hex], i) => [
    dax(`<div style='margin-bottom:18px'><div style='display:flex;justify-content:space-between;align-items:baseline;font-size:13px;`
      + `color:${COR.texto}'><span>${nome}</span>`),
    `IF(v${i} > 0, ${dax(`<b style='font-size:16px;color:${hex}'>`)} & v${i} & ${dax('</b>')}, `
      + `${dax(`<span style='font-size:12px;color:${COR.verde}'>✓ em dia</span>`)})`,
    dax(`</div><div style='height:10px;border-radius:6px;background:${COR.grade};margin-top:7px;overflow:hidden'>`
      + "<div style='height:100%;border-radius:6px;width:"),
    `FORMAT(ROUND(DIVIDE(v${i}, mx) * 100, 0), "0")`,
    dax(`%;background:${hex}'></div></div></div>`),
  ]),
  dax('</div>'));

// uma linha por "linha do relatório": barra verde (lidas), vermelha (atrasadas) e laranja (hoje)
const PROGRESSO_LEITURAS = 'VAR linha = SELECTEDVALUE(\'bi leituras_nfc\'[linha_relatorio]) '
  + 'VAR total = COALESCE([Leituras], 0) VAR lidas = COALESCE([Leituras lidas], 0) '
  + 'VAR atras = COALESCE([Leituras atrasadas], 0) VAR hoje = COALESCE([Leituras que vencem hoje], 0) '
  + 'VAR pl = FORMAT(ROUND(DIVIDE(lidas, total, 0) * 100, 0), "0") VAR pa = FORMAT(ROUND(DIVIDE(atras, total, 0) * 100, 0), "0") '
  + 'VAR ph = FORMAT(ROUND(DIVIDE(hoje, total, 0) * 100, 0), "0") RETURN ' + junta(
  dax(`<div style='margin:2px 6px 14px 6px;${FONTE}'><div style='display:flex;justify-content:space-between;align-items:baseline;`
    + `font-size:13px;color:${COR.texto}'><b>`), 'linha',
  dax(`</b><span style='font-size:12px;color:${COR.texto2}'><b style='color:${COR.verde}'>`), 'pl',
  dax('% lidas</b> · '), 'lidas', dax(' de '), 'total',
  dax(`</span></div><div style='height:8px;border-radius:6px;background:${COR.grade};overflow:hidden;display:flex;margin-top:6px'>`
    + "<div style='width:"), 'pl', dax(`%;background:${COR.verde}'></div><div style='width:`), 'pa',
  dax(`%;background:${COR.vermelho}'></div><div style='width:`), 'ph',
  dax(`%;background:${COR.laranja}'></div></div><div style='font-size:11px;margin-top:5px;color:${COR.texto2}'>`
    + `<span style='color:${COR.vermelho}'>● </span>`), 'atras', dax(` atrasadas&nbsp;&nbsp;<span style='color:${COR.laranja}'>● </span>`), 'hoje',
  dax(' para hoje</div></div>'));

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
    ['HTML atrasados por área', ATRASADOS_POR_AREA, HTML],
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
    ['Fundo do resultado', `IF(${CALC('bi contagens', "KEEPFILTERS('bi contagens'[alarme] = TRUE())")} > 0, "${PILULA.Alarme[1]}", `
      + `IF(${CALC('bi contagens', "KEEPFILTERS('bi contagens'[lido] = TRUE())")} > 0, "${PILULA.Normal[1]}"))`, { oculta: true }],
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
  `\tcolumn '${nome}' = ${expr}\n\t\tdataType: ${tipo}\n${extra}\t\tlineageTag: @@${nome}@@\n\t\tsummarizeBy: none\n`;
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
  + (oculta ? '\t\tisHidden\n' : '') + `\t\tlineageTag: @@${nome}@@\n`;
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
// grava medidas e colunas no modelo (pulado no modo --so-relatorio)
for (const [tabela, medidas] of SO_RELATORIO ? [] : Object.entries(MEDIDAS)) {
  const arq = path.join(MOD, `${tabela}.tmdl`);
  let t = fs.readFileSync(arq, 'utf8').replace(/\r\n/g, '\n');
  // remove as geradas antes; ao salvar, o Power BI tira as aspas dos nomes simples (measure Analistas)
  // e pode deixar linha em branco antes de "annotation", então o bloco vai até a próxima linha sem recuo duplo
  t = t.replace(/^\t(?:measure|column) (?:'[^']+'|[^\s=']+) = [^\n]*\n(?:\t\t[^\n]*\n|\n(?=\t\t))*\n?/gm, '');
  const bloco = [...medidas.map(medidaTmdl), ...(COLUNAS[tabela] || [])].join('\n')
    .replace(/@@(.+?)@@/g, (_, nome) => guid(`${tabela}/${nome}`));
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
    ? { show: lit('true'), text: lit(texto(titulo)), fontColor: cor(COR.texto), background: cor(COR.cartao), bold: lit('true'), fontSize: lit('13D') }
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
    { properties: { show: lit('true'), fillColor: cor(COR.cartao), transparency: lit('0D') }, selector: { id: 'default' } },
    { properties: { fillColor: cor('#1F1F23') }, selector: { id: 'hover' } },
    { properties: { fillColor: cor('#2563EB') }, selector: { id: 'selected' } },
  ],
  text: [
    { properties: { show: lit('true'), fontColor: cor(COR.texto2), fontSize: lit('11D'), bold: lit('true') }, selector: { id: 'default' } },
    { properties: { fontColor: cor(COR.branco) }, selector: { id: 'selected' } },
  ],
  outline: NENHUM,
} });
// largura de cada coluna (quanto texto costuma ter); o resto vale 1.2
const PESO = { tanque: 0.8, frasco: 0.9, drop: 0.7, load: 0.9, teste: 0.8, origem: 1.2, analise: 1, lotes: 1.1,
  navio: 1.5, Local: 1.6, linha_relatorio: 1.7, metodo: 1.3, situacao: 1.2, status: 1.1, resultado: 1.4, temperaturas: 1.6,
  alvo: 1.4, lote_amostra: 1, proxima_etapa: 1.2, registrado_em: 1.6, data_resultado: 1.2, howard_percentual: 1,
  Embarque: 2.4, embarque: 2.4, 'Estágio': 0.8, 'Desvio do drop': 1.2, 'Resultado ou andamento': 1.3, data_feito: 1.1, data_coleta: 1.1,
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
      values: [{ properties: { fontSize: lit(fonte), wordWrap: lit('false') } }, ...cores], // uma linha por registro (texto longo corta com '...')
      columnHeaders: [{ properties: { fontSize: lit(fonte), backColor: cor(COR.cartao2), fontColor: cor(COR.texto2),
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
    header: [{ properties: { show: lit('true'), fontColor: cor(COR.texto2), textSize: lit('10D') } }],
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
        color: cor(empilhado ? COR.branco : '#D4D4D8') } }],
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
    html([660, 252, 600, 330], C, 'HTML atrasados por área', { titulo: 'Atrasados por área', corTitulo: COR.vermelho }),
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
    ...topo('Coletas', 1100, [[C, 'Local', 'Navio / terra', 'Dropdown'], [C, 'tanque', 'Tanque', 'Dropdown'],
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
    ...topo('Tanques', 1100, [[L, 'Local', 'Navio / terra', 'Dropdown'],
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
    ...topo('Drops', 900, [[D, 'Local', 'Navio / terra', 'Dropdown'], [D, 'tanque', 'Tanque', 'Dropdown'],
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
  // id fixo por página (vem do nome): o Power BI aberto, ao recarregar, ainda acha a página em que estava
  const pid = crypto.createHash('sha1').update(nome).digest('hex').slice(0, 20);
  const dir = path.join(PAGS, pid);
  fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json',
    name: pid, displayName: nome, displayOption: 'FitToPage', height: 1080, width: 1920,
    ...(filtrosDaPagina ? { filterConfig: { filters: filtrosDaPagina.map((filtro, j) =>
      ({ ...filtro, name: crypto.createHash('sha1').update(`${nome}#filtro${j}`).digest('hex').slice(0, 20) })) } } : {}),
  }, null, 2), 'utf8');
  visuais.forEach((v, i) => {
    v.position.z = (i + 1) * 1000;
    v.position.tabOrder = (i + 1) * 1000;
    // nome fixo (página + posição na lista): rodar de novo não troca as pastas, e o Git só mostra o que mudou
    v.name = crypto.createHash('sha1').update(`${nome}#${i}`).digest('hex').slice(0, 20);
    (v.filterConfig?.filters || []).forEach((filtro, j) => { filtro.name = crypto.createHash('sha1').update(`${v.name}#${j}`).digest('hex').slice(0, 20); });
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
  SO_RELATORIO ? 'modelo não alterado (--so-relatorio),'
    : `${Object.values(MEDIDAS).flat().length} medidas, ${Object.values(COLUNAS).flat().length} colunas calculadas,`, 'tema', TEMA.name);
