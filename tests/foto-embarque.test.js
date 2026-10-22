'use strict';

// Foto do laudo de EMBARQUE (FCOJ): vira o comando `embarque navio ... linha .. fase .. load .. item .. amostras ..`.
// Os resultados de C.T/B.L por amostra ainda não são lidos. Respostas da IA SIMULADAS (nenhuma foto no repositório).
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode } = require('./helpers/executar-node');

const ctx = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', hoje: '14/10/2026', legenda: '' };
function rodar(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: ctx }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}
const ler = (obj) => rodar('Foto · Interpretar', { content: { parts: [{ text: JSON.stringify(obj) }] }, provedor: 'gemini' })[0].json;
const resposta = (d) => rodar('Foto · Montar resposta', [{}], { 'Foto · Interpretar': d })[0].json;

// o que a IA devolveria para as duas fotos de exemplo (valores lidos do papel)
const FOTO1 = { formulario: 'embarque', navio: 'O.Star', viagem: '112', data: '28/08/2026', duvidas: [],
  blocos: [{ linha: '7', fase: '1', load: '43412', item: '2648', amostras: [1, 2, 3], data: '28.08.26' }] };
const FOTO2 = { formulario: 'embarque', navio: 'O.STAR', viagem: '112', data: '28/08/2026', duvidas: ['load da 3ª linha ilegível (434?1)'],
  blocos: [
    { linha: '4', fase: '1', load: '43339', item: '2540', amostras: [1, 2, 3], data: '28.08.26' },
    { linha: '4', fase: '2', load: '43340', item: '2540', amostras: [1, 2, 3], data: '28.08.26' },
    { linha: '7', fase: '2', load: null, item: '2648', amostras: [2, 3, 1], data: '28.08.26' },
  ] };

test('embarque: uma linha do papel vira o comando oficial, com navio e viagem juntos e data como dd/mm/aaaa', () => {
  const r = ler(FOTO1);
  assert.equal(r.formulario, 'embarque');
  assert.equal(r.navio, 'O.STAR 112');
  assert.deepEqual(r.comandos.map((c) => c.texto), ['Embarque navio O.STAR 112 linha 7 fase 1 load 43412 item 2648 amostras 1-3 data 28/08/2026']);
  const c = interpretar(r.comandos[0].texto, { reenvio: true });
  assert.equal(c.tipo, 'embarque');
  assert.deepEqual([c.navio, c.linha, c.fase, c.load, c.item, c.dataEmbarque], ['O.STAR 112', '7', '1', '43412', '2648', '28/08/2026']);
  assert.deepEqual(c.amostras, [1, 2, 3]);
});

test('embarque: várias linhas, amostras fora de ordem e a linha com load ilegível fica de fora com aviso', () => {
  const r = ler(FOTO2);
  assert.deepEqual(r.comandos.map((c) => `${c.linha}/${c.fase} ${c.load}`), ['4/1 43339', '4/2 43340']);
  assert.ok(r.problemas.some((p) => /linha 7 fase 2: não li o número do load/.test(p)));
  assert.ok(r.duvidas.some((d) => /ilegível/.test(d)));
  const fora = ler({ ...FOTO2, blocos: [{ linha: '7', fase: '2', load: '43411', item: '2648', amostras: [2, 3, 1], data: '28/08/2026' }] });
  assert.match(fora.comandos[0].texto, /amostras 1-3 /, 'A2, A3, A1 viram 1-3');
});

test('embarque: navio sem a viagem no nome, "Orange Star" e viagem já dentro do navio', () => {
  assert.equal(ler({ ...FOTO1, navio: 'Orange Star', viagem: '112' }).navio, 'O.STAR 112');
  assert.equal(ler({ ...FOTO1, navio: 'O.STAR 112', viagem: null }).navio, 'O.STAR 112');
  assert.equal(ler({ ...FOTO1, navio: 'O. Star', viagem: '112' }).navio, 'O.STAR 112');
});

test('embarque: sem navio e viagem, ou sem item, não grava nada', () => {
  const semNavio = ler({ ...FOTO1, navio: null, viagem: null });
  assert.equal(semNavio.falha, true);
  assert.match(semNavio.textoResposta, /não entendi o navio e a viagem/);
  const semItem = ler({ ...FOTO1, blocos: [{ ...FOTO1.blocos[0], item: null }] });
  assert.equal(semItem.falha, true);
  assert.match(semItem.textoResposta, /load 43412: não li o item/);
  assert.match(semItem.textoResposta, /Nada foi gravado/);
});

test('embarque: sem data na linha usa a data do papel; sem nenhuma, vale a de hoje e avisa', () => {
  const herdada = ler({ ...FOTO1, blocos: [{ ...FOTO1.blocos[0], data: null }] });
  assert.match(herdada.comandos[0].texto, / data 28\/08\/2026$/);
  const nenhuma = ler({ ...FOTO1, data: null, blocos: [{ ...FOTO1.blocos[0], data: null }] });
  assert.doesNotMatch(nenhuma.comandos[0].texto, / data /);
  assert.ok(nenhuma.duvidas.some((d) => /sem a data da análise, vale a de hoje/.test(d)));
});

test('embarque: a confirmação explica linha por linha e lembra que a foto não cria composta', () => {
  const r = resposta(ler({ ...FOTO2, blocos: [FOTO2.blocos[0], FOTO2.blocos[1]] }));
  assert.equal(r.salvar, '1');
  assert.match(r.textoResposta, /^📷 Embarque( de 28\/08\/2026)?:/);
  assert.doesNotMatch(r.textoResposta, /1️⃣|Embarque navio O\.STAR/, 'a lista de comandos não aparece');
  assert.match(r.textoResposta, /🚢 O\.STAR 112:/);
  assert.match(r.textoResposta, /• linha 4 fase 1: load 43339 \(item 2540\), amostras A1-A3/);
  assert.match(r.textoResposta, /• linha 4 fase 2: load 43340 \(item 2540\), amostras A1-A3/);
  assert.doesNotMatch(r.textoResposta, /a foto não cria/, 'sem regras no texto');
  assert.match(r.textoResposta, /Responda \*sim\* para registrar tudo, na ordem/);
  assert.equal(JSON.parse(r.payload).comandos.length, 2);
});

test('embarque: o prompt conhece o formulário e o item da Observação', () => {
  const [{ json }] = rodar('Foto · Montar pedido', {}, { 'Foto em arquivo': { foto_b64: 'QUJD', mime: 'image/jpeg' } });
  const p = json.pedido.contents[0].parts[0].text;
  assert.match(p, /"embarque": "Laudo de Análises Microbiológicas – Embarque"/);
  assert.match(p, /"Item: 2648" = 2648/);
  assert.match(p, /Linha\/Fase "7 1" = linha 7, fase 1/);
  assert.match(p, /A1, A2, A3 = \[1,2,3\]/);
});
