'use strict';

// NFC placa a placa (docs/specs/nfc-resultados-placas.md): comandos de placas e de repetição no
// "Interpretar comando", e os Code nodes que montam a pergunta (ok / não ok, desvio) e a resposta do "sim".
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode } = require('./helpers/executar-node');

// Roda um Code node com a saída simulada de nodes anteriores: `nodes` = { 'Nome do node': json }.
function rodar(nome, entrada, nodes = {}) {
  const $ = (n) => {
    if (!(n in nodes)) throw new Error(`O teste nao simula o node: ${n}`);
    return { first: () => ({ json: nodes[n] }) };
  };
  const itens = [].concat(entrada).map((json) => ({ json }));
  const $input = { all: () => itens, first: () => itens[0] };
  return new Function('$', '$input', codigoDoNode(nome))($, $input)[0].json;
}

const placas = (frase) => {
  const r = interpretar(frase);
  return r && { tipo: r.tipo, sub: r.sub, metodo: r.metodo, etapa: r.etapa, tanque: r.tanque, navio: r.navio,
    frasco: r.frasco, placas: r.placas && r.placas.map((p) => (p.sinal === '=' ? '' : p.sinal) + p.valor).join(' '),
    dataColeta: r.dataColeta };
};

test('placas: cada análise vira sub-análise, método e etapa', () => {
  assert.deepEqual(placas('ct do tanque 47 normal 12,8,15'), { tipo: 'placas_nfc', sub: 'CT', metodo: 'Profundidade',
    etapa: 'final', tanque: '47', navio: '', frasco: 'Normal', placas: '12 8 15', dataColeta: '' });
  assert.equal(placas('bl72 do tanque 5 stress 0,1,0').etapa, 'pre');
  assert.equal(placas('bl120 do tanque 5 stress 0,1,0').etapa, 'final');
  assert.equal(placas('bl do tanque 5 stress 0,1,0').etapa, 'final'); // bl sozinho = bl120
  const w = placas('wort superficie 120h do tanque 47 stress 1,0,0');
  assert.deepEqual([w.sub, w.metodo, w.etapa], ['WORT', 'Superficie', 'pre']);
  const w2 = placas('Wort profundidade 240h do tanque 47 normal 0,0,1 coleta 01/10/2026');
  assert.deepEqual([w2.metodo, w2.etapa, w2.dataColeta], ['Profundidade', 'final', '01/10/2026']);
});

test('placas: navio, "e", 0 e <1 viram "<1", >300 é incontável', () => {
  const r = placas('bl120 do tanque 5 navio D.SKY 123 normal 0, <1 e >300');
  assert.equal(r.navio, 'D.SKY 123');
  assert.equal(r.placas, '<1 <1 >300');
  assert.equal(placas('C.T 48h do tanque 47 Normal: 30, 12 e 8').placas, '30 12 8');
});

test('placas: sem as 3 placas ou com "<" diferente de 1, explica o formato', () => {
  for (const frase of ['ct do tanque 47 normal 12,8', 'ct do tanque 47 normal 12,8,15,3', 'ct do tanque 47 normal 12,<5,8']) {
    const r = interpretar(frase);
    assert.equal(r.tipo, 'erro_coleta', frase);
    assert.match(r.textoResposta, /❌/);
  }
});

test('placas: consultor não registra; C.T do concentrado continua no comando dele', () => {
  assert.equal(interpretar('ct do tanque 47 normal 12,8,15', { cargo: 'Consultor' }).tipo, 'erro_coleta');
  assert.equal(interpretar('ct load 77001 lote 4 deu 10').tipo, 'contagem_registrar');
});

test('repetição e reanálise: o mesmo comando, nunca análise nova', () => {
  for (const frase of ['repetição do tanque 47 stress bl120', 'reanálise do tanque 47 stress bl120', 'Reanalise do tanque 47 stress bl120']) {
    const r = interpretar(frase);
    assert.deepEqual([r.tipo, r.tanque, r.frasco, r.sub, r.etapa], ['repeticao_nfc', '47', 'Stress', 'BL', 'final'], frase);
  }
  const r = interpretar('reanalise do normal do tanque 42, data 24/09/2026');
  assert.equal(r.tipo, 'repeticao_nfc');
  assert.equal(interpretar('repetição do tanque 5 navio D.SKY 123 normal ct').navio, 'D.SKY 123');
  assert.equal(interpretar('repetição feita').tipo, 'erro_coleta'); // sem o tanque
});

// ---------------------------------------------------------------- pergunta das placas
const pedido = (frase) => ({ ...interpretar(frase), _numeroRemetenteLimpo: '5511900000001' });
const leitura = (extra = {}) => ({ analise_id: '10', tanque: '47', navio: null, data_coleta: '07/10/2026',
  prevista: '09/10/2026', hoje: true, repeticao: false, limite: '40', ja_lidas: '0', tem_desvio: false, ...extra });

test('pergunta das placas: ok e não ok pelo limite, e avisa do desvio', () => {
  const item = pedido('ct do tanque 47 normal 12,8,15');
  const ok = rodar('Montar pergunta placas', leitura(), { 'Interpretar comando': item });
  assert.match(ok.textoResposta, /12, 8, 15 → ✅ \*ok\*/);
  assert.equal(JSON.parse(ok.payload).nao_ok, false);
  assert.equal(ok.salvar, true);

  const ruim = pedido('ct do tanque 47 normal 41,12,8');
  const nok = rodar('Montar pergunta placas', leitura(), { 'Interpretar comando': ruim });
  assert.match(nok.textoResposta, /🚨 \*não ok\*/);
  assert.match(nok.textoResposta, /pergunto se abre o desvio/);
  const p = JSON.parse(nok.payload);
  assert.deepEqual([p.acao, p.analise_id, p.etapa, p.nao_ok], ['placas', 10, 'final', true]);
  assert.match(p.pergunta_desvio, /Abrir desvio do tanque 47 \(C\.T 48h, Normal\)/);
});

test('pergunta das placas: repetição não ok não abre outro desvio; sem leitura, explica', () => {
  const item = pedido('ct do tanque 47 normal 41,12,8');
  const rep = rodar('Montar pergunta placas', leitura({ repeticao: true }), { 'Interpretar comando': item });
  assert.equal(JSON.parse(rep.payload).nao_ok, false);
  assert.match(rep.textoResposta, /desvio fecha como \*não ok\*/);
  const nada = rodar('Montar pergunta placas', {}, { 'Interpretar comando': item });
  assert.equal(nada.salvar, false);
  assert.match(nada.textoResposta, /Não achei leitura de C\.T 48h do tanque 47 \(Normal\)/);
});

// ---------------------------------------------------------------- pergunta da repetição
const desvio = (extra = {}) => ({ desvio_id: '3', etapa: 'final', repeticao_feita: false, frasco: 'Stress', sub_analise: 'BL',
  metodo: 'Profundidade', tanque: '47', navio: null, data_coleta: '07/10/2026', contagem: '0, 5, 0', rep_pre: '12/10/2026',
  rep_final: '14/10/2026', ...extra });

test('repetição: só com desvio aberto', () => {
  const item = pedido('reanálise do tanque 47 stress bl120');
  const sem = rodar('Montar pergunta repetição', {}, { 'Interpretar comando': item });
  assert.equal(sem.salvar, false);
  assert.match(sem.textoResposta, /não tem desvio aberto no B\.L 120h Stress\. A repetição só vale para leitura acima do limite/);

  const com = rodar('Montar pergunta repetição', desvio(), { 'Interpretar comando': item });
  assert.deepEqual(JSON.parse(com.payload), { acao: 'repeticao', desvio_id: 3 });
  assert.match(com.resumo, /^✅ Repetição feita: B\.L 120h do tanque 47 \(Stress\)/);

  const dois = rodar('Montar pergunta repetição', [desvio(), desvio({ desvio_id: '4', sub_analise: 'CT', frasco: 'Normal' })],
    { 'Interpretar comando': pedido('repetição do tanque 47') });
  assert.equal(dois.salvar, false);
  assert.match(dois.textoResposta, /tem 2 desvios abertos/);
});

// ---------------------------------------------------------------- "sim"
test('sim das placas: resumo e, se não ok, a pergunta do desvio depois de gravar (Bug 29)', () => {
  const item = { ...interpretar('sim'), _numeroRemetenteLimpo: '5511900000001' };
  const pend = { tipo: 'PLACAS', payload: { acao: 'placas' }, resumo: '✅ Gravado: C.T 48h ...', minutos: 1 };
  const proc = rodar('Processar sim ou não', pend, { 'Interpretar comando': item });
  assert.equal(proc.nfcAcao, JSON.stringify({ acao: 'placas' }));
  assert.equal(proc.limparPendencia, true);
  const fim = rodar('Retomar resposta do sim', { placas: 3, perguntaDesvio: '❓ Abrir desvio do tanque 47?' },
    { 'Processar sim ou não': proc });
  assert.match(fim.textoResposta, /^✅ Gravado: C\.T 48h[^]*\n\n❓ Abrir desvio do tanque 47\?$/);
  const semPergunta = rodar('Retomar resposta do sim', { placas: 3, perguntaDesvio: '' }, { 'Processar sim ou não': proc });
  assert.doesNotMatch(semPergunta.textoResposta, /Abrir desvio/);
});
