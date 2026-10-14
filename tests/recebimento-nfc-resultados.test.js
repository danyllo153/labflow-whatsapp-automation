'use strict';

// Resultados de C.T / B.L do recebimento NFC: o número lido é MULTIPLICADO pela diluição do lote
// (14 com 10 elevado a 1 vira 140; a 3, acrescenta três zeros). Comando com sim, gravação, consultas e foto.
// Respostas da IA simuladas. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const ctx = { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', hoje: '14/10/2026', legenda: '' };
function rodar(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: vizinhos.item || ctx }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}

// ---------- o comando ----------
test('comando: C.T, B.L 72h e B.L 120h do NFC, com tipo, vários lotes, "<" e decimal', () => {
  const a = interpretar('ct nfc load 44300 lote 10 past deu 14');
  assert.deepEqual([a.tipo, a.analise, a.load], ['contagem_nfc_registrar', 'CT', '44300']);
  assert.deepEqual(a.grupos, [{ lotes: [10], amostra: 'past', sinal: '=', valor: 14 }]);
  assert.deepEqual(a.pedidos, [{ lote: 10, amostra: 'past' }]);
  const b = interpretar('bl72 nfc load 44300 lote 10 past deu 22, lote 11 fresh deu <10');
  assert.equal(b.analise, 'BL72');
  assert.deepEqual(b.grupos.map((g) => [g.lotes, g.amostra, g.sinal, g.valor]), [[[10], 'past', '=', 22], [[11], 'fresh', '<', 10]]);
  const c = interpretar('bl120 nfc load 44300 lotes 10-12 fresh deu 7');
  assert.equal(c.analise, 'BL120');
  assert.deepEqual(c.grupos[0].lotes, [10, 11, 12]);
  assert.equal(interpretar('bl nfc load 44300 lote 10 past deu 1,5').grupos[0].valor, 1.5);
  assert.equal(interpretar('bl nfc load 44300 lote 10 past deu 1,5').analise, 'BL120', '"bl" sozinho vale B.L 120h, como no concentrado');
});

test('comando: sem "nfc" vale se o item for 129 ou se houver past/fresh; o concentrado segue igual', () => {
  assert.equal(interpretar('ct load 44300 item 129 lote 10 past deu 14').tipo, 'contagem_nfc_registrar');
  assert.equal(interpretar('ct load 77001 lote 4 deu 10').tipo, 'contagem_registrar');
  assert.equal(interpretar('ct load 77001 item 444 lotes 5-10 deu <10').tipo, 'contagem_registrar');
  assert.equal(interpretar('ct navio O.SKY 133 linha 2 fase 2 amostras 1-5 deu <10').tipo, 'contagem_registrar');
});

test('comando: recusas (sem tipo ou resultado, item errado, lote repetido, Consultor)', () => {
  assert.match(interpretar('ct nfc load 44300 lote 10 past deu').textoResposta, /Não entendi os lotes\. Para cada lote diga o tipo/);
  // sem o tipo (past/fresh) o bot não chuta: o mesmo lote pode ter os dois
  assert.equal(interpretar('ct nfc load 44300 lote 10 deu 14').tipo, 'erro_coleta');
  assert.match(interpretar('ct nfc load 44300 lote 10 deu 14').textoResposta, /diga o tipo \(past ou fresh\)/);
  assert.match(interpretar('ct nfc load 44300 item 130 lote 10 past deu 14').textoResposta, /sempre o item 129 \(você escreveu 130\)/);
  assert.match(interpretar('ct nfc load 44300 lote 10 past deu 14, lote 10 past deu 15').textoResposta, /lote 10 \(past\) aparece em mais de um grupo/);
  assert.match(interpretar('ct nfc load 44300 lote 10 past deu 14', { cargo: 'Consultor' }).textoResposta, /somente de consulta/);
});

// ---------- a confirmação com a multiplicação ----------
const linhaBanco = (lote, amostra, dil, extra = {}) => ({ loads_encontrados: 1, lote, amostra, alvo_id: 100 + lote, diluicao: dil, atual: null, ...extra });
const pergunta = (frase, linhas) => rodar('Montar pergunta contagens NFC', linhas, { item: { ...interpretar(frase) } })[0].json;

test('multiplicação: 14, 22 e 74 com 10^1 viram 140, 220 e 740 (um zero)', () => {
  const ct = pergunta('ct nfc load 44300 lote 10 past deu 14', [linhaBanco(10, 'past', 1)]);
  assert.match(ct.textoResposta, /lote 10 · past · 10\^1: 14 × 10\^1 = 140(?! 🚨)/, 'C.T 140 ainda não passa de 200');
  assert.equal(JSON.parse(ct.payload).itens[0].valor, 140);
  assert.equal(JSON.parse(ct.payload).itens[0].lido, 14);
  const bl72 = pergunta('bl72 nfc load 44300 lote 10 past deu 22', [linhaBanco(10, 'past', 1)]);
  assert.equal(JSON.parse(bl72.payload).itens[0].valor, 220);
  const bl120 = pergunta('bl120 nfc load 44300 lote 10 past deu 74', [linhaBanco(10, 'past', 1)]);
  assert.equal(JSON.parse(bl120.payload).itens[0].valor, 740);
});

test('multiplicação: cada lote usa a diluição que o recebimento guardou (10^3 acrescenta três zeros; 10^0 não muda)', () => {
  const r = pergunta('ct nfc load 44300 lote 10 past deu 14, lote 11 fresh deu 5, lote 12 fresh deu 3', [linhaBanco(10, 'past', 1), linhaBanco(11, 'fresh', 3), linhaBanco(12, 'fresh', 0)]);
  const v = JSON.parse(r.payload).itens.map((i) => [i.id, i.valor, i.lido]);
  assert.deepEqual(v, [[110, 140, 14], [111, 5000, 5], [112, 3, 3]]);
  assert.match(r.textoResposta, /lote 11 · fresh · 10\^3: 5 × 10\^3 = 5000/);
  assert.match(r.textoResposta, /lote 12 · fresh · 10\^0: 3(?!\d| ×)/, 'diluição 10^0 não muda o número');
  assert.match(r.textoResposta, /O resultado vale o número lido × 10 elevado à diluição do lote\./);
  assert.match(r.textoResposta, /Responda \*sim\* ou \*não\*/);
  const dec = pergunta('ct nfc load 44300 lote 10 past deu 1,5', [linhaBanco(10, 'past', 2)]);
  assert.equal(JSON.parse(dec.payload).itens[0].valor, 150, 'decimal também (1,5 x 100)');
});

test('multiplicação: "<10" com 10^1 vira "<100" (o sinal fica) e nunca alarma', () => {
  const r = pergunta('ct nfc load 44300 lote 10 past deu <250', [linhaBanco(10, 'past', 1)]);
  const i = JSON.parse(r.payload).itens[0];
  assert.deepEqual([i.sinal, i.valor, i.lido], ['<', 2500, 250]);
  assert.match(r.textoResposta, /<250 × 10\^1 = <2500(?! 🚨)/);
  assert.doesNotMatch(r.textoResposta, /🚨/);
});

test('alarme usa o valor final: C.T 20 com 10^1 = 200 alarma; B.L 5 com 10^1 = 50 alarma; B.L 4 com 10^1 = 40 não', () => {
  const ct = pergunta('ct nfc load 44300 lote 10 past deu 20', [linhaBanco(10, 'past', 1)]);
  assert.match(ct.textoResposta, /= 200 🚨/);
  assert.match(ct.textoResposta, /Acima do limite \(C\.T ≥ 200\): 10 \(past\) = 200/);
  assert.match(pergunta('bl120 nfc load 44300 lote 10 past deu 5', [linhaBanco(10, 'past', 1)]).textoResposta, /= 50 🚨/);
  assert.doesNotMatch(pergunta('bl120 nfc load 44300 lote 10 past deu 4', [linhaBanco(10, 'past', 1)]).textoResposta, /🚨/);
});

test('confirmação avisa a correção do resultado anterior; recusa load e lote que não existem', () => {
  const corr = pergunta('ct nfc load 44300 lote 10 past deu 14', [linhaBanco(10, 'past', 1, { atual: '90' })]);
  assert.match(corr.textoResposta, /Corrige resultado anterior: 10 past \(era 90\)/);
  assert.equal(corr.salvar, true);
  const semLoad = pergunta('ct nfc load 99999 lote 10 past deu 14', [{ loads_encontrados: 0, lote: 10, amostra: 'past', alvo_id: null, diluicao: null, atual: null }]);
  assert.equal(semLoad.salvar, false);
  assert.match(semLoad.textoResposta, /Load 99999 \(NFC, item 129\) não encontrado\. Registre o recebimento primeiro/);
  const semLote = pergunta('ct nfc load 44300 lote 10 past deu 14, lote 11 fresh deu 3', [linhaBanco(10, 'past', 1), { loads_encontrados: 1, lote: 11, amostra: 'fresh', alvo_id: null, diluicao: null, atual: null }]);
  assert.equal(semLote.salvar, false);
  assert.match(semLote.textoResposta, /Lote 11 \(fresh\) não foi registrado no recebimento NFC do load 44300\. Nada foi gravado/);
});

// ---------- fiação e SQL ----------
test('workflow: o resultado do NFC passa por resolver, pergunta e sim; a gravação multiplica e corrige', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('contagem_nfc_registrar')].map((x) => x.node), ['BD · Resolver contagens NFC']);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['BD · Resolver contagens NFC'].main[0].map((x) => x.node), ['Montar pergunta contagens NFC']);
  assert.deepEqual(c['Montar pergunta contagens NFC'].main[0].map((x) => x.node).sort(), c['Montar pergunta contagens'].main[0].map((x) => x.node).sort(), 'salva a pendência e pergunta, como o concentrado');
  const resolver = workflow.nodes.find((n) => n.name === 'BD · Resolver contagens NFC').parameters;
  assert.match(resolver.query, /it\.codigo = '129'/);
  assert.match(resolver.options.queryReplacement, /pedidos/);
  const grava = workflow.nodes.find((n) => n.name === 'BD · Gravar contagens NFC');
  assert.match(grava.parameters.query, /p\.j ->> 'acao' = 'contagem_nfc'/);
  assert.match(grava.parameters.query, /ON CONFLICT \(analise, recebimento_nfc_id\) DO UPDATE/);
  assert.match(grava.parameters.query, /valor_lido/);
  assert.equal(grava.alwaysOutputData, true);
  assert.match(grava.parameters.options.queryReplacement || '={{ [$(\'Processar sim ou não\').first().json.tabAcao', /tabAcao|undefined/);
});

test('workflow: corrigir a diluição do lote recalcula os resultados já gravados', () => {
  const q = workflow.nodes.find((n) => n.name === 'BD · Gravar recebimento NFC').parameters.query;
  assert.match(q, /UPDATE contagens_nfc c SET diluicao = i\.diluicao, valor = c\.valor_lido \* power\(10, i\.diluicao\)/);
  assert.match(q, /c\.diluicao <> i\.diluicao/);
  const resp = rodar('Montar resposta recebimento NFC', { gravados: [{ lote: 10, amostra: 'past', diluicao: 2, novo: false, era: 1 }], recalculados: 3 },
    { item: interpretar('load 44300 fab aqa item 129 lote 10 past 10 elevado a 2') })[0].json.textoResposta;
  assert.match(resp, /3 resultado\(s\) de C\.T\/B\.L já gravado\(s\) foram recalculados com a nova diluição/);
});

// ---------- consultas e IA ----------
test('consultas: "quais ct tenho para ler hoje" e o resultado do load incluem o NFC', () => {
  const ler = workflow.nodes.find((n) => n.name === 'BD · Consultar contagens').parameters.query;
  assert.match(ler, /FROM vw_contagens_nfc_previstas vn/);
  assert.match(ler, /'nfc'::text AS origem/);
  assert.match(ler, /ORDER BY ord_data, origem, rotulo, "load", numero/);
  const load = workflow.nodes.find((n) => n.name === 'BD · Resultado do load').parameters.query;
  assert.match(load, /FROM vw_contagens_nfc_previstas vn/);
  // a resposta de "para ler hoje" agrupa por tipo e diluição, e a do load mostra o NFC
  const respLer = rodar('Montar resposta contagens', [
    { origem: 'nfc', rotulo: 'NFC load 44300 · past 10^1', load: '44300', numero: 10, prevista: '14/10/2026', atrasado: false, resultado: null, alarme: false },
    { origem: 'nfc', rotulo: 'NFC load 44300 · past 10^1', load: '44300', numero: 11, prevista: '14/10/2026', atrasado: false, resultado: null, alarme: false },
    { origem: 'nfc', rotulo: 'NFC load 44300 · fresh 10^3', load: '44300', numero: 10, prevista: '14/10/2026', atrasado: false, resultado: null, alarme: false },
  ], { item: { ...ctx, analise: 'CT', etapa: 'ler' } })[0].json.textoResposta;
  assert.match(respLer, /NFC load 44300 · past 10\^1: 10-11/);
  assert.match(respLer, /NFC load 44300 · fresh 10\^3: 10/);
  const respLoad = rodar('Montar resposta resultado do load', [
    { origem: 'nfc', load: '44300', item: '129', fabrica: 'AQA', analise: 'CT', numero: 10, prevista: '16/10/2026', resultado: '140', alarme: false, amostra: 'past', diluicao: 1 },
    { origem: 'nfc', load: '44300', item: '129', fabrica: 'AQA', analise: 'CT', numero: 11, prevista: '16/10/2026', resultado: null, alarme: false, amostra: 'past', diluicao: 1 },
  ], { item: { ...ctx, load: '44300', analises: 'CT' } })[0].json.textoResposta;
  assert.match(respLoad, /NFC load 44300 · item 129 · fábrica AQA · past 10\^1/);
  assert.match(respLoad, /C\.T 48h: 10 = 140/);
  assert.match(respLoad, /faltam lote 11/);
});

test('IA e ajuda conhecem o resultado do NFC', () => {
  const prompt = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments[0].value;
  assert.match(prompt, /34\. <ct\|bl72\|bl120> nfc load <load> lote <n> <past\|fresh> deu <valor>/);
  assert.match(prompt, /não multiplique/);
  assert.match(codigoDoNode('Validar resposta da IA'), /\['pede_sim', \/\^\(ct\|cts\|bls\?\|bl \?72\|bl \?120\) nfc load \.\* deu \/\]/);
  assert.match(interpretar('comandos recebimento nfc').textoResposta, /14 com 10\^1 vira 140/);
});

// ---------- foto ----------
const lerFoto = (obj) => rodar('Foto · Interpretar', { content: { parts: [{ text: JSON.stringify(obj) }] }, provedor: 'gemini' })[0].json;
const LAUDO = (lotes) => ({ formulario: 'recebimento_nfc', data: '14/10/2026', duvidas: [], blocos: [{ load: '44300', fabrica: 'AQA', item: '129', lotes }] });
const noBanco = (d, dil = () => 1, extra = () => ({})) => (d.buscasNfc || []).map((x) => ({ kind: 'nfc', idx: x.idx, alvo_id: 500 + x.lote, load_num: '44300', atual: null, diluicao: dil(x), ...extra(x) }));
const respFoto = (d, linhas) => rodar('Foto · Montar resposta', linhas, { 'Foto · Interpretar': d })[0].json;

test('foto: lê C.T, B.L 72h e B.L 120h por lote e tipo, sem multiplicar (a multiplicação é do sistema)', () => {
  const d = lerFoto(LAUDO([{ lote: 10, tipo: 'past', diluicao: 1, ct: '14', bl72: '22', bl120: '74' }, { lote: 10, tipo: 'fresh', diluicao: 3, ct: '<10', bl72: null, bl120: '—' }]));
  assert.equal(d.resultadosNfc.length, 4);
  const ct = d.resultadosNfc.find((x) => x.lote === 10 && x.amostra === 'past' && x.analise === 'CT');
  assert.deepEqual([ct.lido, ct.sinal, ct.dilPapel], [14, '=', 1]);
  const fr = d.resultadosNfc.find((x) => x.amostra === 'fresh');
  assert.deepEqual([fr.analise, fr.sinal, fr.lido], ['CT', '<', 10]);
  assert.equal(d.buscasNfc.filter((x) => x.analise === null).length, 2);
});

test('foto: com os lotes já registrados, um sim grava tudo, multiplicado pela diluição do banco', () => {
  const d = lerFoto(LAUDO([{ lote: 10, tipo: 'past', diluicao: 1, ct: '14', bl72: '22', bl120: '74' }]));
  const r = respFoto(d, noBanco(d));
  assert.equal(r.salvar, '1');
  assert.equal(r.tipoPendencia, 'TAB');
  assert.match(r.textoResposta, /Li os resultados do laudo de recebimento NFC/);
  assert.match(r.textoResposta, /load 44300:\n   lote 10 · past · 10\^1: CT 14 → 140 · BL72 22 → 220 🚨 · BL120 74 → 740 🚨/);
  assert.match(r.textoResposta, /3 resultados de C\.T\/B\.L\. O número lido é multiplicado pela diluição/);
  assert.match(r.textoResposta, /Valor riscado no papel não foi lido\. Responda \*sim\*/);
  const payload = JSON.parse(r.payload);
  assert.equal(payload.acao, 'contagem_nfc');
  assert.deepEqual(payload.itens.map((i) => [i.analise, i.valor, i.lido, i.id]), [['CT', 140, 14, 510], ['BL72', 220, 22, 510], ['BL120', 740, 74, 510]]);
});

test('foto: a diluição do sistema manda; se o papel disser outra, o bot avisa', () => {
  const d = lerFoto(LAUDO([{ lote: 10, tipo: 'past', diluicao: 1, ct: '14' }]));
  const r = respFoto(d, noBanco(d, () => 3));
  assert.deepEqual(JSON.parse(r.payload).itens.map((i) => i.valor), [14000]);
  assert.match(r.textoResposta, /o papel diz 10\^1 e o sistema tem 10\^3; usei a do sistema/);
});

test('foto: tudo riscado grava nada; lote não registrado vira registro primeiro; correção é avisada', () => {
  const vazio = lerFoto(LAUDO([{ lote: 10, tipo: 'past', diluicao: 1, ct: null, bl72: null, bl120: null }]));
  const r1 = respFoto(vazio, noBanco(vazio));
  assert.equal(r1.salvar, '0');
  assert.match(r1.textoResposta, /os lotes já estão registrados e não achei resultado válido de C\.T\/B\.L \(tudo riscado ou em branco\)\. Nada foi gravado/);
  const d = lerFoto(LAUDO([{ lote: 10, tipo: 'past', diluicao: 1, ct: '14' }]));
  const novo = respFoto(d, d.buscasNfc.map((x) => ({ kind: 'nfc', idx: x.idx, alvo_id: null, load_num: null, atual: null, diluicao: null })));
  assert.equal(novo.salvar, '1');
  assert.equal(novo.tipoPendencia, undefined, 'segue a lista de comandos de recebimento');
  assert.match(novo.textoResposta, /Recebimento NFC load 44300 fab AQA item 129 lote 10 past 10 elevado a 1/);
  assert.match(novo.textoResposta, /li 1 resultado\(s\) de C\.T\/B\.L, mas os lotes ainda não estão registrados: registre agora \(sim\) e mande a foto de novo/);
  const corr = respFoto(d, noBanco(d, () => 1, () => ({ atual: '90' })));
  assert.match(corr.textoResposta, /Corrige resultado anterior: lote 10 past CT \(era 90\)/);
});

test('foto: texto que não é número fica de fora com aviso; "<" não alarma; o prompt ensina a não multiplicar', () => {
  const d = lerFoto(LAUDO([{ lote: 10, tipo: 'past', diluicao: 1, ct: 'abc', bl72: '<300', bl120: '10' }]));
  assert.ok(d.duvidas.some((x) => /lote 10 past CT: não entendi "abc"; fica de fora/.test(x)));
  const r = respFoto(d, noBanco(d));
  assert.doesNotMatch(r.textoResposta, /BL72 <300 → <3000 🚨/);
  assert.match(r.textoResposta, /BL72 <300 → <3000/);
  const [{ json }] = rodar('Foto · Montar pedido', {}, { 'Foto em arquivo': { foto_b64: 'QUJD', mime: 'image/jpeg' } });
  const p = json.pedido.contents[0].parts[0].text;
  assert.match(p, /SEM multiplicar pela diluição/);
  assert.match(p, /"ct": "14", "bl72": "22", "bl120": null/);
});

test('foto: a busca no banco traz o NFC (lote, diluição e resultado atual)', () => {
  const b = workflow.nodes.find((n) => n.name === 'BD · Compostas da foto').parameters;
  assert.match(b.query, /'nfc'::text AS kind/);
  assert.match(b.query, /vw_contagens_nfc vc ON vc\.recebimento_nfc_id = r\.id AND vc\.analise = b\.analise/);
  assert.match(b.options.queryReplacement, /nfc: \$json\.buscasNfc/);
});
