'use strict';

// Foto do laudo de NFC: resultados das placas (triplicata) de vários tanques gravados com UM sim.
// Não abre desvio sozinho: lista os não ok com o comando pronto. Respostas da IA SIMULADAS (nenhuma foto no repositório).
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

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
const resposta = (d, linhas) => rodar('Foto · Montar resposta', linhas, { 'Foto · Interpretar': d })[0].json;

const celulas = (extra = {}) => ({ ct: ['<1', '<1', '1'], bl120: ['<1', '<1', '<1'], wort_prof_240: ['<1', '<1', '<1'], wort_sup_240: ['<1', '<1', '<1'], ...extra });
const LAUDO = (blocoExtra = {}, tanques) => ({
  formulario: 'nfc', data: '31/08/2026', duvidas: [],
  blocos: [{ navio: 'O.Star 112', coleta: '30.08.26', tanques: tanques || [
    { tanque: '1C', normal: celulas(), stress: celulas() },
    { tanque: '2P', normal: celulas({ ct: '11<1' }), stress: celulas({ ct: ['3', '9', '2'] }) },
  ], ...blocoExtra }],
});

test('NFC: lê navio, coleta e as 4 colunas de cada frasco, com as placas como o bot grava', () => {
  const r = ler(LAUDO());
  assert.equal(r.formulario, 'nfc');
  assert.equal(r.nfc.blocos[0].navio, 'O.STAR 112');
  assert.equal(r.nfc.blocos[0].coleta, '30/08/2026', '30.08.26 vira dd/mm/aaaa');
  assert.equal(r.nfc.itens.length, 16, '2 tanques x 2 frascos x 4 análises');
  const ct1c = r.nfc.itens.find((i) => i.tanque === '1C' && i.frasco === 'Normal' && i.col === 'ct');
  assert.deepEqual(ct1c.placas, [{ placa: 1, sinal: '<', valor: 1 }, { placa: 2, sinal: '<', valor: 1 }, { placa: 3, sinal: '=', valor: 1 }]);
  assert.deepEqual([ct1c.sub, ct1c.metodo, ct1c.etapa], ['CT', 'Profundidade', 'final']);
  const wp = r.nfc.itens.find((i) => i.col === 'wort_prof_240');
  assert.deepEqual([wp.sub, wp.metodo, wp.etapa], ['WORT', 'Profundidade', 'final']);
  const ws = r.nfc.itens.find((i) => i.col === 'wort_sup_240');
  assert.equal(ws.metodo, 'Superficie');
  assert.equal(r.buscasPlacas.length, 16);
  assert.deepEqual(Object.keys(r.buscasPlacas[0]).sort(), ['coleta', 'etapa', 'frasco', 'idx', 'metodo', 'navio', 'sub', 'tanque']);
});

test('NFC: número colado só vale quando dá exatamente 3 placas; senão fica de fora com o texto lido', () => {
  const r = ler(LAUDO({}, [{ tanque: '2P', normal: celulas({ ct: '11<1', bl120: '954', wort_prof_240: '<1<1<1' }), stress: celulas({ ct: '12105', bl120: '>300>300>300' }) }]));
  const pega = (frasco, col) => r.nfc.itens.find((i) => i.frasco === frasco && i.col === col);
  assert.deepEqual(pega('Normal', 'ct').placas.map((p) => p.valor), [1, 1, 1]);
  assert.deepEqual(pega('Normal', 'ct').placas.map((p) => p.sinal), ['=', '=', '<']);
  assert.deepEqual(pega('Normal', 'bl120').placas.map((p) => p.valor), [9, 5, 4]);
  assert.equal(pega('Stress', 'ct'), undefined, '12105 não dá para separar');
  assert.equal(pega('Stress', 'bl120'), undefined, '">" colado também não');
  assert.deepEqual(r.nfc.excluidos.map((e) => [e.frasco, e.col, e.escrito]), [['Stress', 'ct', '12105'], ['Stress', 'bl120', '>300>300>300']]);
});

test('NFC: placa com separador, ">300", "0" e traço', () => {
  const r = ler(LAUDO({}, [{ tanque: '3S', normal: { ct: '1, 2, 10', bl120: ['0', '0', '>300'], wort_prof_240: '—', wort_sup_240: null }, stress: {} }]));
  assert.deepEqual(r.nfc.itens.map((i) => i.col), ['ct', 'bl120'], 'traço e vazio não viram leitura');
  assert.deepEqual(r.nfc.itens[0].placas.map((p) => p.valor), [1, 2, 10]);
  assert.deepEqual(r.nfc.itens[1].placas, [{ placa: 1, sinal: '<', valor: 1 }, { placa: 2, sinal: '<', valor: 1 }, { placa: 3, sinal: '>', valor: 300 }]);
});

test('NFC: "<5" não existe (só "<1"), dois valores ou quatro não servem', () => {
  const r = ler(LAUDO({}, [{ tanque: '1C', normal: celulas({ ct: ['<5', '1', '1'], bl120: ['1', '2'], wort_prof_240: ['1', '1', '1', '1'] }), stress: {} }]));
  assert.deepEqual(r.nfc.itens.map((i) => i.col), ['wort_sup_240']);
  assert.equal(r.nfc.excluidos.length, 3);
});

test('NFC: tanque de navio sem letra, navio estranho e papel vazio não gravam', () => {
  const semLetra = ler(LAUDO({}, [{ tanque: '2', normal: celulas(), stress: {} }, { tanque: '1C', normal: celulas(), stress: {} }]));
  assert.ok(semLetra.problemas.some((p) => /tanque 2: faltou a letra/.test(p)));
  assert.ok(semLetra.nfc.itens.every((i) => i.tanque === '1C'));
  const navio = ler(LAUDO({ navio: 'lixo' }));
  assert.equal(navio.falha, true);
  assert.match(navio.textoResposta, /não consegui montar nenhuma leitura/);
  const vazio = ler({ formulario: 'nfc', blocos: [] });
  assert.equal(vazio.falha, true);
});

test('NFC: tanque de terra (sem navio) e "Orange Star" por extenso', () => {
  const terra = ler(LAUDO({ navio: null }, [{ tanque: '42', normal: celulas(), stress: {} }]));
  assert.equal(terra.nfc.itens[0].navio, '');
  const orange = ler(LAUDO({ navio: 'Orange Star 112' }));
  assert.equal(orange.nfc.blocos[0].navio, 'O.STAR 112');
});

// ---- a confirmação ----
const linhaBanco = (it, extra = {}) => ({ kind: 'placa', idx: it.idx, analise_id: 100 + it.idx, limite: 30, ja_lidas: 0, tem_desvio: false, data_coleta: '30/08/2026', ...extra });

test('NFC: confirmação compacta com ok / não ok e um sim para tudo; guarda as placas na pendência', () => {
  const d = ler(LAUDO({}, [{ tanque: '2P', normal: celulas({ ct: ['3', '3', '3'], bl120: ['80', '1', '1'] }), stress: celulas() }]));
  const linhas = d.nfc.itens.map((it) => linhaBanco(it));
  const r = resposta(d, linhas);
  assert.equal(r.salvar, '1');
  assert.equal(r.tipoPendencia, 'PLACAS');
  assert.match(r.textoResposta, /Li o laudo de NFC — navio O\.STAR 112, coleta 30\/08\/2026/);
  assert.match(r.textoResposta, /2P normal: CT 3,3,3 · BL120 80,1,1 🚨 · WP240 <1,<1,<1 · WS240 <1,<1,<1/);
  assert.match(r.textoResposta, /2P stress: CT/);
  assert.match(r.textoResposta, /8 leituras \(24 placas\): 7 ok · 1 🚨 não ok/);
  assert.match(r.textoResposta, /Não abro desvio sozinho/);
  assert.match(r.textoResposta, /Responda \*sim\* para gravar tudo/);
  const payload = JSON.parse(r.payload);
  assert.equal(payload.acao, 'placas_lote');
  assert.equal(payload.itens.length, 8);
  assert.deepEqual(payload.itens[0], { analise_id: 100, etapa: 'final', placas: d.nfc.itens[0].placas });
});

test('NFC: a mensagem do depois-do-sim lista os não ok com o comando pronto e diz que nenhum desvio foi aberto', () => {
  const d = ler(LAUDO({}, [{ tanque: '2P', normal: celulas({ bl120: ['80', '1', '1'] }), stress: {} }]));
  const r = resposta(d, d.nfc.itens.map((it) => linhaBanco(it)));
  assert.match(r.resumo, /^✅ Gravado: laudo de NFC — navio O\.STAR 112, coleta 30\/08\/2026/);
  assert.match(r.resumo, /Não ok \(nenhum desvio foi aberto\)/);
  assert.match(r.resumo, /para abrir o desvio, mande: bl120 do tanque 2P navio O\.STAR 112 normal 80,1,1 coleta 30\/08\/2026/);
  // o comando sugerido é aceito pelo bot e cai no fluxo de placas (que pergunta se abre o desvio)
  const cmd = r.resumo.match(/mande: (.+)/)[1];
  const c = interpretar(cmd);
  assert.equal(c.tipo, 'placas_nfc');
  assert.equal(c.tanque, '2P');
  assert.equal(c.navio, 'O.STAR 112');
  assert.equal(c.dataColeta, '30/08/2026');
  // já tem desvio: não manda abrir de novo
  const comDesvio = resposta(d, d.nfc.itens.map((it) => linhaBanco(it, { tem_desvio: it.col === 'bl120' })));
  assert.match(comDesvio.resumo, /\(já tem desvio\)/);
  assert.doesNotMatch(comDesvio.resumo, /para abrir o desvio/);
});

test('NFC: sem limite cadastrado, ">" e leitura que já tinha placas', () => {
  const d = ler(LAUDO({}, [{ tanque: '1C', normal: celulas({ ct: ['>300', '>300', '>300'] }), stress: {} }]));
  const semLimite = resposta(d, d.nfc.itens.map((it) => linhaBanco(it, { limite: null })));
  assert.match(semLimite.textoResposta, /1 🚨 não ok · 3 sem limite cadastrado/);
  assert.match(semLimite.textoResposta, /CT >300,>300,>300 🚨/, '">" é não ok mesmo sem limite cadastrado (incontável)');
  assert.match(semLimite.textoResposta, /BL120 <1,<1,<1 ℹ️/);
  const lida = resposta(d, d.nfc.itens.map((it) => linhaBanco(it, { ja_lidas: 3 })));
  assert.match(lida.textoResposta, /4 leitura\(s\) já tinham placas: os valores novos substituem os antigos/);
  const maior = resposta(d, d.nfc.itens.map((it) => linhaBanco(it)));
  assert.match(maior.textoResposta, /CT >300,>300,>300 🚨/);
});

test('NFC: tanque sem análise registrada e célula ilegível ficam de fora com aviso; nada achado = nada guardado', () => {
  const d = ler(LAUDO({}, [{ tanque: '2P', normal: celulas({ ct: '12105' }), stress: celulas() }, { tanque: '3S', normal: celulas(), stress: {} }]));
  const linhas = d.nfc.itens.filter((it) => it.tanque === '2P').map((it) => linhaBanco(it));
  const r = resposta(d, linhas);
  assert.equal(r.salvar, '1');
  assert.match(r.textoResposta, /tanque 3S normal: não achei análise para ler \(CT, BL120, WP240, WS240\); fica de fora/);
  assert.match(r.textoResposta, /tanque 2P normal CT: não separei as 3 placas \("12105"\); fica de fora, mande o comando/);
  assert.match(r.resumo, /Ficaram de fora/);
  assert.equal(JSON.parse(r.payload).itens.length, 7, 'as 3 leituras boas do 2P normal e as 4 do 2P stress');
  const nada = resposta(d, [{}]);
  assert.equal(nada.salvar, '0');
  assert.match(nada.textoResposta, /nenhuma leitura ficou pronta para gravar/);
});

// ---- depois do "sim" ----
test('"sim" de foto de NFC: a pendência PLACAS entrega o lote ao executor sem abrir desvio', () => {
  const item = { tipo: 'confirmar_pendencia', nomeContato: 'Joao' };
  const payload = { acao: 'placas_lote', itens: [{ analise_id: 1, etapa: 'final', placas: [] }] };
  const r = new Function('$', '$input', codigoDoNode('Processar sim ou não'))(
    () => ({ first: () => ({ json: item }) }),
    { all: () => [{ json: { tipo: 'PLACAS', minutos: 2, payload, resumo: '✅ Gravado: laudo' } }] })[0].json;
  assert.equal(JSON.parse(r.nfcAcao).acao, 'placas_lote');
  assert.match(r.textoResposta, /^✅ Gravado: laudo\n\nPor: Joao/);
  assert.equal(r.reenviarComando, undefined);
});

test('workflow: o lote entra entre o desvio e o executor de NFC e só age com acao placas_lote', () => {
  const c = workflow.connections;
  assert.deepEqual(c['BD · Executar desvio'].main[0].map((x) => x.node), ['BD · Executar placas da foto']);
  assert.deepEqual(c['BD · Executar placas da foto'].main[0].map((x) => x.node), ['BD · Executar NFC']);
  const n = workflow.nodes.find((x) => x.name === 'BD · Executar placas da foto');
  assert.match(n.parameters.query, /p\.j ->> 'acao' = 'placas_lote'/);
  assert.doesNotMatch(n.parameters.query, /desvios_tanque/, 'não abre desvio');
  assert.match(n.parameters.query, /ON CONFLICT \(analise_id, etapa, placa\)/);
  assert.match(n.parameters.options.queryReplacement, /nfcAcao/);
  assert.equal(n.alwaysOutputData, true);
  // o executor de placa única não confunde o lote com uma placa
  const exec = workflow.nodes.find((x) => x.name === 'BD · Executar NFC').parameters.query;
  assert.match(exec, /p\.j ->> 'acao' = 'placas'/);
});

test('workflow: a busca no banco e o salvar aceitam as duas famílias (composta e placa)', () => {
  const por = (nome) => workflow.nodes.find((x) => x.name === nome).parameters;
  assert.match(por('BD · Compostas da foto').query, /'composta'::text AS kind/);
  assert.match(por('BD · Compostas da foto').query, /'placa'::text AS kind/);
  assert.match(por('BD · Compostas da foto').query, /a\.repeticao_de IS NULL/, 'repetição fica no comando');
  assert.match(por('BD · Compostas da foto').options.queryReplacement, /compostas.*placas/s);
  assert.match(por('BD · Salvar pendência foto').query, /\$5::text/);
  assert.match(por('BD · Salvar pendência foto').options.queryReplacement, /tipoPendencia/);
});

test('o prompt da foto conhece o laudo de NFC e como escrever as placas', () => {
  const [{ json }] = rodar('Foto · Montar pedido', {}, { 'Foto em arquivo': { foto_b64: 'QUJD', mime: 'image/jpeg' } });
  const p = json.pedido.contents[0].parts[0].text;
  assert.match(p, /"nfc": "Laudo de Análises Microbiológica de NFC"/);
  assert.match(p, /wort_prof_240/);
  assert.match(p, /nunca chute a separação/);
  assert.match(p, /B\.L Superfície não entra/);
});

test('NFC: ">300" escrito colado (3 unidades) não vira ">3, 0, 0"', () => {
  const r = ler(LAUDO({}, [{ tanque: '1C', normal: { ct: '>300' }, stress: {} }]));
  assert.equal(r.falha, true, 'nenhuma leitura sobra');
  assert.match(r.textoResposta, /tanque 1C normal ct: não separei as 3 placas \(">300"\)/);
});

test('NFC: valor igual ao limite é ok; acima do limite é não ok (limite é o máximo por placa)', () => {
  const d = ler(LAUDO({}, [{ tanque: '1C', normal: { ct: ['30', '30', '30'], bl120: ['31', '1', '1'] }, stress: {} }]));
  const r = resposta(d, d.nfc.itens.map((it) => linhaBanco(it)));
  assert.match(r.textoResposta, /CT 30,30,30 · BL120 31,1,1 🚨/);
  assert.match(r.textoResposta, /2 leituras \(6 placas\): 1 ok · 1 🚨 não ok/);
});

test('workflow: a busca usa a data da coleta do papel quando ela foi lida', () => {
  const q = workflow.nodes.find((x) => x.name === 'BD · Compostas da foto').parameters.query;
  assert.match(q, /c\.data_coleta = to_date\(b\.coleta, 'DD\/MM\/YYYY'\)/);
  assert.match(q, /<= CURRENT_DATE/, 'sem a data, só leituras já na hora de ler');
});
