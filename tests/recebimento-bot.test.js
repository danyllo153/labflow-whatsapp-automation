'use strict';

// Corrigir e apagar recebimento pelo WhatsApp (23/10/2026): os comandos chamam a recebimento_pelo_bot (migration 037),
// que acha o load e o lote pelo número e usa as funções da 036. A função foi ensaiada no servidor num bloco desfeito
// (13 casos: corrigir lote, data, load, item e fábrica; apagar; composta; load/lote inexistente; dois loads iguais;
// não cadastrado; Consultor; lote inválido). Aqui os comandos, a resposta e a ligação no workflow. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const como = (frase, cargo = 'Analista') => interpretar(frase, { cargo });

test('comandos: load, item, fábrica, lote, data e apagar viram a ação certa', () => {
  const casos = [
    ['corrigir load 43453 para 43413', 'load', { load: '43453', campos: { numero: '43413' } }],
    ['Corrigir o load 43453 item 2549 para 43413', 'load', { load: '43453', item: '2549', campos: { numero: '43413' } }],
    ['corrigir item do load 43453 para 2503', 'load', { load: '43453', campos: { item: '2503' } }],
    ['corrigir fábrica do load 43453 para AQA', 'load', { load: '43453', campos: { fabrica: 'AQA' } }],
    ['trocar a fabrica do load 43453 para Araraquara', 'load', { load: '43453', campos: { fabrica: 'AQA' } }],
    ['corrigir lote 4 do load 43670 para 40', 'lote', { load: '43670', lote: 4, campos: { lote: 40 } }],
    ['corrigir lote 4 do load 43670 item 2549 para o lote 40', 'lote', { load: '43670', item: '2549', lote: 4, campos: { lote: 40 } }],
    ['corrigir data do lote 4 do load 43670 para 20/10/2026', 'lote', { load: '43670', lote: 4, campos: { data_recebimento: '2026-10-20' } }],
    ['corrigir a data do lote 4 do load 43670 para 5.10.26', 'lote', { load: '43670', lote: 4, campos: { data_recebimento: '2026-10-05' } }],
    ['apagar lote 4 do load 43670', 'excluir', { load: '43670', lote: 4 }],
    ['excluir o lote 4 do load 43670 item 2549', 'excluir', { load: '43670', item: '2549', lote: 4 }],
  ];
  for (const [frase, acao, dados] of casos) {
    const r = como(frase);
    assert.equal(r.tipo, 'recebimento_corrigir', frase);
    assert.equal(r.acao, acao, frase);
    assert.deepEqual(JSON.parse(r.dadosJson), dados, frase);
  }
});

test('comandos: valor igual, fábrica, item e data inválidos são recusados sem ir ao banco', () => {
  assert.match(como('corrigir load 43453 para 43453').textoResposta, /igual ao antigo/);
  assert.match(como('corrigir lote 4 do load 43670 para 4').textoResposta, /igual ao antigo/);
  assert.match(como('corrigir fabrica do load 43453 para XPTO').textoResposta, /Fábrica inválida/);
  assert.match(como('corrigir item do load 43453 para abc').textoResposta, /Item inválido/);
  assert.match(como('corrigir data do lote 4 do load 43670 para 31/02/2026').textoResposta, /Data inválida/);
  for (const f of ['corrigir fabrica do load 43453 para XPTO', 'corrigir data do lote 4 do load 43670 para 31/02/2026']) assert.equal(como(f).tipo, 'erro_coleta', f);
});

test('permissão: Consultor e Coletor barrados no bot (o banco confere de novo: só Admin e Analista)', () => {
  assert.match(como('apagar lote 4 do load 43670', 'Consultor').textoResposta, /somente de consulta/);
  assert.match(como('corrigir load 43453 para 43413', 'Coletor').textoResposta, /Coletor/);
  assert.equal(como('corrigir load 43453 para 43413', 'Admin').tipo, 'recebimento_corrigir');
  assert.equal(como('corrigir coleta tanque terra 42 para 43').tipo, 'coleta_corrigir', 'o corrigir coleta continua');
});

test('ajuda: comandos recebimento ensina a corrigir e apagar', () => {
  const t = como('comandos recebimento').textoResposta;
  assert.match(t, /corrigir load 43453 para 43413/);
  assert.match(t, /corrigir data do lote 4 do load 43670 para 20\/10\/2026/);
  assert.match(t, /apagar lote 4 do load 43670 \(só sem C\.T\/B\.L, composta ou teste; um Admin recupera\)/);
});

function resposta(item, r) {
  const $ = () => ({ first: () => ({ json: item }) });
  return new Function('$', '$input', codigoDoNode('Montar resposta corrigir recebimento'))($, { first: () => ({ json: { r } }) })[0].json.textoResposta;
}
test('resposta: diz o que mudou, ou o erro do banco', () => {
  assert.equal(resposta({ acao: 'load' }, { ok: true, lotes: 7, antes: { numero: '43453', item: '2549', fabrica: 'UCH' }, depois: { numero: '43413', item: '2549', fabrica: 'UCH' } }),
    '✅ Load corrigido: load 43453 → 43413. Vale para os 7 lotes dele; fica no histórico.');
  assert.match(resposta({ acao: 'load' }, { ok: true, lotes: 1, antes: { numero: '1', item: '2549', fabrica: 'UCH' }, depois: { numero: '1', item: '2503', fabrica: 'AQA' } }),
    /item 2549 → 2503, fábrica UCH → AQA\. Vale para o lote dele/);
  assert.equal(resposta({ acao: 'lote' }, { ok: true, load: '43670', antes: { lote: 4, data_recebimento: '23/10/2026' }, depois: { lote: 40, data_recebimento: '23/10/2026' } }),
    '✅ Recebimento corrigido no load 43670: lote 4 → 40. Fica no histórico.');
  assert.match(resposta({ acao: 'lote' }, JSON.stringify({ ok: true, load: '43670', antes: { lote: 4, data_recebimento: '23/10/2026' }, depois: { lote: 4, data_recebimento: '20/10/2026' } })),
    /data 23\/10\/2026 → 20\/10\/2026/);
  assert.equal(resposta({ acao: 'excluir' }, { ok: true, load: '43670', lote: 4, restam: 0 }),
    '✅ Lote 4 do load 43670 apagado. Fica guardado e um Admin pode recuperar. O load ficou sem lotes.');
  assert.equal(resposta({ acao: 'excluir' }, { ok: false, erro: 'O lote está numa composta: tire-o da composta antes de excluir.' }),
    '❌ O lote está numa composta: tire-o da composta antes de excluir. Nada foi alterado.');
  assert.match(resposta({ acao: 'lote' }, null), /Não consegui alterar/);
});

test('workflow: roteado até o banco, a resposta e o WhatsApp; o SQL só chama a recebimento_pelo_bot', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('recebimento_corrigir')].map((x) => x.node), ['BD · Corrigir recebimento']);
  assert.deepEqual(c['BD · Corrigir recebimento'].main[0].map((x) => x.node), ['Montar resposta corrigir recebimento']);
  assert.deepEqual(c['Montar resposta corrigir recebimento'].main[0].map((x) => x.node), ['Zap · Corrigir recebimento']);
  assert.deepEqual(c['Zap · Corrigir recebimento'].main[0].map((x) => x.node), ['Fim · Corrigir recebimento']);
  const q = workflow.nodes.find((n) => n.name === 'BD · Corrigir recebimento').parameters;
  assert.match(q.query, /SELECT recebimento_pelo_bot\(\$1::text, \$2::jsonb, \$3::text\) AS r;/);
  assert.match(q.options.queryReplacement, /\$json\.acao, \$json\.dadosJson, \$json\._numeroRemetenteLimpo/);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '037_recebimento_bot.sql'), 'utf8');
  assert.match(sql, /WHEN raise_exception THEN\s+RETURN jsonb_build_object\('ok', false, 'erro', SQLERRM\);/, 'erro da regra volta como texto');
  for (const f of ['corrigir_load(v_load.id', 'corrigir_recebimento(v_lote.id', 'excluir_recebimento(v_lote.id']) assert.ok(sql.includes(f), f);
  assert.match(sql, /Há mais de um load % \(itens %\): diga o item/);
  assert.match(sql, /TO labflow_app;/);
});
