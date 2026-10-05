'use strict';

// Testa o jsCode REAL do node "Montar alerta de erro" (LabFlow_Alerta_Erro.json):
// a mensagem que o Admin recebe no WhatsApp quando um ramo do bot falha.

const test = require('node:test');
const assert = require('node:assert/strict');
const { codigoDoNodeEm } = require('./helpers/executar-node');

const CODIGO = codigoDoNodeEm('LabFlow_Alerta_Erro.json', 'Montar alerta de erro');
const ADMINS = ['5511900000001', '5511900000002'];

function erroDoN8n(extra = {}) {
  return {
    workflow: { id: 'abc', name: 'LabFlow (Postgres)' },
    execution: {
      id: '321',
      lastNodeExecuted: 'BD · Gravar coleta terra',
      error: { message: 'connection refused' },
      ...extra,
    },
  };
}

// `memoria` e compartilhada entre chamadas, como o static data do n8n.
function executar({ erro = erroDoN8n(), admins = ADMINS, memoria = {} } = {}) {
  const $ = (nome) => {
    assert.equal(nome, 'Error Trigger', 'o node so deve ler o Error Trigger');
    return { first: () => ({ json: erro }) };
  };
  const $input = { all: () => admins.map((telefone) => ({ json: { telefone } })) };
  const executar = new Function('$', '$input', '$getWorkflowStaticData', CODIGO);
  return executar($, $input, () => memoria) || [];
}

test('alerta: mensagem traz workflow, node, erro, execucao e hora', () => {
  const [item] = executar();
  const texto = item.json.texto;
  assert.match(texto, /^🚨 LabFlow: erro no workflow/);
  assert.match(texto, /Workflow: LabFlow \(Postgres\)/);
  assert.match(texto, /Node: BD · Gravar coleta terra/);
  assert.match(texto, /Erro: connection refused/);
  assert.match(texto, /Execução: 321/);
  assert.match(texto, /Hora: \d{2}\/\d{2}\/\d{4}/);
});

test('alerta: um aviso por Admin, com o telefone so em digitos', () => {
  const saida = executar({ admins: ['+55 (11) 90000-0001', '5511900000002'] });
  assert.deepStrictEqual(saida.map((i) => i.json.numero), ['5511900000001', '5511900000002']);
});

test('alerta: sem Admin cadastrado, nao envia nada', () => {
  assert.deepStrictEqual(executar({ admins: [] }), []);
});

test('alerta: mascara numeros longos que o banco cita no erro (telefone)', () => {
  const erro = erroDoN8n({
    error: { message: 'duplicate key: Key (telefone)=(5511900000001) already exists' },
  });
  const texto = executar({ erro })[0].json.texto;
  assert.doesNotMatch(texto, /\d{8,}/);
  assert.match(texto, /\(\*\*\*\) already exists/);
});

test('alerta: erro muito longo e cortado em 300 caracteres e sem quebras de linha', () => {
  const longo = 'x'.repeat(500);
  const erro = erroDoN8n({ error: { message: `linha 1\nlinha 2 ${longo}` } });
  const linhaErro = executar({ erro })[0].json.texto.split('\n').find((l) => l.startsWith('Erro: '));
  assert.ok(linhaErro.length <= 'Erro: '.length + 300);
  assert.match(linhaErro, /linha 1 linha 2/);
});

test('alerta: erro sem detalhes ainda gera uma mensagem legivel', () => {
  const texto = executar({ erro: { workflow: {}, execution: {} } })[0].json.texto;
  assert.match(texto, /Workflow: desconhecido/);
  assert.match(texto, /Node: desconhecido/);
  assert.match(texto, /Erro: sem mensagem/);
});

test('alerta: usa o node do erro quando nao ha lastNodeExecuted', () => {
  const erro = erroDoN8n({ lastNodeExecuted: undefined, error: { message: 'x', node: { name: 'Zap · Drops de hoje' } } });
  assert.match(executar({ erro })[0].json.texto, /Node: Zap · Drops de hoje/);
});

test('alerta: o mesmo erro no mesmo node so alerta de novo depois de 10 minutos', (t) => {
  const memoria = {};
  let agora = 1_000_000_000_000;
  t.mock.method(Date, 'now', () => agora);

  assert.equal(executar({ memoria }).length, ADMINS.length, '1o erro avisa');

  agora += 60 * 1000; // 1 minuto depois, mesmo erro
  assert.equal(executar({ memoria }).length, 0, 'repeticao dentro da janela nao avisa');

  const outro = erroDoN8n({ lastNodeExecuted: 'Zap · Drops de hoje' });
  assert.equal(executar({ erro: outro, memoria }).length, ADMINS.length, 'node diferente avisa');

  agora += 11 * 60 * 1000; // passou a janela
  assert.equal(executar({ memoria }).length, ADMINS.length, 'depois de 10 min avisa de novo');
});

test('alerta: sem Admin nao consome a janela (o proximo erro ainda pode avisar)', () => {
  const memoria = {};
  assert.deepStrictEqual(executar({ admins: [], memoria }), []);
  assert.equal(executar({ memoria }).length, ADMINS.length);
});
