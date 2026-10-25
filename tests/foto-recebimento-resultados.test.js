'use strict';

// C.T / B.L de cada lote lidos da foto do laudo de RECEBIMENTO de FCOJ (25/10/2026). No papel, o traço por cima de um
// resultado quer dizer "já digitado": a IA devolve null e a resposta não comenta nada. Só entra o que é novo (lote que falta,
// composta que falta, resultado que falta ou mudou) e tudo vai num sim só; os resultados gravam pelo comando interno
// "contagem da foto", depois do recebimento. Respostas da IA SIMULADAS (nenhuma foto no repositório). Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const ctx = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', hoje: '25/10/2026', legenda: '' };
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
const resposta = (d, linhasBanco) => rodar('Foto · Montar resposta', linhasBanco.length ? linhasBanco : [{}], { 'Foto · Interpretar': d })[0].json;

// lotes 9 a 12: 9 e 10 com traço (já digitados, a IA devolve null); 11 e 12 sem traço
const LOTES = () => [
  { n: 9, fecha: false, ct: null, bl72: null, bl120: null },
  { n: 10, fecha: false, ct: null, bl72: null, bl120: null },
  { n: 11, fecha: false, ct: '<10', bl72: '<10', bl120: null },
  { n: 12, fecha: false, ct: '<10', bl72: '60', bl120: null },
];
const LAUDO = (extra = {}) => ({ formulario: 'recebimento', data: '22.09.26', duvidas: [],
  blocos: [{ load: '43599', item: '2703', fabrica: 'AQA', lotes: LOTES(), ...extra }] });

// o banco: os lotes existem (alvo_id) e, se quiser, com um valor atual por análise
const noBanco = (d, atual = () => null, existe = () => true) => (d.buscasReceb || []).map((x) => ({
  kind: 'receb', idx: x.idx, alvo_id: existe(x) ? 900 + x.lote : null, atual: x.analise ? atual(x) : null }));

test('leitura: só os resultados sem traço viram resultado, com sinal e valor; cada lote é procurado no banco', () => {
  const d = ler(LAUDO());
  assert.deepEqual(d.resultadosReceb.map((x) => `${x.lote} ${x.analise} ${x.sinal}${x.valor}`), ['11 CT <10', '11 BL72 <10', '12 CT <10', '12 BL72 =60']);
  assert.equal(d.buscasReceb.filter((x) => x.analise === null).length, 4);
  assert.deepEqual(Object.keys(d.buscasReceb[0]).sort(), ['analise', 'idx', 'item', 'load', 'lote']);
  const rec = d.comandos.find((c) => c.tipo === 'recebimento');
  assert.deepEqual([rec.load, rec.item, rec.fabrica, rec.lotes], ['43599', '2703', 'AQA', '9-12']);
});

test('leitura: a dúvida da IA sobre o traço não aparece; a dúvida sobre a marca de composta continua', () => {
  const d = ler({ ...LAUDO(), duvidas: ['os resultados dos lotes 9 e 10 estão riscados com traço', 'não sei se o traço depois do lote 5 fecha a composta'] });
  assert.ok(!d.duvidas.some((x) => /riscados/.test(x)));
  assert.ok(d.duvidas.some((x) => /fecha a composta/.test(x)));
});

test('lotes já registrados: só os resultados novos, num sim só, sem "Registrar" e sem falar do traço', () => {
  const d = ler(LAUDO());
  const r = resposta(d, noBanco(d, (x) => (x.lote === 11 ? '<10' : x.lote === 12 && x.analise === 'CT' ? '20' : null)));
  assert.equal(r.salvar, '1');
  assert.match(r.textoResposta, /^📷 Recebimento de 22\/09\/2026:\n\n📊 Resultados de C\.T\/B\.L:\nload 43599:\n   lote 12: CT <10 · BL72 60 🚨/);
  assert.doesNotMatch(r.textoResposta, /lote 11|lote 9|lote 10/, 'o que já está igual (ou com traço) não aparece');
  assert.doesNotMatch(r.textoResposta, /🧪 Registrar|tra[cç]o|riscad|digitad/);
  assert.match(r.textoResposta, /🚨 Acima do limite \(C\.T ≥ 200, B\.L ≥ 50\): lote 12 BL72 = 60/);
  assert.match(r.textoResposta, /⚠️ Corrige resultado anterior: lote 12 CT \(era 20\)/);
  assert.match(r.textoResposta, /Responda \*sim\* para gravar ou \*não\* para cancelar\.$/);
  const { comandos } = JSON.parse(r.payload);
  assert.equal(comandos.length, 1);
  assert.match(comandos[0], /^Contagem da foto: /);
  assert.deepEqual(JSON.parse(comandos[0].replace(/^Contagem da foto: /, '')).itens, [
    { load: '43599', item: '2703', lote: 12, analise: 'CT', sinal: '<', valor: 10 },
    { load: '43599', item: '2703', lote: 12, analise: 'BL72', sinal: '=', valor: 60 }]);
});

test('lotes registrados, compostas já feitas e tudo igual (ou com traço): nada novo, nada guardado', () => {
  const d = ler(LAUDO({ lotes: [{ n: 9, fecha: true, ct: null }, { n: 10, fecha: true, ct: '<10' }] }));
  const linhas = noBanco(d, () => '<10').concat((d.buscas || []).map((b) => ({ kind: 'composta', idx: b.idx, composta_id: 70 + b.idx })));
  const r = resposta(d, linhas);
  assert.equal(r.salvar, '0');
  assert.equal(r.textoResposta, '📷 Recebimento: nada novo para registrar.');
});

test('lotes que ainda não existem: recebimento, compostas e resultados no mesmo sim, na ordem', () => {
  const d = ler(LAUDO({ lotes: [{ n: 1, fecha: false, ct: '<10' }, { n: 2, fecha: true, ct: '30', bl72: '<10' }] }));
  const r = resposta(d, noBanco(d, () => null, () => false));
  const { comandos } = JSON.parse(r.payload);
  assert.equal(comandos.length, 3);
  assert.match(comandos[0], /^Recebimento load 43599 item 2703 fabrica AQA lotes 1-2 data 22\/09\/2026$/);
  assert.equal(comandos[1], 'Compostas do load 43599 item 2703 (1-2)');
  assert.match(comandos[2], /^Contagem da foto: \{"itens":\[\{"load":"43599","item":"2703","lote":1,"analise":"CT","sinal":"<","valor":10\}/);
  assert.match(r.textoResposta, /🧪 Registrar:\n• load 43599: recebimento dos lotes 1-2 e 1 composta:\n     1ª composta = lotes 1-2/);
  assert.match(r.textoResposta, /📊 Resultados de C\.T\/B\.L:\nload 43599:\n   lote 1: CT <10\n   lote 2: CT 30 · BL72 <10/);
  assert.match(r.textoResposta, /Responda \*sim\* para registrar tudo, na ordem, ou \*não\* para cancelar\./);
  // os comandos do sim são aceitos pelo bot
  assert.equal(interpretar(comandos[0], { cargo: 'Analista' }).tipo, 'recebimento');
  assert.equal(interpretar(comandos[1], { cargo: 'Analista' }).tipo, 'criar_compostas');
  assert.equal(interpretar(comandos[2], { cargo: 'Analista', reenvio: true }).tipo, 'contagem_foto');
});

test('lotes registrados e composta nova: cria só a composta que falta, sem registrar de novo', () => {
  const d = ler(LAUDO({ lotes: [{ n: 1, fecha: false }, { n: 2, fecha: true }, { n: 3, fecha: false }, { n: 4, fecha: true }] }));
  const comp = (d.buscas || []).map((b, i) => ({ kind: 'composta', idx: b.idx, composta_id: i === 0 ? 81 : null }));
  const r = resposta(d, noBanco(d).concat(comp));
  assert.deepEqual(JSON.parse(r.payload).comandos, ['Compostas do load 43599 item 2703 (3-4)']);
  assert.match(r.textoResposta, /• load 43599: compostas novas:\n     1ª composta = lotes 3-4/);
  assert.doesNotMatch(r.textoResposta, /sem marca|sem a data/);
});

test('foto sem resultados e lotes novos: continua como antes (recebimento e compostas)', () => {
  const d = ler(LAUDO({ lotes: [{ n: 21 }, { n: 22 }, { n: 23, fecha: true }] }));
  const r = resposta(d, noBanco(d, () => null, () => false));
  assert.deepEqual(JSON.parse(r.payload).comandos.map((c) => c.split(' ')[0]), ['Recebimento', 'Compostas']);
  assert.doesNotMatch(r.textoResposta, /📊/);
});

test('comando interno: só pelo sim da foto; Consultor e Coletor não gravam; dados ruins não chegam ao banco', () => {
  const cmd = 'Contagem da foto: ' + JSON.stringify({ itens: [{ load: '43599', item: '2703', lote: 12, analise: 'CT', sinal: '<', valor: 10 }] });
  assert.match(interpretar(cmd, { cargo: 'Analista' }).textoResposta, /usado pelo \*sim\* da foto do recebimento/);
  const r = interpretar(cmd, { cargo: 'Analista', reenvio: true });
  assert.equal(r.tipo, 'contagem_foto');
  assert.deepEqual(JSON.parse(r.dadosJson).itens[0], { load: '43599', item: '2703', lote: 12, analise: 'CT', sinal: '<', valor: 10 });
  assert.match(interpretar(cmd, { cargo: 'Consultor', reenvio: true }).textoResposta, /somente de consulta/);
  assert.notEqual(interpretar(cmd, { cargo: 'Coletor', reenvio: true }).tipo, 'contagem_foto');
  const ruim = 'Contagem da foto: ' + JSON.stringify({ itens: [{ load: 'x', lote: 1, analise: 'XX', sinal: '<', valor: 1 }] });
  assert.match(interpretar(ruim, { cargo: 'Analista', reenvio: true }).textoResposta, /Não entendi os resultados da foto/);
});

test('resposta depois do sim: quantos gravou, o que ficou de fora e o erro do banco', () => {
  const montar = (x) => rodar('Montar resposta contagem da foto', x)[0].json.textoResposta;
  assert.equal(montar({ r: { ok: true, gravados: 2 }, faltam: null }), '✅ 2 resultados de C.T/B.L da foto gravados.\n\nPor: Usuario Teste');
  assert.match(montar({ r: '{"ok": true, "gravados": 1}', faltam: 'load 43599 lote 99' }), /^✅ 1 resultado de C\.T\/B\.L da foto gravado\.\n⚠️ Não achei no sistema: load 43599 lote 99 \(ficou de fora\)/);
  assert.equal(montar({ r: { ok: false, erro: 'O seu cargo não lança resultado.' } }), '❌ O seu cargo não lança resultado. Os resultados da foto não foram gravados.');
  assert.match(montar({ r: null, faltam: 'load 43599 lote 1' }), /Não achei no sistema load 43599 lote 1/);
});

test('workflow: rota contagem_foto até o WhatsApp; o banco acha o lote e grava pela contagem_lancar_pelo_bot', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('contagem_foto')].map((x) => x.node), ['BD · Contagem da foto']);
  assert.deepEqual(c['BD · Contagem da foto'].main[0].map((x) => x.node), ['Montar resposta contagem da foto']);
  assert.deepEqual(c['Montar resposta contagem da foto'].main[0].map((x) => x.node), ['Zap · Contagem da foto']);
  assert.deepEqual(c['Zap · Contagem da foto'].main[0].map((x) => x.node), ['Fim · Contagem da foto']);
  const bd = workflow.nodes.find((n) => n.name === 'BD · Contagem da foto').parameters;
  assert.match(bd.query, /contagem_lancar_pelo_bot\(\$2::text, jsonb_build_object\('acao', 'contagem', 'alvo', 'lote'/);
  assert.match(bd.query, /LEFT JOIN recebimento_lotes rl ON rl\.load_id = l\.id AND rl\.lote/);
  assert.doesNotMatch(bd.query, /INSERT INTO|UPDATE /);
  const busca = workflow.nodes.find((n) => n.name === 'BD · Compostas da foto').parameters;
  assert.match(busca.query, /SELECT \* FROM rec;/);
  assert.match(busca.options.queryReplacement, /receb: \$json\.buscasReceb/);
});

test('o prompt ensina os resultados do recebimento e que traço por cima é já digitado (sem comentar)', () => {
  const [{ json }] = rodar('Foto · Montar pedido', {}, { 'Foto em arquivo': { foto_b64: 'QUJD', mime: 'image/jpeg' } });
  const p = json.pedido.contents[0].parts[0].text;
  assert.match(p, /"lotes": \[ \{ "n": 1, "fecha": false, "ct": "<10", "bl72": "<10", "bl120": null \}/);
  assert.match(p, /TRAÇO = JÁ DIGITADO \(recebimento e embarque\)/);
  assert.match(p, /Não comente em "duvidas" nada sobre o traço/);
  assert.match(p, /O traço marca um BLOCO: todo resultado dentro do retângulo que o traço atravessa/);
  assert.match(p, /um número escrito ao lado, dentro desse bloco, também já foi digitado/);
  assert.doesNotMatch(p, /qual vale, use null e anote em "duvidas"/);
});

test('embarque: resultado igual ao do sistema (já digitado) não aparece; só o novo vai para o sim', () => {
  const d = ler({ formulario: 'embarque', navio: 'O.Sky', viagem: '189', data: '12/10/2026', duvidas: [], blocos: [
    { linha: '6', fase: '1', load: '43453', item: '2503', amostras: [1, 2], resultados: { A1: { ct: '<10', bl72: '<10' }, A2: { ct: '<10', bl72: '30' } } }] });
  const linhas = d.buscasAmostras.map((x) => ({ kind: 'amostra', idx: x.idx, alvo_id: 1000 + x.numero, load_num: '43453', atual: x.analise && x.numero === 1 ? '<10' : null }));
  const r = resposta(d, linhas);
  assert.doesNotMatch(r.textoResposta, /A1:/);
  assert.match(r.textoResposta, /A2: CT <10 · BL72 30/);
  assert.doesNotMatch(r.textoResposta, /Corrige resultado anterior/);
  assert.equal(JSON.parse(r.payload).itens.length, 2);
});
