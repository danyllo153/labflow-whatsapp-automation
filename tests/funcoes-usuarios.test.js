'use strict';

// PB5 (sessão do app): funções do banco para cadastrar pessoa e trocar cargo (migration 031), usadas pelo comando
// "adicionar cargo ..." do bot e pela tela "Nova pessoa" do app. A parte que roda no banco foi validada no servidor
// numa transação desfeita (cadastro, erros, último Admin, permissão); aqui o texto da migration e a ligação do bot.
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '031_funcoes_usuarios.sql'), 'utf8');
const no = (nome) => workflow.nodes.find((n) => n.name === nome);

test('migration 031: as regras vivem no banco', () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION cadastrar_usuario\(p_nome text, p_telefone text, p_cargo text, p_quem bigint\)/);
  assert.match(SQL, /CREATE OR REPLACE FUNCTION trocar_cargo\(p_usuario_id bigint, p_cargo text, p_quem bigint\)/);
  assert.match(SQL, /CREATE OR REPLACE FUNCTION gravar_cargo_bot\(p_telefone text, p_nome text, p_cargo text, p_quem_telefone text\)/);
  assert.match(SQL, /usuarios WHERE id = p_quem AND cargo = 'Admin'/, 'só Admin cadastra e troca');
  assert.match(SQL, /v_tel !~ '\^\[0-9\]\{12,13\}\$'/, 'telefone obrigatório, só dígitos com DDI');
  assert.match(SQL, /NOT IN \('Admin', 'Operador', 'Consultor', 'Coletor'\)/, 'cargos válidos, com o Coletor');
  assert.match(SQL, /Esse telefone já está cadastrado/);
  assert.match(SQL, /count\(\*\) FROM usuarios WHERE cargo = 'Admin'\) <= 1/, 'o banco nunca fica sem Admin');
  assert.match(SQL, /FOR UPDATE/, 'trava a linha ao trocar o cargo');
});

test('migration 031: o bot recebe o erro como texto e só o labflow_app executa', () => {
  assert.match(SQL, /EXCEPTION WHEN raise_exception THEN\s+RETURN 'erro: ' \|\| SQLERRM/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION[\s\S]*TO labflow_app/);
  assert.doesNotMatch(SQL, /GRANT[^;]*labflow_leitura/, 'o usuário de leitura não executa');
});

test('o comando do bot chama as funções do banco (não escreve em usuarios por conta própria)', () => {
  const g = no('BD · Gravar cargo').parameters;
  assert.match(g.query, /SELECT gravar_cargo_bot\(\$1::text, \$2::text, \$3::text, \$4::text\) AS resultado/);
  assert.doesNotMatch(g.query, /INSERT INTO usuarios|UPDATE usuarios/, 'a regra é das funções');
  assert.match(g.options.queryReplacement, /\$json\.NumeroAlvo, \$json\.NomeAlvo \|\| "", \$json\.NivelNovo, \$json\._numeroRemetenteLimpo/);
});

test('fluxo: Pode trocar cargo? -> banco -> resposta do cargo -> WhatsApp', () => {
  const c = workflow.connections;
  assert.deepEqual(c['BD · Gravar cargo'].main[0].map((x) => x.node), ['Montar resposta cargo']);
  assert.deepEqual(c['Montar resposta cargo'].main[0].map((x) => x.node), ['Zap · Cargo atualizado']);
  const corpo = no('Zap · Cargo atualizado').parameters.bodyParameters.parameters.find((p) => p.name === 'text').value;
  assert.equal(corpo, '={{ $json.textoResposta }}', 'a mensagem vem da resposta montada (sucesso ou erro)');
});

function resposta(resultado) {
  const item = { numero: '5511900000001@s.whatsapp.net', textoResposta: '✅ Cargo atualizado: numero 5511987654321 (Joyce) agora é Coletor.' };
  const $ = () => ({ first: () => ({ json: item }) });
  return new Function('$', '$input', codigoDoNode('Montar resposta cargo'))($, { first: () => ({ json: { resultado } }) })[0].json.textoResposta;
}
test('resposta: confirmação quando deu certo; motivo da recusa quando o banco recusou', () => {
  assert.match(resposta('ok'), /✅ Cargo atualizado: numero 5511987654321 \(Joyce\) agora é Coletor\./);
  assert.equal(resposta('erro: Não dá para tirar o cargo do único Admin: o sistema não pode ficar sem administrador.'),
    '❌ Não dá para tirar o cargo do único Admin: o sistema não pode ficar sem administrador. Nada foi alterado.');
  assert.match(resposta('erro: Telefone inválido: use DDI + DDD + número (12 ou 13 dígitos), ex.: 5511987654321.'), /^❌ Telefone inválido/);
  assert.doesNotMatch(resposta('erro: x'), /✅/);
});

test('o comando do bot continua só para Admin e com o cargo Coletor válido', () => {
  const r = interpretar('adicionar cargo Coletor para o número 5511987654321 nome Joyce', { cargo: 'Admin' });
  assert.equal(r.tipo, 'gerenciar_usuario');
  assert.equal(r.autorizado, true);
  assert.equal(r.NivelNovo, 'Coletor');
  assert.equal(interpretar('adicionar cargo Operador para o número 5511987654321', { cargo: 'Operador' }).autorizado, false);
  assert.match(interpretar('adicionar cargo Gerente para o número 5511987654321', { cargo: 'Admin' }).textoResposta, /Cargo inválido/);
});
// ---- pedido de segurança da sessão do app (17/10/2026) ----
test('migration 031: as funções que o app chama são SECURITY DEFINER com search_path fixo', () => {
  const corpo = (nome) => { const i = SQL.indexOf('FUNCTION ' + nome); const j = SQL.indexOf('$$ LANGUAGE', SQL.indexOf('AS $$', i) + 5); return SQL.slice(j, SQL.indexOf(';', j)); };
  for (const f of ['cadastrar_usuario(', 'trocar_cargo(']) {
    assert.match(corpo(f), /SECURITY DEFINER SET search_path = public, pg_temp/, f);
  }
  // o auxiliar roda dentro delas: search_path fixo, sem DEFINER (ninguém do app o chama direto)
  assert.match(corpo('usuario_exigir_admin('), /SET search_path = public, pg_temp/);
  assert.doesNotMatch(corpo('usuario_exigir_admin('), /SECURITY DEFINER/);
  // a função do bot não precisa de DEFINER
  assert.doesNotMatch(corpo('gravar_cargo_bot('), /SECURITY DEFINER/);
  // a permissão continua conferida dentro da função, por quem está fazendo
  assert.equal((SQL.match(/PERFORM usuario_exigir_admin\(p_quem\)/g) || []).length, 2);
  // o GRANT do papel do app NÃO fica nesta migration (é da 051 do app)
  assert.doesNotMatch(SQL, /GRANT[^;]*labflow_app_web/);
});
