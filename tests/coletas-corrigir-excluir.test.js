'use strict';

// PB4 parte 1 (sessão do app): corrigir, excluir (arquivar) e recuperar COLETA por funções do banco (migration 033).
// A parte que roda no banco foi validada numa cópia do banco do piloto (restaurada de backup, banco de teste apagado depois):
// permissões por cargo, recusas, arquivar e recuperar com os mesmos ids. Aqui o texto da migration. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '033_coletas_corrigir_excluir.sql'), 'utf8');

test('migration 033: as três funções e as tabelas de histórico', () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION corrigir_coleta\(p_id bigint, p_campos jsonb, p_quem bigint\)/);
  assert.match(SQL, /CREATE OR REPLACE FUNCTION excluir_coleta\(p_id bigint, p_quem bigint, p_motivo text DEFAULT NULL\)/);
  assert.match(SQL, /CREATE OR REPLACE FUNCTION recuperar_coleta\(p_excluido_id bigint, p_motivo text, p_quem bigint\)/);
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS registros_excluidos/);
  assert.match(SQL, /esquema\s+smallint\s+NOT NULL DEFAULT 1/, 'versão do formato do JSON (pedido do app)');
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS historico_alteracoes/);
  assert.match(SQL, /CHECK \(tipo IN \('corrigido', 'excluido', 'recuperado'\)\)/);
  assert.match(SQL, /CREATE OR REPLACE VIEW vw_historico_alteracoes/);
});

test('migration 033: excluir arquiva (não apaga de vez) e recusa coleta com análise, drop concluído ou TAB', () => {
  assert.match(SQL, /INSERT INTO registros_excluidos[\s\S]*'drops'[\s\S]*'arquivo'/, 'guarda a coleta, os drops e o arquivo');
  assert.match(SQL, /A coleta já tem análises: exclua primeiro as análises, com motivo\./);
  assert.match(SQL, /A coleta já tem drop concluído: não dá para excluir\./);
  assert.match(SQL, /A coleta já tem TAB: não dá para excluir\./);
  assert.match(SQL, /DELETE FROM coletas WHERE id = p_id;\s+-- os drops e o arquivo saem junto \(ON DELETE CASCADE\)/);
});

test('migration 033: permissão conferida no banco por p_quem', () => {
  assert.match(SQL, /v_cargo NOT IN \('Admin', 'Operador', 'Coletor'\)/, 'Consultor e desconhecidos não mexem');
  assert.match(SQL, /O Coletor só corrige ou exclui a coleta que ele mesmo registrou\./);
  assert.match(SQL, /Essa coleta já tem análise, drop concluído ou TAB: peça a um Operador ou Admin\./, 'regra do Coletor da 029');
  assert.match(SQL, /usuarios WHERE id = p_quem AND cargo = 'Admin'[\s\S]*Só administradores podem recuperar/, 'recuperar só Admin');
  assert.match(SQL, /Para recuperar, escreva o motivo\./, 'recuperar pede motivo; corrigir e excluir de coleta não');
});

test('migration 033: corrigir muda só os campos combinados e cuida da data', () => {
  assert.match(SQL, /'tanque', 'data_coleta', 'navio_id', 'coletado_por'/);
  assert.match(SQL, /A origem da coleta \(terra ou navio\) não muda: exclua a coleta e registre de novo\./);
  assert.match(SQL, /A coleta já tem drop concluído: a data não pode mudar\./);
  assert.match(SQL, /A coleta já tem análise ou TAB: a data não pode mudar\./);
  assert.match(SQL, /UPDATE drops SET data_prevista = v_data \+ dia WHERE coleta_id = p_id AND status = 'Pendente'/);
  assert.match(SQL, /UPDATE arquivo_amostras SET data_descarte = v_data \+ 365/);
  assert.match(SQL, /Já existe uma coleta desse tanque nessa data\./);
  assert.match(SQL, /EXCEPTION WHEN unique_violation/, 'o UNIQUE continua sendo a defesa final');
});

test('migration 033: recuperar reinsere com os mesmos ids e recusa duplicata', () => {
  assert.match(SQL, /INSERT INTO coletas OVERRIDING SYSTEM VALUE/);
  assert.match(SQL, /INSERT INTO drops OVERRIDING SYSTEM VALUE/);
  assert.match(SQL, /INSERT INTO arquivo_amostras OVERRIDING SYSTEM VALUE/);
  assert.match(SQL, /Já existe outra coleta igual \(mesmo tanque, data e origem\): não dá para recuperar esta\./);
  assert.match(SQL, /v_reg\.esquema <> 1/, 'só entende o formato conhecido do JSON');
  assert.match(SQL, /Essa coleta já foi recuperada\./);
});

test('migration 033: SECURITY DEFINER com search_path fixo; só o labflow_app executa', () => {
  for (const f of ['corrigir_coleta', 'excluir_coleta', 'recuperar_coleta']) {
    const m = SQL.match(new RegExp('CREATE OR REPLACE FUNCTION ' + f + '\\([\\s\\S]*?\\$\\$ LANGUAGE plpgsql([^;]*);'));
    assert.ok(m, f);
    assert.match(m[1], /SECURITY DEFINER SET search_path = public, pg_temp/, f);
  }
  const h = SQL.match(/CREATE OR REPLACE FUNCTION coleta_exigir_permissao\([\s\S]*?\$\$ LANGUAGE plpgsql([^;]*);/);
  assert.match(h[1], /SET search_path = public, pg_temp/);
  assert.doesNotMatch(h[1], /SECURITY DEFINER/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION[\s\S]*TO labflow_app;/);
  assert.doesNotMatch(SQL, /GRANT[^;]*labflow_app_web/, 'o GRANT do app fica na migration do app');
});
