'use strict';

// PB4 parte 2 (23/10/2026): corrigir, excluir e recuperar RECEBIMENTO por funções do banco (migration 036), para o app e,
// depois, o bot. Decisões do Danyllo: lote e load; sem motivo obrigatório; lote com resultado, composta ou teste não sai.
// A parte que roda no banco foi ensaiada no servidor numa transação desfeita (cada regra e as mensagens); aqui o texto da
// migration. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIG = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const SQL = MIG('036_recebimento_corrigir_excluir.sql');
const SEM_COMENTARIO = SQL.replace(/--.*$/gm, '');
const corpo = (nome) => { const i = SQL.indexOf('FUNCTION ' + nome + '('); return SQL.slice(i, SQL.indexOf('$$ LANGUAGE', SQL.indexOf('AS $$', i) + 5)); };

test('migration 036: as cinco funções, SECURITY DEFINER com search_path fixo, só o labflow_app executa', () => {
  for (const f of ['corrigir_recebimento(p_id bigint, p_campos jsonb, p_quem bigint, p_motivo text DEFAULT NULL)',
    'corrigir_load(p_id bigint, p_campos jsonb, p_quem bigint, p_motivo text DEFAULT NULL)',
    'excluir_recebimento(p_id bigint, p_quem bigint, p_motivo text DEFAULT NULL)',
    'recuperar_recebimento(p_excluido_id bigint, p_motivo text, p_quem bigint)',
    'recebimento_exigir_permissao(p_quem bigint)']) assert.ok(SQL.includes('CREATE OR REPLACE FUNCTION ' + f), f);
  assert.equal((SEM_COMENTARIO.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) || []).length, 4);
  assert.match(SQL, /FROM PUBLIC;/);
  assert.match(SQL, /TO labflow_app;/);
  assert.doesNotMatch(SEM_COMENTARIO, /labflow_app_web/, 'o GRANT para o app fica numa migration do app');
});

test('migration 036: só Admin e Analista mexem; recuperar só Admin e com motivo', () => {
  assert.match(corpo('recebimento_exigir_permissao'), /IF v_cargo NOT IN \('Admin', 'Analista'\) THEN/);
  for (const f of ['corrigir_recebimento', 'corrigir_load', 'excluir_recebimento']) assert.match(corpo(f), /PERFORM recebimento_exigir_permissao\(p_quem\);/, f);
  const rec = corpo('recuperar_recebimento');
  assert.match(rec, /cargo = 'Admin'/);
  assert.match(rec, /Para recuperar, escreva o motivo\./);
  assert.match(rec, /INSERT INTO recebimento_lotes OVERRIDING SYSTEM VALUE/, 'volta com o mesmo id');
  assert.match(rec, /INSERT INTO loads OVERRIDING SYSTEM VALUE/, 'recria o load se ele tiver sumido');
});

test('migration 036: corrigir o lote (número e data) com as travas combinadas', () => {
  const c = corpo('corrigir_recebimento');
  assert.match(c, /v_chave NOT IN \('lote', 'data_recebimento'\)/);
  assert.match(c, /O load, o item e a fábrica se corrigem no load/);
  assert.match(c, /FROM contagens WHERE recebimento_lote_id = p_id\) THEN\s+RAISE EXCEPTION 'O lote já tem C\.T ou B\.L lido: a data não pode mudar\.'/);
  assert.match(c, /FROM testes WHERE recebimento_lote_id = p_id\) THEN\s+RAISE EXCEPTION 'O lote já tem teste \(TAB ou Coliformes\): a data não pode mudar\.'/);
  assert.match(c, /Esse load já tem o lote %\./);
  assert.match(c, /Nada mudou/);
  assert.match(c, /INSERT INTO historico_alteracoes[\s\S]*'corrigido', 'recebimento_lotes'/);
});

test('migration 036: corrigir o load (número, item e fábrica)', () => {
  const c = corpo('corrigir_load');
  assert.match(c, /v_chave NOT IN \('numero', 'item', 'fabrica'\)/);
  assert.match(c, /v_numero !~ '\^\[0-9\]\{4,6\}\$'/);
  assert.match(c, /O item 129 \(NFC\) não troca com outro item/);
  assert.match(c, /v_sigla NOT IN \('AQA', 'CON', 'COL', 'UCH', 'ITA', 'TMG'\)/);
  assert.match(c, /Já existe o load % com esse item/);
  assert.match(c, /'corrigido', 'loads'/);
});

test('migration 036: excluir arquiva o lote e recusa lote com resultado, composta ou teste', () => {
  const c = corpo('excluir_recebimento');
  assert.match(c, /FROM contagens WHERE recebimento_lote_id = p_id\) THEN\s+RAISE EXCEPTION 'O lote já tem C\.T ou B\.L lido: não dá para excluir\.'/);
  assert.match(c, /FROM composta_lotes WHERE recebimento_lote_id = p_id\) THEN\s+RAISE EXCEPTION 'O lote está numa composta/);
  assert.match(c, /FROM testes WHERE recebimento_lote_id = p_id\) THEN\s+RAISE EXCEPTION 'O lote já tem teste/);
  assert.match(c, /INSERT INTO registros_excluidos \(tabela, registro_id, esquema, dados, motivo, excluido_por\)\s+VALUES \('recebimento_lotes', p_id, 1,/);
  assert.match(c, /jsonb_build_object\('lote', to_jsonb\(v_lote\), 'load'/);
  assert.match(c, /DELETE FROM recebimento_lotes WHERE id = p_id;/);
  assert.doesNotMatch(c, /DELETE FROM loads/, 'o load fica');
});

test('migration 036: o desfazer apaga só as funções (o histórico fica)', () => {
  const d = MIG('036_recebimento_corrigir_excluir_desfazer.sql');
  assert.equal((d.match(/DROP FUNCTION IF EXISTS/g) || []).length, 5);
  assert.doesNotMatch(d.replace(/--.*$/gm, ''), /historico_alteracoes|registros_excluidos/);
});
