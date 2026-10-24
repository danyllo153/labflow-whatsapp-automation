'use strict';

// PB10 (24/10/2026): o dia da incubação para o laudo de incubação e leitura do app (migration 038). Ensaiada no banco real
// numa transação desfeita (152 linhas de tanque N/ST, 822 de recebimento, 75 de embarque, 24 de NFC, 65 de TAB e 9 de
// Coliformes; o labflow_leitura e o labflow_app_web leem a view). Aqui o texto da migration. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIG = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const SQL = MIG('038_bi_incubacao.sql');
const T015 = MIG('015_bi_coliformes_por_lote.sql');

test('038: bi.testes só ganha espalhado_em e espalhado_por no fim (as colunas da 015 ficam iguais e na mesma ordem)', () => {
  // o fim da view é o ';' do fim da linha (há ';' dentro de comentários)
  const corpo = (s) => { const i = s.indexOf('CREATE OR REPLACE VIEW bi.testes'); return s.slice(i, s.indexOf(';\n', s.indexOf('LEFT JOIN usuarios ur', i))); };
  const antes = corpo(T015), depois = corpo(SQL);
  const ate = "CASE WHEN t.coleta_id IS NOT NULL THEN 'Tanque ' || co.tanque ELSE v.load::text END AS load_ou_tanque";
  assert.equal(depois.slice(0, depois.indexOf(ate)), antes.slice(0, antes.indexOf(ate)), 'o começo da view é o mesmo da 015');
  assert.match(depois, /AS load_ou_tanque,\s+-- novas \(038[^\n]*\n\s+\(t\.espalhado_em AT TIME ZONE 'America\/Sao_Paulo'\) AS espalhado_em,\s+ue\.nome AS espalhado_por/);
  assert.match(depois, /LEFT JOIN usuarios ue ON ue\.id = t\.espalhado_por$/);
});

test('038: bi.incubacao tem uma linha por plaqueamento, com o dia certo de cada tipo', () => {
  assert.match(SQL, /CREATE OR REPLACE VIEW bi\.incubacao AS/);
  for (const tipo of ["'Tanque'::text AS tipo", "'Recebimento'", "'Embarque'", "'Recebimento NFC'", "CASE t.tipo WHEN 'COLIFORMES' THEN 'Coliformes' ELSE 'TAB' END"]) assert.ok(SQL.includes(tipo), tipo);
  assert.match(SQL, /a\.data_analise AS dia_incubacao/, 'tanque: o dia da análise (nem sempre o da coleta)');
  assert.match(SQL, /CASE a\.frasco WHEN 'Normal' THEN 'N' WHEN 'Stress' THEN 'ST' ELSE a\.frasco END AS frasco/);
  assert.match(SQL, /SELECT 'Recebimento', r\.data_recebimento,/, 'recebimento plaqueia no dia que chega');
  assert.match(SQL, /SELECT 'Embarque', ea\.data_embarque,/);
  assert.match(SQL, /SELECT 'Recebimento NFC', rn\.data_recebimento, rn\.amostra,/);
  assert.match(SQL, /WHERE t\.tipo IN \('TAB', 'COLIFORMES'\);/, 'Howard não incuba');
  assert.equal((SQL.match(/\('CT', 'C\.T 48h', 2\), \('BL72', 'B\.L 72h', 3\), \('BL120', 'B\.L 120h', 5\)/g) || []).length, 3, 'mesmos prazos do bot');
});

test('038: só aditiva (nenhuma tabela muda) e o desfazer volta a 015', () => {
  const sem = SQL.replace(/--.*$/gm, '');
  assert.doesNotMatch(sem, /ALTER TABLE|CREATE TABLE|DROP |INSERT |UPDATE |DELETE /);
  const d = MIG('038_bi_incubacao_desfazer.sql');
  assert.match(d, /DROP VIEW IF EXISTS bi\.incubacao;/);
  assert.ok(d.includes(T015.slice(T015.indexOf('CREATE OR REPLACE VIEW bi.testes'), T015.indexOf(';\n', T015.indexOf('LEFT JOIN usuarios ur')))), 'o desfazer recria a view da 015');
});
