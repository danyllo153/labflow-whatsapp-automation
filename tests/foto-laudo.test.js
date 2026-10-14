'use strict';

// Leitura de foto de laudo (fase 1: recebimento + compostas, TAB e Coliformes de caldo).
// A IA de visão só devolve dados; o código valida e monta a lista de comandos oficiais; o "sim" executa em ordem.
// Os testes usam respostas SIMULADAS da IA: nenhuma foto de laudo entra no repositório.
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const HOJE = '14/10/2026';
const ctx = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', hoje: HOJE, legenda: '' };

// roda um Code node com os nodes vizinhos simulados
function rodar(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: { ...ctx, ...(vizinhos.ctx || {}) } }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}
const respostaIA = (obj) => ({ content: { parts: [{ text: JSON.stringify(obj) }] }, provedor: 'gemini' });
const ler = (obj) => rodar('Foto · Interpretar', respostaIA(obj))[0].json;
const lotes = (...faixas) => faixas.flatMap(([a, b, fecha]) => Array.from({ length: b - a + 1 }, (_, i) => ({ n: a + i, fecha: !!fecha && a + i === b })));

const RECEBIMENTO = (extra = {}) => ({
  formulario: 'recebimento', data: '14/10/2026',
  blocos: [{ load: '43598', item: '2703', fabrica: 'AQA', lotes: lotes([1, 5, true], [6, 10, true]) }],
  duvidas: [], ...extra,
});

// ---- entrada ----
test('foto: entra no fluxo como foto_ler, com a legenda; Consultor não registra', () => {
  const r = interpretar('', { imagem: { caption: 'laudo de hoje' } });
  assert.equal(r.tipo, 'foto_ler');
  assert.equal(r.legenda, 'laudo de hoje');
  assert.match(r.hoje, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(interpretar('', { imagem: {} }).tipo, 'foto_ler');
  const c = interpretar('', { imagem: {}, cargo: 'Consultor' });
  assert.equal(c.tipo, 'erro_coleta');
  assert.match(c.textoResposta, /somente de consulta/);
  assert.equal(interpretar('', { imagem: {}, cadastrado: false }).tipo, 'nao_cadastrado');
});

test('foto: o filtro do webhook deixa a foto passar (antes só texto e áudio)', () => {
  const filtro = workflow.nodes.find((n) => n.name === 'Filtrar mensagens válidas');
  assert.match(filtro.parameters.conditions.conditions[1].leftValue, /imageMessage/);
});

// ---- o pedido para a IA ----
test('foto: o pedido leva a imagem, as seis fábricas e o formato do JSON', () => {
  const [{ json }] = rodar('Foto · Montar pedido', {}, { 'Foto em arquivo': { foto_b64: 'QUJD', mime: 'image/jpeg' }, ctx: { legenda: 'recebimento' } });
  const partes = json.pedido.contents[0].parts;
  assert.equal(partes[1].inline_data.mime_type, 'image/jpeg');
  assert.equal(partes[1].inline_data.data, 'QUJD');
  assert.equal(json.pedido.generationConfig.responseMimeType, 'application/json');
  assert.match(partes[0].text, /AQA \(Araraquara\), CON \(Conchal\), COL \(Colina\), UCH \(Uchoa\), ITA \(Itápolis\), TMG \(Terminal Guarujá\)/);
  for (const chave of ['"formulario"', '"blocos"', '"lotes"', '"fecha"', '"compostas"', '"tanques"', '"duvidas"']) assert.ok(partes[0].text.includes(chave), chave);
  assert.match(partes[0].text, /Legenda enviada com a foto: "recebimento"/);
  assert.match(partes[0].text, /Hoje é /);
});

// ---- recebimento e compostas ----
test('recebimento: marcas separam as compostas e o último lote fecha a última', () => {
  const r = ler(RECEBIMENTO());
  assert.deepEqual(r.comandos.map((c) => c.texto), [
    'Recebimento load 43598 item 2703 fabrica AQA lotes 1-10 data 14/10/2026',
    'Compostas do load 43598 item 2703 (1-5)(6-10)',
  ]);
  const so1 = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'AQA', lotes: lotes([1, 5, true], [6, 10, false]) }] }));
  assert.equal(so1.comandos[1].texto, 'Compostas do load 43598 item 2703 (1-5)(6-10)', 'a marca no lote 5 abre a composta 6-10 e o fim a fecha');
  const umaSo = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'AQA', lotes: lotes([1, 10, true]) }] }));
  assert.equal(umaSo.comandos[1].texto, 'Compostas do load 43598 item 2703 (1-10)');
});

test('recebimento: sem nenhuma marca grava só o recebimento e avisa', () => {
  const r = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'AQA', lotes: lotes([1, 6, false]) }] }));
  assert.equal(r.comandos.length, 1);
  assert.equal(r.comandos[0].tipo, 'recebimento');
  assert.ok(r.duvidas.some((d) => /sem marca de composta/.test(d)));
});

test('recebimento: lotes soltos viram lista e composta de lotes salteados continua válida', () => {
  const r = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'AQA',
    lotes: [{ n: 1 }, { n: 2, fecha: true }, { n: 4 }, { n: 5 }, { n: 7, fecha: true }] }] }));
  assert.equal(r.comandos[0].texto, 'Recebimento load 43598 item 2703 fabrica AQA lotes 1-2,4-5,7 data 14/10/2026');
  assert.equal(r.comandos[1].texto, 'Compostas do load 43598 item 2703 (1-2)(4-5,7)');
});

test('recebimento: vários loads na mesma foto viram comandos na ordem', () => {
  const r = ler(RECEBIMENTO({ blocos: [
    { load: '43598', item: '2703', fabrica: 'AQA', lotes: lotes([1, 3, true]) },
    { load: '43599', item: '2655', fabrica: 'colina', lotes: lotes([1, 2, true]) },
  ] }));
  assert.deepEqual(r.comandos.map((c) => c.load), ['43598', '43598', '43599', '43599']);
  assert.match(r.comandos[2].texto, /fabrica COL lotes 1-2/);
});

test('recebimento: fábrica por nome ou torta é corrigida e avisada; fora das seis, o load é recusado', () => {
  const torta = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'AOQ', lotes: lotes([1, 3, true]) }] }));
  assert.match(torta.comandos[0].texto, /fabrica AQA/);
  assert.ok(torta.duvidas.some((d) => /load 43598: li a fábrica como "AOQ" e entendi AQA/.test(d)));
  const nome = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'Itápolis', lotes: lotes([1, 3, true]) }] }));
  assert.match(nome.comandos[0].texto, /fabrica ITA/);
  const ruim = ler(RECEBIMENTO({ blocos: [
    { load: '43598', item: '2703', fabrica: 'XYZ', lotes: lotes([1, 3, true]) },
    { load: '43599', item: '2703', fabrica: 'AQA', lotes: lotes([1, 3, true]) },
  ] }));
  assert.deepEqual(ruim.comandos.map((c) => c.load), ['43599', '43599'], 'só o load bom segue');
  assert.ok(ruim.problemas.some((p) => /load 43598: fábrica "XYZ" não é uma das seis/.test(p)));
});

test('recebimento: load/item ilegíveis, lotes repetidos e data ruim não viram comando', () => {
  const sem = ler(RECEBIMENTO({ blocos: [{ load: null, item: '2703', fabrica: 'AQA', lotes: lotes([1, 3, true]) }] }));
  assert.equal(sem.falha, true);
  assert.match(sem.textoResposta, /não li o número do load/);
  assert.match(sem.textoResposta, /Nada foi gravado/);
  const rep = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'AQA', lotes: [{ n: 1 }, { n: 1 }] }] }));
  assert.equal(rep.falha, true);
  const data = ler(RECEBIMENTO({ data: '31/02/2026' }));
  assert.equal(data.comandos[0].texto.includes(' data '), false);
  assert.ok(data.duvidas.some((d) => /sem a data da análise, vale a de hoje/.test(d)));
  assert.ok(data.duvidas.some((d) => /ilegível/.test(d)));
});

// ---- TAB e Coliformes de caldo ----
test('TAB e Coliformes: uma composta por linha, achada pelo load e pelos lotes', () => {
  const tab = ler({ formulario: 'tab', data: '14/10/2026', blocos: [{ load: '43598', item: '2703', compostas: ['1-5', '6-10'] }] });
  assert.deepEqual(tab.comandos.map((c) => c.texto), ['Tab feito do load 43598 item 2703 lotes 1-5', 'Tab feito do load 43598 item 2703 lotes 6-10']);
  assert.deepEqual(tab.buscas.map((b) => [b.idx, b.load, b.item, b.lotes.length]), [[0, '43598', '2703', 5], [1, '43598', '2703', 5]]);
  const col = ler({ formulario: 'coliformes', blocos: [{ load: '43598', item: '2703', compostas: ['1-5', '6,7'] }] });
  assert.deepEqual(col.comandos.map((c) => c.texto), ['Coliformes feitos do load 43598 item 2703 lotes 1-5', 'Coliformes feitos do load 43598 item 2703 lotes 6-7']);
});

test('TAB: tanques de NFC com data da coleta (ano de hoje; data que cairia no futuro usa o ano anterior)', () => {
  const r = ler({ formulario: 'tab', blocos: [{ load: '43598', item: '2703', tanques: [
    { tanque: '42', data: '17/08' }, { tanque: '43', data: '17/08' }, { tanque: '44', data: '20/12' }] }] });
  const tanques = r.comandos.filter((c) => c.tipo === 'tab_tanques').map((c) => c.texto);
  assert.deepEqual(tanques, ['Tab feito dos tanques terra 42,43 coleta 17/08/2026', 'Tab feito dos tanques terra 44 coleta 20/12/2025']);
});

test('TAB: composta ou tanque ilegível vira aviso; laudo de embarque ainda não é lido', () => {
  const r = ler({ formulario: 'tab', blocos: [{ load: '43598', item: '2703', compostas: ['1-5', 'abc'] }] });
  assert.equal(r.comandos.length, 1);
  assert.ok(r.problemas.some((p) => /não entendi a composta "abc"/.test(p)));
  const emb = ler({ formulario: 'coliformes', blocos: [{ load: '43598', item: '2703', navio: 'O.SKY 123', linha: 2, fase: 1, compostas: ['A1-A3'] }] });
  assert.equal(emb.falha, true);
  assert.match(emb.textoResposta, /embarque ainda não leio/);
});

// ---- falhas da IA ----
test('foto: limite, IA fora do ar, JSON quebrado e papel desconhecido não gravam nada', () => {
  const a = rodar('Foto · Interpretar', { limite: true })[0].json;
  assert.match(a.textoResposta, /Limite diário de IA atingido/);
  const b = rodar('Foto · Interpretar', { error: 'indisponivel' })[0].json;
  assert.match(b.textoResposta, /indisponível agora/);
  const c = rodar('Foto · Interpretar', { content: { parts: [{ text: 'isto nao é json' }] } })[0].json;
  assert.match(c.textoResposta, /Não consegui ler essa foto/);
  const d = ler({ formulario: 'desconhecido', blocos: [] });
  assert.match(d.textoResposta, /Não reconheci o formulário/);
  for (const r of [a, b, c, d]) { assert.equal(r.falha, true); assert.deepEqual(r.comandos, []); }
});

test('foto: o JSON pode vir dentro de cercas de código', () => {
  const r = rodar('Foto · Interpretar', { content: { parts: [{ text: '```json\n' + JSON.stringify(RECEBIMENTO()) + '\n```' }] } })[0].json;
  assert.equal(r.comandos.length, 2);
});

// ---- a confirmação ----
const resposta = (d, linhasBanco) => rodar('Foto · Montar resposta', linhasBanco, { 'Foto · Interpretar': d })[0].json;

test('confirmação: lista os comandos em ordem, avisa as dúvidas e guarda a lista na pendência', () => {
  const d = ler(RECEBIMENTO({ blocos: [{ load: '43598', item: '2703', fabrica: 'AOQ', lotes: lotes([1, 5, true], [6, 10, true]) }] }));
  const r = resposta(d, [{}]);
  assert.equal(r.salvar, '1');
  assert.match(r.textoResposta, /Li o laudo de recebimento \(data 14\/10\/2026\)/);
  assert.match(r.textoResposta, /1️⃣ Recebimento load 43598/);
  assert.match(r.textoResposta, /2️⃣ Compostas do load 43598/);
  assert.match(r.textoResposta, /⚠️ Confira:\n• load 43598: li a fábrica como "AOQ" e entendi AQA/);
  assert.match(r.textoResposta, /Responda \*sim\* para registrar tudo, na ordem, ou \*não\* para cancelar/);
  const payload = JSON.parse(r.payload);
  assert.equal(payload.comandos.length, 2);
  assert.match(payload.comandos[0], /^Recebimento load 43598/);
});

test('confirmação: TAB mostra o #N da composta achada; a que não existe fica de fora com aviso', () => {
  const d = ler({ formulario: 'tab', blocos: [{ load: '43598', item: '2703', compostas: ['1-5', '6-10', '11-12'] }] });
  const r = resposta(d, [{ idx: 0, composta_id: 41 }, { idx: 1, composta_id: 42 }, { idx: 2, composta_id: null }]);
  assert.match(r.textoResposta, /Tab feito do load 43598 item 2703 lotes 1-5  \(composta #41\)/);
  assert.match(r.textoResposta, /lotes 6-10  \(composta #42\)/);
  assert.doesNotMatch(r.textoResposta, /lotes 11-12  \(composta/);
  assert.match(r.textoResposta, /load 43598 lotes 11-12: não achei essa composta \(ficou de fora\)/);
  assert.equal(JSON.parse(r.payload).comandos.length, 2);
});

test('confirmação: se nenhuma composta existe, nada é guardado', () => {
  const d = ler({ formulario: 'coliformes', blocos: [{ load: '43598', item: '2703', compostas: ['1-5'] }] });
  const r = resposta(d, [{ idx: 0, composta_id: null }]);
  assert.equal(r.salvar, '0');
  assert.match(r.textoResposta, /nenhum comando ficou pronto/);
  assert.match(r.textoResposta, /Nada foi gravado/);
});

test('confirmação: falha da leitura segue sem pendência', () => {
  const d = ler({ formulario: 'desconhecido' });
  const r = resposta(d, [{}]);
  assert.equal(r.salvar, '0');
  assert.match(r.textoResposta, /Não reconheci o formulário/);
});

test('todo comando montado a partir da foto é aceito pelo bot (reenvio do "sim")', () => {
  const tipos = { recebimento: 'recebimento', compostas: 'criar_compostas', tab: 'tab_feito', coliformes: 'tab_feito', tab_tanques: 'tab_feito_nfc' };
  const d = ler(RECEBIMENTO());
  const tab = ler({ formulario: 'tab', blocos: [{ load: '43598', item: '2703', compostas: ['1-5'], tanques: [{ tanque: '42', data: '17/08' }] }] });
  const col = ler({ formulario: 'coliformes', blocos: [{ load: '43598', item: '2703', compostas: ['6-10'] }] });
  for (const c of [...d.comandos, ...tab.comandos, ...col.comandos]) {
    const r = interpretar(c.texto, { reenvio: true });
    assert.equal(r.tipo, tipos[c.tipo], c.texto);
  }
});

// ---- o "sim" executa a lista ----
test('"sim" com pendência de foto devolve a lista; a pendência antiga de um comando segue igual', () => {
  const item = { tipo: 'confirmar_pendencia', nomeContato: 'Joao' };
  const exec = (p) => new Function('$', '$input', codigoDoNode('Processar sim ou não'))(
    () => ({ first: () => ({ json: item }) }), { all: () => [{ json: p }] })[0].json;
  const lista = exec({ tipo: 'IA', minutos: 1, payload: { comandos: ['A', 'B'] }, resumo: 'x' });
  assert.deepEqual(lista.reenviarComandos, ['A', 'B']);
  assert.equal(lista.reenviarComando, '');
  assert.equal(lista.limparPendencia, true);
  const um = exec({ tipo: 'IA', minutos: 1, payload: { comando: 'tabs de hoje lidos' }, resumo: 'x' });
  assert.equal(um.reenviarComando, 'tabs de hoje lidos');
  assert.deepEqual(um.reenviarComandos, []);
  assert.match(exec({ tipo: 'IA', minutos: 11, payload: { comandos: ['A'] } }).textoResposta, /expirou/);
});

test('o node Expandir comandos faz um item por comando, na ordem, e mantém o comando único', () => {
  const run = (j) => new Function('$input', codigoDoNode('Expandir comandos'))({ first: () => ({ json: j }) });
  assert.deepEqual(run({ reenviarComando: '', reenviarComandos: ['A', 'B', 'C'] }).map((i) => i.json.reenviarComando), ['A', 'B', 'C']);
  assert.deepEqual(run({ reenviarComando: 'solo', reenviarComandos: [] }).map((i) => i.json.reenviarComando), ['solo']);
  assert.deepEqual(run({ reenviarComando: 'solo' }).map((i) => i.json.reenviarComando), ['solo']);
});

// ---- a fiação ----
test('workflow: a foto vai do roteador até o WhatsApp, com reserva de modelo e limite diário', () => {
  const c = workflow.connections;
  const destino = (de, saida = 0) => c[de].main[saida].map((x) => x.node);
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.deepEqual(destino('Rotear comando', rot.indexOf('foto_ler')), ['Evolution · Baixar foto']);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(destino('Evolution · Baixar foto'), ['Foto em arquivo']);
  assert.deepEqual(destino('Foto em arquivo'), ['BD · Limite IA foto']);
  assert.deepEqual(destino('BD · Limite IA foto'), ['IA liberada? (foto)']);
  assert.deepEqual(destino('IA liberada? (foto)', 0), ['Foto · Montar pedido']);
  assert.deepEqual(destino('IA liberada? (foto)', 1), ['IA · Limite atingido foto']);
  assert.deepEqual(destino('IA · Limite atingido foto'), ['Foto · Interpretar']);
  assert.deepEqual(destino('Foto · Montar pedido'), ['IA · Gemini foto']);
  assert.deepEqual(destino('IA · Gemini foto', 0), ['IA · Normalizar foto']);
  assert.deepEqual(destino('IA · Gemini foto', 1), ['IA · Gemini 3.1 foto']);
  assert.deepEqual(destino('IA · Gemini 3.1 foto', 0), ['IA · Normalizar foto']);
  assert.deepEqual(destino('IA · Gemini 3.1 foto', 1), ['IA · Normalizar foto']);
  assert.deepEqual(destino('IA · Normalizar foto'), ['Foto · Interpretar']);
  assert.deepEqual(destino('Foto · Interpretar'), ['BD · Compostas da foto']);
  assert.deepEqual(destino('BD · Compostas da foto'), ['Foto · Montar resposta']);
  assert.deepEqual(destino('Foto · Montar resposta'), ['BD · Salvar pendência foto']);
  assert.deepEqual(destino('BD · Salvar pendência foto'), ['Zap · Foto']);
  assert.deepEqual(destino('Zap · Foto'), ['Fim · Foto']);
  const por = (n) => workflow.nodes.find((x) => x.name === n);
  assert.equal(por('IA · Gemini foto').onError, 'continueErrorOutput');
  assert.equal(por('IA · Gemini 3.1 foto').onError, 'continueErrorOutput');
  assert.match(por('IA · Gemini foto').parameters.url, /gemini-3\.8-flash/);
  assert.match(por('IA · Gemini 3.1 foto').parameters.url, /gemini-3\.1-flash-lite/);
  assert.match(por('BD · Limite IA foto').parameters.options.queryReplacement, /"foto"/);
  assert.match(por('BD · Salvar pendência foto').parameters.query, /\$4::text = '1'/);
});

test('workflow: o "sim" com lista passa por Expandir comandos e o reenvio roda um por vez', () => {
  const c = workflow.connections;
  assert.deepEqual(c['Reenviar comando da IA?'].main[0].map((x) => x.node), ['Expandir comandos']);
  assert.deepEqual(c['Expandir comandos'].main[0].map((x) => x.node), ['Reenviar ao webhook']);
  const web = workflow.nodes.find((n) => n.name === 'Reenviar ao webhook');
  assert.equal(web.parameters.options.batching.batch.batchSize, 1, 'um comando por vez, na ordem');
  const se = workflow.nodes.find((n) => n.name === 'Reenviar comando da IA?');
  assert.match(se.parameters.conditions.conditions[0].leftValue, /reenviarComandos/);
});
