'use strict';

// Foto da folha de TAB com o resultado de cada composta (decisão do Danyllo em 23/10/2026): "+" = positivo JÁ confirmado
// (TAB concluído), "—" = negativo (concluído), em branco = vai para o caldo como antes; o que já tem resultado fica de fora.
// Caso real: folha de 13/10/2026, load 43699 (10 compostas "+") e load 43701 (3 em branco). Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

function rodar(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Danyllo G.', hoje: '23/10/2026', legenda: '', nivelAtual: vizinhos.nivel || 'Admin' } }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}
const ler = (obj, nivel = 'Admin') => rodar('Foto · Interpretar', { content: { parts: [{ text: JSON.stringify({ formulario: 'tab', duvidas: [], ...obj }) }] }, provedor: 'gemini' }, { nivel })[0].json;
const resposta = (d, linhas, nivel = 'Admin') => rodar('Foto · Montar resposta', linhas, { 'Foto · Interpretar': d, nivel })[0].json;

const FOLHA = { data: '13/10/2026', blocos: [
  { load: '43699', item: '2655', fabrica: 'AQA', compostas: ['1-3', '4-6', '7,8,17,18,22', '9-12', '39-42'], resultados: ['+', '+', '+', '-', '+'] },
  { load: '43701', item: '319', fabrica: 'AQA', compostas: ['1-4', '5-8'], resultados: [null, null] },
] };

test('leitura: o resultado de cada composta vem na mesma ordem ("+" positivo, "-" negativo, vazio = nada)', () => {
  const d = ler(FOLHA);
  assert.deepEqual(d.comandos.map((c) => [c.load, c.lotes, c.resultado]), [
    ['43699', '1-3', 'positivo'], ['43699', '4-6', 'positivo'], ['43699', '7-8,17-18,22', 'positivo'], ['43699', '9-12', 'negativo'], ['43699', '39-42', 'positivo'],
    ['43701', '1-4', null], ['43701', '5-8', null]]);
  const outro = ler({ data: '13/10/2026', blocos: [{ load: '43699', item: '2655', fabrica: 'AQA', compostas: ['1-3', '4-6'], resultados: ['Detectado', '—'] }] });
  assert.deepEqual(outro.comandos.map((c) => c.resultado), ['positivo', 'negativo']);
});

test('resposta: "+" e "—" num comando interno só; já incubado e em branco fica de fora; a que falta o Admin abre e grava', () => {
  const d = ler(FOLHA);
  // #11 e #12 incubadas, #3 já concluída, a (1-3) e a (4-6) não existem; no 43701, #10 no caldo e (5-8) sem TAB
  const sit = { 2: [11, 'Incubada|'], 3: [12, 'Incubada|'], 4: [3, 'Concluída|Positivo'], 5: [10, 'Incubada|'], 6: [4, ''] };
  const linhas = d.buscas.map((b) => ({ kind: 'composta', idx: b.idx, composta_id: sit[b.idx] ? sit[b.idx][0] : null, atual: sit[b.idx] ? sit[b.idx][1] : null }));
  const r = resposta(d, linhas);
  const cmds = JSON.parse(r.payload).comandos;
  assert.ok(cmds.includes('Tab feito das compostas #4'), 'só a do 43701 sem TAB vai para o caldo');
  assert.ok(cmds.some((c) => /^Recebimento load 43699 item 2655 fabrica AQA lotes 1-6/.test(c)), 'o Admin abre as que faltam');
  assert.deepEqual(cmds[cmds.length - 1].split(' ; '), [
    'TAB da foto: load 43699 item 2655 (1-3) data 13/10/2026 positivo', 'load 43699 item 2655 (4-6) data 13/10/2026 positivo',
    '#11 data 13/10/2026 positivo', '#12 data 13/10/2026 negativo'].map((x, i) => (i === 0 ? x : x)));
  assert.match(r.textoResposta, /🚨 TAB positivo, já confirmado \(\+\):\n• load 43699 \(item 2655\): \(1-3\) · \(4-6\) · #11 \(7-8,17-18,22\)/);
  assert.match(r.textoResposta, /✅ TAB negativo \(—\):\n• load 43699 \(item 2655\): #12 \(9-12\)/);
  assert.match(r.textoResposta, /ℹ️ Já com resultado \(ficam como estão\): #3 \(39-42\)/);
  assert.doesNotMatch(r.textoResposta, /#10/, 'a que já está incubada e veio em branco não aparece');
  // o comando interno é aceito pelo bot só no reenvio do sim
  const re = interpretar(cmds[cmds.length - 1], { cargo: 'Admin', reenvio: true });
  assert.equal(re.tipo, 'tab_foto');
  assert.deepEqual(re.linhas.map((x) => [x.id, x.load, x.acao, x.data]), [[null, '43699', 'positivo', '13/10/2026'], [null, '43699', 'positivo', '13/10/2026'], [11, null, 'positivo', '13/10/2026'], [12, null, 'negativo', '13/10/2026']]);
  assert.equal(interpretar('TAB da foto: #11 positivo', { cargo: 'Admin' }).tipo, 'erro_coleta', 'digitado não vale');
  assert.equal(interpretar('TAB da foto: #11 positivo', { cargo: 'Consultor', reenvio: true }).tipo, 'erro_coleta');
});

test('resposta: tudo já com resultado ou já no caldo = nada novo, sem pedir sim', () => {
  const d = ler({ data: '13/10/2026', blocos: [{ load: '43699', item: '2655', fabrica: 'AQA', compostas: ['39-42', '9-12'], resultados: ['+', null] }] });
  const r = resposta(d, d.buscas.map((b, k) => ({ kind: 'composta', idx: b.idx, composta_id: [3, 12][k], atual: ['Concluída|Positivo', 'Incubada|'][k] })));
  assert.equal(r.salvar, '0');
  assert.match(r.textoResposta, /nada novo para registrar/);
});

test('folha antiga (antes de 13/10/2026): o resultado vale a data de hoje', () => {
  const d = ler({ data: '05/10/2026', blocos: [{ load: '43699', item: '2655', fabrica: 'AQA', compostas: ['9-12'], resultados: ['-'] }] });
  const r = resposta(d, [{ kind: 'composta', idx: 0, composta_id: 12, atual: 'Incubada|' }]);
  assert.equal(JSON.parse(r.payload).comandos.pop(), 'TAB da foto: #12 negativo');
});

test('resposta do TAB da foto (depois de gravar)', () => {
  const montar = (r) => new Function('$', '$input', codigoDoNode('Montar resposta TAB da foto'))(() => ({ first: () => ({ json: { nomeContato: 'Danyllo G.' } }) }), { first: () => ({ json: r }) })[0].json.textoResposta;
  const t = montar({ linhas: [
    { acao: 'positivo', composta: 11, gravou: true, load: '43699', item: '2655', lotes: [7, 8, 17, 18, 22] },
    { acao: 'positivo', composta: 87, gravou: true, load: '43699', item: '2655', lotes: [1, 2, 3] },
    { acao: 'negativo', composta: 12, gravou: true, load: '43699', item: '2655', lotes: [9, 10, 11, 12] },
    { acao: 'positivo', composta: 3, gravou: false, load: '43699', item: '2655', lotes: [39, 40, 41, 42] }], nao_achadas: [{ id: 99 }] });
  assert.match(t, /^📷 TAB gravado:/);
  assert.match(t, /🚨 TAB positivo, confirmado \(2\):\n• load 43699 \(item 2655\): #11 \(7-8,17-18,22\) · #87 \(1-3\)/);
  assert.match(t, /✅ TAB negativo \(1\):\n• load 43699 \(item 2655\): #12 \(9-12\)/);
  assert.match(t, /Já tinham resultado, ficaram como estavam: #3/);
  assert.match(t, /Não achei a composta: #99/);
  assert.match(montar({ linhas: [], nao_achadas: [] }), /Nada novo para gravar no TAB/);
});

test('workflow e SQL: rota tab_foto até o WhatsApp; positivo e negativo concluem; já concluído não mexe', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('tab_foto')].map((x) => x.node), ['BD · TAB da foto']);
  assert.deepEqual(c['BD · TAB da foto'].main[0].map((x) => x.node), ['Montar resposta TAB da foto']);
  assert.deepEqual(c['Montar resposta TAB da foto'].main[0].map((x) => x.node), ['Zap · TAB da foto']);
  assert.deepEqual(c['Zap · TAB da foto'].main[0].map((x) => x.node), ['Fim · TAB da foto']);
  assert.ok(workflow.nodes.find((n) => n.name === 'BD · TAB da foto').parameters.query.includes('tab_foto_pelo_bot($2::text, $1::jsonb)'), 'desde a 048 o nó chama a função do banco');
  const q = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'db', 'migrations', '048_foto_tab_nfc_funcoes.sql'), 'utf8');
  assert.match(q, /SET status = 'Concluída',\s+resultado = CASE r\.acao WHEN 'positivo' THEN 'Positivo' ELSE 'Negativo' END/);
  assert.match(q, /a\.status IN \('No caldo', 'Incubada', 'Em confirmação'\)/, 'concluído não muda');
  assert.match(q, /ON CONFLICT \(tipo, composta_id\) DO NOTHING/);
  const foto = workflow.nodes.find((n) => n.name === 'BD · Compostas da foto').parameters.query;
  assert.match(foto, /SELECT t\.status \|\| '\|' \|\| COALESCE\(t\.resultado, ''\) FROM testes t WHERE t\.tipo = 'TAB' AND t\.composta_id = COALESCE\(cc\.cid, cs\.cid\)/);
  const prompt = workflow.nodes.find((n) => n.name === 'Foto · Montar pedido').parameters.jsCode;
  assert.match(prompt, /"resultados" só no TAB: um por composta, na MESMA ordem de "compostas"/);
  assert.ok(fs.existsSync(path.join(__dirname, 'foto-tab-resultados.test.js')));
});

test('folha de 13/10 só com resultado (compostas já no caldo): sem o aviso "vale a data de hoje", grava com a data do papel', () => {
  // caso real de 24/10: 43701 (1-4)(5-8)(9,10,14) com "—", #10, #4 e #5 já incubadas desde 13/10
  const d = ler({ data: '13/10/2026', blocos: [{ load: '43701', item: '319', fabrica: 'AQA', compostas: ['1-4', '5-8', '9,10,14'], resultados: ['-', '-', '-'] }] });
  assert.ok(d.duvidas.some((x) => /não é de hoje nem dos últimos 3 dias/.test(x)), 'o Interpretar ainda marca (vale para o caldo)');
  const r = resposta(d, d.buscas.map((b, k) => ({ kind: 'composta', idx: b.idx, composta_id: [10, 4, 5][k], atual: 'Incubada|' })));
  assert.equal(JSON.parse(r.payload).comandos.pop(), 'TAB da foto: #10 data 13/10/2026 negativo ; #4 data 13/10/2026 negativo ; #5 data 13/10/2026 negativo');
  assert.doesNotMatch(r.textoResposta, /vale a data de hoje/);
  assert.doesNotMatch(r.textoResposta, /Confira/);
  assert.match(r.textoResposta, /✅ TAB negativo \(—\):\n• load 43701 \(item 319\): #10 \(1-4\) · #4 \(5-8\) · #5 \(9-10,14\)/);
});

test('item lido errado (2653 no lugar de 2655): usa o item do sistema e acha as compostas, sem abrir load novo', () => {
  // caso real de 24/10: a IA leu 2653 no 43699; o banco devolve em load_num o item do sistema (o load só tem o 2655)
  const d = ler({ data: '13/10/2026', blocos: [
    { load: '43699', item: '2653', fabrica: 'AQA', compostas: ['1-3', '4-6'], resultados: ['+', '+'] },
    { load: '43701', item: '319', fabrica: 'AQA', compostas: ['1-4'], resultados: ['-'] }] });
  const sis = [[87, 'Concluída|Positivo', '2655'], [88, 'Concluída|Positivo', '2655'], [10, 'Incubada|', null]];
  const r = resposta(d, d.buscas.map((b, k) => ({ kind: 'composta', idx: b.idx, composta_id: sis[k][0], atual: sis[k][1], load_num: sis[k][2] })));
  const cmds = JSON.parse(r.payload).comandos;
  assert.ok(!cmds.some((c) => /^Recebimento load 43699/.test(c)), 'não abre o load de novo');
  assert.equal(cmds.pop(), 'TAB da foto: #10 data 13/10/2026 negativo');
  assert.match(r.textoResposta, /li o item 2653 no load 43699, mas no sistema ele é 2655: usei 2655/);
  assert.match(r.textoResposta, /Já com resultado \(ficam como estão\): #87 \(1-3\) · #88 \(4-6\)/);
  // composta que não existe, com o item trocado: o Admin abre com o item do sistema
  const d2 = ler({ data: '13/10/2026', blocos: [{ load: '43699', item: '2653', fabrica: 'AQA', compostas: ['50-51'], resultados: ['-'] }] });
  const r2 = resposta(d2, [{ kind: 'composta', idx: 0, composta_id: null, atual: null, load_num: '2655' }]);
  assert.ok(JSON.parse(r2.payload).comandos.some((c) => /^Recebimento load 43699 item 2655 fabrica AQA lotes 50-51/.test(c)));
});

test('SQL: a busca da composta tenta o item do sistema quando o load só tem um item', () => {
  const q = workflow.nodes.find((n) => n.name === 'BD · Compostas da foto').parameters.query;
  assert.match(q, /HAVING count\(\*\) = 1 AND min\(i\.codigo\) <> b\.item/);
  assert.match(q, /COALESCE\(cc\.cid, cs\.cid\) AS composta_id/);
});
