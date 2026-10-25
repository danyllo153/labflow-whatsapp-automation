'use strict';

// Folha de Coliformes pela foto (17/10/2026): a folha é cumulativa e cada grupo de linhas tem a sua data; só entram
// linhas a partir de 13/10/2026 (início do piloto); só o que é novo; "—" = lido negativo; "+" = composta positiva e o
// bot pergunta se abre lote a lote; E.coli "+" só avisa; linhas de navio acham a composta de embarque existente.
// Respostas da IA e linhas do banco simuladas. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const HOJE = '16/10/2026';
function rodar(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Ana', hoje: HOJE, legenda: '', nivelAtual: vizinhos.nivel || 'Operador', ...(vizinhos.item || {}) } }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}
const ler = (obj, nivel) => rodar('Foto · Interpretar', { content: { parts: [{ text: JSON.stringify({ formulario: 'coliformes', duvidas: [], ...obj }) }] }, provedor: 'gemini' }, { nivel })[0].json;
const resposta = (d, linhas) => rodar('Foto · Montar resposta', linhas, { 'Foto · Interpretar': d })[0].json;
const banco = (d, porIdx = {}) => d.linhasColi.map((x) => ({ kind: 'coli', idx: x.idx, composta_id: null, analise_id: null, atual: null, ...(porIdx[x.idx] || {}) }));

// ---------- a leitura da folha ----------
test('leitura: data por grupo de linhas, linhas antes de 13/10/2026 ficam de fora, resultados e E.coli', () => {
  const d = ler({ blocos: [
    { data: '05/03/2025', load: '40874', compostas: ['9-13'], item: '2403', fabrica: 'COL', coliformes: '+', ecoli: '-' },
    { data: '16/10/2026', load: '43669', compostas: ['1-6'], item: '2549', fabrica: 'UCH', coliformes: null, ecoli: null },
    { load: '43683', compostas: ['1-4'], item: '1233', fabrica: 'AOA', coliformes: '—', ecoli: '—' },
    { load: '43716', compostas: ['1-3'], item: '1233', fabrica: 'CON', coliformes: '+', ecoli: '+' },
  ] });
  assert.equal(d.ignoradas, 1, 'a linha de 2025 não entra');
  assert.deepEqual(d.linhasColi.map((x) => [x.load, x.data, x.resultado, x.fabrica]), [
    ['43669', '16/10/2026', null, 'UCH'], ['43683', '16/10/2026', 'negativo', 'AQA'], ['43716', '16/10/2026', 'positivo', 'CON']]);
  assert.ok(d.duvidas.some((x) => /43716.*E\.coli positivo/.test(x)), 'E.coli + só avisa');
  assert.ok(d.duvidas.some((x) => /li a fábrica como "AOA" e entendi AQA/.test(x)));
});

test('leitura: embarque pelo navio (com ou sem linha/fase), navio escrito de vários jeitos', () => {
  const d = ler({ blocos: [
    { data: '14/10/2026', navio: 'O.Sky 188', load: '43478', amostras: [1, 2, 3], item: '2748', coliformes: '-' },
    { data: '14/10/2026', navio: 'O.SEA6', linha: 'L6', fase: 'F2', amostras: ['A1', 'A2', 'A3', 'A4', 'A5'], coliformes: null },
    { data: '14/10/2026', navio: 'O.BLOSSOM 105', linha: null, fase: null, load: null, amostras: [1, 2, 3] },
  ] });
  assert.deepEqual(d.linhasColi.map((x) => [x.navio, x.linha, x.fase, x.load, x.amostras.join(',')]), [
    ['O.SKY 188', null, null, '43478', '1,2,3'], ['O.SEA 6', 6, 2, '', '1,2,3,4,5']]);
  assert.ok(d.problemas.some((x) => /O\.BLOSSOM 105.*não tem linha\/fase nem load/.test(x)));
  assert.deepEqual(d.buscasColi[0], { idx: 0, load: '', item: '2748', lotes: [], navio: 'O.SKY 188', linha: null, fase: null, load_emb: '43478', amostras: [1, 2, 3] });
});

test('leitura: folha só com linhas antigas não grava nada e explica', () => {
  const d = ler({ blocos: [{ data: '22/09/2026', load: '43602', compostas: ['6-8'], coliformes: '-' }] });
  assert.equal(d.falha, true);
  assert.match(d.textoResposta, /1 linha\(s\) com data antes de 13\/10\/2026 \(início do piloto\) não entram/);
});

// ---------- a confirmação: só o que é novo ----------
test('confirmação: só o que é novo; o que já está igual no banco não aparece', () => {
  const d = ler({ blocos: [
    { data: '16/10/2026', load: '43669', compostas: ['1-6'], coliformes: null },
    { data: '16/10/2026', load: '43683', compostas: ['1-4'], coliformes: '-' },
    { data: '16/10/2026', load: '43716', compostas: ['1-3'], coliformes: '-' },
    { data: '16/10/2026', load: '43747', compostas: ['1-3'], coliformes: '+' },
    { data: '16/10/2026', load: '43750', compostas: ['1,2'], coliformes: null },
  ] });
  const r = resposta(d, banco(d, {
    0: { composta_id: 12, analise_id: 90, atual: 'No caldo|' },        // já no caldo e o papel não tem resultado: nada a fazer
    1: { composta_id: 13, analise_id: 91, atual: 'Concluída|Negativo' }, // já negativo: igual
    2: { composta_id: 14, analise_id: 92, atual: 'Estriada|' },         // ganha o resultado
    3: { composta_id: 15 },                                             // sem Coliformes: entra já positivo
    4: { composta_id: 16 },                                             // sem Coliformes: vai para o caldo
  }));
  assert.equal(r.salvar, '1');
  assert.deepEqual(JSON.parse(r.payload).comandos, ['Coliformes da foto: #14 data 16/10/2026 negativo ; #15 data 16/10/2026 positivo ; #16 data 16/10/2026 feito']);
  assert.match(r.textoResposta, /🧪 Vão para o caldo \(sem resultado\):\n• 16\/10\/2026: #16 load 43750 \(1-2\)/);
  assert.match(r.textoResposta, /✅ Resultado NEGATIVO \(traço no papel\):\n• 16\/10\/2026: #14 load 43716 \(1-3\)/);
  assert.match(r.textoResposta, /🚨 Resultado POSITIVO \(\+\):\n• 16\/10\/2026: #15 load 43747 \(1-3\)\nDepois do sim, pergunto se abre a composta lote a lote/);
  assert.doesNotMatch(r.textoResposta, /#12|#13/, 'o que já está igual não aparece');
  const tudoIgual = resposta(d, banco(d, Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, { composta_id: 20 + i, analise_id: 80 + i, atual: ['No caldo|', 'Concluída|Negativo', 'Concluída|Negativo', 'Concluída|Positivo', 'No caldo|'][i] }]))));
  assert.equal(tudoIgual.salvar, '0');
  assert.match(tudoIgual.textoResposta, /Coliformes: nada novo para gravar\./);
});

test('confirmação: composta que falta: o Admin abre (recebimento + compostas, como no TAB); embarque nunca é criado', () => {
  const d = ler({ blocos: [
    { data: '16/10/2026', load: '43750', compostas: ['1,2'], item: '1233', fabrica: 'AQA', coliformes: '-' },
    { data: '16/10/2026', navio: 'O.SKY 188', load: '43478', amostras: [1, 2, 3], coliformes: '-' },
  ] }, 'Admin');
  const r = rodar('Foto · Montar resposta', banco(d), { 'Foto · Interpretar': { ...d, nivel: 'Admin' } })[0].json;
  assert.deepEqual(JSON.parse(r.payload).comandos, [
    'Recebimento load 43750 item 1233 fabrica AQA lotes 1-2 data 16/10/2026 resultados <10',
    'Compostas do load 43750 item 1233 (1-2)',
    'Coliformes da foto: load 43750 item 1233 (1-2) data 16/10/2026 negativo']);
  assert.doesNotMatch(r.textoResposta, /início do piloto|já tinham|repetid/, 'não fala do que foi ignorado');
  assert.match(r.textoResposta, /O\.SKY 188 load 43478 \(A1-A3\): não achei a composta do embarque/);
  const op = resposta({ ...d, nivel: 'Operador' }, banco(d));
  assert.match(op.textoResposta, /load 43750 \(1-2\): não achei essa composta \(só um Admin abre/);
  assert.equal(op.salvar, '0');
});

// ---------- o comando interno, depois do sim ----------
test('comando interno: só pelo reenvio do sim da foto; # ou load + item + lotes, com data e ação', () => {
  const t = 'Coliformes da foto: #14 data 16/10/2026 negativo ; load 43750 item 1233 (1,2) data 16/10/2026 positivo';
  const c = interpretar(t, { reenvio: true });
  assert.equal(c.tipo, 'coliformes_foto');
  assert.deepEqual(c.linhas, [
    { i: 0, id: 14, load: null, item: null, lotes: [], data: '16/10/2026', acao: 'negativo' },
    { i: 1, id: null, load: '43750', item: '1233', lotes: [1, 2], data: '16/10/2026', acao: 'positivo' }]);
  assert.match(interpretar(t).textoResposta, /usado pela foto da folha de Coliformes/, 'digitado não grava');
  assert.equal(interpretar('Coliformes da foto: #14 data 16/10/2026 talvez', { reenvio: true }).tipo, 'erro_coleta');
});

test('resposta do comando interno: positivo pergunta se abre lote a lote (pendência abrir); sem positivo não pergunta', () => {
  const item = { ...interpretar('Coliformes da foto: #14 data 16/10/2026 negativo ; #15 data 16/10/2026 positivo', { reenvio: true }), nomeContato: 'Ana' };
  const linhas = [
    { i: 0, acao: 'negativo', data: '16/10/2026', composta: 14, teste: 92, gravou: true, era: null, load: '43716', lotes: [1, 2, 3], origem: 'recebimento' },
    { i: 1, acao: 'positivo', data: '16/10/2026', composta: 15, teste: 93, gravou: true, era: null, load: '43747', lotes: [1, 2, 3], origem: 'recebimento' }];
  const r = rodar('Montar resposta coliformes da foto', { linhas, nao_achadas: null }, { item })[0].json;
  assert.equal(r.salvar, true);
  assert.equal(r.tipoPendencia, 'TAB');
  assert.deepEqual(JSON.parse(r.payload), { acao: 'abrir', tipo: 'COLIFORMES', ids: [93] });
  assert.match(r.textoResposta, /✅ Lidos, negativos:\n• 16\/10\/2026: #14 load 43716 \(1,2,3\)/);
  assert.match(r.textoResposta, /❓ A composta #15 deu positivo\. Abrir a composta lote a lote para a confirmação\?/);
  const so = rodar('Montar resposta coliformes da foto', { linhas: [linhas[0]], nao_achadas: [{ i: 2, load: '43999', lotes: [1], id: null }] }, { item })[0].json;
  assert.equal(so.salvar, false);
  assert.doesNotMatch(so.textoResposta, /❓/);
  assert.match(so.textoResposta, /Não achei a composta de: load 43999 \(1\)/);
});

test('banco: o "abrir" aceita a composta que a foto fechou positiva; o comando interno tem rota e SQL', () => {
  // desde a 043, o "abrir" é da teste_acao (a mesma do app), chamada pelo BD · Atualizar TABs
  const at = workflow.nodes.find((n) => n.name === 'BD · Atualizar TABs').parameters.query;
  assert.match(at, /teste_acao_pelo_bot\(\$2::text, \$1::jsonb\)/);
  const f043 = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'db', 'migrations', '043_testes_funcoes.sql'), 'utf8');
  assert.match(f043, /t\.status = 'Concluída' AND t\.resultado = 'Positivo'/);
  const no = workflow.nodes.find((n) => n.name === 'BD · Coliformes da foto').parameters.query;
  assert.ok(no.includes('coliformes_foto_pelo_bot($2::text, $1::jsonb)'), 'desde a 048 o nó chama a função do banco');
  const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'db', 'migrations', '048_foto_tab_nfc_funcoes.sql'), 'utf8');
  assert.match(sql, /ON CONFLICT \(tipo, composta_id\) DO NOTHING/);
  assert.match(sql, /a\.status <> 'Em confirmação'/, 'não mexe em composta já aberta lote a lote');
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.ok(rot.includes('coliformes_foto'));
  const p = codigoDoNode('Foto · Montar pedido');
  assert.match(p, /A folha é CUMULATIVA/);
  assert.match(p, /O\.SEA6 - L6F2/);
});

// ---------- 19/10: célula em branco, grupo que junta compostas, item diferente, resposta objetiva ----------
test('prompt: célula em branco é null (nunca "-"); o exemplo do prompt não ensina "-"', () => {
  const p = workflow.nodes.find((n) => n.name === 'Foto · Montar pedido').parameters.jsCode;
  assert.match(p, /"coliformes": null, "ecoli": null/);
  assert.match(p, /escreva "-" SÓ se houver um traço DESENHADO/);
  assert.match(p, /célula EM BRANCO = null \(nunca "-"\)/);
});

test('o grupo do papel que junta compostas ((1-3)+(4-6) = 1-6) grava em cada uma; o texto mostra os dois #', () => {
  const d = ler({ blocos: [{ data: '16/10/2026', load: '43669', compostas: ['1-6'], item: '2549', fabrica: 'UCH', coliformes: null }] }, 'Admin');
  const r = rodar('Foto · Montar resposta', [
    { kind: 'coli', idx: 0, composta_id: 40, analise_id: null, atual: null },
    { kind: 'coli', idx: 0, composta_id: 41, analise_id: null, atual: null }], { 'Foto · Interpretar': { ...d, nivel: 'Admin' } })[0].json;
  assert.deepEqual(JSON.parse(r.payload).comandos, ['Coliformes da foto: #40 data 16/10/2026 feito ; #41 data 16/10/2026 feito']);
  assert.match(r.textoResposta, /🧪 Vão para o caldo \(sem resultado\):\n• 16\/10\/2026: #40 \+ #41 load 43669 \(1-6\)/);
  assert.doesNotMatch(r.textoResposta, /Abrir antes/);
});

test('item do papel diferente do sistema: usa a composta que já existe e avisa (não cria duplicada)', () => {
  const d = ler({ blocos: [{ data: '16/10/2026', load: '43667', compostas: ['1-5'], item: '2589', fabrica: 'UCH', coliformes: null }] }, 'Admin');
  const r = rodar('Foto · Montar resposta', [{ kind: 'coli', idx: 0, composta_id: 42, analise_id: null, atual: null, load_num: '2549' }], { 'Foto · Interpretar': { ...d, nivel: 'Admin' } })[0].json;
  assert.deepEqual(JSON.parse(r.payload).comandos, ['Coliformes da foto: #42 data 16/10/2026 feito']);
  assert.match(r.textoResposta, /load 43667: o papel diz item 2589 e o sistema tem 2549; usei a composta que já existe/);
  assert.doesNotMatch(r.textoResposta, /Abrir antes/);
});

test('resposta objetiva: só o que vai para o caldo, o que recebe resultado e o que abre antes', () => {
  const d = ler({ blocos: [
    { data: '16/10/2026', load: '43683', compostas: ['1-4'], item: '1233', fabrica: 'AQA', coliformes: '-' },
    { data: '16/10/2026', load: '43800', compostas: ['1-3'], item: '1233', fabrica: 'CON', coliformes: null },
  ] }, 'Admin');
  const r = rodar('Foto · Montar resposta', [{ kind: 'coli', idx: 0, composta_id: 52, analise_id: null, atual: null }, { kind: 'coli', idx: 1, composta_id: null }], { 'Foto · Interpretar': { ...d, nivel: 'Admin' } })[0].json;
  assert.equal(r.textoResposta.split('\n')[0], '📷 Coliformes:');
  assert.match(r.textoResposta, /✅ Resultado NEGATIVO \(traço no papel\):\n• 16\/10\/2026: #52 load 43683 \(1-4\)/);
  assert.match(r.textoResposta, /🆕 Abrir antes:\n• load 43800 item 1233 \(CON\)/);
});

test('banco: o SQL das compostas da foto acha várias compostas por linha e o item do sistema', () => {
  const q = workflow.nodes.find((n) => n.name === 'BD · Compostas da foto').parameters.query;
  assert.match(q, /coli_ids AS/);
  assert.match(q, /v\.lotes <@ r\.rq/);
  assert.match(q, /AS load_num/);
});

test('leitura: dúvidas da IA sobre resultado em branco e data assumida não aparecem; as outras continuam', () => {
  const d = ler({ duvidas: ['data 16.10.22 assumida como 16/10/2026', 'colunas Coliformes Totais e E.coli em branco', 'load da 3ª linha ilegível'],
    blocos: [{ data: '16/10/2026', load: '43669', compostas: ['1-6'], item: '2549', fabrica: 'UCH', coliformes: null, ecoli: null }] });
  assert.deepEqual(d.duvidas, ['load da 3ª linha ilegível']);
});
