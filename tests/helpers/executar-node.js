'use strict';

// Executa o jsCode REAL de um Code node do LabFlow.json fora do n8n.
// Simula so o que o node usa do n8n: $('Webhook WhatsApp') e $input.

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');

// Por padrao testa o LabFlow.json (publico). Para testar outro arquivo, por exemplo
// o de importacao antes de subir no n8n:  $env:LABFLOW_JSON='LabFlow_importar_n8n.json'; npm test
const ARQUIVO = path.resolve(RAIZ, process.env.LABFLOW_JSON || 'LabFlow.json');
const workflow = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));

function codigoDoNode(nome) {
  const node = workflow.nodes.find((n) => n.name === nome);
  if (!node || !node.parameters || typeof node.parameters.jsCode !== 'string') {
    throw new Error(`Code node nao encontrado no LabFlow.json: ${nome}`);
  }
  return node.parameters.jsCode;
}

const NUMERO_PADRAO = '5511900000001';

// Roda o node "Interpretar comando" para uma mensagem de WhatsApp.
// Retorna o json do primeiro item de saida (ou null se o node descartou a mensagem).
function interpretar(texto, opcoes = {}) {
  const {
    cargo = 'Admin',
    numero = NUMERO_PADRAO,
    nome = 'Usuario Teste',
    cadastrado = true,
    reenvio = false,
  } = opcoes;

  const webhook = {
    body: {
      data: {
        key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false },
        pushName: nome,
        message: { conversation: texto },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
      ...(reenvio ? { labflowReenvio: true } : {}),
    },
  };

  const usuarios = cadastrado ? [{ Numero: numero, Nome: nome, Nivel: cargo }] : [];

  const $ = (nomeDoNode) => {
    if (nomeDoNode !== 'Webhook WhatsApp') {
      throw new Error(`O teste nao simula o node: ${nomeDoNode}`);
    }
    return { first: () => ({ json: webhook }) };
  };
  const $input = { all: () => usuarios.map((json) => ({ json })) };

  const executar = new Function('$', '$input', codigoDoNode('Interpretar comando'));
  const saida = executar($, $input);
  return Array.isArray(saida) && saida.length > 0 ? saida[0].json : null;
}

module.exports = { interpretar, codigoDoNode, workflow };
