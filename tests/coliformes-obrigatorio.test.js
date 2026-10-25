'use strict';

// Coliformes obrigatório (regra do Danyllo de 25/10/2026, migration 104): no embarque, toda composta; no recebimento, só a
// primeira composta de cada load (feito o Coliformes de uma, as outras não pedem); na fábrica COL, toda composta do load.
// O que já estava no banco não vira obrigatório. A função foi ensaiada no servidor em bloco desfeito. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode } = require('./helpers/executar-node');

const mig = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const montar = (r, item) => new Function('$', '$input', codigoDoNode('Montar resposta compostas'))(
  () => ({ first: () => ({ json: item }) }), { first: () => ({ json: { r } }) })[0].json.textoResposta;

const item = { load: '44300', compostas: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]] };

test('resposta das compostas: a primeira do load pede Coliformes e lembra o comando', () => {
  const t = montar({ ok: true, ids: [109, 110], coliformes_obrigatorio: [109], coliformes_motivo: 'primeira' }, item);
  assert.match(t, /✅ 2 compostas criadas no load 44300:\n#109 lotes 1-5\n#110 lotes 6-10\n\n🧪 Coliformes obrigatório na composta #109 \(primeira composta do load\)\. Quando fizer, mande: coliformes feitos das compostas #109\n\nUse o número/);
  // o comando lembrado é aceito pelo bot
  assert.equal(interpretar('coliformes feitos das compostas #109', { cargo: 'Analista' }).tipo, 'tab_feito');
});

test('resposta das compostas: na COL todas pedem; sem obrigatório, a resposta fica como antes', () => {
  const col = montar({ ok: true, ids: [111, 112], coliformes_obrigatorio: [111, 112], coliformes_motivo: 'col' }, item);
  assert.match(col, /🧪 Coliformes obrigatório nas compostas #111, #112 \(fábrica COL: toda composta do load\)\. Quando fizer, mande: coliformes feitos das compostas #111, #112/);
  const nada = montar({ ok: true, ids: [113, 114], coliformes_obrigatorio: [] }, item);
  assert.doesNotMatch(nada, /Coliformes/);
  const antigo = montar({ ok: true, ids: [113, 114] }, item);
  assert.doesNotMatch(antigo, /Coliformes/, 'banco sem a 104: nada muda');
});

test('migration 104: marca na criação, sem mexer no que já existe, e a view diz o obrigatório e o motivo', () => {
  const m = mig('104_coliformes_obrigatorio.sql');
  assert.match(m, /ALTER TABLE compostas ADD COLUMN coliformes_obrigatorio boolean NOT NULL DEFAULT false;/);
  assert.doesNotMatch(m, /UPDATE compostas/, 'o que já está no banco não vira obrigatório');
  assert.match(m, /BEFORE INSERT ON compostas/);
  assert.match(m, /fb\.nome = 'COL'/);
  assert.match(m, /OR NOT EXISTS \(SELECT 1 FROM compostas c WHERE c\.load_id = NEW\.load_id\)/);
  assert.match(m, /'coliformes_obrigatorio', to_jsonb\(v_ob\)/);
  assert.match(m, /CREATE OR REPLACE VIEW vw_coliformes_pendentes AS[\s\S]*c\.criada_em,\s*o\.obrigatorio,[\s\S]*AS motivo/);
  assert.match(m, /GRANT SELECT ON vw_coliformes_pendentes TO labflow_app, labflow_app_web, labflow_leitura;/);
  // a criar_compostas continua a da 043, só com o aviso
  const f043 = mig('043_testes_funcoes.sql');
  assert.match(f043, /INSERT INTO compostas \(load_id, criada_por\) VALUES \(v_ld, p_quem\) RETURNING id INTO v_cid;/);
  assert.match(m, /INSERT INTO compostas \(load_id, criada_por\) VALUES \(v_ld, p_quem\) RETURNING id INTO v_cid;/);
  const d = mig('104_coliformes_obrigatorio_desfazer.sql');
  assert.match(d, /DROP TRIGGER IF EXISTS compostas_coliformes_obrigatorio ON compostas;/);
  assert.match(d, /ALTER TABLE compostas DROP COLUMN IF EXISTS coliformes_obrigatorio;/);
});
