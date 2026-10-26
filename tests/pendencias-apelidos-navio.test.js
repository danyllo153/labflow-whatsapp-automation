'use strict';

// Pendências do dia (PB22) e apelidos de navio (migration 106). A view e o texto foram ensaiados no servidor em bloco desfeito
// (sem pendência hoje; com TABs atrasados simulados, a lista por etapa com os atrasados primeiro). Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, workflow } = require('./helpers/executar-node');

const mig = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const APELIDOS = { 'O.ALFA': 'O.ALFA II' }; // fictício, como o real que vem da tabela

test('pendências do dia: várias formas de pedir, resposta direta (consulta) para qualquer cargo', () => {
  for (const frase of ['pendências do dia', 'Pendencias', 'pendências de hoje?', 'o que está pendente', 'o que falta fazer hoje',
    'análises pendentes', 'quais são as pendências de hoje', 'minhas pendências']) {
    const r = interpretar(frase, { cargo: 'Consultor' });
    assert.equal(r.tipo, 'laudo_registrar', frase);
    assert.equal(r.fase, 'consulta', frase);
    assert.deepEqual(JSON.parse(r.dadosJson), { acao: 'pendencias' }, frase);
  }
  // o "sim" e as consultas de TAB continuam no caminho delas
  assert.equal(interpretar('quais tabs tenho para espalhar hoje?').tipo === 'laudo_registrar', false);
});

test('apelido de navio: "O.ALFA 95" vira o oficial "O.ALFA II 95"; quem já escreve o oficial não muda', () => {
  const emb = (t) => interpretar(t, { cargo: 'Analista', apelidos: APELIDOS });
  const r = emb('embarque navio O.ALFA 95 linha 1 fase 1 load 77010 item 444 amostras 1-5');
  assert.equal(r.tipo, 'embarque');
  assert.match(JSON.stringify(r), /O\.ALFA II 95/);
  assert.doesNotMatch(JSON.stringify(emb('embarque navio O.ALFA II 95 linha 1 fase 1 load 77010 item 444 amostras 1-5')), /II II/);
  assert.match(JSON.stringify(emb('embarque navio o. alfa 95 linha 1 fase 1 load 77010 item 444 amostras 1-5')), /O\.ALFA II 95/);
  assert.match(JSON.stringify(emb('Coleta navio Orange Alfa 95 tanques 1C data 25/10/2026')), /O\.ALFA II 95/);
  // sem apelido cadastrado, nada muda; outro navio que só começa igual também não
  assert.match(JSON.stringify(interpretar('embarque navio O.ALFA 95 linha 1 fase 1 load 77010 item 444 amostras 1-5', { cargo: 'Analista' })), /O\.ALFA 95/);
  assert.match(JSON.stringify(emb('embarque navio O.ALFAX 3 linha 1 fase 1 load 77010 item 444 amostras 1-5')), /O\.ALFAX 3/);
});

test('workflow: os usuários vêm com os apelidos e o node do laudo responde as pendências', () => {
  const u = workflow.nodes.find((n) => n.name === 'BD · Buscar usuários').parameters.query;
  assert.match(u, /jsonb_object_agg\(apelido, nome\), '\{\}'::jsonb\) FROM navio_apelidos\) AS "_apelidosNavio"/);
  const q = workflow.nodes.find((n) => n.name === 'BD · Registrar laudo').parameters.query;
  assert.match(q, /WHEN \(\$2::jsonb ->> 'acao'\) = 'pendencias' THEN jsonb_build_object\('ok', true, 'fase', 'consulta', 'resumo', pendencias_do_dia_texto\(\)\)/);
});

test('migration 106: a view junta as etapas, o gatilho grava o oficial, nada real no Git', () => {
  const m = mig('106_pendencias_do_dia_apelidos_navio.sql');
  for (const etapa of ['TAB: espalhar e incubar', 'Coliformes: estriar (tirar do caldo)', 'TAB: ler', 'Coliformes: ler',
    'TAB: confirmação (PCA)', 'Coliformes: confirmação lote a lote', 'Coliformes por fazer (obrigatório)', 'TAB por fazer',
    'Tanque: Stress por fazer']) assert.ok(m.includes("'" + etapa + "'"), etapa);
  assert.match(m, /i\.prevista < \(SELECT d FROM hoje\) AS atrasado/);
  assert.match(m, /FROM vw_coliformes_pendentes p WHERE p\.obrigatorio/);
  assert.match(m, /CREATE TRIGGER navios_apelido BEFORE INSERT ON navios/);
  assert.match(m, /GRANT SELECT ON navio_apelidos, vw_pendencias_do_dia TO labflow_app, labflow_app_web, labflow_leitura;/);
  assert.doesNotMatch(m, /INSERT INTO navio_apelidos/, 'os apelidos reais entram fora do Git');
  assert.doesNotMatch(m, /BLOSSOM|WAVE|OCEAN|STAR|SUN\b/);
  assert.match(mig('106_pendencias_do_dia_apelidos_navio_desfazer.sql'), /DROP TRIGGER IF EXISTS navios_apelido ON navios;/);
});
