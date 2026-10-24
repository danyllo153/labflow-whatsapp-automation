'use strict';

// Resultados de C.T / B.L por amostra lidos da foto do laudo de EMBARQUE, gravados em lote com um só sim.
// Valor riscado não vale. Respostas da IA SIMULADAS (nenhuma foto no repositório). Rodar: npm test

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
const resposta = (d, linhasBanco) => rodar('Foto · Montar resposta', linhasBanco, { 'Foto · Interpretar': d })[0].json;

const BLOCO = (extra = {}) => ({ linha: '7', fase: '1', load: '43412', item: '2648', amostras: [1, 2, 3], data: '28.08.26',
  resultados: { A1: { ct: '<10', bl72: '<10', bl120: '<10' }, A2: { ct: '10', bl72: '<10', bl120: '<10' }, A3: { ct: '10', bl72: '<10', bl120: '<10' } }, ...extra });
const LAUDO = (bloco = BLOCO()) => ({ formulario: 'embarque', navio: 'O.Star', viagem: '112', data: '28/08/2026', duvidas: [], blocos: [bloco] });

// o banco diz que a amostra existe (alvo_id) e, se houver, o resultado atual
const noBanco = (d, extra = () => ({})) => (d.buscasAmostras || []).map((x) => ({ kind: 'amostra', idx: x.idx, alvo_id: 1000 + x.numero, load_num: '43412', atual: null, ...extra(x) }));

test('resultados: lê C.T, B.L 72h e B.L 120h por amostra, com sinal e valor', () => {
  const r = ler(LAUDO());
  assert.equal(r.resultados.length, 9);
  const a2ct = r.resultados.find((x) => x.numero === 2 && x.analise === 'CT');
  assert.deepEqual([a2ct.sinal, a2ct.valor, a2ct.linha, a2ct.fase, a2ct.load], ['=', 10, '7', '1', '43412']);
  const a1 = r.resultados.find((x) => x.numero === 1 && x.analise === 'BL120');
  assert.deepEqual([a1.sinal, a1.valor], ['<', 10]);
  // busca no banco: cada amostra (existência) + cada resultado (valor atual)
  assert.equal(r.buscasAmostras.filter((x) => x.analise === null).length, 3);
  assert.equal(r.buscasAmostras.filter((x) => x.analise !== null).length, 9);
  assert.deepEqual(Object.keys(r.buscasAmostras[0]).sort(), ['analise', 'fase', 'idx', 'linha', 'navio', 'numero']);
});

test('resultados: riscado (null), vazio, traço e decimal com vírgula', () => {
  const r = ler(LAUDO(BLOCO({ resultados: { A1: { ct: null, bl72: '', bl120: '—' }, A2: { ct: '1,5', bl72: '>300', bl120: null }, A3: {} } })));
  assert.deepEqual(r.resultados.map((x) => [x.numero, x.analise, x.sinal, x.valor]), [[2, 'CT', '=', 1.5], [2, 'BL72', '>', 300]]);
});

test('resultados: texto que não é número fica de fora com aviso, e amostra que não é da linha é ignorada', () => {
  const r = ler(LAUDO(BLOCO({ resultados: { A1: { ct: 'abc', bl72: '10', bl120: null }, A9: { ct: '10' } } })));
  assert.deepEqual(r.resultados.map((x) => [x.numero, x.analise]), [[1, 'BL72']]);
  assert.ok(r.duvidas.some((d) => /A1 CT: não entendi "abc"; fica de fora/.test(d)));
});

test('resultados: sem o campo "resultados" o laudo continua só registrando o embarque', () => {
  const r = ler(LAUDO(BLOCO({ resultados: undefined })));
  assert.equal(r.resultados.length, 0);
  assert.equal(r.comandos.length, 1);
});

test('confirmação dos resultados: tudo registrado, vira uma lista só com alarme e correção', () => {
  const d = ler(LAUDO(BLOCO({ resultados: { A1: { ct: '<10', bl72: '60', bl120: '<10' }, A2: { ct: '250', bl72: null, bl120: '5' }, A3: { ct: '10', bl72: null, bl120: null } } })));
  const r = resposta(d, noBanco(d, (x) => (x.analise === 'CT' && x.numero === 3 ? { atual: '8' } : {})));
  assert.equal(r.salvar, '1');
  assert.equal(r.tipoPendencia, 'TAB');
  assert.match(r.textoResposta, /📷 Embarque O\.STAR 112 — resultados:/);
  assert.match(r.textoResposta, /linha 7 fase 1 · load 43412:/);
  assert.match(r.textoResposta, /A1: CT <10 · BL72 60 🚨 · BL120 <10/);
  assert.match(r.textoResposta, /A2: CT 250 🚨 · BL120 5/);
  assert.match(r.textoResposta, /A3: CT 10/);
  assert.match(r.textoResposta, /6 resultados de C\.T\/B\.L/);
  assert.match(r.textoResposta, /🚨 Acima do limite \(C\.T ≥ 200, B\.L ≥ 50\): A1 BL72 = 60, A2 CT = 250/);
  assert.match(r.textoResposta, /Corrige resultado anterior: A3 CT \(era 8\)/);
  assert.match(r.textoResposta, /Responda \*sim\* para gravar tudo/);
  assert.doesNotMatch(r.textoResposta, /Valor riscado/, 'sem regras no texto');
  const payload = JSON.parse(r.payload);
  assert.equal(payload.acao, 'contagem_lote');
  assert.equal(payload.itens.length, 6);
  assert.deepEqual(payload.itens[0], { analise: 'CT', alvo: 'amostra', id: 1001, sinal: '<', valor: 10 });
  assert.deepEqual(payload.itens.find((i) => i.analise === 'BL72' && i.id === 1001), { analise: 'BL72', alvo: 'amostra', id: 1001, sinal: '=', valor: 60 });
  assert.match(r.resumo, /Resultados do laudo de embarque O\.STAR 112 gravados/);
});

test('confirmação dos resultados: várias linhas do papel, cada uma com a sua linha e fase', () => {
  const d = ler({ ...LAUDO(), blocos: [BLOCO({ resultados: { A1: { ct: '<10' } } }), BLOCO({ linha: '4', fase: '2', load: '43340', item: '2540', amostras: [1], resultados: { A1: { bl120: '<10' } } })] });
  const r = resposta(d, noBanco(d));
  assert.match(r.textoResposta, /linha 7 fase 1 · load 43412:\n   A1: CT <10/);
  assert.match(r.textoResposta, /linha 4 fase 2 · load 43340:\n   A1: BL120 <10/);
});

test('tudo riscado com o embarque já registrado: nada é gravado e o bot explica', () => {
  const d = ler(LAUDO(BLOCO({ resultados: { A1: { ct: null, bl72: null, bl120: null }, A2: { ct: null }, A3: { ct: null } } })));
  const r = resposta(d, noBanco(d));
  assert.equal(r.salvar, '0');
  assert.match(r.textoResposta, /Embarque O\.STAR 112: nada novo para registrar\./);
});

test('embarque ainda não registrado: registra primeiro e avisa que os resultados vêm na foto seguinte', () => {
  const d = ler(LAUDO());
  const r = resposta(d, d.buscasAmostras.map((x) => ({ kind: 'amostra', idx: x.idx, alvo_id: null, load_num: null, atual: null })));
  assert.equal(r.salvar, '1');
  assert.equal(r.tipoPendencia, undefined, 'continua a lista de comandos de embarque');
  assert.match(r.textoResposta, /🚢 O\.STAR 112:\n• linha 7 fase 1: load 43412 \(item 2648\), amostras A1-A3/);
  assert.match(r.textoResposta, /li 9 resultado\(s\) de C\.T\/B\.L, mas o embarque ainda não está registrado: registre agora \(sim\) e mande a foto de novo/);
  assert.equal(JSON.parse(r.payload).comandos.length, 1);
});

test('amostra no load diferente do papel gera aviso, mas os resultados seguem para confirmação', () => {
  const d = ler(LAUDO());
  const r = resposta(d, noBanco(d, () => ({ load_num: '43999' })));
  assert.equal(r.salvar, '1');
  assert.match(r.textoResposta, /linha 7 fase 1: A1 está no load 43999 no sistema e o papel diz 43412/);
});

test('o prompt ensina os resultados do embarque e que riscado não vale', () => {
  const [{ json }] = rodar('Foto · Montar pedido', {}, { 'Foto em arquivo': { foto_b64: 'QUJD', mime: 'image/jpeg' } });
  const p = json.pedido.contents[0].parts[0].text;
  assert.match(p, /"resultados": \{ "A1": \{ "ct": "<10", "bl72": "<10", "bl120": "<10" \}/);
  assert.match(p, /Valor RISCADO \(com traço ou barra por cima\) NÃO vale/);
  assert.doesNotMatch(p, /Não leia os resultados de C\.T e B\.L por enquanto/);
});

test('workflow: o lote de contagens roda depois do "sim", só com acao contagem_lote, e a busca traz as amostras', () => {
  const n = workflow.nodes.find((x) => x.name === 'BD · Gravar contagens da foto');
  assert.match(n.parameters.query, /\$1::jsonb ->> 'acao' = 'contagem_lote'/);
  assert.match(n.parameters.query, /contagem_lancar_pelo_bot\(\$2::text, \$1::jsonb\)/, 'grava pela lancar_contagem (040), a mesma do app');
  assert.match(n.parameters.options.queryReplacement, /tabAcao/);
  assert.equal(n.alwaysOutputData, true);
  const busca = workflow.nodes.find((x) => x.name === 'BD · Compostas da foto').parameters;
  assert.match(busca.query, /'amostra'::text AS kind/);
  assert.match(busca.options.queryReplacement, /amostras: \$json\.buscasAmostras/);
  // a pendência de resultados é do tipo TAB, que o "sim" já entrega como tabAcao
  const exec = codigoDoNode('Processar sim ou não');
  assert.match(exec, /ehTAB[\s\S]*tabAcao: JSON\.stringify\(p\.payload\)/);
});

test('alarme nos limites: B.L 50 e C.T 200 alarmam; "<" nunca alarma; abaixo do limite não alarma', () => {
  const d = ler(LAUDO(BLOCO({ resultados: { A1: { ct: '200', bl72: '50', bl120: '49' }, A2: { ct: '<250', bl72: '<60', bl120: '<10' }, A3: { ct: '199', bl72: null, bl120: null } } })));
  const r = resposta(d, noBanco(d));
  assert.match(r.textoResposta, /Acima do limite \(C\.T ≥ 200, B\.L ≥ 50\): A1 CT = 200, A1 BL72 = 50\n/);
  assert.match(r.textoResposta, /A1: CT 200 🚨 · BL72 50 🚨 · BL120 49\n/);
  assert.match(r.textoResposta, /A2: CT <250 · BL72 <60 · BL120 <10\n/);
  assert.match(r.textoResposta, /A3: CT 199\n/);
});
