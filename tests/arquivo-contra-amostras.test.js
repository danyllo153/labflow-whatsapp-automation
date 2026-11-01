'use strict';

// Arquivo de contra-amostras (PB21, migration 105, spec docs/specs/lims/11-arquivo-contra-amostras.md): consultas, arquivar o
// recebimento numa caixa (121 a 153 desde a 108, PB23) e descartar (Admin e Analista, com sim). As regras moram nas funções do banco, ensaiadas
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

test('PB23 (108): caixas do recebimento de 121 a 153; de 154 em diante é navio', () => {
  for (const n of ['121', '146', '150', '153']) {
    assert.deepEqual(dados(interpretar(`caixa ${n}`)), { acao: 'arquivo_consulta', consulta: 'caixa', tipo: 'recebimento', numero: n }, n);
  }
  for (const n of ['120', '154', '165']) {
    assert.deepEqual(dados(interpretar(`caixa ${n}`)), { acao: 'arquivo_consulta', consulta: 'caixa', tipo: 'navio', numero: n }, n);
  }
  assert.equal(dados(interpretar('arquivei load 43599 lotes 1-3 caixa 153', { cargo: 'Analista' })).caixa, '153');
  assert.doesNotMatch(JSON.stringify(workflow), /121 a 145/);

  const m = mig('108_caixas_recebimento_153.sql');
  assert.match(m, /DELETE FROM arquivo_caixas WHERE tipo = 'navio' AND numero BETWEEN 146 AND 153;/);
  assert.match(m, /UPDATE arquivo_familias SET caixa_de = 154 WHERE caixa_de BETWEEN 146 AND 153 AND caixa_ate >= 154;/);
  assert.match(m, /generate_series\(146, 153\)/);
  assert.match(m, /IF EXISTS \(SELECT 1 FROM arquivo_navios WHERE caixa BETWEEN 146 AND 153\) THEN/, 'nada guardado se perde');
  assert.match(m, /v_num BETWEEN 121 AND 153 THEN 'recebimento'/);
  assert.equal((m.match(/121 a 153/g) || []).length, 4, 'título, comentário e as duas mensagens');
  assert.doesNotMatch(m.slice(m.indexOf('CREATE OR REPLACE')), /145/, 'as funções sem o número antigo');
  assert.doesNotMatch(m, /O\.(SEA|WAVE|SUN|STAR|OCEAN|BLOSSOM)/, 'as famílias reais ficam fora do Git');
  for (const f of ['arquivo_arquivar_recebimento', 'arquivo_descartar', 'arquivo_consulta']) {
    assert.ok(m.includes(`CREATE OR REPLACE FUNCTION ${f}(`), f);
  }
  assert.match(m, /^BEGIN;[\s\S]*COMMIT;\s*$/m);
  const d = mig('108_caixas_recebimento_153_desfazer.sql');
  assert.match(d, /IF EXISTS \(SELECT 1 FROM arquivo_recebimento WHERE caixa BETWEEN 146 AND 153\) THEN/);
  assert.match(d, /UPDATE arquivo_familias SET caixa_de = 146 WHERE caixa_de = 154;/);
});

test('PB24 (109): data inicial da caixa de navio pelo comando, com sim; Coletor e Consultor não; recebimento não tem', () => {
  const r = interpretar('caixa 67 começa em 10/11/2026', { cargo: 'Analista' });
  assert.equal(r.tipo, 'laudo_registrar');
  assert.equal(r.fase, 'previa');
  assert.deepEqual(dados(r), { acao: 'arquivo_data_inicial', numero: '67', data: '10/11/2026' });
  assert.deepEqual(dados(interpretar('Data inicial da caixa 67 em 5/1/27', { cargo: 'Admin' })), { acao: 'arquivo_data_inicial', numero: '67', data: '05/01/2027' });
  assert.deepEqual(dados(interpretar('a caixa 67 inicia dia 10/11/2026', { cargo: 'Analista' })), { acao: 'arquivo_data_inicial', numero: '67', data: '10/11/2026' });
  const ano = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).slice(6);
  assert.equal(dados(interpretar('caixa 67 comeca em 10/11', { cargo: 'Analista' })).data, '10/11/' + ano);
  for (const f of ['caixa 67 começa automático', 'caixa 67 data inicial automatica', 'data inicial da caixa 67 automática']) {
    assert.deepEqual(dados(interpretar(f, { cargo: 'Analista' })), { acao: 'arquivo_data_inicial', numero: '67' }, f);
  }
  assert.match(interpretar('caixa 121 começa em 10/11/2026', { cargo: 'Analista' }).textoResposta, /só existe na caixa de navio/);
  assert.match(interpretar('caixa 67 começa em 10/11/2026', { cargo: 'Coletor' }).textoResposta, /Admin e Analista/);
  assert.notEqual(interpretar('caixa 67 começa em 10/11/2026', { cargo: 'Consultor' }).tipo, 'laudo_registrar');
  // a consulta da caixa continua no caminho dela
  assert.equal(dados(interpretar('caixa 67')).acao, 'arquivo_consulta');
  const sim = interpretar('laudo registrado: ' + JSON.stringify({ acao: 'arquivo_data_inicial', numero: '67', data: '10/11/2026' }), { cargo: 'Analista', reenvio: true });
  assert.equal(sim.fase, 'gravar');
});

test('PB24: a consulta de potes lê o prazo novo, não a data antiga da arquivo_amostras', () => {
  const q = workflow.nodes.find((n) => n.name === 'BD · Potes para descartar').parameters.query;
  assert.match(q, /FROM vw_arquivo_itens i/);
  assert.match(q, /i\.item = 'pote'\s+AND i\.situacao = 'Vencido'/);
  assert.doesNotMatch(q, /arquivo_amostras/);
});

test('migration 109: data inicial = última amostra + 5 dias ou a manual; dela contam 1 e 2 anos; a carga fica como está', () => {
  const m = mig('109_data_inicial_caixa_navio.sql');
  assert.match(m, /^BEGIN;[\s\S]*COMMIT;\s*$/m);
  assert.match(m, /max\(x\.dia\) \+ 5 AS inicio_auto/);
  assert.match(m, /c\.data_coleta AS dia FROM coletas c/);
  assert.match(m, /ea\.data_embarque FROM embarque_amostras ea/);
  assert.match(m, /COALESCE\(an\.inicio_manual, u\.inicio_auto\) \+ interval '1 year'/);
  assert.match(m, /COALESCE\(an\.inicio_manual, u\.inicio_auto\) \+ interval '2 years'/);
  assert.match(m, /NULL, an\.descarte_carga, an\.descartado_em IS NOT NULL/, 'a linha da planilha não muda');
  assert.match(m, /AS itens_vencidos,\s+u\.ultima_amostra,\s+COALESCE\(an\.inicio_manual, u\.inicio_auto\) AS inicio_em,\s+an\.inicio_manual IS NOT NULL AS inicio_fixado\s+FROM arquivo_caixas k/);
  assert.match(m, /arquivo_data_inicial_navio\(p_quem bigint, p_caixa int, p_data date, p_previa boolean DEFAULT false\)/);
  assert.equal((m.match(/tanque_exigir_cargo\(p_quem, ARRAY\['Admin', 'Analista'\]\)/g) || []).length, 1);
  assert.match(m, /ALTER FUNCTION arquivo_data_inicial_navio\(bigint, int, date, boolean\) OWNER TO labflow_app;/);
  assert.match(m, /GRANT EXECUTE ON FUNCTION arquivo_data_inicial_navio\(bigint, int, date, boolean\) TO labflow_app, labflow_app_web;/);
  assert.match(m, /v_acao = 'arquivo_data_inicial' THEN/);
  assert.match(m, /121 AND 153/, 'a consulta refeita sobre a 108, não sobre a 105');
  assert.doesNotMatch(m, /DELETE FROM|O\.(SEA|WAVE|SUN|STAR|OCEAN|BLOSSOM)/);
  const d = mig('109_data_inicial_caixa_navio_desfazer.sql');
  assert.match(d, /DROP FUNCTION arquivo_data_inicial_navio\(bigint, int, date, boolean\);/);
  assert.match(d, /DROP VIEW vw_arquivo_inicio_navio;/);
  assert.match(d, /ALTER TABLE arquivo_navios DROP COLUMN inicio_manual, DROP COLUMN inicio_manual_por, DROP COLUMN inicio_manual_em;/);
  assert.match(d, /\(s\.dia \+ interval '2 years'\)::date/);
  assert.match(d, /GRANT SELECT ON vw_arquivo_caixas TO labflow_app_web, labflow_leitura;/);
  assert.doesNotMatch(d, /arquivo_data_inicial'/, 'o bot volta ao que era');
});
