'use strict';

// Mensagem repetida: a Evolution reentrega a mesma mensagem (mesmo key.id) enquanto o fluxo não responde (a foto do
// laudo leva mais de 1 minuto). "BD · Buscar usuários" grava o id (migration 032) e marca _nova = false na reentrega;
// o "Interpretar comando" descarta. Em 16/10/2026 a mesma foto gerou 3 respostas. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

function rodarInterpretar(texto, nova) {
  const webhook = { body: { data: { key: { id: '3A785CB6BF83EA6B4042', remoteJid: '5511900000001@s.whatsapp.net', fromMe: false },
    pushName: 'Usuario Teste', message: { conversation: texto }, messageTimestamp: Math.floor(Date.now() / 1000) } } };
  const usuarios = [{ Numero: '5511900000001', Nome: 'Usuario Teste', Nivel: 'Admin', _nova: nova }];
  const $ = (n) => { assert.equal(n, 'Webhook WhatsApp'); return { first: () => ({ json: webhook }) }; };
  return new Function('$', '$input', codigoDoNode('Interpretar comando'))($, { all: () => usuarios.map((json) => ({ json })) });
}

test('reentrega da mesma mensagem é descartada; a primeira segue normal', () => {
  assert.deepEqual(rodarInterpretar('relatório do dia', false), [], 'a reentrega não roda o fluxo de novo');
  const primeira = rodarInterpretar('relatório do dia', true);
  assert.equal(primeira[0].json.tipo, 'relatorio_dia');
  assert.equal(interpretar('relatório do dia').tipo, 'relatorio_dia', 'sem o campo _nova (como antes) também segue');
});

test('"BD · Buscar usuários" grava o id e não marca o reenvio interno do bot', () => {
  const n = workflow.nodes.find((x) => x.name === 'BD · Buscar usuários');
  assert.match(n.parameters.query, /INSERT INTO mensagens_recebidas \(id\)/);
  assert.match(n.parameters.query, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(n.parameters.query, /AS "_nova"/);
  assert.match(n.parameters.query, /interval '2 days'/, 'apaga os ids antigos');
  assert.match(n.parameters.options.queryReplacement, /labflowReenvio \|\| \$json\.body\.labflowAudio\) \? ""/, 'reenvio interno vem sem id');
  assert.equal(n.alwaysOutputData, true);
});
