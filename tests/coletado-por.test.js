'use strict';

// "coletado por Joyce": quem coletou quando não foi quem mandou a mensagem (piloto: micro e física coletam,
// o laboratório registra). Comando, IA, banco e migration. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const VALIDAR = codigoDoNode('Validar resposta da IA');
function validar(ia) {
  const principal = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', nivelAtual: 'Admin', mensagem_original: 'x' };
  const $ = () => ({ first: () => ({ json: principal }) });
  const $input = { first: () => ({ json: { content: { parts: [{ text: JSON.stringify(ia) }] } } }) };
  return new Function('$', '$input', VALIDAR)($, $input)[0].json;
}

test('terra: "coletado por Joyce" grava o nome dela como responsável e não o de quem mandou', () => {
  const r = interpretar('registrar coleta tanque terra 42,43 data 15/10/2026 coletado por Joyce');
  assert.equal(r.tipo, 'coleta_terra');
  assert.equal(r.coletadoPor, 'Joyce');
  assert.deepEqual(r.tanques, ['42', '43']);
  assert.equal(r.dataColeta, '15/10/2026');
  assert.ok(r.itensColeta.every((i) => i.responsavel === 'Joyce'));
  assert.match(r.textoResposta, /Coletado por: Joyce/);
  assert.doesNotMatch(r.textoResposta, /Usuario Teste/, 'a resposta não diz que quem mandou coletou');
});

test('ordem livre, caixa e nome composto: "coletado por" antes ou depois da data', () => {
  const antes = interpretar('registrar coleta tanque terra 42 coletado por joyce data 15/10/2026');
  assert.equal(antes.coletadoPor, 'Joyce');
  assert.deepEqual(antes.tanques, ['42']);
  assert.equal(interpretar('registrar coleta tanque terra 42 data 15/10/2026 coletado pela Maria de Souza').coletadoPor, 'Maria de Souza');
  assert.equal(interpretar('registrar coleta tanque terra 42 data 15/10/2026 coletado pelo carlos').coletadoPor, 'Carlos');
  assert.equal(interpretar('registrar coleta tanque terra 42 data 15/10/2026 coletado por Ana-Maria').coletadoPor, 'Ana-Maria', 'cada parte do nome começa com maiúscula');
  assert.equal(interpretar("registrar coleta tanque terra 42 data 15/10/2026 coletado por D'Avila").coletadoPor, "D'Avila");
  assert.equal(interpretar('registrar coleta tanque terra 42 data 15/10/2026 coletado por José').coletadoPor, 'José', 'acento vale');
  assert.equal(interpretar('registrar coleta tanque terra 42 data 15/10/2026, coletada por ana').coletadoPor, 'Ana');
});

test('navio: também aceita "coletado por"', () => {
  const r = interpretar('Coleta navio O.SKY 123 tanques 1C,4P data 15/10/2026 coletado por Carlos');
  assert.equal(r.tipo, 'coleta_navio');
  assert.equal(r.coletadoPor, 'Carlos');
  assert.equal(r.navio, 'O.SKY 123');
  assert.deepEqual(r.tanques, ['1C', '4P']);
  assert.ok(r.itensColeta.every((i) => i.responsavel === 'Carlos'));
  assert.match(r.textoResposta, /Coletado por: Carlos/);
});

test('sem "coletado por", ou "por mim": quem mandou a mensagem é o responsável (como sempre)', () => {
  for (const f of ['registrar coleta tanque terra 42 data 15/10/2026', 'registrar coleta tanque terra 42 data 15/10/2026 coletado por mim']) {
    const r = interpretar(f);
    assert.equal(r.tipo, 'coleta_terra', f);
    assert.equal(r.coletadoPor, '', f);
    assert.ok(r.itensColeta.every((i) => i.responsavel === 'Usuario Teste'), f);
    assert.match(r.textoResposta, /efetuado com sucesso por Usuario Teste\./, f);
  }
});

test('nome inválido é recusado e nada é gravado', () => {
  for (const nome of ['J0yce99', 'Joyce; DROP TABLE', "x'--", "'Joyce", 'Jo--yce', 'a'.repeat(50)]) {
    const r = interpretar('registrar coleta tanque terra 42 data 15/10/2026 coletado por ' + nome);
    assert.equal(r.tipo, 'erro_coleta', nome);
    assert.match(r.textoResposta, /Não entendi o nome de quem coletou/, nome);
  }
});

test('Consultor continua sem poder registrar, com ou sem "coletado por"', () => {
  assert.match(interpretar('registrar coleta tanque terra 42 data 15/10/2026 coletado por Joyce', { cargo: 'Consultor' }).textoResposta, /somente de consulta/);
});

test('IA: coletado_por entra no comando oficial; null, mim ou eu não entram', () => {
  assert.equal(validar({ intencao: 'coleta_terra', tanques: ['42'], data: '15/10/2026', coletado_por: 'Joyce' }).comando_ia,
    'registrar coleta tanque terra 42 data 15/10/2026 coletado por Joyce');
  assert.equal(validar({ intencao: 'coleta_navio', tanques: ['1C'], navio: 'O.SKY 123', data: '15/10/2026', coletado_por: 'Carlos' }).comando_ia,
    'Coleta navio O.SKY 123 tanques 1C data 15/10/2026 coletado por Carlos');
  for (const por of [null, '', 'mim', 'eu', 'me']) {
    assert.equal(validar({ intencao: 'coleta_terra', tanques: ['42'], data: '15/10/2026', coletado_por: por }).comando_ia,
      'registrar coleta tanque terra 42 data 15/10/2026', String(por));
  }
  assert.match(validar({ intencao: 'coleta_terra', tanques: ['42'], data: '15/10/2026', coletado_por: 'J0yce; DROP' }).textoResposta, /Não entendi o nome de quem coletou/);
  // o comando que a IA monta é aceito pelo bot
  const ia = validar({ intencao: 'coleta_terra', tanques: ['42'], data: '15/10/2026', coletado_por: 'Joyce' }).comando_ia;
  assert.equal(interpretar(ia, { reenvio: true }).coletadoPor, 'Joyce');
});

test('IA: o prompt ensina as variações e que "eu coletei" não leva nome', () => {
  const p = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments[0].value;
  assert.match(p, /"coletado_por"/);
  assert.match(p, /coletado por Joyce.*coletado pela Joyce.*a Joyce coletou.*foi coletado pelo Carlos/s);
  assert.match(p, /"eu coletei", "coletei", "coletamos", "coletado por mim"/);
  assert.match(p, /tanque 42 coletado por Joyce data 15\/10\/2026/);
  assert.match(p, /"coletado_por": null/);
});

test('banco: grava coletado_por (vazio vira nulo) e as consultas mostram quem coletou', () => {
  const no = (nome) => workflow.nodes.find((n) => n.name === nome).parameters;
  const terra = no('BD · Gravar coleta terra');
  assert.match(terra.query, /INSERT INTO coletas \(origem, tanque, data_coleta, registrado_por, coletado_por\)/);
  assert.match(terra.query, /NULLIF\(trim\(\$4::text\), ''\)/);
  assert.match(terra.options.queryReplacement, /\$json\.coletadoPor \|\| ""/);
  const navio = no('BD · Gravar coleta navio');
  assert.match(navio.query, /registrado_por, coletado_por\)/);
  assert.match(navio.query, /NULLIF\(trim\(\$5::text\), ''\)/);
  assert.match(navio.options.queryReplacement, /\$json\.navio, \$json\._numeroRemetenteLimpo, \$json\.coletadoPor \|\| ""/);
  for (const n of ['BD · Coleta terra já existe?', 'BD · Coleta navio já existe?']) assert.match(no(n).query, /COALESCE\(c\.coletado_por, u\.nome\) AS responsavel/, n);
  assert.match(no('BD · Quem coletou').query, /COALESCE\(c\.coletado_por, u\.nome\) AS quem/);
});

test('migration 028: coluna, limite de tamanho e painel com quem coletou e quem digitou', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '028_coletado_por.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS coletado_por text/);
  assert.match(sql, /BETWEEN 1 AND 40/);
  assert.match(sql, /COALESCE\(c\.coletado_por, u\.nome\) AS registrado_por/);
  assert.match(sql, /u\.nome AS digitado_por/);
});