'use strict';

// Arquivo de contra-amostras (PB21, migration 105, spec docs/specs/lims/11-arquivo-contra-amostras.md): consultas, arquivar o
// recebimento numa caixa (121 a 145) e descartar (Admin e Analista, com sim). As regras moram nas funções do banco, ensaiadas
// no servidor em bloco desfeito (com a carga inicial da planilha, fora do Git). Aqui o comando, a resposta e a migration.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const mig = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const dados = (r) => JSON.parse(r.dadosJson);
const montar = (r) => new Function('$', '$input', codigoDoNode('Montar resposta laudo'))(
  () => ({ first: () => ({ json: { nomeContato: 'Ana' } }) }), { first: () => ({ json: { r } }) })[0].json.textoResposta;

test('consultas do arquivo respondem direto (fase consulta), também para o Consultor', () => {
  for (const frase of ['o que posso descartar hoje?', 'O que posso descartar', 'descarte de hoje', 'caixas vencidas', 'pra descartar hoje']) {
    const r = interpretar(frase, { cargo: 'Consultor' });
    assert.equal(r.tipo, 'laudo_registrar', frase);
    assert.equal(r.fase, 'consulta', frase);
    assert.deepEqual(dados(r), { acao: 'arquivo_consulta', consulta: 'descartar' }, frase);
  }
  assert.deepEqual(dados(interpretar('o que tem na caixa 67')), { acao: 'arquivo_consulta', consulta: 'caixa', tipo: 'navio', numero: '67' });
  assert.deepEqual(dados(interpretar('caixa 121')), { acao: 'arquivo_consulta', consulta: 'caixa', tipo: 'recebimento', numero: '121' });
  assert.deepEqual(dados(interpretar('caixa do tanque 42')), { acao: 'arquivo_consulta', consulta: 'caixa', tipo: 'tanque', numero: '42' });
  assert.deepEqual(dados(interpretar('qual caixa do navio O.SKY 189?')), { acao: 'arquivo_consulta', consulta: 'navio', navio: 'O.SKY', viagem: '189' });
  assert.deepEqual(dados(interpretar('caixas disponiveis')), { acao: 'arquivo_consulta', consulta: 'disponiveis', tipo: 'recebimento' });
  assert.deepEqual(dados(interpretar('caixas livres O.SEA')), { acao: 'arquivo_consulta', consulta: 'disponiveis', tipo: 'navio', navio: 'O.SEA' });
  assert.deepEqual(dados(interpretar('caixas disponíveis dos tanques')), { acao: 'arquivo_consulta', consulta: 'disponiveis', tipo: 'tanque' });
});

test('arquivar o recebimento: load, lotes e caixa viram prévia com sim', () => {
  const r = interpretar('arquivei load 43599 lotes 1-12, 14 caixa 121', { cargo: 'Analista' });
  assert.equal(r.fase, 'previa');
  assert.deepEqual(dados(r), { acao: 'arquivo_recebimento', load: '43599', lotes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14], caixa: '121' });
  const comItem = dados(interpretar('Arquivei o load 43599 item 444 lotes 9 a 20 na caixa 122 data 24/10/2026', { cargo: 'Analista' }));
  assert.deepEqual([comItem.item, comItem.lotes.length, comItem.caixa, comItem.data], ['444', 12, '122', '24/10/2026']);
  assert.match(interpretar('arquivei load 43599 caixa 121', { cargo: 'Analista' }).textoResposta, /arquivei load 43599 lotes 1-12,14 caixa 121/);
  assert.match(interpretar('arquivei load 43599 lotes 1-12 caixa 121', { cargo: 'Coletor' }).textoResposta, /Admin e Analista/);
  assert.notEqual(interpretar('arquivei load 43599 lotes 1-12 caixa 121', { cargo: 'Consultor' }).tipo, 'laudo_registrar');
});

test('descartar: caixa do recebimento, do navio e bags do tanque, com sim; o Coletor e o Consultor não', () => {
  assert.deepEqual(dados(interpretar('descartei caixa 121', { cargo: 'Analista' })), { acao: 'arquivo_descartar', tipo: 'recebimento', numero: '121' });
  assert.deepEqual(dados(interpretar('Descartei a caixa 67', { cargo: 'Analista' })), { acao: 'arquivo_descartar', tipo: 'navio', numero: '67' });
  assert.deepEqual(dados(interpretar('descartei bags do tanque 35', { cargo: 'Admin' })), { acao: 'arquivo_descartar', tipo: 'tanque', numero: '35' });
  assert.equal(interpretar('descartei caixa 121', { cargo: 'Analista' }).fase, 'previa');
  assert.match(interpretar('descartei caixa 121', { cargo: 'Coletor' }).textoResposta, /Admin e Analista/);
  assert.notEqual(interpretar('descartei caixa 121', { cargo: 'Consultor' }).tipo, 'laudo_registrar');
  // as consultas antigas de bags e potes continuam no caminho delas
  assert.equal(interpretar('quais bags posso descartar hoje').tipo, 'consulta_bags');
});

test('o sim reenvia pelo mesmo caminho dos laudos', () => {
  const cmd = 'laudo registrado: ' + JSON.stringify({ acao: 'arquivo_descartar', tipo: 'recebimento', numero: '121' });
  const r = interpretar(cmd, { cargo: 'Analista', reenvio: true });
  assert.equal(r.tipo, 'laudo_registrar');
  assert.equal(r.fase, 'gravar');
  assert.equal(dados(r).acao, 'arquivo_descartar');
});

test('resposta: consulta direto, prévia e gravado com o título do arquivo', () => {
  assert.equal(montar({ ok: true, fase: 'consulta', resumo: '✅ Nada vencido no arquivo de contra-amostras.' }), '✅ Nada vencido no arquivo de contra-amostras.');
  const p = montar({ ok: true, fase: 'previa', titulo: 'Descartar', resumo: 'Caixa 121 (recebimento): load 43599 lotes 1-3 (15/10/2026). A caixa fica disponível.' });
  assert.match(p, /^📝 Descartar:\nCaixa 121 \(recebimento\)[\s\S]*Responda \*sim\* para gravar/);
  assert.match(montar({ ok: true, fase: 'gravar', titulo: 'Arquivar', resumo: 'Caixa 121' }), /^✅ Arquivado:\nCaixa 121\n\nPor: Ana$/);
  assert.match(montar({ ok: true, fase: 'gravar', resumo: 'Esterilização' }), /^✅ Registrado:/, 'os laudos continuam iguais');
  assert.match(montar({ ok: false, erro: 'A caixa 67 (O.SKY 189) ainda não venceu: libera em 05/11/2028.' }), /^❌ A caixa 67 .* Nada foi gravado\.$/);
});

test('ajuda do descarte: todo exemplo é entendido pelo bot', () => {
  const ajuda = interpretar('comandos descarte').textoResposta;
  const exemplos = ajuda.split('\n').filter((l) => l.startsWith('• ')).flatMap((l) => l.slice(2).split(' · '));
  assert.ok(exemplos.length >= 9);
  for (const ex of exemplos) {
    const r = interpretar(ex, { cargo: 'Analista' });
    assert.ok(['laudo_registrar', 'consulta_bags', 'consulta_potes'].includes(r.tipo), ex + ' -> ' + r.tipo);
  }
});

test('workflow: o node do laudo chama a função do arquivo; bags vencidos antes de hoje também aparecem', () => {
  const q = workflow.nodes.find((n) => n.name === 'BD · Registrar laudo').parameters.query;
  assert.match(q, /WHEN \(\$2::jsonb ->> 'acao'\) LIKE 'arquivo%' THEN arquivo_pelo_bot\(\$1::text, \$2::jsonb, \$3::text\)/);
  assert.match(q, /ELSE laudo_registrar_pelo_bot\(\$1::text, \$2::jsonb, \$3::text\) END AS r;/);
  assert.match(workflow.nodes.find((n) => n.name === 'BD · Bags para descartar').parameters.query, /a\.data_descarte <= CURRENT_DATE/);
});

test('migration 105: caixas, reserva do navio, prazos, descarte por Admin e Analista e o que o app pode usar', () => {
  const m = mig('105_arquivo_contra_amostras.sql');
  assert.match(m, /generate_series\(121, 145\)/);
  assert.match(m, /generate_series\(34, 49\)/);
  assert.doesNotMatch(m, /O\.WAVE|O\.SUN|O\.STAR|O\.OCEAN|O\.BLOSSOM|O\.SEA'/, 'as famílias reais ficam fora do Git');
  assert.match(m, /CREATE TRIGGER arquivo_reservar_caixa AFTER INSERT ON navios/);
  assert.match(m, /\(s\.dia \+ interval '2 years'\)::date/);
  assert.match(m, /v_dia \+ 7/);
  assert.equal((m.match(/tanque_exigir_cargo\(p_quem, ARRAY\['Admin', 'Analista'\]\)/g) || []).length, 2);
  assert.match(m, /GRANT EXECUTE ON FUNCTION arquivo_arquivar_recebimento\(bigint, text, text, int\[\], int, date, boolean\),\s+arquivo_descartar\(bigint, text, int, boolean\), arquivo_caixa_recebimento_sugerida\(\)\s+TO labflow_app_web;/);
  assert.match(m, /GRANT SELECT ON arquivo_familias, arquivo_caixas, arquivo_navios, arquivo_recebimento, vw_arquivo_itens, vw_arquivo_caixas\s+TO labflow_app_web, labflow_leitura;/);
  assert.doesNotMatch(m, /DELETE FROM/, 'descartar não apaga');
  const d = mig('105_arquivo_contra_amostras_desfazer.sql');
  assert.match(d, /DROP TRIGGER IF EXISTS arquivo_reservar_caixa ON navios;/);
  assert.match(d, /DROP TABLE IF EXISTS arquivo_recebimento, arquivo_navios, arquivo_caixas, arquivo_familias;/);
});
