'use strict';

// Cargo "Coletor": só registra coleta e corrige/apaga a própria coleta (quando erra o tanque).
// Porteiro no "Interpretar comando" e na IA, comando de correção, banco e migration. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const comoColetor = (frase, extra = {}) => interpretar(frase, { cargo: 'Coletor', ...extra });
const VALIDAR = codigoDoNode('Validar resposta da IA');
function validar(ia, cargo = 'Coletor', mensagem = 'x') {
  const principal = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', nivelAtual: cargo, mensagem_original: mensagem };
  const $ = () => ({ first: () => ({ json: principal }) });
  const $input = { first: () => ({ json: { content: { parts: [{ text: JSON.stringify(ia) }] } } }) };
  return new Function('$', '$input', VALIDAR)($, $input)[0].json;
}

test('Coletor registra coleta de terra e de navio normalmente (responsável é ele mesmo)', () => {
  const t = comoColetor('registrar coleta tanque terra 42,43 data 15/10/2026');
  assert.equal(t.tipo, 'coleta_terra');
  assert.ok(t.itensColeta.every((i) => i.responsavel === 'Usuario Teste'));
  const n = comoColetor('Coleta navio O.SKY 123 tanques 1C,4P data 15/10/2026');
  assert.equal(n.tipo, 'coleta_navio');
});

test('Coletor não registra coleta em nome de outra pessoa', () => {
  for (const f of ['registrar coleta tanque terra 42 data 15/10/2026 coletado por Joyce', 'Coleta navio O.SKY 123 tanques 1C data 15/10/2026 coletado por Carlos']) {
    const r = comoColetor(f);
    assert.equal(r.tipo, 'erro_coleta', f);
    assert.match(r.textoResposta, /Coletor registra só a própria coleta/, f);
  }
  assert.equal(comoColetor('registrar coleta tanque terra 42 data 15/10/2026 coletado por mim').tipo, 'coleta_terra');
});

test('corrigir e apagar coleta: comandos, com ou sem data, terra e navio', () => {
  const a = comoColetor('corrigir coleta tanque terra 42 para 43');
  assert.deepEqual([a.tipo, a.modo, a.origem, a.tanque, a.novoTanque, a.dataColeta, a.ehGestor], ['coleta_corrigir', 'corrigir', 'terra', '42', '43', '', '0']);
  const b = comoColetor('corrigir coleta navio O.SKY 123 tanque 1C para 2C data 15/10/2026');
  assert.deepEqual([b.modo, b.origem, b.navio, b.tanque, b.novoTanque, b.dataColeta], ['corrigir', 'navio', 'O.SKY 123', '1C', '2C', '15/10/2026']);
  const c = comoColetor('apagar coleta tanque terra 42');
  assert.deepEqual([c.modo, c.tanque, c.novoTanque], ['apagar', '42', '']);
  const d = comoColetor('apagar coleta navio O.SKY 123 tanque 1C data 15/10/2026');
  assert.deepEqual([d.modo, d.navio, d.tanque, d.dataColeta], ['apagar', 'O.SKY 123', '1C', '15/10/2026']);
  for (const f of ['alterar coleta tanque terra 42 por 43', 'trocar coleta tanque de terra 42 para o 43', 'cancelar coleta tanque terra 42', 'excluir coleta do tanque terra 42', 'remover coleta tanque terra 42 data 15/10/2026']) {
    assert.equal(comoColetor(f).tipo, 'coleta_corrigir', f);
  }
});

test('correção recusa tanque inválido e troca pelo mesmo número', () => {
  assert.match(comoColetor('corrigir coleta tanque terra 4x2 para 43').textoResposta, /Número de tanque inválido/);
  assert.match(comoColetor('corrigir coleta tanque terra 42 para 42').textoResposta, /igual ao antigo/);
  assert.match(comoColetor('corrigir coleta tanque terra 42 para 1C').textoResposta, /Tanque de terra é só número/);
});

test('Admin e Operador corrigem qualquer coleta (ehGestor), Consultor não corrige', () => {
  for (const cargo of ['Admin', 'Operador']) assert.equal(interpretar('corrigir coleta tanque terra 42 para 43', { cargo }).ehGestor, '1', cargo);
  assert.match(interpretar('corrigir coleta tanque terra 42 para 43', { cargo: 'Consultor' }).textoResposta, /somente de consulta/);
});

test('porteiro: Coletor não faz mais nada (consulta, análise, recebimento, relatório, cargos, foto)', () => {
  const barrados = ['drops para hoje', 'relatório do dia', 'Analise do normal dos tanques 42, data 24/09/2026', 'recebimento load 77001 item 444 fabrica AQA lotes 1-14',
    'Concluir drops D5 terra', 'quem coletou o tanque 42', 'trocar cargo de Admin para o número 5511987654321', 'tab feito das compostas #4 a #6',
    'Tab feito dos tanques terra 42,43 coleta 28/09/2026', 'ct load 77001 lotes 1-8 deu 10', 'recebimento nfc load 44300 fab aqa item 129 lote 10 past 10 elevado a 1'];
  for (const f of barrados) {
    const r = comoColetor(f);
    assert.equal(r.tipo, 'erro_coleta', f);
    assert.match(r.textoResposta, /seu cargo \(Coletor\) permite só registrar coletas e corrigir as suas próprias coletas/, f);
  }
  assert.equal(comoColetor('', { imagem: { caption: '' } }).tipo, 'erro_coleta', 'foto');
  assert.equal(comoColetor('quais drops tenho hoje?').tipo, 'interpretar_ia', 'frase livre vai para a IA, que também é vigiada');
  // quem tem outro cargo continua como antes
  assert.equal(interpretar('drops para hoje', { cargo: 'Operador' }).tipo, 'consulta_drops');
});

test('ajuda do Coletor mostra só o que ele pode; os outros cargos veem a lista completa', () => {
  const c = comoColetor('comandos').textoResposta;
  assert.match(c, /Comandos do Coletor/);
  assert.match(c, /corrigir coleta tanque terra 42 para 43/);
  assert.doesNotMatch(c, /comandos recebimento nfc/);
  assert.equal(comoColetor('comandos drops').textoResposta, c, 'qualquer tópico mostra a ajuda do Coletor');
  assert.match(interpretar('comandos', { cargo: 'Operador' }).textoResposta, /comandos recebimento nfc/);
  // os exemplos da ajuda do Coletor são comandos que o bot aceita
  const exemplos = c.split('\n').filter((l) => l.startsWith('• ')).map((l) => l.slice(2).trim());
  assert.equal(exemplos.length, 6);
  for (const e of exemplos) assert.ok(['coleta_terra', 'coleta_navio', 'coleta_corrigir'].includes(comoColetor(e).tipo), e);
});

test('Admin cadastra o cargo Coletor (comando e IA)', () => {
  const r = interpretar('adicionar cargo Coletor para o número 5511987654321 nome Joyce', { cargo: 'Admin' });
  assert.equal(r.tipo, 'gerenciar_usuario');
  assert.equal(r.NivelNovo, 'Coletor');
  assert.match(interpretar('adicionar cargo Coletor para o número 5511987654321', { cargo: 'Operador' }).textoResposta, /Só administradores/);
  const ia = validar({ intencao: 'gerenciar_cargo', cargo: 'coletor', telefone: '11987654321', nome: 'Joyce' }, 'Admin', 'adicionar cargo Coletor para o número 11987654321 nome Joyce');
  assert.equal(ia.comando_ia, 'trocar cargo de Coletor para o número 5511987654321 nome Joyce');
  assert.match(interpretar('comandos usuarios', { cargo: 'Admin' }).textoResposta, /adicionar cargo Coletor/);
});

test('IA: Coletor só passa coleta e correção; o resto é barrado', () => {
  assert.equal(validar({ intencao: 'coleta_terra', tanques: ['42'], data: '15/10/2026' }).comando_ia, 'registrar coleta tanque terra 42 data 15/10/2026');
  const corr = validar({ intencao: 'comando', comando: 'corrigir coleta tanque terra 42 para 43' });
  assert.equal(corr.comando_ia, 'corrigir coleta tanque terra 42 para 43', 'pede sim antes de alterar');
  assert.match(corr.textoResposta, /Responda \*sim\*/);
  const apagar = validar({ intencao: 'comando', comando: 'apagar coleta tanque terra 42' });
  assert.match(apagar.textoResposta, /Responda \*sim\*/);
  // barrado na IA (resposta de erro) ou, se a IA só reencaminha o comando, pelo porteiro do bot
  for (const ia of [{ intencao: 'consulta_bags' }, { intencao: 'registro_analise', analise: 'normal', tanques: ['42'], data: '15/10/2026' },
    { intencao: 'comando', comando: 'relatório do dia completo' }, { intencao: 'comando', comando: 'quais drops tenho hoje?' },
    { intencao: 'gerenciar_cargo', cargo: 'admin', telefone: '11987654321' }]) {
    const r = validar(ia);
    assert.ok(!r.comando_ia, JSON.stringify(ia));
    if (r.reenviarComando) assert.equal(interpretar(r.reenviarComando, { cargo: 'Coletor', reenvio: true }).tipo, 'erro_coleta', JSON.stringify(ia));
    else assert.match(r.textoResposta, /Coletor\) permite só registrar coletas e corrigir as suas próprias coletas/, JSON.stringify(ia));
  }
  // o comando que a IA monta para correção é entendido pelo bot
  assert.equal(interpretar('corrigir coleta tanque terra 42 para 43', { reenvio: true }).tipo, 'coleta_corrigir');
  const p = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments[0].value;
  assert.match(p, /35\. corrigir coleta tanque terra/);
  assert.match(p, /36\. apagar coleta tanque terra/);
  assert.match(p, /Admin, Operador, Consultor e Coletor/);
});

// ---- fluxo e banco ----
test('workflow: roteado até o banco, a resposta e o WhatsApp; o SQL protege o que precisa', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('coleta_corrigir')].map((x) => x.node), ['BD · Corrigir coleta']);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['BD · Corrigir coleta'].main[0].map((x) => x.node), ['Montar resposta corrigir coleta']);
  assert.deepEqual(c['Montar resposta corrigir coleta'].main[0].map((x) => x.node), ['Zap · Corrigir coleta']);
  assert.deepEqual(c['Zap · Corrigir coleta'].main[0].map((x) => x.node), ['Fim · Corrigir coleta']);
  const q = workflow.nodes.find((n) => n.name === 'BD · Corrigir coleta').parameters;
  assert.match(q.query, /\$7::text = '1' OR a\.registrado_por = \(SELECT id FROM u\)/, 'só a própria coleta, ou Admin/Operador');
  assert.match(q.query, /FROM analises x WHERE x\.coleta_id = a\.id/);
  assert.match(q.query, /d\.status = 'Concluído'/);
  assert.match(q.query, /FROM testes t WHERE t\.coleta_id = a\.id/);
  assert.match(q.query, /WHERE permitido AND NOT tem_analise AND NOT tem_drop AND NOT tem_teste AND NOT duplicada/);
  assert.match(q.query, /c\.data_coleta >= CURRENT_DATE - 7/, 'sem data: últimos 7 dias');
  assert.match(q.options.queryReplacement, /\$json\._numeroRemetenteLimpo, \$json\.ehGestor/);
});

function resposta(item, linha) {
  const $ = () => ({ first: () => ({ json: item }) });
  return new Function('$', '$input', codigoDoNode('Montar resposta corrigir coleta'))($, { first: () => ({ json: linha }) })[0].json.textoResposta;
}
test('resposta: explica o que foi feito ou por que não pôde', () => {
  const t = { modo: 'corrigir', origem: 'terra', navio: '', tanque: '42', novoTanque: '43', dataColeta: '' };
  const ok = { permitido: true, tem_analise: false, tem_drop: false, tem_teste: false, duplicada: false, data: '15/10/2026' };
  assert.match(resposta(t, { estado: ok, atualizados: 1, apagados: 0 }), /✅ Coleta corrigida: tanque 42 → 43 \(terra, 15\/10\/2026\)/);
  assert.match(resposta({ ...t, modo: 'apagar', novoTanque: '' }, { estado: ok, atualizados: 0, apagados: 1 }), /✅ Coleta apagada: tanque de terra 42 \(15\/10\/2026\)\. Os drops e o arquivo/);
  assert.match(resposta(t, { estado: null, atualizados: 0, apagados: 0 }), /Não achei a coleta do tanque de terra 42 nos últimos 7 dias/);
  assert.match(resposta({ ...t, dataColeta: '14/10/2026' }, { estado: null }), /Não achei a coleta .* em 14\/10\/2026/);
  assert.match(resposta(t, { estado: { ...ok, permitido: false } }), /registrada por outra pessoa/);
  assert.match(resposta(t, { estado: { ...ok, tem_analise: true } }), /já tem análise registrado\(a\), então não dá para trocar a coleta/);
  assert.match(resposta({ ...t, modo: 'apagar' }, { estado: { ...ok, tem_drop: true } }), /já tem drop concluído registrado\(a\), então não dá para apagar a coleta/);
  assert.match(resposta(t, { estado: { ...ok, duplicada: true } }), /O tanque 43 já está registrado nessa mesma data/);
  const navio = { modo: 'corrigir', origem: 'navio', navio: 'O.SKY 123', tanque: '1C', novoTanque: '2C', dataColeta: '15/10/2026' };
  assert.match(resposta(navio, { estado: ok, atualizados: 1 }), /tanque 1C → 2C \(navio O\.SKY 123, 15\/10\/2026\)/);
});

test('migration 029: o banco aceita o cargo Coletor', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '029_cargo_coletor.sql'), 'utf8');
  assert.match(sql, /DROP CONSTRAINT IF EXISTS usuarios_cargo_check/);
  assert.match(sql, /cargo IN \('Admin', 'Operador', 'Consultor', 'Coletor'\)/);
});