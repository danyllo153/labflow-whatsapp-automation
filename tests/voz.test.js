'use strict';

// Comando por áudio: o "Interpretar comando" manda o áudio para a transcrição, recusa áudio longo, e o texto
// que volta transcrito (labflowAudio) vai direto para a IA, que sempre pede "sim" antes de gravar.
// Também testa o node "Montar transcrição" (o "🎤 Ouvi"). Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode } = require('./helpers/executar-node');

test('áudio de até 1 minuto vai para a transcrição; mais longo é recusado', () => {
  assert.equal(interpretar('', { audio: 8 }).tipo, 'audio_transcrever');
  assert.equal(interpretar('', { audio: 60 }).tipo, 'audio_transcrever');
  const longo = interpretar('', { audio: 75 });
  assert.equal(longo.tipo, 'erro_coleta');
  assert.match(longo.textoResposta, /muito longo/);
});

test('áudio de quem não é cadastrado é bloqueado antes da transcrição (sem custo de IA)', () => {
  assert.equal(interpretar('', { audio: 8, cadastrado: false }).tipo, 'nao_cadastrado');
});

test('texto transcrito vai direto para a IA, mesmo quando a regex reconheceria', () => {
  for (const frase of ['registrar coleta tanque terra 42,43 data 24/09/2026', 'ct do tanque 47 normal 12,8,15', 'drops para hoje']) {
    const r = interpretar(frase, { transcrito: true });
    assert.equal(r.tipo, 'interpretar_ia', frase);
    assert.equal(r.mensagem_original, frase);
    assert.equal(r.audio, true);
  }
});

test('"sim" e "não" falados confirmam ou cancelam a pendência', () => {
  assert.equal(interpretar('Sim.', { transcrito: true }).tipo, 'confirmar_pendencia');
  assert.equal(interpretar('não', { transcrito: true }).tipo, 'cancelar_pendencia');
});

test('áudio leva a duração para a transcrição', () => {
  assert.equal(interpretar('', { audio: 8 }).segundos, 8);
});

// roda o node "Montar transcrição" com a resposta do Gemini e a duração do áudio
const rodar = (texto, segundos = 10) => new Function('$', '$input', codigoDoNode('Montar transcrição'))(
  () => ({ first: () => ({ json: { segundos } }) }),
  { first: () => ({ json: { content: { parts: [{ text: texto }] } } }) })[0].json;

test('áudio de até 2 s só vale "sim" ou "não" (clique sem querer não vira comando)', () => {
  assert.equal(rodar('Sim.', 1).transcricao, 'Sim.');
  assert.equal(rodar('não', 2).transcricao, 'não');
  const inventado = rodar('coletado tanque 85', 1);
  assert.equal(inventado.transcricao, '');
  assert.match(inventado.textoResposta, /Não entendi o áudio/);
  assert.equal(rodar('coletado tanque 85 data 07/10/2026', 5).transcricao, 'coletado tanque 85 data 07/10/2026');
});

test('transcrição: "🎤 Ouvi" com o texto; vazio pede para repetir', () => {
  const ok = rodar('  "C.T do tanque 47 normal 12, 8 e 15"\n');
  assert.equal(ok.transcricao, 'C.T do tanque 47 normal 12, 8 e 15');
  assert.match(ok.textoResposta, /^🎤 Ouvi: "C.T do tanque 47/);
  for (const vazio of ['VAZIO', '', 'vazio.']) {
    const r = rodar(vazio);
    assert.equal(r.transcricao, '');
    assert.match(r.textoResposta, /Não entendi o áudio/);
  }
});
