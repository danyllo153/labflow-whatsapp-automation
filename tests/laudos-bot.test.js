'use strict';

// Esterilização, água do processo, baias e linhas por frase (24/10/2026, pedidos PB8 e PB9 do app). O comando vira
// "laudo_registrar" e a laudo_registrar_pelo_bot (migration 049) chama as funções do app (067): prévia que se desfaz e guarda o
// "sim", gravação depois do "sim". A função foi ensaiada no servidor em bloco desfeito (prévia e gravar de cada ação, erros do
// app e número não cadastrado). Aqui o comando, a resposta e a ligação no workflow. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const ANO = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).slice(6);
const como = (frase, cargo = 'Analista', opcoes = {}) => interpretar(frase, { cargo, ...opcoes });
const dados = (frase, cargo) => JSON.parse(como(frase, cargo).dadosJson);
const mig = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');

test('esterilização: materiais, ciclo com a caixa que a pessoa digitou, data e hora opcionais', () => {
  assert.deepEqual(dados('esterilizei meio de cultura e frascos, ciclo A1092/26'), { acao: 'esterilizar', tipos: ['Meio', 'Frasco'], ciclo: 'A1092/26' });
  assert.deepEqual(dados('Esterilizei ponteiras ciclo A1093/26 data 24/10 14:30'),
    { acao: 'esterilizar', tipos: ['Ponteira'], ciclo: 'A1093/26', data: `24/10/${ANO}`, hora: '14:30' });
  assert.deepEqual(dados('esterilizei agua de diluicao e descarte ciclo B7').tipos, ['Água de diluição', 'Descarte']);
  const outro = dados('esterilizei outro ciclo A1 descricao luvas de nitrilo');
  assert.deepEqual([outro.tipos, outro.descricao], [['Outro'], 'luvas de nitrilo']);
  assert.equal(dados('esterilizei meio de cultura ciclo A1 nome do meio PCA').meio, 'PCA');
  const r = como('esterilizei meio de cultura e frascos, ciclo A1092/26');
  assert.deepEqual([r.tipo, r.fase], ['laudo_registrar', 'previa']);
});

test('esterilização: sem ciclo, sem material ou "outro" sem descrição não chega ao banco', () => {
  assert.match(como('esterilizei frascos').textoResposta, /Faltou o número do ciclo/);
  assert.match(como('esterilizei ciclo A1').textoResposta, /Diga o que foi esterilizado/);
  assert.match(como('esterilizei outro ciclo A1').textoResposta, /descreva o que foi/);
  assert.equal(como('esterilizei frascos').tipo, 'erro_coleta');
});

test('água do processo: coleta por ponto e resultados (sem ponto vale para todos, o ponto dito vale só para ele)', () => {
  assert.deepEqual(dados('coleta agua do processo manifold, camara 5'), { acao: 'agua_coletar', pontos: ['manifold', 'camara5'] });
  assert.deepEqual(dados('coleta agua do processo camara 4 e 6').pontos, ['camara4', 'camara6']);
  assert.deepEqual(dados('coleta agua do processo todos').pontos, ['manifold', 'camara4', 'camara5', 'camara6']);
  assert.deepEqual(dados('agua do processo ct <1 bl <1 camara 5 bl 2'), { acao: 'agua_lancar', ct: { todos: '<1' }, bl: { todos: '<1', camara5: '2' } });
  assert.deepEqual(dados('água do processo ct < 1 bl 3'), { acao: 'agua_lancar', ct: { todos: '<1' }, bl: { todos: '3' } });
  assert.deepEqual(dados('agua do processo manifold ct <1 bl <1').ct, { manifold: '<1' });
  assert.match(como('coleta agua do processo').textoResposta, /Diga os pontos coletados/);
});

test('baias e linhas: "analisei" (são análise, 25/10), data e resultados; "bl" sozinho é recusado', () => {
  assert.deepEqual(dados('analisei baia 8,9'), { acao: 'superficie_coletar', tipo: 'Baia', pontos: ['8', '9'] });
  assert.deepEqual(dados('Analisei a linha 3 data 24/10 14:00'), { acao: 'superficie_coletar', tipo: 'Linha', pontos: ['3'], data: `24/10/${ANO}`, hora: '14:00' });
  assert.deepEqual(dados('analisamos as baias 8 e 9').pontos, ['8', '9']);
  assert.deepEqual(dados('coleta de baia 8,9 analise 26/10'), { acao: 'superficie_coletar', tipo: 'Baia', pontos: ['8', '9'], analise: `26/10/${ANO}` });
  assert.match(como('analisei baia data 24/10').textoResposta, /Ex\.: analisei baia 8,9/);
  assert.deepEqual(dados('baia 8 ct48 <1 bl72 <1 bl120 2'), { acao: 'superficie_lancar', tipo: 'Baia', ponto: '8', campos: { ct_48: '<1', bl_72: '<1', bl_120: '2' } });
  assert.deepEqual(dados('linha 3 ct <1').campos, { ct_48: '<1' });
  assert.match(como('linha 3 ct <1 bl 5').textoResposta, /Diga qual B\.L: bl72 ou bl120/);
});

test('permissões: Consultor bloqueado; Coletor só na água (baia e linha são análise); o sim é só do reenvio', () => {
  assert.match(como('esterilizei frascos ciclo A1', 'Consultor').textoResposta, /somente de consulta/);
  assert.equal(como('coleta agua do processo manifold', 'Coletor').tipo, 'laudo_registrar');
  assert.match(como('analisei baia 8', 'Coletor').textoResposta, /Baias e linhas são análise: só Admin e Analista/);
  assert.match(como('coleta de baia 8', 'Coletor').textoResposta, /Baias e linhas são análise/);
  const cmd = 'laudo registrado: ' + JSON.stringify({ acao: 'agua_coletar', pontos: ['manifold'] });
  assert.match(como(cmd).textoResposta, /usado pelo \*sim\*/);
  const r = como(cmd, 'Analista', { reenvio: true });
  assert.deepEqual([r.tipo, r.fase], ['laudo_registrar', 'gravar']);
  assert.deepEqual(JSON.parse(r.dadosJson), { acao: 'agua_coletar', pontos: ['manifold'] });
  assert.match(como('laudo registrado: {quebrado', 'Analista', { reenvio: true }).textoResposta, /Não entendi o registro/);
});

test('resposta: prévia pede sim, gravar confirma, erro do banco diz o motivo', () => {
  const montar = (r) => new Function('$', '$input', codigoDoNode('Montar resposta laudo'))(
    () => ({ first: () => ({ json: { nomeContato: 'Ana' } }) }), { first: () => ({ json: { r } }) })[0].json.textoResposta;
  assert.equal(montar({ ok: true, fase: 'previa', resumo: 'Água do processo: Manifold' }), '📝 Registrar:\nÁgua do processo: Manifold\n\nResponda *sim* para gravar ou *não* para cancelar.');
  assert.equal(montar({ ok: true, fase: 'gravar', resumo: 'Água do processo: Manifold' }), '✅ Registrado:\nÁgua do processo: Manifold\n\nPor: Ana');
  assert.equal(montar({ ok: false, erro: 'Informe o número do ciclo.' }), '❌ Informe o número do ciclo. Nada foi gravado.');
  assert.match(montar(null), /Nada foi gravado/);
});

test('workflow: rota laudo_registrar até o WhatsApp; a IA conhece os formatos', () => {
  const c = workflow.connections;
  const rot = workflow.nodes.find((n) => n.name === 'Rotear comando').parameters.rules.values.map((v) => v.outputKey);
  assert.equal(c['Rotear comando'].main.length, rot.length);
  assert.deepEqual(c['Rotear comando'].main[rot.indexOf('laudo_registrar')].map((x) => x.node), ['BD · Registrar laudo']);
  assert.deepEqual(c['BD · Registrar laudo'].main[0].map((x) => x.node), ['Montar resposta laudo']);
  assert.deepEqual(c['Montar resposta laudo'].main[0].map((x) => x.node), ['Zap · Laudo']);
  assert.deepEqual(c['Zap · Laudo'].main[0].map((x) => x.node), ['Fim · Laudo']);
  const bd = workflow.nodes.find((n) => n.name === 'BD · Registrar laudo').parameters;
  assert.ok(bd.query.includes('laudo_registrar_pelo_bot($1::text, $2::jsonb, $3::text)'));
  assert.doesNotMatch(bd.query, /INSERT INTO|UPDATE /);
  assert.ok(bd.options.queryReplacement.includes('$json.fase') && bd.options.queryReplacement.includes('$json.dadosJson'));
  const prompt = JSON.stringify(workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters);
  assert.ok(prompt.includes('esterilizei <ponteiras') && prompt.includes('coleta agua do processo') && prompt.includes('<baia|linha> <n> <ct48|bl72|bl120>'));
  assert.ok(prompt.includes('analisei <baia|linha> <n>') && !prompt.includes('coleta de <baia|linha>'));
});

test('migration 049: prévia desfeita por exceção própria, pendência do sim, funções do app, GRANT só ao bot, desfazer', () => {
  const m = mig('049_laudos_pelo_bot.sql');
  for (const f of ['bot_registrar_esterilizacao', 'bot_coletar_agua', 'bot_lancar_agua', 'bot_coletar_superficie', 'bot_lancar_superficie']) assert.ok(m.includes('app.' + f + '('), f);
  assert.match(m, /RAISE EXCEPTION USING ERRCODE = 'P0999'/);
  assert.match(m, /WHEN SQLSTATE 'P0999' THEN NULL/);
  assert.ok(m.includes("'laudo registrado: ' || p_dados::text"));
  assert.match(m, /WHEN raise_exception THEN\s+RETURN jsonb_build_object\('ok', false, 'erro', SQLERRM\);/);
  assert.match(m, /TO labflow_app;/);
  assert.doesNotMatch(m, /labflow_app_web/);
  assert.match(mig('049_laudos_pelo_bot_desfazer.sql'), /DROP FUNCTION IF EXISTS laudo_registrar_pelo_bot\(text, jsonb, text\);/);
});

test('migration 100: baia e linha são análise (só Admin e Analista, resumo "análise de"); o desfazer volta a 049', () => {
  const m = mig('100_baias_linhas_analise.sql');
  const f049 = (s) => s.slice(s.indexOf('BEGIN;'), s.indexOf('COMMIT;'));
  assert.match(m, /NOT IN \('Admin', 'Analista'\) THEN\s+RAISE EXCEPTION 'Baias e linhas são análise/);
  assert.ok(m.includes("': análise de '") && m.includes("', análise de ' || to_char(v_sup.analisada_em"));
  assert.doesNotMatch(f049(m), /': coleta de '|', coleta de ' \|\| to_char\(v_sup/);
  assert.match(m, /TO labflow_app;/);
  assert.doesNotMatch(m, /labflow_app_web/);
  assert.equal(f049(mig('100_baias_linhas_analise_desfazer.sql')), f049(mig('049_laudos_pelo_bot.sql')));
});
