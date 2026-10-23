'use strict';

// PB7 (23/10/2026): o cargo "Operador" passa a se chamar "Analista" no banco (migration 035), no bot e no app.
// "Operador" continua aceito como nome antigo por um tempo (o banco grava "Analista"). A migration foi ensaiada no
// servidor numa transação desfeita (dados, apelido, as 3 funções e o desfazer); aqui o texto dela e o bot.
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const MIG = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const SQL = MIG('035_cargo_analista.sql');
const DESFAZ = MIG('035_cargo_analista_desfazer.sql');

test('migration 035: dados, trava, apelido e as três funções com "Analista"', () => {
  assert.match(SQL, /UPDATE usuarios SET cargo = 'Analista' WHERE cargo = 'Operador';/);
  assert.match(SQL, /CHECK \(cargo IN \('Admin', 'Analista', 'Consultor', 'Coletor'\)\)/);
  assert.match(SQL, /BEFORE INSERT OR UPDATE OF cargo ON usuarios/, 'apelido roda antes da trava');
  assert.match(SQL, /IF NEW\.cargo = 'Operador' THEN\s+NEW\.cargo := 'Analista';/);
  for (const f of ['cadastrar_usuario', 'trocar_cargo', 'coleta_exigir_permissao']) assert.match(SQL, new RegExp('CREATE OR REPLACE FUNCTION public\\.' + f + '\\('), f);
  assert.equal((SQL.match(/CASE WHEN p_cargo = 'Operador' THEN 'Analista' ELSE p_cargo END/g) || []).length, 2, 'cadastrar e trocar aceitam o nome antigo');
  assert.match(SQL, /IF v_cargo NOT IN \('Admin', 'Analista', 'Coletor'\) THEN/, 'Analista corrige e exclui coleta');
  assert.match(SQL, /Cargo inválido\. Use Admin, Analista, Consultor ou Coletor\./);
  assert.match(SQL, /peça a um Analista ou Admin/);
  assert.equal((SQL.replace(/--.*$/gm, '').match(/SECURITY DEFINER/g) || []).length, 2, 'as funções do app seguem SECURITY DEFINER');
  assert.doesNotMatch(SQL.replace(/--.*$/gm, ''), /NOT IN \('Admin', 'Operador'/, 'nenhuma conferência antiga ficou');
});

test('migration 035: o desfazer volta o nome e as funções como estavam', () => {
  assert.match(DESFAZ, /DROP TRIGGER IF EXISTS usuarios_cargo_apelido ON usuarios;/);
  assert.match(DESFAZ, /UPDATE usuarios SET cargo = 'Operador' WHERE cargo = 'Analista';/);
  assert.match(DESFAZ, /CHECK \(cargo IN \('Admin', 'Operador', 'Consultor', 'Coletor'\)\)/);
  assert.equal((DESFAZ.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 3);
});

test('bot: "trocar cargo de Analista" vale; "operador" é o nome antigo de Analista', () => {
  for (const frase of ['adicionar cargo Analista para o número 5511987654321 nome Bia', 'trocar cargo de analista para o número 5511987654321',
    'adicionar cargo Operador para o número 5511987654321 nome Bia']) {
    const r = interpretar(frase, { cargo: 'Admin' });
    assert.equal(r.tipo, 'gerenciar_usuario', frase);
    assert.equal(r.autorizado, true, frase);
    assert.equal(r.NivelNovo, 'Analista', frase);
  }
  assert.match(interpretar('comandos usuarios', { cargo: 'Admin' }).textoResposta, /trocar cargo de Analista[\s\S]*Cargos válidos: Admin, Analista, Consultor e Coletor/);
  assert.equal(interpretar('adicionar cargo Coletor para o número 5511987654321', { cargo: 'Analista' }).autorizado, false, 'só Admin troca cargo');
});

test('bot: Analista corrige e apaga qualquer coleta (como o antigo Operador)', () => {
  assert.equal(interpretar('corrigir coleta tanque terra 42 para 43', { cargo: 'Analista' }).ehGestor, '1');
  assert.equal(interpretar('corrigir coleta tanque terra 42 para 43', { cargo: 'Operador' }).ehGestor, '1', 'nome antigo, durante a troca');
  assert.equal(interpretar('corrigir coleta tanque terra 42 para 43', { cargo: 'Coletor' }).ehGestor, '0');
  const r = new Function('$', '$input', codigoDoNode('Montar resposta corrigir coleta'))(
    () => ({ first: () => ({ json: { modo: 'corrigir', origem: 'terra', tanque: '42', novoTanque: '43', dataColeta: '' } }) }),
    { first: () => ({ json: { estado: { permitido: false, data: '15/10/2026' } } }) })[0].json.textoResposta;
  assert.match(r, /Só quem registrou, um Analista ou um Admin pode alterar/);
});

test('IA: "analista" e "operador" viram Analista; o prompt fala Analista', () => {
  const CODIGO = codigoDoNode('Validar resposta da IA');
  const validar = (ia, mensagem) => new Function('$', '$input', CODIGO)(
    () => ({ first: () => ({ json: { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Teste', nivelAtual: 'Admin', mensagem_original: mensagem } }) }),
    { first: () => ({ json: { content: { parts: [{ text: JSON.stringify(ia) }] } } }) })[0].json;
  for (const [palavra, msg] of [['analista', 'muda o cargo do 11987654321 para analista'], ['operador', 'muda o cargo do 11987654321 para operador']]) {
    const r = validar({ intencao: 'gerenciar_cargo', cargo: palavra, telefone: '11987654321' }, msg);
    assert.equal(r.comando_ia, 'trocar cargo de Analista para o número 5511987654321', palavra);
  }
  const prompt = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments[0].value;
  assert.match(prompt, /os cargos válidos são só Admin, Analista, Consultor e Coletor, "administrador" conta como Admin e "operador" é o nome antigo de Analista;/);
  assert.match(prompt, /supervisor NÃO é Analista/);
  assert.doesNotMatch(prompt, /novo cargo Operador/);
});
