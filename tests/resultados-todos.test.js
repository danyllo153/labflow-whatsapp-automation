'use strict';

// "Todos" de uma vez: C.T / B.L em todos os lotes (recebimento), amostras (embarque) e lotes do NFC que saem hoje
// (ou na data) e ainda não têm resultado, com "exceto"; "todos os tanques" sem crescimento (<1 nas 3 placas) com as
// exceções; e a leitura antecipada no comando de placas. As linhas do banco são simuladas. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode } = require('./helpers/executar-node');

const hojeSP = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
function rodar(nome, linhas, item) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: item }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = linhas.map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens })[0].json;
}

// ---------- concentrado e embarque: o comando ----------
test('comando: "todos" do recebimento, com data, exceto com valor e exceto sem valor', () => {
  const a = interpretar('bl72 load 44502 todos deu <10 exceto lote 3 deu 20');
  assert.deepEqual([a.tipo, a.analise, a.origem, a.load], ['contagem_registrar', 'BL72', 'recebimento', '44502']);
  assert.deepEqual(a.todos, { sinal: '<', valor: 10, data: hojeSP(), dataTxt: '' });
  assert.deepEqual(a.grupos, [{ numeros: [3], sinal: '=', valor: 20 }]);
  assert.deepEqual(a.numeros, [3]);
  assert.deepEqual(a.excluidos, []);
  const b = interpretar('Bl72 recebimento load 44502, todos os lotes que saem hoje deram menor que 10, exceto lote 3 e lotes 5-6 deu 30');
  assert.equal(b.tipo, 'contagem_registrar', 'aceita "recebimento", "os lotes que saem hoje" e "menor que"');
  assert.deepEqual(b.todos.sinal + b.todos.valor, '<10');
  assert.deepEqual(b.excluidos, [3]);
  assert.deepEqual(b.grupos, [{ numeros: [5, 6], sinal: '=', valor: 30 }]);
  const c = interpretar('ct load 44502 item 444 todos de 14/10/2026 deu <10 exceto lote 3');
  assert.deepEqual([c.item, c.todos.data, c.grupos.length, c.excluidos], ['444', '14/10/2026', 0, [3]]);
  assert.equal(interpretar('bl load 44502 todos deu 0').analise, 'BL120', '"bl" sozinho vale B.L 120h');
});

test('comando: "todas" do embarque (amostras, com A) e o comando antigo com "recebimento"', () => {
  const e = interpretar('bl120 navio O.SKY 189 linha 6 fase 1 todas deu <10 exceto amostra A3 deu 20');
  assert.deepEqual([e.tipo, e.origem, e.navio, e.linha, e.fase], ['contagem_registrar', 'embarque', 'O.SKY 189', '6', '1']);
  assert.deepEqual(e.grupos, [{ numeros: [3], sinal: '=', valor: 20 }]);
  const v = interpretar('bl72 recebimento load 77001 lotes 1-14 deu <10');
  assert.deepEqual([v.tipo, v.load, v.todos], ['contagem_registrar', '77001', undefined], 'o comando de sempre também aceita "recebimento"');
});

test('comando: recusas do "todos" (sem resultado, data inválida, número repetido, Consultor)', () => {
  assert.match(interpretar('bl72 load 44502 todos').textoResposta, /Diga o resultado do "todos"/);
  assert.match(interpretar('bl72 load 44502 todos de 31/02 deu <10').textoResposta, /Data inválida/);
  assert.match(interpretar('bl72 load 44502 todos deu <10 exceto lote 3 deu 20, lote 3 deu 30').textoResposta, /aparece mais de uma vez/);
  assert.match(interpretar('bl72 load 44502 todos deu <10 pra mim').textoResposta, /Não entendi "pra mim"/);
  assert.match(interpretar('bl72 load 44502 todos deu <10', { cargo: 'Consultor' }).textoResposta, /somente de consulta/);
});

// ---------- concentrado e embarque: a confirmação ----------
const linha = (numero, extra = {}) => ({ loads_encontrados: 1, embarques_encontrados: 0, numero, via_todos: false, alvo_id: 500 + numero, tipo: 'lote', atual: null, ...extra });
const perguntaCt = (frase, linhas) => rodar('Montar pergunta contagens', linhas, interpretar(frase));

test('confirmação: os lotes do "todos" e a exceção, um só sim', () => {
  const r = perguntaCt('bl72 load 44502 todos deu <10 exceto lote 3 deu 20',
    [linha(1, { via_todos: true }), linha(2, { via_todos: true }), linha(3), linha(4, { via_todos: true }), linha(5, { via_todos: true })]);
  assert.equal(r.salvar, true);
  assert.match(r.textoResposta, /lotes 1-2,4-5 = <10 \(todos de \d{2}\/\d{2}\/\d{4} sem resultado\)/);
  assert.match(r.textoResposta, /lote 3 = 20/);
  const p = JSON.parse(r.payload);
  assert.equal(p.acao, 'contagem');
  assert.deepEqual(p.itens.map((i) => [i.id, i.sinal, i.valor]), [[501, '<', 10], [502, '<', 10], [504, '<', 10], [505, '<', 10], [503, '=', 20]]);
});

test('confirmação: "todos" sem nada para a data avisa e não grava; com exceção grava só ela', () => {
  const vazio = perguntaCt('bl72 load 44502 todos deu <10', [{ loads_encontrados: 1, embarques_encontrados: 0, numero: null }]);
  assert.equal(vazio.salvar, false);
  assert.match(vazio.textoResposta, /Nenhum lote de load 44502 com B\.L 72h para \d{2}\/\d{2}\/\d{4} sem resultado\. Nada foi gravado/);
  const naoAchou = perguntaCt('bl72 load 44502 todos deu <10', [{ loads_encontrados: 0, embarques_encontrados: 0, numero: null }]);
  assert.match(naoAchou.textoResposta, /Load 44502 não encontrado/);
  const so = perguntaCt('bl72 load 44502 todos deu <10 exceto lote 3 deu 20, lote 4', [linha(3)]);
  assert.equal(so.salvar, true);
  assert.match(so.textoResposta, /Nenhum outro lote com B\.L 72h/);
  assert.match(so.textoResposta, /Fora do "todos": lote 4/);
  assert.equal(JSON.parse(so.payload).itens.length, 1);
});

test('confirmação: embarque usa A nas amostras e o alarme continua', () => {
  const r = perguntaCt('ct navio O.SKY 189 linha 6 fase 1 todas deu 300',
    [1, 2].map((n) => linha(n, { loads_encontrados: 0, embarques_encontrados: 1, via_todos: true, tipo: 'amostra' })));
  assert.match(r.textoResposta, /amostras A1-A2 = 300/);
  assert.match(r.textoResposta, /🚨 Acima do limite \(C\.T ≥ 200\)/);
});

// ---------- NFC recebido ----------
test('NFC: comando "todos" com exceção por tipo e o lote de fora nos dois tipos', () => {
  const a = interpretar('ct nfc load 44300 todos deu <10 exceto lote 10 past deu 14, lote 11');
  assert.deepEqual([a.tipo, a.analise, a.load], ['contagem_nfc_registrar', 'CT', '44300']);
  assert.deepEqual(a.grupos, [{ lotes: [10], amostra: 'past', sinal: '=', valor: 14 }]);
  assert.deepEqual(a.pedidos, [{ lote: 10, amostra: 'past' }]);
  assert.deepEqual(a.excluidos, [{ lote: 11, amostra: '' }]);
  assert.equal(interpretar('bl72 load 44300 item 129 todos deu <10').tipo, 'contagem_nfc_registrar');
  assert.match(interpretar('ct nfc load 44300 todos deu <10 exceto lote 10 deu 14').textoResposta, /diga o tipo do lote 10 \(past ou fresh\)/);
});

test('NFC: a confirmação multiplica pela diluição de cada lote do "todos"', () => {
  const lin = (lote, amostra, dil, extra = {}) => ({ loads_encontrados: 1, lote, amostra, via_todos: true, alvo_id: 700 + lote, diluicao: dil, atual: null, ...extra });
  const r = rodar('Montar pergunta contagens NFC', [lin(10, 'past', 1), lin(12, 'fresh', 3), lin(11, 'past', 1, { via_todos: false })],
    interpretar('bl72 nfc load 44300 todos deu 2 exceto lote 11 past deu 5'));
  assert.match(r.textoResposta, /lote 10 · past · 10\^1: 2 × 10\^1 = 20/);
  assert.match(r.textoResposta, /lote 12 · fresh · 10\^3: 2 × 10\^3 = 2000/);
  assert.match(r.textoResposta, /lote 11 · past · 10\^1: 5 × 10\^1 = 50/);
  assert.match(r.textoResposta, /Todos de \d{2}\/\d{2}\/\d{4} sem resultado: 2 lotes/);
  assert.deepEqual(JSON.parse(r.payload).itens.map((i) => i.valor), [20, 2000, 50]);
  const vazio = rodar('Montar pergunta contagens NFC', [{ loads_encontrados: 1, lote: null }], interpretar('ct nfc load 44300 todos deu <10'));
  assert.equal(vazio.salvar, false);
  assert.match(vazio.textoResposta, /Nenhum lote do NFC load 44300 com C\.T 48h/);
});

// ---------- tanques: o comando ----------
test('tanques: "todos os tanques" de navio e de terra, com data e exceções', () => {
  const a = interpretar('bl todos os tanques navio O.SKY 123 deu <1');
  assert.deepEqual([a.tipo, a.sub, a.etapa, a.navio, a.origem, a.data], ['placas_todos', 'BL', 'final', 'O.SKY 123', 'navio', hojeSP()]);
  assert.deepEqual(a.excecoes, []);
  const b = interpretar('bl72 todos os tanques terra que saem hoje deu <1 exceto tanque 47 normal <1,1,0 e tanque 48');
  assert.deepEqual([b.etapa, b.origem, b.navio], ['pre', 'terra', '']);
  assert.deepEqual(b.excecoes, [
    { tanque: '47', frasco: 'Normal', placas: [{ placa: 1, sinal: '<', valor: 1 }, { placa: 2, sinal: '=', valor: 1 }, { placa: 3, sinal: '<', valor: 1 }] },
    { tanque: '48', frasco: '', placas: null }]);
  const c = interpretar('ct todos os tanques de 17/10/2026 deu 0 exceto tanques 41, 42');
  assert.deepEqual([c.sub, c.origem, c.data, c.excecoes.map((e) => e.tanque)], ['CT', 'terra', '17/10/2026', ['41', '42']]);
  const d = interpretar('wort superficie 240h todos os tanques do navio O.SKY 123 deu sem crescimento exceto tanque 1c stress 0,0,3');
  assert.deepEqual([d.sub, d.metodo, d.etapa, d.navio, d.excecoes[0].tanque], ['WORT', 'Superficie', 'final', 'O.SKY 123', '1C']);
});

test('tanques: recusas (valor com colônia, placas sem frasco, faltou placa, Consultor)', () => {
  assert.match(interpretar('bl todos os tanques terra deu 5').textoResposta, /só vale para sem crescimento/);
  assert.match(interpretar('bl todos os tanques terra').textoResposta, /Diga o resultado: deu <1/);
  assert.match(interpretar('bl todos os tanques terra deu <1 exceto tanque 47 1,0,0').textoResposta, /diga o frasco \(normal ou stress\)/);
  assert.match(interpretar('bl todos os tanques terra deu <1 exceto tanque 47 normal 1,0').textoResposta, /Mande as 3 placas/);
  assert.match(interpretar('bl todos os tanques terra deu <1 exceto tanque 47 normal 1,0,0, tanque 47 normal').textoResposta, /aparece duas vezes/);
  assert.match(interpretar('bl todos os tanques terra deu <1', { cargo: 'Consultor' }).textoResposta, /somente de consulta/);
});

// ---------- tanques: a confirmação ----------
const leitura = (id, tanque, frasco, extra = {}) => ({ navios_encontrados: 0, analise_id: id, tanque, frasco, data_coleta: '13/10/2026',
  repeticao: false, limite: 10, ja_lidas: 0, tem_desvio: false, ...extra });
const perguntaTanques = (frase, linhas) => rodar('Montar pergunta placas todos', linhas, interpretar(frase));

test('tanques: <1 nas 3 placas de cada leitura sem placas; exceção não ok volta com o comando pronto', () => {
  const r = perguntaTanques('bl72 todos os tanques terra deu <1 exceto tanque 47 normal 0,30,2, tanque 48',
    [leitura(1, '41', 'Normal'), leitura(2, '41', 'Stress'), leitura(3, '47', 'Normal'), leitura(4, '47', 'Stress'),
      leitura(5, '48', 'Normal'), leitura(6, '48', 'Stress'), leitura(7, '49', 'Normal', { ja_lidas: 3 })]);
  assert.equal(r.salvar, true);
  assert.equal(r.tipoPendencia, 'PLACAS');
  assert.match(r.textoResposta, /<1 nas 3 placas \(3 leituras\): 41 normal, 41 stress, 47 stress/);
  assert.match(r.textoResposta, /47 normal: <1, 30, 2 → 🚨 não ok/);
  assert.match(r.textoResposta, /Fora: 48 normal, 48 stress/);
  assert.match(r.textoResposta, /Já tinham placas \(ficam como estão\): 49 normal/);
  assert.match(r.textoResposta, /Não abro desvio sozinho/);
  assert.match(r.resumo, /para abrir o desvio, mande: bl72 do tanque 47 normal <1,30,2 coleta 13\/10\/2026/);
  const p = JSON.parse(r.payload);
  assert.equal(p.acao, 'placas_lote');
  assert.deepEqual(p.itens.map((i) => [i.analise_id, i.etapa, i.placas.map((x) => x.sinal + x.valor).join(',')]),
    [[1, 'pre', '<1,<1,<1'], [2, 'pre', '<1,<1,<1'], [4, 'pre', '<1,<1,<1'], [3, 'pre', '<1,=30,=2']]);
});

test('tanques: navio que não existe, nada para a data, exceção que não sai na data, tudo já lido', () => {
  assert.match(perguntaTanques('bl todos os tanques navio O.SKY 999 deu <1', [{ navios_encontrados: 0, analise_id: null }]).textoResposta, /Navio O\.SKY 999 não encontrado/);
  const nada = perguntaTanques('bl todos os tanques terra deu <1', [{ navios_encontrados: 0, analise_id: null }]);
  assert.equal(nada.salvar, false);
  assert.match(nada.textoResposta, /Nenhuma leitura de B\.L 120h dos tanques de terra/);
  assert.match(perguntaTanques('bl todos os tanques terra deu <1 exceto tanque 50', [leitura(1, '41', 'Normal')]).textoResposta, /O tanque 50 não tem B\.L 120h/);
  const lidas = perguntaTanques('ct todos os tanques terra deu <1', [leitura(1, '41', 'Normal', { ja_lidas: 3 })]);
  assert.equal(lidas.salvar, false);
  assert.match(lidas.textoResposta, /já têm placas/);
  assert.match(lidas.textoResposta, /ct do tanque 41 normal 0,0,1/);
});

test('tanques: leitura de data futura aparece como antecipada', () => {
  const futuro = new Date(Date.now() + 3 * 86400000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const r = perguntaTanques(`bl72 todos os tanques navio O.SKY 123 de ${futuro} deu <1`, [leitura(1, '1C', 'Normal', { navios_encontrados: 1 })]);
  assert.match(r.textoResposta, /leitura de \d{2}\/\d{2}\/\d{4} \(⏩ antecipada\)/);
});

// ---------- leitura antecipada no comando de placas ----------
test('placas: a leitura antes do prazo mostra "antecipada"', () => {
  const r = rodar('Montar pergunta placas', [{ analise_id: 9, data_coleta: '14/10/2026', prevista: '17/10/2026', hoje: false, antecipada: true,
    repeticao: false, limite: 10, ja_lidas: 0, tem_desvio: false, coletas_abertas: 1 }], interpretar('bl72 do tanque 47 normal 0,0,0'));
  assert.equal(r.salvar, true);
  assert.match(r.textoResposta, /⏩ Leitura antecipada: prevista para 17\/10\/2026/);
  const atrasada = rodar('Montar pergunta placas', [{ analise_id: 9, data_coleta: '10/10/2026', prevista: '13/10/2026', hoje: false, antecipada: false,
    repeticao: false, limite: 10, ja_lidas: 0, tem_desvio: false, coletas_abertas: 1 }], interpretar('bl72 do tanque 47 normal 0,0,0'));
  assert.match(atrasada.textoResposta, /ℹ️ Leitura prevista para 13\/10\/2026/);
});

test('IA: o "todos os tanques" pede sim pelo próprio fluxo e o prompt conhece os formatos 37 e 38', () => {
  const { workflow } = require('./helpers/executar-node');
  const prompt = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments[0].value;
  assert.match(prompt, /37\. <ct\|bl72\|bl120> load <load> \[item <item>\] todos/);
  assert.match(prompt, /38\. <ct\|bl72\|bl120\|wort profundidade 120h/);
  assert.match(codigoDoNode('Validar resposta da IA'), /tod\[oa\]s \(os \)\?tanques/);
});
