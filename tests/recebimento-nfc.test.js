'use strict';

// Recebimento NFC (item sempre 129): load, fábrica, lote e, na observação, fresh/past e a diluição.
// Comando, gravação, resposta, ajuda, IA e leitura por foto (respostas da IA simuladas). Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const nfc = (frase, opcoes) => interpretar(frase, opcoes);

test('os exemplos do laboratório: lote 10 past 10 elevado a 1 e lote 10 fresh 10 elevado a 3', () => {
  const a = nfc('Load 44300 fab aqa item 129 lote 10 past 10 elevado a 1');
  assert.equal(a.tipo, 'recebimento_nfc');
  assert.deepEqual([a.load, a.item, a.fabrica], ['44300', '129', 'AQA']);
  assert.deepEqual(a.itens, [{ lote: 10, amostra: 'past', diluicao: 1 }]);
  const b = nfc('Load 44300 fab aqa item 129 lote 10 fresh 10 elevado a 3');
  assert.deepEqual(b.itens, [{ lote: 10, amostra: 'fresh', diluicao: 3 }]);
  assert.match(a.dataRecebimento, /^\d{2}\/\d{2}\/\d{4}$/, 'sem data vale hoje');
});

test('com o início "recebimento nfc", vários lotes, faixas, nomes por extenso e data', () => {
  const r = nfc('Recebimento NFC load 44300 fábrica Araraquara lotes 10-12 fresh 10^3, lote 13 pasteurizado 10 elevado a 2 data 14/10/2026');
  assert.equal(r.tipo, 'recebimento_nfc');
  assert.equal(r.fabrica, 'AQA');
  assert.deepEqual(r.itens.map((i) => [i.lote, i.amostra, i.diluicao]), [[10, 'fresh', 3], [11, 'fresh', 3], [12, 'fresh', 3], [13, 'past', 2]]);
  assert.equal(r.dataRecebimento, '14/10/2026');
  const s = nfc('load 44300 fab aqa lotes 10 e 11 fresh 10 elevado a 3');
  assert.deepEqual(s.itens.map((i) => i.lote), [10, 11]);
  assert.equal(s.item, '129', 'o item é 129 mesmo sem escrever');
});

test('o mesmo lote vale nos dois tipos, e vem em ordem de lote e tipo', () => {
  const r = nfc('recebimento nfc load 44300 fab aqa item 129 lote 10 past 10 elevado a 1, lote 10 fresh 10 elevado a 3');
  assert.deepEqual(r.itens, [{ lote: 10, amostra: 'fresh', diluicao: 3 }, { lote: 10, amostra: 'past', diluicao: 1 }]);
});

test('recusas: item diferente de 129, fábrica fora das seis, sem tipo ou diluição, duas diluições para o mesmo lote e tipo', () => {
  assert.match(nfc('load 44300 fab aqa item 130 lote 10 past 10 elevado a 1').textoResposta, /sempre o item 129 \(você escreveu 130\)/);
  assert.match(nfc('load 44300 fab xyz item 129 lote 10 past 10 elevado a 1').textoResposta, /Fábrica "xyz" não reconhecida/);
  assert.match(nfc('load 44300 fab aqa item 129 lote 10 past').textoResposta, /Não entendi os lotes\. Para cada lote diga o tipo/);
  assert.match(nfc('load 44300 fab aqa item 129 lote 10 past 10 elevado a 1, lote 10 past 10 elevado a 2').textoResposta, /lote 10 \(past\) apareceu com duas diluições diferentes/);
  for (const f of ['load 44300 fab aqa item 130 lote 10 past 10 elevado a 1', 'load 44300 fab aqa item 129 lote 10 past']) {
    assert.equal(nfc(f).tipo, 'erro_coleta');
  }
});

test('Consultor não registra; "load ..." sem past/fresh continua não sendo recebimento NFC', () => {
  assert.match(nfc('load 44300 fab aqa item 129 lote 10 past 10 elevado a 1', { cargo: 'Consultor' }).textoResposta, /somente de consulta/);
  assert.notEqual(nfc('load 44300 fab aqa item 129 lotes 1-5').tipo, 'recebimento_nfc');
  assert.equal(nfc('tab feito do load 43598 item 2703 lotes 1-5').tipo, 'tab_feito');
  assert.equal(nfc('recebimento load 77001 item 444 fabrica AQA lotes 1-4').tipo, 'recebimento', 'o recebimento do concentrado segue igual');
});

// ---- gravação e resposta ----
const resposta = (frase, linha) => {
  const item = nfc(frase);
  const $ = () => ({ first: () => ({ json: item }) });
  return new Function('$', '$input', codigoDoNode('Montar resposta recebimento NFC'))($, { first: () => ({ json: linha }) })[0].json.textoResposta;
};

test('resposta: lista cada lote com tipo e diluição, e avisa correção, repetição e fábrica diferente', () => {
  const t = resposta('load 44300 fab aqa item 129 lote 10 past 10 elevado a 1, lote 10 fresh 10 elevado a 3',
    { gravados: [{ lote: 10, amostra: 'fresh', diluicao: 3, novo: true, era: null }, { lote: 10, amostra: 'past', diluicao: 1, novo: true, era: null }], fabrica_cadastrada: null });
  assert.match(t, /Recebimento NFC do load 44300 \(item 129, fábrica AQA\) registrado por Usuario Teste/);
  assert.match(t, /lote 10 · fresh · 10\^3/);
  assert.match(t, /lote 10 · past · 10\^1/);
  assert.match(t, /Data: \d{2}\/\d{2}\/\d{4}/);
  const corrigido = resposta('load 44300 fab aqa item 129 lote 10 past 10 elevado a 2', { gravados: [{ lote: 10, amostra: 'past', diluicao: 2, novo: false, era: 1 }] });
  assert.match(corrigido, /lote 10 · past · 10\^2 \(corrigido: era 10\^1\)/);
  const igual = resposta('load 44300 fab aqa item 129 lote 10 past 10 elevado a 1', { gravados: [{ lote: 10, amostra: 'past', diluicao: 1, novo: false, era: 1 }] });
  assert.match(igual, /\(já estava assim\)/);
  const outra = resposta('load 44300 fab aqa item 129 lote 10 past 10 elevado a 1', { gravados: null, fabrica_cadastrada: 'CON' });
  assert.match(outra, /já está cadastrado com a fábrica CON, não AQA\. Nada foi gravado/);
  const torta = resposta('load 44300 fab aoq item 129 lote 10 past 10 elevado a 1', { gravados: [{ lote: 10, amostra: 'past', diluicao: 1, novo: true }] });
  assert.match(torta, /Li a fábrica como "aoq" e entendi AQA/);
});

test('workflow: roteado até a gravação e o WhatsApp, e o SQL protege o que precisa', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('recebimento_nfc')].map((x) => x.node), ['BD · Gravar recebimento NFC']);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['BD · Gravar recebimento NFC'].main[0].map((x) => x.node), ['Montar resposta recebimento NFC']);
  assert.deepEqual(c['Montar resposta recebimento NFC'].main[0].map((x) => x.node), ['Zap · Recebimento']);
  const q = workflow.nodes.find((n) => n.name === 'BD · Gravar recebimento NFC').parameters;
  assert.match(q.query, /ON CONFLICT \(load_id, lote, amostra\) DO UPDATE/);
  assert.match(q.query, /WHERE ld\.fabrica_id <> f\.id/, 'fábrica diferente da cadastrada não grava');
  assert.match(q.query, /NOT EXISTS \(SELECT 1 FROM conflito\)/);
  assert.match(q.options.queryReplacement, /JSON\.stringify\(\$json\.itens\)/);
  assert.doesNotMatch(q.query, /recebimento_lotes/, 'não mistura com os lotes do concentrado');
});

// ---- ajuda e IA ----
test('ajuda e IA conhecem o recebimento NFC', () => {
  const menu = interpretar('comandos').textoResposta;
  assert.ok(menu.includes('• comandos recebimento nfc'));
  const topico = interpretar('comandos recebimento nfc').textoResposta;
  assert.match(topico, /Recebimento de NFC \(item 129\)/);
  const exemplos = topico.split('\n').filter((l) => l.startsWith('• ')).map((l) => l.slice(2).trim());
  assert.equal(exemplos.length, 6);
  assert.deepEqual(exemplos.map((e) => interpretar(e).tipo), ['recebimento_nfc', 'recebimento_nfc', 'recebimento_nfc', 'contagem_nfc_registrar', 'contagem_nfc_registrar', 'contagem_nfc_registrar']);
  const prompt = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments[0].value;
  assert.match(prompt, /33\. recebimento nfc load <load> fab <sigla> item 129 lote <n> <past\|fresh> 10 elevado a <n>/);
  const validar = codigoDoNode('Validar resposta da IA');
  assert.match(validar, /\['grava', \/\^recebimento nfc \/\]/);
});

// ---- foto ----
const ctx = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', hoje: '14/10/2026', legenda: '' };
function rodar(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: ctx }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}
const ler = (obj) => rodar('Foto · Interpretar', { content: { parts: [{ text: JSON.stringify(obj) }] }, provedor: 'gemini' })[0].json;
const LAUDO = (extra = {}) => ({ formulario: 'recebimento_nfc', data: '14/10/2026', duvidas: [],
  blocos: [{ load: '44300', fabrica: 'AQA', item: '129', lotes: [{ lote: 10, tipo: 'past', diluicao: 1 }, { lote: 10, tipo: 'fresh', diluicao: 3 }, { lote: 11, tipo: 'fresh', diluicao: 3 }, { lote: 12, tipo: 'fresh', diluicao: 3 }] }], ...extra });

test('foto: cada load vira um comando só, com lotes juntos por tipo e diluição, aceito pelo bot', () => {
  const r = ler(LAUDO());
  assert.equal(r.formulario, 'recebimento_nfc');
  assert.equal(r.comandos.length, 1);
  assert.equal(r.comandos[0].texto, 'Recebimento NFC load 44300 fab AQA item 129 lotes 10-12 fresh 10 elevado a 3, lote 10 past 10 elevado a 1 data 14/10/2026');
  const c = interpretar(r.comandos[0].texto, { reenvio: true });
  assert.equal(c.tipo, 'recebimento_nfc');
  assert.deepEqual(c.itens.map((i) => [i.lote, i.amostra, i.diluicao]), [[10, 'fresh', 3], [10, 'past', 1], [11, 'fresh', 3], [12, 'fresh', 3]]);
});

test('foto: tipo por extenso, expoente com texto, fábrica torta, item errado e lote sem tipo ou diluição', () => {
  const r = ler(LAUDO({ blocos: [
    { load: '44300', fabrica: 'AOQ', item: '129', lotes: [{ lote: '10', tipo: 'Pasteurizado', diluicao: '10^1' }, { lote: 13, tipo: 'fresh', diluicao: '10 elevado a 2' }, { lote: 11, tipo: null, diluicao: 3 }, { lote: 12, tipo: 'fresh', diluicao: null }] },
    { load: '44301', fabrica: 'CON', item: '2655', lotes: [{ lote: 1, tipo: 'fresh', diluicao: 2 }] },
    { load: '44302', fabrica: 'XYZ', item: '129', lotes: [{ lote: 1, tipo: 'fresh', diluicao: 2 }] },
  ] }));
  assert.deepEqual(r.comandos.map((c) => c.texto), ['Recebimento NFC load 44300 fab AQA item 129 lote 10 past 10 elevado a 1, lote 13 fresh 10 elevado a 2 data 14/10/2026']);
  assert.ok(r.duvidas.some((d) => /load 44300: li a fábrica como "AOQ" e entendi AQA/.test(d)));
  assert.ok(r.problemas.some((p) => /load 44300: não li o tipo ou a diluição de lote 11, lote 12/.test(p)));
  assert.ok(r.problemas.some((p) => /load 44301: o item do recebimento NFC é 129 e o papel diz 2655/.test(p)));
  assert.ok(r.problemas.some((p) => /load 44302: fábrica "XYZ" não é uma das seis/.test(p)));
});

test('foto: nada legível não grava; confirmação explica o que registra e pede um sim', () => {
  const vazio = ler(LAUDO({ blocos: [{ load: null, fabrica: 'AQA', lotes: [] }] }));
  assert.equal(vazio.falha, true);
  assert.match(vazio.textoResposta, /Nada foi gravado/);
  const d = ler(LAUDO());
  const r = rodar('Foto · Montar resposta', [{}], { 'Foto · Interpretar': d })[0].json;
  assert.equal(r.salvar, '1');
  assert.match(r.textoResposta, /Li o laudo de recebimento NFC \(data 14\/10\/2026\)/);
  assert.match(r.textoResposta, /1️⃣ Recebimento NFC load 44300 fab AQA item 129/);
  assert.match(r.textoResposta, /Recebimento NFC — o que isso registra:\n• load 44300 \(AQA, item 129\): lotes 10-12 fresh 10\^3 · lote 10 past 10\^1/);
  assert.match(r.textoResposta, /Responda \*sim\*/);
  assert.equal(JSON.parse(r.payload).comandos.length, 1);
});

test('foto: o prompt ensina o formulário, o tipo e só o expoente da diluição', () => {
  const [{ json }] = rodar('Foto · Montar pedido', {}, { 'Foto em arquivo': { foto_b64: 'QUJD', mime: 'image/jpeg' } });
  const p = json.pedido.contents[0].parts[0].text;
  assert.match(p, /"recebimento_nfc": "Recebimento NFC" \(suco pronto, item sempre 129\)/);
  assert.match(p, /"diluicao" é só o expoente: "10 elevado a 3" = 3/);
  assert.match(p, /o mesmo lote pode aparecer duas vezes, uma em cada tipo/);
});

test('texto sobrando no comando é recusado e expoente negativo vale pelo número', () => {
  const sobra = nfc('load 44300 fab aqa item 129 lote 10 past 10 elevado a 1 amostra azul');
  assert.equal(sobra.tipo, 'erro_coleta');
  assert.match(sobra.textoResposta, /Não entendi os lotes/);
  assert.deepEqual(nfc('load 44300 fab aqa item 129 lote 10 past 10 elevado a -2').itens, [{ lote: 10, amostra: 'past', diluicao: 2 }]);
});

test('SQL: repetir lote e tipo corrige a diluição e a data (não ignora)', () => {
  const q = workflow.nodes.find((n) => n.name === 'BD · Gravar recebimento NFC').parameters.query;
  assert.match(q, /SET diluicao = EXCLUDED\.diluicao, data_recebimento = EXCLUDED\.data_recebimento/);
});
