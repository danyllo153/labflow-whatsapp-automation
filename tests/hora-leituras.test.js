'use strict';

// PB1 (sessão do app): hora de cada leitura. A migration 030 põe pre_leitura_em e leitura_final_em em analises,
// preenchidas por gatilho no banco (vale para o bot, o app e qualquer escrita futura). Sem banco no CI, confere o
// texto da migration e que os 4 nós do workflow que gravam leitura continuam gravando quem fez (o gatilho põe a hora).
// A parte que roda no banco foi validada no servidor numa transação desfeita. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { workflow } = require('./helpers/executar-node');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '030_hora_leituras.sql'), 'utf8');

test('migration 030: colunas novas com hora e fuso, sem inventar hora das leituras antigas', () => {
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS pre_leitura_em timestamptz/);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS leitura_final_em timestamptz/);
  assert.doesNotMatch(SQL, /UPDATE analises/, 'nada de preencher hora antiga com chute');
});

test('gatilho: hora da pré-leitura e da leitura final, só quando a leitura muda', () => {
  assert.match(SQL, /CREATE TRIGGER analises_hora_leitura BEFORE UPDATE ON analises/);
  assert.match(SQL, /NEW\.status = 'Aguardando Leitura Final' AND NEW\.status IS DISTINCT FROM OLD\.status/);
  assert.match(SQL, /NEW\.pre_leitura_por IS NOT NULL AND NEW\.pre_leitura_por IS DISTINCT FROM OLD\.pre_leitura_por/);
  assert.match(SQL, /NEW\.pre_leitura_em := now\(\)/);
  assert.match(SQL, /NEW\.status = 'Concluído' AND NEW\.status IS DISTINCT FROM OLD\.status/);
  assert.match(SQL, /NEW\.leitura_final_por IS NOT NULL AND NEW\.leitura_final_por IS DISTINCT FROM OLD\.leitura_final_por/);
  assert.match(SQL, /NEW\.leitura_final_em := now\(\)/);
});

test('painel e app: bi.leituras_nfc ganha lida_em no FIM da lista (não desloca as colunas atuais)', () => {
  const view = SQL.slice(SQL.indexOf('CREATE OR REPLACE VIEW bi.leituras_nfc'));
  assert.match(view, /a\.pre_leitura_em AS lida_em/);
  assert.match(view, /a\.leitura_final_em\n/);
  assert.match(view, /END AS desvio,\n\s+l\.lida_em\nFROM l/, 'lida_em é a última coluna');
  // as colunas que o Power BI usa continuam, na mesma ordem
  const ordem = ['analise_id', 'coleta_id', 'origem', 'tanque', 'navio', 'data_coleta', 'frasco', 'analise', 'metodo', 'etapa', 'linha_relatorio',
    'data_analise', 'prevista', 'lida', 'lida_por', 'situacao', 'placa_1', 'placa_2', 'placa_3', 'contagem', 'maior', 'resultado', 'repeticao', 'desvio', 'lida_em'];
  let pos = -1;
  for (const col of ordem) {
    const re = new RegExp('(AS ' + col + '\\b|\\b(?:[lcs]|pl)\\.' + col + '\\b)', 'g');
    const m = [...view.slice(view.indexOf('SELECT l.id AS analise_id')).matchAll(re)].map((x) => x.index).find((i) => i > pos);
    assert.ok(m !== undefined, 'coluna ' + col + ' fora de ordem ou ausente');
    pos = m;
  }
});

test('o workflow continua gravando quem fez a leitura (o gatilho cuida da hora)', () => {
  // desde a 042, as leituras e as placas gravam pela concluir_leitura e pela lancar_placas (as mesmas do app)
  const sql042 = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'db', 'migrations', '042_tanques_funcoes.sql'), 'utf8');
  // e, desde a 047, a leitura do dia finalizada grava pela finalizar_leitura_do_dia
  const sql047 = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'db', 'migrations', '047_desvio_tanque_dia_funcoes.sql'), 'utf8');
  const textos = { '047 (finalizar_leitura_do_dia)': sql047, '042 (concluir_leitura e lancar_placas)': sql042 };
  assert.match(workflow.nodes.find((n) => n.name === 'BD · Finalizar leitura do dia').parameters.query, /leitura_dia_finalizar_pelo_bot\(\$2::text\)/);
  for (const [nome, q] of Object.entries(textos)) {
    assert.match(q, /pre_leitura_por/, nome);
    assert.match(q, /leitura_final_por/, nome);
    assert.doesNotMatch(q, /pre_leitura_em|leitura_final_em/, nome + ' não precisa mexer na hora: é do gatilho');
  }
  assert.match(workflow.nodes.find((n) => n.name === 'BD · Concluir leituras').parameters.query, /leitura_concluir_pelo_bot\(\$2::text, \$1::jsonb\)/);
  assert.match(workflow.nodes.find((n) => n.name === 'BD · Executar NFC').parameters.query, /placas_lancar_pelo_bot\(\$2::text/);
});