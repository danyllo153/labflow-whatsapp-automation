'use strict';

// Fábricas travadas (AQA, CON, COL, UCH, ITA, TMG), navio "Orange X" e tanques de navio por extenso.
// Valem para texto, fala e (depois) foto: o bot nunca cadastra uma fábrica fora das seis.
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar } = require('./helpers/executar-node');

const receb = (fabrica) => interpretar(`recebimento load 77001 item 444 fabrica ${fabrica} lotes 1-4`);

test('fábricas: as seis siglas são aceitas, em maiúscula ou minúscula', () => {
  for (const f of ['AQA', 'CON', 'COL', 'UCH', 'ITA', 'TMG', 'aqa', 'tmg']) {
    const r = receb(f);
    assert.equal(r.tipo, 'recebimento', f);
    assert.equal(r.fabrica, f.toUpperCase());
    assert.equal(r.fabricaLida, '', 'sigla certa não precisa de aviso');
  }
});

test('fábricas: o nome da cidade, escrito ou falado, vira a sigla', () => {
  const casos = [
    ['Araraquara', 'AQA'], ['Conchal', 'CON'], ['Colina', 'COL'], ['Uchoa', 'UCH'], ['Itápolis', 'ITA'], ['Itapolis', 'ITA'],
    ['Terminal Guarujá', 'TMG'], ['terminal do guarujá', 'TMG'], ['Guarujá', 'TMG'],
  ];
  for (const [nome, sigla] of casos) {
    const r = interpretar(`Recebimento load 43699 item 2655 fábrica ${nome} lotes 35 a 38`);
    assert.equal(r.tipo, 'recebimento', nome);
    assert.equal(r.fabrica, sigla, nome);
    assert.deepEqual(r.lotes, [35, 36, 37, 38]);
  }
});

test('fábricas: letra torta vira a sigla parecida e o bot avisa o que leu', () => {
  for (const torta of ['AOQ', 'AOA', 'AKA', 'A0A', 'AQ4']) {
    const r = receb(torta);
    assert.equal(r.tipo, 'recebimento', torta);
    assert.equal(r.fabrica, 'AQA', torta);
    assert.equal(r.fabricaLida, torta, 'guarda o que foi lido para avisar');
  }
  assert.equal(receb('C0N').fabrica, 'CON');
  assert.equal(receb('COI').fabrica, 'COL');
});

test('fábricas: o que não parece nenhuma das seis é recusado, sem cadastrar nada', () => {
  for (const f of ['XYZ', 'BCD', 'CAL', 'ATA', 'Barretos', 'AB']) {
    const r = receb(f);
    assert.equal(r.tipo, 'erro_coleta', f);
    assert.match(r.textoResposta, /não reconhecida/);
    assert.match(r.textoResposta, /AQA \(Araraquara\).*TMG \(Terminal Guarujá\)/, 'lista as seis válidas');
    assert.match(r.textoResposta, /Nada foi gravado/);
    assert.equal(r.load, undefined, 'nada fica preparado para gravar');
  }
});

test('fábricas: o aviso de correção aparece na resposta do recebimento', () => {
  // o node "Montar resposta recebimento" recebe o item do Interpretar
  const { codigoDoNode } = require('./helpers/executar-node');
  const item = interpretar('recebimento load 46699 item 2655 fabrica AOQ lotes 35-38');
  const $ = (n) => ({ first: () => ({ json: item }) });
  const entrada = [{ json: { novos: [35, 36, 37, 38] } }];
  const saida = new Function('$', '$input', codigoDoNode('Montar resposta recebimento'))($, { first: () => entrada[0], all: () => entrada })[0].json;
  assert.match(saida.textoResposta, /fábrica AQA/);
  assert.match(saida.textoResposta, /Li a fábrica como "AOQ" e entendi AQA/);
  const certo = interpretar('recebimento load 46699 item 2655 fabrica AQA lotes 35-38');
  const $2 = () => ({ first: () => ({ json: certo }) });
  const s2 = new Function('$', '$input', codigoDoNode('Montar resposta recebimento'))($2, { first: () => entrada[0], all: () => entrada })[0].json;
  assert.doesNotMatch(s2.textoResposta, /Li a fábrica/);
});

test('fábricas: o áudio do recebimento (Whisper) com cidade por extenso já vira comando pronto', () => {
  const r = interpretar('Recebimento, load, 46,699, fábrica Araraquara, item, 2655, lotes, 35 a 38.', { transcrito: true });
  assert.equal(r.tipo, 'interpretar_ia');
  assert.equal(JSON.parse(r.ia_pronta).comando, 'Recebimento load 46699 item 2655 fábrica AQA lotes 35-38');
});

test('navios: "Orange Sky" vira O.SKY, também com a viagem', () => {
  const r = interpretar('Coleta navio Orange Sky 123 tanques 5,6,7 data 13/10/2026');
  assert.equal(r.tipo, 'coleta_navio');
  assert.equal(r.navio, 'O.SKY 123');
  assert.equal(interpretar('Coleta navio Orange Star 112 tanques 1C data 13/10/2026').navio, 'O.STAR 112');
  assert.equal(interpretar('Coleta navio Orange Blossom 105 tanques 1C data 13/10/2026').navio, 'O.BLOSSOM 105');
  assert.equal(interpretar('Coleta navio O.SKY 123 tanques 5 data 13/10/2026').navio, 'O.SKY 123', 'já certo passa igual');
});

test('tanques de navio: center vira C, port ou PS vira P, starboard vira S', () => {
  const r = interpretar('Coleta navio Orange Sky 123 tanques 1 center, 2 port, 3 starboard, 4PS, 5S, 6 central data 13/10/2026');
  assert.equal(r.tipo, 'coleta_navio');
  assert.deepEqual(r.tanques, ['1C', '2P', '3S', '4P', '5S', '6C']);
  const falado = interpretar('Coleta navio Orange Sky 123 tanques 1 center e 2 port data 13/10/2026');
  assert.deepEqual(falado.tanques, ['1C', '2P']);
});

test('tanques de navio: número de tanque de terra e frases comuns não são mexidos', () => {
  const t = interpretar('registrar coleta tanque terra 42,43 data 24/09/2026');
  assert.equal(t.tipo, 'coleta_terra');
  assert.deepEqual(t.tanques, ['42', '43']);
  const c = interpretar('Coleta navio O.SKY 123 tanques 1C,4P data 24/09/2026');
  assert.deepEqual(c.tanques, ['1C', '4P']);
});

test('a IA recebe a lista das seis fábricas e o exemplo usa uma sigla válida', () => {
  const { workflow } = require('./helpers/executar-node');
  const n = workflow.nodes.find((x) => x.name === 'IA · Montar pedido');
  const prompt = n.parameters.assignments.assignments[0].value;
  assert.match(prompt, /Fábricas válidas \(escreva sempre a sigla\): AQA \(Araraquara\), CON \(Conchal\), COL \(Colina\), UCH \(Uchoa\), ITA \(Itápolis\), TMG \(Terminal Guarujá\)/);
  assert.match(prompt, /Orange Sky" escreve-se O\.SKY/);
  assert.doesNotMatch(prompt, /BCD/, 'o exemplo antigo usava uma fábrica que agora é recusada');
});
