'use strict';

// Consultas novas: quem coletou (tanque e navio), resultado do tanque e C.T/B.L de um load até agora,
// e o desvio de um tanque numa coleta (com data). Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const tipoE = (frase, esperado) => {
  const r = interpretar(frase);
  for (const [k, v] of Object.entries(esperado)) assert.equal(r[k], v, `${frase} -> ${k}`);
  return r;
};

test('quem coletou o tanque: com data, com navio, sem nada', () => {
  tipoE('quem coletou o tanque 41 do dia 14/10/2026?', { tipo: 'consulta_coletor', modo: 'tanque', tanque: '41', navio: '', data: '14/10/2026' });
  tipoE('Quem coletou o tanque 41', { tipo: 'consulta_coletor', modo: 'tanque', tanque: '41', data: '' });
  tipoE('quem coletou o tanque 1C do navio O.SKY 123', { tipo: 'consulta_coletor', tanque: '1C', navio: 'O.SKY 123', data: '' });
  tipoE('quem coletou o tanque 1C do dia 14/10 do navio Orange Sky 123', { tipo: 'consulta_coletor', tanque: '1C', navio: 'O.SKY 123' });
});

test('quem coletou: data sem ano usa o ano de hoje, "ontem" vira data e data impossível é recusada', () => {
  const ano = String(new Date().getFullYear());
  assert.equal(interpretar('quem coletou o tanque 41 do dia 14/10').data, `14/10/${ano}`);
  assert.match(interpretar('quem coletou o tanque 41 ontem').data, /^\d{2}\/\d{2}\/\d{4}$/);
  const r = interpretar('quem coletou o tanque 41 do dia 31/02/2026');
  assert.equal(r.tipo, 'erro_coleta');
  assert.match(r.textoResposta, /Data inválida/);
});

test('quem coletou os tanques do navio, inclusive com pedido educado no fim', () => {
  tipoE('quem coletou os tanques do navio Orange Sky 123', { tipo: 'consulta_coletor', modo: 'navio', navio: 'O.SKY 123' });
  tipoE('Quem coletou os tanques do navio O.SKY 123? me envia os nomes de todos', { tipo: 'consulta_coletor', modo: 'navio', navio: 'O.SKY 123' });
  tipoE('quem coletou os tanques do navio O.SKY 123 do dia 14/10/2026', { modo: 'navio', navio: 'O.SKY 123', data: '14/10/2026' });
});

test('resultados de C.T e B.L do load: qual análise, e não confunde com o registro', () => {
  tipoE('quanto ta o CT do load 44444 ate agora?', { tipo: 'consulta_resultado_load', load: '44444', analises: 'CT' });
  tipoE('quanto está o BL do load 44444 até agora', { tipo: 'consulta_resultado_load', analises: 'BL72,BL120' });
  tipoE('resultados do load 44444', { tipo: 'consulta_resultado_load', analises: '' });
  tipoE('bl72 do load 44444 ate agora', { tipo: 'consulta_resultado_load', analises: 'BL72' });
  tipoE('qual o ct e o bl do load 44444', { analises: 'CT,BL72,BL120' });
  // registro continua registro
  tipoE('ct load 44444 lote 4 deu 10', { tipo: 'contagem_registrar' });
  tipoE('bl72 load 44444 lotes 1-14 deu <10', { tipo: 'contagem_registrar' });
  // frase com valor digitado nunca é consulta, mesmo começando como pergunta
  assert.notEqual(interpretar('quanto deu o ct do load 44444 deu 10').tipo, 'consulta_resultado_load');
});

test('resultado do tanque e desvio do tanque numa coleta', () => {
  tipoE('resultado do tanque 41 do dia 14/10/2026', { tipo: 'consulta_resultado_tanque', tanque: '41', data: '14/10/2026' });
  tipoE('como esta o tanque 41', { tipo: 'consulta_resultado_tanque', tanque: '41', data: '' });
  tipoE('desvios do tanque 41 do dia 14/10/2026', { tipo: 'consulta_desvios', modo: 'tanque', tanque: '41', data: '14/10/2026' });
  // sem data, a consulta antiga segue igual
  tipoE('desvios do tanque 41', { tipo: 'consulta_desvios', modo: 'tanque', tanque: '41' });
  tipoE('quais desvios estao abertos', { tipo: 'consulta_desvios', modo: 'abertos' });
});

test('consultores também podem consultar', () => {
  assert.equal(interpretar('quem coletou o tanque 41', { cargo: 'Consultor' }).tipo, 'consulta_coletor');
  assert.equal(interpretar('resultados do load 44444', { cargo: 'Consultor' }).tipo, 'consulta_resultado_load');
});

// ---- as respostas, com linhas simuladas do banco ----
function responder(nodeNome, frase, linhas) {
  const item = interpretar(frase);
  const $ = (n) => ({ first: () => ({ json: item }), item: { json: item } });
  const entrada = linhas.map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nodeNome))($, { first: () => entrada[0], all: () => entrada })[0].json.textoResposta;
}

test('resposta: quem coletou os tanques do navio agrupa por pessoa', () => {
  const t = responder('Montar resposta quem coletou', 'quem coletou os tanques do navio O.SKY 123', [
    { origem: 'navio', tanque: '1C', navio: 'O.SKY 123', data_coleta: '14/10/2026', quem: 'João', registrado_em: '14/10/2026 08:00' },
    { origem: 'navio', tanque: '10P', navio: 'O.SKY 123', data_coleta: '14/10/2026', quem: 'Herick', registrado_em: '14/10/2026 08:05' },
    { origem: 'navio', tanque: '2P', navio: 'O.SKY 123', data_coleta: '14/10/2026', quem: 'João', registrado_em: '14/10/2026 08:01' },
  ]);
  assert.match(t, /navio O\.SKY 123/);
  assert.match(t, /João: 1C, 2P/);
  assert.match(t, /Herick: 10P/);
  assert.match(t, /Total: 3 tanques/);
});

test('resposta: quem coletou um tanque mostra data, onde e quem; sem coleta avisa', () => {
  const t = responder('Montar resposta quem coletou', 'quem coletou o tanque 41 do dia 14/10/2026', [
    { origem: 'terra', tanque: '41', navio: null, data_coleta: '14/10/2026', quem: 'Rafaela', registrado_em: '14/10/2026 09:10' },
  ]);
  assert.match(t, /Quem coletou o tanque 41 no dia 14\/10\/2026/);
  assert.match(t, /14\/10\/2026 · terra · Rafaela/);
  assert.match(responder('Montar resposta quem coletou', 'quem coletou o tanque 41 do dia 14/10/2026', [{}]), /Nenhuma coleta encontrada para o tanque 41/);
  assert.match(responder('Montar resposta quem coletou', 'quem coletou o tanque 41', [{ origem: 'terra', tanque: '41', data_coleta: '14/10/2026', quem: null, registrado_em: 'x' }]), /sem nome cadastrado/);
});

test('resposta: resultados do load mostram o lido, o que falta e o alarme', () => {
  const lote = (n, resultado, alarme = false, analise = 'CT') => ({ origem: 'recebimento', load: '44444', item: '2655', fabrica: 'AQA', analise, numero: n, prevista: '16/10/2026', resultado, alarme });
  const t = responder('Montar resposta resultado do load', 'quanto ta o CT do load 44444 ate agora?', [
    lote(1, '10'), lote(2, '<10'), lote(3, '250', true), lote(4, null), lote(5, null),
  ]);
  assert.match(t, /C\.T 48h do load 44444 até agora/);
  assert.match(t, /load 44444 · item 2655 · fábrica AQA/);
  assert.match(t, /1 = 10 · 2 = <10 · 3 = 250 🚨/);
  assert.match(t, /faltam lotes 4-5 \(previsto 16\/10\/2026\)/);
  const nada = responder('Montar resposta resultado do load', 'resultados do load 44444', [lote(1, null)]);
  assert.match(nada, /nenhum lote lido ainda/);
  assert.match(responder('Montar resposta resultado do load', 'resultados do load 99999', [{}]), /Não encontrei o load 99999/);
});

test('resposta: resultado do embarque usa amostras (A1...) e identifica o navio', () => {
  const t = responder('Montar resposta resultado do load', 'resultados do load 44444', [
    { origem: 'embarque', load: '44444', item: '2655', navio: 'O.SKY 123', linha: 2, fase: 1, analise: 'BL120', numero: 1, prevista: '20/10/2026', resultado: '30', alarme: false },
    { origem: 'embarque', load: '44444', item: '2655', navio: 'O.SKY 123', linha: 2, fase: 1, analise: 'BL120', numero: 2, prevista: '20/10/2026', resultado: null, alarme: false },
  ]);
  assert.match(t, /O\.SKY 123 linha 2 fase 1/);
  assert.match(t, /A1 = 30/);
  assert.match(t, /faltam amostra A2/);
});

test('resposta: resultado do tanque mostra contagem e situação; sem leitura mostra a previsão', () => {
  const l = (o) => ({ data_coleta: '14/10/2026', origem: 'terra', navio: null, frasco: 'Normal', sub_analise: 'CT', metodo: 'Profundidade', etapa: 'final', contagem: null, situacao: 'Pendente', prevista: '16/10/2026', repeticao: false, ...o });
  const t = responder('Montar resposta resultado do tanque', 'resultado do tanque 41 do dia 14/10/2026', [
    l({ contagem: '30, 12, 8', situacao: 'Ok' }),
    l({ sub_analise: 'BL', etapa: 'pre', contagem: '60, 2, 1', situacao: 'Não ok' }),
    l({ sub_analise: 'WORT', metodo: 'Superficie', etapa: 'pre' }),
  ]);
  assert.match(t, /Resultados do tanque 41 do dia 14\/10\/2026/);
  assert.match(t, /C\.T 48h normal: 30, 12, 8 · ✅ ok/);
  assert.match(t, /B\.L 72h normal: 60, 2, 1 · 🚨 não ok/);
  assert.match(t, /WORT superfície 120h normal: — · aguardando leitura \(prevista 16\/10\/2026\)/);
  assert.match(responder('Montar resposta resultado do tanque', 'resultado do tanque 41', [{}]), /Nenhuma coleta\/análise encontrada para o tanque 41/);
});

// ---- a fiação no workflow ----
test('workflow: as três consultas estão roteadas até o WhatsApp, e o SQL recebe os parâmetros certos', () => {
  const por = (nome) => workflow.nodes.find((n) => n.name === nome);
  const rot = por('Rotear comando');
  const saidas = rot.parameters.rules.values.map((v) => v.outputKey);
  assert.equal(workflow.connections['Rotear comando'].main.length, saidas.length, 'cada regra tem uma saída ligada');
  const cadeias = {
    consulta_coletor: ['BD · Quem coletou', 'Montar resposta quem coletou'],
    consulta_resultado_load: ['BD · Resultado do load', 'Montar resposta resultado do load'],
    consulta_resultado_tanque: ['BD · Resultado do tanque', 'Montar resposta resultado do tanque'],
  };
  for (const [tipo, [bd, montar]] of Object.entries(cadeias)) {
    const i = saidas.indexOf(tipo);
    assert.ok(i >= 0, `falta a regra ${tipo}`);
    assert.equal(workflow.connections['Rotear comando'].main[i][0].node, bd);
    assert.equal(workflow.connections[bd].main[0][0].node, montar);
    assert.equal(workflow.connections[montar].main[0][0].node, 'Zap · Consulta de resultados');
  }
  assert.equal(workflow.connections['Zap · Consulta de resultados'].main[0][0].node, 'Fim · Consulta de resultados');
  const q = (nome) => por(nome).parameters;
  assert.match(q('BD · Quem coletou').options.queryReplacement, /modo.*tanque.*navio.*data/s);
  assert.match(q('BD · Quem coletou').query, /\$4::text/);
  assert.match(q('BD · Resultado do load').options.queryReplacement, /\$json\.load.*analises/s);
  assert.match(q('BD · Resultado do tanque').options.queryReplacement, /tanque.*navio.*data/s);
  assert.match(q('BD · Consultar desvios').query, /data_coleta = to_date\(\$4::text/);
  assert.match(q('BD · Consultar desvios').options.queryReplacement, /\$json\.data/);
});

test('a IA conhece os formatos das consultas novas', () => {
  const prompt = workflow.nodes.find((x) => x.name === 'IA · Montar pedido').parameters.assignments.assignments[0].value;
  assert.match(prompt, /30\. quem coletou o tanque/);
  assert.match(prompt, /31\. resultados do load/);
  assert.match(prompt, /32\. resultado do tanque/);
});
