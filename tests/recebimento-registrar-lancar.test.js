'use strict';

// PB11 (Fase E do app): registrar_recebimento e lancar_contagem (migration 040), a mesma regra para o bot e o app.
// As funções foram ensaiadas no banco do servidor num bloco desfeito (21 casos: prévia sem gravar, load novo, lotes repetidos,
// outra fábrica, item 129, fábrica inválida, <10 só Admin, sem permissão, lote 0, prévia e gravação de C.T com alarme,
// correção com histórico, repetido, duplicado, B.L com > e <, amostra de embarque, lote inexistente, análise e alvo inválidos).
// Aqui as regras escritas no arquivo, para não mudarem sem querer. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'db', 'migrations');
const sql = fs.readFileSync(path.join(dir, '040_recebimento_registrar_lancar.sql'), 'utf8');

test('040: as duas funções, a prévia e o GRANT só para o labflow_app', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION registrar_recebimento\(p_quem bigint, p_load text, p_item text, p_fabrica text, p_lotes int\[\],\s+p_data date, p_resultados_menor10 boolean DEFAULT false,\s+p_previa boolean DEFAULT false\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION lancar_contagem\(p_quem bigint, p_analise text, p_itens jsonb, p_previa boolean DEFAULT false\)/);
  assert.equal((sql.match(/SECURITY DEFINER SET search_path = public, pg_temp;/g) || []).length, 2);
  assert.match(sql, /IF p_previa THEN\s+RETURN jsonb_build_object\('ok', true, 'previa', true/);
  assert.match(sql, /IF NOT p_previa THEN/);
  assert.match(sql, /TO labflow_app;/);
  assert.doesNotMatch(sql, /labflow_app_web/, 'o GRANT para o app fica numa migration do app');
});

test('040: mesmas regras do bot no recebimento', () => {
  assert.match(sql, /PERFORM recebimento_exigir_permissao\(p_quem\);/, 'Admin e Analista, como a 036');
  assert.match(sql, /v_fab NOT IN \('AQA', 'CON', 'COL', 'UCH', 'ITA', 'TMG'\)/);
  assert.match(sql, /O item 129 é o recebimento de NFC/);
  assert.match(sql, /já está cadastrado com a fábrica %, não %/);
  assert.match(sql, /Só um Admin registra o recebimento já com os resultados <10/);
  assert.match(sql, /ON CONFLICT \(load_id, lote\) DO NOTHING/, 'lote repetido é ignorado');
  assert.match(sql, /Já recebidos antes \(ignorados\)/);
});

test('040: mesmo alarme do bot no C.T/B.L, correção no histórico', () => {
  assert.match(sql, /v_limite := CASE v_an WHEN 'CT' THEN 200 ELSE 50 END;/);
  assert.match(sql, /IF v_sinal <> '<' AND v_valor >= v_limite THEN/);
  assert.match(sql, /🚨 Acima do limite/);
  assert.match(sql, /⚠️ Corrige resultado anterior/);
  assert.match(sql, /'resultado lançado de novo', p_quem\);/);
  // o mesmo limite que a vw_contagens (009) e o bot usam
  const bot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'LabFlow.json'), 'utf8'))
    .nodes.find((n) => n.name === 'Montar pergunta contagens').parameters.jsCode;
  assert.match(bot, /const LIMITE = \{ CT: 200, BL72: 50, BL120: 50 \};/);
});

test('040: o desfazer apaga as três funções', () => {
  const d = fs.readFileSync(path.join(dir, '040_recebimento_registrar_lancar_desfazer.sql'), 'utf8');
  for (const f of ['lancar_contagem(bigint, text, jsonb, boolean)', 'registrar_recebimento(bigint, text, text, text, int[], date, boolean, boolean)', 'lista_compacta(int[])']) {
    assert.ok(d.includes('DROP FUNCTION IF EXISTS ' + f), f);
  }
});
