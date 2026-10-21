'use strict';

// TAB / Coliformes de composta que ainda não existe: só o Admin abre a composta pelo próprio comando.
// O bot pergunta e, no "sim", registra o recebimento dos lotes, cria as compostas e registra o teste
// (a pendência guarda a lista de comandos oficiais, executada em ordem). Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode } = require('./helpers/executar-node');

// Roda o node "Montar resposta TAB feito" com a resposta do banco `r` e o comando `item`.
function montar(r, item) {
  const $ = (nome) => {
    assert.equal(nome, 'Interpretar comando');
    return { first: () => ({ json: item }) };
  };
  const $input = { first: () => ({ json: r }) };
  return new Function('$', '$input', codigoDoNode('Montar resposta TAB feito'))($, $input)[0].json;
}

const FRASE = 'tab feito do load 44300 item 2703 fabrica AQA (1-5)(6-10) data 16/10/2026';

test('o comando de TAB leva a fábrica e o cargo de quem mandou', () => {
  const r = interpretar(FRASE, { cargo: 'Admin' });
  assert.equal(r.tipo, 'tab_feito');
  assert.equal(r.fabrica, 'AQA');
  assert.equal(r.item, '2703');
  assert.deepEqual(r.refGrupos, [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]);
  assert.equal(r._nivelAtual, 'Admin');
  assert.equal(interpretar(FRASE, { cargo: 'Operador' })._nivelAtual, 'Operador');
});

const NADA = { encontradas: 0, nao_achadas: '(1,2,3,4,5) (6,7,8,9,10)', inexistentes: null, ja_tinham: null, criados: null };

test('Admin: composta que não existe vira pergunta com recebimento, compostas e TAB, na ordem', () => {
  const item = interpretar(FRASE, { cargo: 'Admin' });
  const m = montar(NADA, item);
  assert.equal(m.salvar, '1');
  assert.equal(m.tipoPendencia, 'IA');
  assert.deepEqual(JSON.parse(m.payload).comandos, [
    'Recebimento load 44300 item 2703 fabrica AQA lotes 1-10 data 16/10/2026 resultados <10',
    'Compostas do load 44300 item 2703 (1-5)(6-10)',
    'Tab feito do load 44300 item 2703 (1-5)(6-10) data 16/10/2026',
  ]);
  assert.match(m.textoResposta, /ainda não estão abertas/);
  assert.match(m.textoResposta, /Responda \*sim\* ou \*não\*/);
});

test('Admin: só as compostas que faltam são criadas; o TAB vale para todas', () => {
  const item = interpretar(FRASE, { cargo: 'Admin' });
  const m = montar({ ...NADA, encontradas: 1, nao_achadas: '(6,7,8,9,10)' }, item);
  assert.deepEqual(JSON.parse(m.payload).comandos, [
    'Recebimento load 44300 item 2703 fabrica AQA lotes 6-10 data 16/10/2026 resultados <10',
    'Compostas do load 44300 item 2703 (6-10)',
    'Tab feito do load 44300 item 2703 (1-5)(6-10) data 16/10/2026',
  ]);
});

test('Coliformes seguem o mesmo caminho', () => {
  const item = interpretar('coliformes feitos do load 44300 item 2703 fabrica AQA (1-5)', { cargo: 'Admin' });
  const m = montar({ ...NADA, nao_achadas: '(1,2,3,4,5)' }, item);
  const c = JSON.parse(m.payload).comandos;
  assert.match(c[2], /^Coliformes feitos do load 44300 item 2703 \(1-5\)/);
  assert.match(m.textoResposta, /Coliformes no caldo|registro o Coliformes/);
});

test('sem a fábrica ou sem o item, o Admin é orientado e nada é gravado', () => {
  const semFab = montar(NADA, interpretar('tab feito do load 44300 item 2703 (1-5)(6-10)', { cargo: 'Admin' }));
  assert.equal(semFab.salvar, '0');
  assert.match(semFab.textoResposta, /Falta a fábrica/);
  const fabErrada = montar(NADA, interpretar('tab feito do load 44300 item 2703 fabrica XYZ (1-5)', { cargo: 'Admin' }));
  assert.equal(fabErrada.salvar, '0');
  assert.match(fabErrada.textoResposta, /Falta a fábrica/);
  const semItem = montar(NADA, interpretar('tab feito do load 44300 fabrica AQA (1-5)', { cargo: 'Admin' }));
  assert.equal(semItem.salvar, '0');
  assert.match(semItem.textoResposta, /item e a fábrica/);
});

test('Operador não abre composta: continua a recusa de sempre, agora com a dica', () => {
  const item = interpretar(FRASE, { cargo: 'Operador' });
  const m = montar(NADA, item);
  assert.equal(m.salvar, '0');
  assert.match(m.textoResposta, /Não achei composta/);
  assert.match(m.textoResposta, /Só um Admin abre a composta direto/);
});

test('composta que já existe segue o fluxo normal, sem pergunta', () => {
  const item = interpretar(FRASE, { cargo: 'Admin' });
  const m = montar({ encontradas: 2, nao_achadas: null, inexistentes: null, ja_tinham: null, espalhar_em: '21/10/2026',
    criados: [{ id: 10, load: '44300', lotes: [1, 2, 3, 4, 5], rotulo: '', prefixo: '' }, { id: 11, load: '44300', lotes: [6, 7, 8, 9, 10], rotulo: '', prefixo: '' }] }, item);
  assert.equal(m.salvar, '0');
  assert.match(m.textoResposta, /TAB no caldo \(2 compostas\)/);
});

// ---- foto de TAB / Coliformes ----
function rodarFoto(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', hoje: '16/10/2026', legenda: '', ...(vizinhos.ctx || {}) } }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}
const lerFoto = (obj, nivel) => rodarFoto('Foto · Interpretar', { content: { parts: [{ text: JSON.stringify(obj) }] }, provedor: 'gemini' },
  { ctx: { nivelAtual: nivel } })[0].json;
const FOTO_TAB = { formulario: 'tab', data: '15/10/2026', blocos: [{ load: '44300', item: '2703', fabrica: 'AQA', compostas: ['1-5', '6-10'] }] };
const naoAchou = [{ kind: 'composta', idx: 0, composta_id: null }, { kind: 'composta', idx: 1, composta_id: null }];

test('foto de TAB: o comando de cada composta leva a fábrica lida no papel', () => {
  const d = lerFoto(FOTO_TAB, 'Admin');
  assert.equal(d.nivel, 'Admin');
  assert.deepEqual(d.comandos.map((c) => c.fabrica), ['AQA', 'AQA']);
});

test('foto de TAB, Admin: as compostas que não existem entram na lista (recebimento, compostas e TAB)', () => {
  const d = lerFoto(FOTO_TAB, 'Admin');
  const r = rodarFoto('Foto · Montar resposta', naoAchou, { 'Foto · Interpretar': d })[0].json;
  assert.equal(r.salvar, '1');
  const c = JSON.parse(r.payload).comandos;
  assert.equal(c.length, 3);
  assert.match(c[0], /^Recebimento load 44300 item 2703 fabrica AQA lotes 1-10 data 15\/10\/2026 resultados <10$/);
  assert.match(c[1], /^Compostas do load 44300 item 2703 \(1-5\)\(6-10\)$/);
  assert.match(c[2], /^Tab feito do load 44300 item 2703 \(1-5\)\(6-10\) data 15\/10\/2026$/);
  assert.match(r.textoResposta, /Compostas que ainda não existem \(só o Admin abre pelo TAB/);
  // todo comando montado é aceito pelo bot (o "sim" reenvia um por vez)
  c.forEach((x) => assert.notEqual(interpretar(x).tipo, 'interpretar_ia', x));
});

test('foto de TAB, Operador: composta que não existe fica de fora, com a dica de pedir a um Admin', () => {
  const d = lerFoto(FOTO_TAB, 'Operador');
  const r = rodarFoto('Foto · Montar resposta', naoAchou, { 'Foto · Interpretar': d })[0].json;
  assert.equal(r.salvar, '0');
  assert.match(r.textoResposta, /não achei essa composta/);
  assert.match(r.textoResposta, /só um Admin abre a composta direto pelo TAB/);
});

test('foto de TAB, Admin: sem a fábrica no papel não abre a composta e explica', () => {
  const sem = { ...FOTO_TAB, blocos: [{ load: '44300', item: '2703', compostas: ['1-5'] }] };
  const d = lerFoto(sem, 'Admin');
  const r = rodarFoto('Foto · Montar resposta', [{ kind: 'composta', idx: 0, composta_id: null }], { 'Foto · Interpretar': d })[0].json;
  assert.equal(r.salvar, '0');
  assert.match(r.textoResposta, /a foto precisa mostrar a fábrica/);
});

test('foto de Coliformes, Admin: mesmo caminho, com o comando de Coliformes', () => {
  const d = lerFoto({ ...FOTO_TAB, formulario: 'coliformes' }, 'Admin');
  const r = rodarFoto('Foto · Montar resposta', [{ kind: 'coli', idx: 0, composta_id: null }, { kind: 'coli', idx: 1, composta_id: null }], { 'Foto · Interpretar': d })[0].json;
  const c = JSON.parse(r.payload).comandos;
  assert.deepEqual(c, [
    'Recebimento load 44300 item 2703 fabrica AQA lotes 1-10 data 15/10/2026 resultados <10',
    'Compostas do load 44300 item 2703 (1-5)(6-10)',
    'Coliformes da foto: load 44300 item 2703 (1-5) data 15/10/2026 feito ; load 44300 item 2703 (6-10) data 15/10/2026 feito']);
  assert.match(r.textoResposta, /Abrir antes \(só o Admin\)/);
});

test('prompt: "bl" sozinho vale bl120 também nas placas de tanque', () => {
  const { workflow } = require('./helpers/executar-node');
  const prompt = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments.find((a) => a.name === 'prompt').value;
  assert.match(prompt, /"bl" ou "bolor" sem dizer 72 = bl120, em qualquer comando \(inclusive as placas de tanque/);
  assert.match(prompt, /\[fabrica <fabrica>\] \[lotes <lotes>\]/);
});

// ---- recebimento já com os resultados <10 (só Admin) ----
test('recebimento "resultados <10": o Admin registra e o dado vai para a gravação', () => {
  const r = interpretar('Recebimento load 44300 item 2703 fabrica AQA lotes 1-10 data 16/10/2026 resultados <10', { cargo: 'Admin' });
  assert.equal(r.tipo, 'recebimento');
  assert.equal(r.resultadosMenor10, '1');
  assert.deepEqual(r.lotes, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(r.dataRecebimento, '16/10/2026');
  // sem o sufixo nada muda
  assert.equal(interpretar('Recebimento load 44300 item 2703 fabrica AQA lotes 1-10 data 16/10/2026', { cargo: 'Admin' }).resultadosMenor10, '');
});

test('recebimento "resultados <10": Operador é recusado e nada é gravado', () => {
  const r = interpretar('Recebimento load 44300 item 2703 fabrica AQA lotes 1-10 resultados <10', { cargo: 'Operador' });
  assert.equal(r.tipo, 'erro_coleta');
  assert.match(r.textoResposta, /Só um Admin registra o recebimento já com os resultados <10/);
  // o recebimento normal continua liberado para o Operador
  assert.equal(interpretar('Recebimento load 44300 item 2703 fabrica AQA lotes 1-10', { cargo: 'Operador' }).tipo, 'recebimento');
});

test('resposta do recebimento avisa dos resultados <10 gravados', () => {
  const item = { load: '44300', item: '2703', fabrica: 'AQA', nomeContato: 'Admin', dataRecebimento: '16/10/2026', lotes: [1, 2, 3], resultadosMenor10: '1' };
  const $ = () => ({ first: () => ({ json: item }) });
  const montar = (r) => new Function('$', '$input', codigoDoNode('Montar resposta recebimento'))($, { first: () => ({ json: r }) })[0].json;
  assert.match(montar({ novos: [1, 2, 3], resultados_gravados: 9 }).textoResposta, /gravados como <10 \(sem crescimento\): 9 resultados/);
  assert.doesNotMatch(montar({ novos: [], resultados_gravados: 0 }).textoResposta, /gravados como <10/);
});

test('o SQL do recebimento só grava <10 nos lotes novos, sem sobrescrever e só com o sufixo', () => {
  const { workflow } = require('./helpers/executar-node');
  const no = workflow.nodes.find((n) => n.name === 'BD · Gravar recebimento');
  const q = no.parameters.query;
  assert.match(q, /INSERT INTO contagens \(analise, recebimento_lote_id, sinal, valor, lido_por\)/);
  assert.match(q, /VALUES \('CT'\), \('BL72'\), \('BL120'\)/);
  assert.match(q, /RETURNING id, lote\n\), res AS \(/);              // usa o id devolvido pela inserção (a mesma instrução não enxerga as linhas novas)
  assert.match(q, /FROM ins\n  CROSS JOIN \(VALUES \('CT'\)/);          // só os lotes novos
  assert.match(q, /WHERE \$7::text = '1'/);                          // só com o sufixo
  assert.match(q, /ON CONFLICT \(analise, recebimento_lote_id\) DO NOTHING/); // não sobrescreve resultado existente
  assert.match(no.parameters.options.queryReplacement, /\$json\.resultadosMenor10/);
});
