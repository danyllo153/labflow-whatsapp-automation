'use strict';

// Corrigir um resultado de C.T/B.L já gravado com um comando curto (24/10/2026): "corrigir ct do load 43755 para <1".
// A corrigir_resultado_pelo_bot (migration 039) acha o resultado (NFC ou FCOJ), guarda a pendência do sim e, depois do sim,
// grava com o histórico. A função foi ensaiada no servidor num bloco desfeito (12 casos: igual, Analista sem motivo, Admin sem
// motivo, gravar, gravar de novo, vários lotes, com lote, FCOJ, load e amostra inexistentes, número não cadastrado).
// Aqui o comando, a resposta e a ligação no workflow. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const como = (frase, cargo = 'Analista', opcoes = {}) => interpretar(frase, { cargo, ...opcoes });

test('comando: análise, load, item, lote, fresh/past, valor e motivo viram os dados da prévia', () => {
  const casos = [
    ['corrigir ct do load 43755 para <1', { analise: 'CT', load: '43755', sinal: '<', valor: 1 }],
    ['Corrigir CT do load 43755 para <1 motivo foto leu 21', { analise: 'CT', load: '43755', sinal: '<', valor: 1, motivo: 'foto leu 21' }],
    ['corrigir bl72 do load 43755 lote 148 fresh para 12, motivo: leitura trocada', { analise: 'BL72', load: '43755', sinal: '=', valor: 12, lote: 148, amostra: 'fresh', motivo: 'leitura trocada' }],
    ['alterar bl 120 do load 43670 item 2549 lote 4 para >300', { analise: 'BL120', load: '43670', sinal: '>', valor: 300, item: '2549', lote: 4 }],
    ['corrigir o resultado do ct nfc do load 43755 do lote 148 past para 1,5', { analise: 'CT', load: '43755', sinal: '=', valor: 1.5, lote: 148, amostra: 'past' }],
    ['corrigir ct do load 43755 para <1 porque a placa foi lida errada', { analise: 'CT', load: '43755', sinal: '<', valor: 1, motivo: 'a placa foi lida errada' }],
  ];
  for (const [frase, dados] of casos) {
    const r = como(frase);
    assert.equal(r.tipo, 'resultado_corrigir', frase);
    assert.equal(r.fase, 'previa', frase);
    assert.deepEqual(JSON.parse(r.dadosJson), dados, frase);
  }
  assert.equal(JSON.parse(como('corrigir ct do load 1 para 2 motivo Leitura é de João').dadosJson).motivo, 'Leitura é de João', 'motivo com acento e maiúscula');
});

test('comando: "bl" sem 72/120 é recusado; Consultor e Coletor barrados (o banco confere Admin e Analista)', () => {
  const r = como('corrigir bl do load 43755 para <1');
  assert.equal(r.tipo, 'erro_coleta');
  assert.match(r.textoResposta, /bl72 ou bl120/);
  assert.match(como('corrigir ct do load 43755 para <1', 'Consultor').textoResposta, /somente de consulta/);
  assert.match(como('corrigir ct do load 43755 para <1', 'Coletor').textoResposta, /Coletor/);
  assert.equal(como('corrigir ct do load 43755 para <1', 'Admin').tipo, 'resultado_corrigir');
  assert.equal(como('corrigir lote 4 do load 43670 para 40').tipo, 'recebimento_corrigir', 'o corrigir recebimento continua');
});

test('sim: "resultado corrigido" só vale no reenvio do próprio bot', () => {
  const dados = { tabela: 'contagens_nfc', id: 25, analise: 'CT', sinal: '<', valor: 1, era: { sinal: '=', valor: 21000 }, motivo: 'foto' };
  const cmd = 'resultado corrigido: ' + JSON.stringify(dados);
  const fora = como(cmd);
  assert.equal(fora.tipo, 'erro_coleta');
  assert.match(fora.textoResposta, /usado pelo \*sim\*/);
  const r = como(cmd, 'Analista', { reenvio: true });
  assert.equal(r.tipo, 'resultado_corrigir');
  assert.equal(r.fase, 'gravar');
  assert.deepEqual(JSON.parse(r.dadosJson), dados);
  assert.match(como('resultado corrigido: {quebrado', 'Analista', { reenvio: true }).textoResposta, /Não entendi a correção/);
});

test('ajuda: comandos recebimento e recebimento nfc ensinam a corrigir resultado', () => {
  assert.match(como('comandos recebimento').textoResposta, /corrigir ct do load 43670 lote 4 para <10 motivo foto leu errado/);
  assert.match(como('comandos recebimento nfc').textoResposta, /corrigir ct do load 43755 para <1 motivo foto leu errado/);
});

function resposta(r, item = { nomeContato: 'Ana' }) {
  const $ = () => ({ first: () => ({ json: item }) });
  return new Function('$', '$input', codigoDoNode('Montar resposta corrigir resultado'))($, { first: () => ({ json: { r } }) })[0].json.textoResposta;
}
test('resposta: prévia com "era → novo" e sim; gravado; erro do banco', () => {
  const resumo = 'C.T 48h do load 43755 lote 148 fresh (NFC, 10^3): era 21 (21000) → <1 (<1000)';
  assert.equal(resposta({ ok: true, fase: 'previa', resumo, motivo: 'foto leu errado' }),
    '✏️ Corrigir ' + resumo + '.\nMotivo: foto leu errado\n\nResponda *sim* para gravar ou *não* para cancelar.');
  assert.equal(resposta(JSON.stringify({ ok: true, fase: 'previa', resumo, motivo: null })),
    '✏️ Corrigir ' + resumo + '.\n\nResponda *sim* para gravar ou *não* para cancelar.');
  assert.equal(resposta({ ok: true, fase: 'gravar', resumo }), '✅ Resultado corrigido: ' + resumo + '. Fica no histórico.\n\nPor: Ana');
  assert.equal(resposta({ ok: false, erro: 'O load 43670 tem C.T 48h em mais de um lote (1, 2): diga o lote, ex.: corrigir ct do load 43670 lote 1 para ...' }),
    '❌ O load 43670 tem C.T 48h em mais de um lote (1, 2): diga o lote, ex.: corrigir ct do load 43670 lote 1 para ... Nada foi alterado.');
  assert.match(resposta(null), /Não consegui corrigir/);
});

test('workflow: roteado até o banco, a resposta e o WhatsApp; o SQL só chama a corrigir_resultado_pelo_bot', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('resultado_corrigir')].map((x) => x.node), ['BD · Corrigir resultado']);
  assert.deepEqual(c['BD · Corrigir resultado'].main[0].map((x) => x.node), ['Montar resposta corrigir resultado']);
  assert.deepEqual(c['Montar resposta corrigir resultado'].main[0].map((x) => x.node), ['Zap · Corrigir resultado']);
  assert.deepEqual(c['Zap · Corrigir resultado'].main[0].map((x) => x.node), ['Fim · Corrigir resultado']);
  const q = workflow.nodes.find((n) => n.name === 'BD · Corrigir resultado').parameters;
  assert.match(q.query, /SELECT corrigir_resultado_pelo_bot\(\$1::text, \$2::jsonb, \$3::text\) AS r;/);
  assert.match(q.options.queryReplacement, /\$json\.fase, \$json\.dadosJson, \$json\._numeroRemetenteLimpo/);
});

test('migration 039: regras do Danyllo (motivo do Analista, quem corrigiu, só Admin e Analista) e pendência do sim', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '039_corrigir_resultado.sql'), 'utf8');
  assert.match(sql, /IF v_cargo NOT IN \('Admin', 'Analista'\) THEN/);
  assert.match(sql, /IF v_cargo = 'Analista' AND v_motivo IS NULL THEN/);
  assert.match(sql, /INSERT INTO historico_alteracoes \(tipo, tabela, registro_id, antes, depois, motivo, quem\)/);
  assert.match(sql, /'resultado corrigido: ' \|\| v_dados::text/);
  assert.match(sql, /O resultado mudou desde a pergunta/);
  assert.match(sql, /trim_scale\(v_valor \* power\(10::numeric, r\.diluicao\)\)/, 'NFC: valor da placa x diluição');
  assert.match(sql, /WHEN raise_exception THEN\s+RETURN jsonb_build_object\('ok', false, 'erro', SQLERRM\);/);
  assert.match(sql, /TO labflow_app;/);
  const desfazer = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '039_corrigir_resultado_desfazer.sql'), 'utf8');
  assert.match(desfazer, /DROP FUNCTION IF EXISTS corrigir_resultado_pelo_bot\(text, jsonb, text\);/);
});
