'use strict';

// Testa o jsCode REAL do node "Validar resposta da IA" com respostas simuladas do
// Gemini (sem chamar o modelo): o que vai direto, o que pede "sim" e o que e recusado.
// E confere que cada formato do catalogo da IA (tests/catalogo-ia.js) e aceito pela
// regex do node "Interpretar comando": se a IA gerar um formato oficial, o bot entende.

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode } = require('./helpers/executar-node');
const CATALOGO = require('./catalogo-ia');

const CODIGO = codigoDoNode('Validar resposta da IA');

// Roda o node com a resposta do Gemini `ia` (objeto) para um usuario com `cargo`.
function validar(ia, { cargo = 'Admin', mensagem = 'mensagem livre' } = {}) {
  const principal = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', nivelAtual: cargo, mensagem_original: mensagem };
  const resposta = { content: { parts: [{ text: JSON.stringify(ia) }] } };
  const $ = (nome) => {
    assert.equal(nome, 'Interpretar comando');
    return { first: () => ({ json: principal }) };
  };
  const $input = { first: () => ({ json: resposta }) };
  return new Function('$', '$input', CODIGO)($, $input)[0].json;
}

test('catalogo da IA: cada formato oficial e reconhecido pela regex', async (t) => {
  for (const [comando, tipo] of CATALOGO) {
    await t.test(`${tipo} <- ${comando}`, () => {
      assert.equal(interpretar(comando).tipo, tipo);
    });
  }
});

test('catalogo da IA: consulta e pede_sim voltam direto; grava pede "sim" antes', async (t) => {
  for (const [comando, , classe] of CATALOGO) {
    await t.test(`${classe} <- ${comando}`, () => {
      const r = validar({ intencao: 'comando', comando });
      if (classe === 'grava') {
        assert.equal(r.comando_ia, comando);
        assert.equal(r.reenviarComando, '');
        assert.match(r.textoResposta, /Entendi:[\s\S]*sim/);
      } else {
        assert.equal(r.comando_ia, null);
        assert.equal(r.reenviarComando, comando);
      }
    });
  }
});

test('ia: Consultor so consulta pelo caminho da IA', () => {
  assert.equal(validar({ intencao: 'comando', comando: 'quais tabs tenho para ler hoje?' }, { cargo: 'Consultor' }).reenviarComando,
    'quais tabs tenho para ler hoje?');
  for (const comando of ['recebimento load 77001 item 444 fabrica AQA lotes 1-14', 'leitura do dia finalizada', 'drop d5 do tanque 45 data 30/09/2026 não ok']) {
    const r = validar({ intencao: 'comando', comando }, { cargo: 'Consultor' });
    assert.equal(r.reenviarComando, '', comando);
    assert.equal(r.comando_ia, null, comando);
    assert.match(r.textoResposta, /somente de consulta/, comando);
  }
});

test('ia: comando fora do catalogo e recusado (a IA nao inventa formato)', () => {
  for (const comando of ['apagar todas as coletas', 'DROP TABLE usuarios', '', null]) {
    const r = validar({ intencao: 'comando', comando });
    assert.equal(r.reenviarComando, '');
    assert.equal(r.comando_ia, null);
    assert.match(r.textoResposta, /Não consegui transformar/);
  }
});

test('ia: dado faltando vira pergunta, sem gravar nada', () => {
  const r = validar({ intencao: 'incompleto', falta: 'o item e a fábrica do load' });
  assert.equal(r.comando_ia, null);
  assert.equal(r.reenviarComando, '');
  assert.match(r.textoResposta, /Faltou o item e a fábrica do load/);
});

test('ia: intencoes antigas continuam como antes (coleta pede sim, consulta vai direto)', () => {
  const coleta = validar({ intencao: 'coleta_terra', tanques: ['42'], data: '30/09/2026' });
  assert.equal(coleta.comando_ia, 'registrar coleta tanque terra 42 data 30/09/2026');
  assert.equal(validar({ intencao: 'consulta_drops' }).reenviarComando, 'drops para hoje');
});
