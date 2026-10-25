'use strict';

// Pedidos do app de 25/10/2026: PB19 (vários loads e itens na mesma linha e fase, migration 102), PB20 (o Coliformes nasce com a
// composta do embarque e TAB/Howard só pela criar_teste_da_composta, migration 101) e PB18 (modelo do relatório completo na doc).
// As funções foram ensaiadas no servidor em bloco desfeito. Aqui o comando, as respostas e as migrations. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const mig = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const doc = (f) => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
const montar = (nome, r, item) => new Function('$', '$input', codigoDoNode(nome))(
  () => ({ first: () => ({ json: item }) }), { first: () => ({ json: r }) })[0].json.textoResposta;

test('embarque: vários loads e itens com barra (o primeiro é o principal); um load só continua igual', () => {
  const r = interpretar('embarque navio O.SKY 189 linha 6 fase 1 load 43453/43462 item 2503/1233 amostras 1-5', { cargo: 'Analista' });
  assert.deepEqual([r.tipo, r.load, r.item, r.amostras.join(',')], ['embarque', '43453/43462', '2503/1233', '1,2,3,4,5']);
  assert.equal(interpretar('embarque navio O.SKY 189 linha 6 fase 1 loads 43453 / 43462 itens 2503 amostras A1-A5', { cargo: 'Analista' }).load, '43453/43462');
  const um = interpretar('embarque navio O.SKY 133 linha 2 fase 2 load 77010 item 444 amostras 1-10', { cargo: 'Analista' });
  assert.deepEqual([um.load, um.item], ['77010', '444']);
});

test('resposta do embarque: diz que as amostras ficam no principal e avisa os loads novos', () => {
  const item = { navio: 'O.SKY 189', linha: '6', fase: '1', load: '43453/43462', item: '2503/1233', amostras: [1, 2], dataEmbarque: '25/10/2026', nomeContato: 'Ana' };
  const t = montar('Montar resposta embarque', { novas: [1, 2], existentes: [], load_novo: false, outros_loads: ['43462'], loads_novos: ['43462'] }, item);
  assert.match(t, /✅ Embarque registrado por Ana: O\.SKY 189 linha 6 fase 1, load 43453\/43462 \(item 2503\/1233\)\./);
  assert.match(t, /As amostras ficam no load 43453 \(o principal\); 43462 entra na mesma linha e fase\./);
  assert.match(t, /⚠️ O load 43462 não estava cadastrado: cadastrei agora, sem fábrica/);
  const um = montar('Montar resposta embarque', { novas: [1], existentes: [], load_novo: false, outros_loads: [], loads_novos: [] }, { ...item, load: '77010', item: '444', amostras: [1] });
  assert.doesNotMatch(um, /principal|não estava cadastrado/);
});

test('compostas do embarque: a resposta diz que o Coliformes já foi para o caldo', () => {
  const item = { navio: 'O.SKY 133', linha: '2', fase: '2', compostas: [[1, 2, 3, 4, 5]] };
  const t = montar('Montar resposta compostas embarque', { r: { ok: true, ids: [106], coliformes_em: '25/10/2026', estriar_em: '26/10/2026' } }, item);
  assert.match(t, /✅ 1 composta criada em O\.SKY 133 linha 2 fase 2:\n#106 amostras A1-A5\n\n🧪 Coliformes no caldo em 25\/10\/2026; estriar em 26\/10\/2026\./);
  assert.doesNotMatch(montar('Montar resposta compostas embarque', { r: { ok: true, ids: [7] } }, item), /Coliformes no caldo/);
});

test('workflow: o banco devolve os outros loads; a IA conhece o embarque com barra e o Coliformes das compostas', () => {
  const bd = workflow.nodes.find((n) => n.name === 'BD · Gravar embarque').parameters.query;
  assert.match(bd, /x\.r -> 'outros_loads' AS outros_loads, x\.r -> 'loads_novos' AS loads_novos/);
  const prompt = JSON.stringify(workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters);
  assert.ok(prompt.includes('load <load>[/<load>] item <item>[/<item>]'));
  assert.ok(prompt.includes('o Coliformes de cada composta já vai para o caldo junto'));
});

test('migration 101: compostas do embarque nascem com o Coliformes no caldo; criar_teste_da_composta com GRANT ao app', () => {
  const m = mig('101_compostas_embarque_coliformes.sql');
  assert.match(m, /INSERT INTO testes \(tipo, composta_id, status, data_feito, feito_por, espalhar_prevista\)\s+VALUES \('COLIFORMES', v_cid, 'No caldo', v_hoje, p_quem, v_hoje \+ 1\);/);
  assert.match(m, /v_hoje   date := \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date;/);
  assert.match(m, /CREATE OR REPLACE FUNCTION criar_teste_da_composta\(p_quem bigint, p_composta_id bigint, p_tipo text, p_percentual numeric DEFAULT NULL,/);
  assert.match(m, /RETURN teste_feito\(p_quem, v_tipo, ARRAY\[p_composta_id\]/);
  assert.match(m, /RETURN teste_acao\(p_quem, 'howard', 'HOWARD', ARRAY\[p_composta_id\], NULL, p_percentual\);/);
  assert.match(m, /GRANT EXECUTE ON FUNCTION criar_teste_da_composta\(bigint, bigint, text, numeric, boolean\) TO labflow_app, labflow_app_web;/);
  const d = mig('101_compostas_embarque_coliformes_desfazer.sql');
  assert.match(d, /DROP FUNCTION IF EXISTS criar_teste_da_composta\(bigint, bigint, text, numeric, boolean\);/);
  assert.doesNotMatch(d, /INSERT INTO testes/, 'o desfazer volta a composta sem teste (045)');
});

test('migration 102: embarque_loads com um principal, carga dos embarques antigos e registrar_embarque com barra', () => {
  const m = mig('102_embarque_varios_loads.sql');
  assert.match(m, /CREATE TABLE embarque_loads \(/);
  assert.match(m, /CREATE UNIQUE INDEX embarque_loads_um_principal ON embarque_loads \(embarque_id\) WHERE principal;/);
  assert.match(m, /INSERT INTO embarque_loads \(embarque_id, load_id, principal, criado_por, criado_em\)\nSELECT DISTINCT ON/);
  assert.match(m, /string_to_array\(COALESCE\(p_load, ''\), '\/'\)/);
  assert.match(m, /Diga um item por load, na mesma ordem/);
  assert.match(m, /'outros_loads', to_jsonb\(v_loads\[2:\]\)/);
  assert.match(m, /GRANT SELECT ON embarque_loads TO labflow_app_web, labflow_leitura;/);
  const d = mig('102_embarque_varios_loads_desfazer.sql');
  assert.match(d, /DROP TABLE IF EXISTS embarque_loads;/);
  assert.match(d, /CREATE OR REPLACE FUNCTION registrar_embarque\(/);
});

test('PB18: o modelo do relatório completo está na doc, na ordem dos blocos', () => {
  const c = doc('comandos.md');
  const ini = c.indexOf('### Modelo do relatório completo');
  assert.ok(ini > 0);
  const bloco = c.slice(ini, c.indexOf('### O que entra em cada linha', ini));
  const ordem = ['*FCOJ — Recebimento*', '*FCOJ — Embarque*', '*NFC — Tank farm*', 'AMOSTRA NORMAL', 'AMOSTRA STRESS', 'DROPS', '*NFC — Navio*', '✅ lido: X de Y.'];
  ordem.reduce((pos, s) => { const p = bloco.indexOf(s); assert.ok(p > pos, s); return p; }, -1);
});
