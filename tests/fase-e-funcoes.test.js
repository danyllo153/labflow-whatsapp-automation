'use strict';

// Fase E do app (pedidos PB11 a PB17): cada coisa que o bot grava vira UMA função do banco, chamada igual pelo bot e pelo app.
// As funções foram ensaiadas no banco do servidor em blocos desfeitos (casos de cada uma, mais os SQL dos nós do workflow com os
// parâmetros deles). Aqui as regras escritas nas migrations e a ligação dos nós, para não mudarem sem querer. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { workflow } = require('./helpers/executar-node');

const mig = (f) => fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', f), 'utf8');
const q = (nome) => workflow.nodes.find((n) => n.name === nome).parameters.query;

test('todas: SECURITY DEFINER com search_path fixo, GRANT só ao labflow_app, desfazer apaga cada função', () => {
  for (const [f, fns] of [
    ['042_tanques_funcoes', ['registrar_coleta', 'registrar_analise', 'concluir_leitura', 'lancar_placas']],
    ['043_testes_funcoes', ['criar_compostas', 'teste_feito', 'teste_acao']],
    ['044_drops_funcoes', ['concluir_drops', 'abrir_desvio_drop', 'fechar_desvio_drop']],
    ['045_embarque_funcoes', ['registrar_embarque', 'criar_compostas_embarque']],
    ['046_nfc_funcoes', ['registrar_recebimento_nfc', 'lancar_contagem_nfc']],
  ]) {
    const s = mig(f + '.sql');
    const d = mig(f + '_desfazer.sql');
    for (const fn of fns) {
      assert.match(s, new RegExp('CREATE OR REPLACE FUNCTION ' + fn + '\\('), f + ' ' + fn);
      assert.match(d, new RegExp('DROP FUNCTION IF EXISTS ' + fn + '\\('), f + ' desfaz ' + fn);
    }
    assert.ok((s.match(/SECURITY DEFINER SET search_path = public, pg_temp;/g) || []).length >= fns.length, f);
    assert.match(s, /TO labflow_app;/, f);
    assert.doesNotMatch(s, /labflow_app_web/, f + ': o GRANT do app fica com o app');
    assert.match(s, /WHEN raise_exception THEN RETURN jsonb_build_object\('ok', false, 'erro', SQLERRM\);/, f + ': a porta do bot devolve o erro como texto');
  }
});

test('042 tanques: as regras do bot (8/16 tanques, coleta repetida, Coletor, drops, arquivo, análise sem coleta)', () => {
  const s = mig('042_tanques_funcoes.sql');
  assert.match(s, /registrar_coleta[\s\S]*ARRAY\['Admin', 'Analista', 'Coletor'\]/);
  assert.match(s, /Coletor registra só a própria coleta/);
  assert.match(s, /até 8 tanques de terra/);
  assert.match(s, /até 16 tanques de navio/);
  assert.match(s, /Coleta já registrada em %/);
  assert.match(s, /VALUES \(5\), \(10\), \(15\)/);
  assert.match(s, /CASE WHEN v_origem = 'terra' THEN 'bag' ELSE 'pote' END, data_coleta \+ 365/);
  assert.match(s, /Não há coleta % até % para o\(s\) tanque\(s\) %/);
  assert.match(s, /já têm a análise % de %/, 'novo: a mesma análise não duplica');
  assert.match(s, /\('CT', 'Profundidade', NULL::int, 2\), \('BL', 'Profundidade', 3, 5\)/);
  assert.match(s, /O C\.T não tem pré-leitura/);
  assert.match(s, /Cada leitura tem as 3 placas/);
});

test('043 testes: caldo, etapas, abrir lote a lote e Howard como o bot', () => {
  const s = mig('043_testes_funcoes.sql');
  assert.match(s, /p_data \+ CASE WHEN v_tipo = 'TAB' THEN 5 ELSE 1 END/);
  assert.match(s, /\(v_acao = 'confirmar' AND t\.status = 'Incubada'\)/);
  assert.match(s, /t\.status = 'Concluída' AND t\.resultado = 'Positivo'/);
  assert.match(s, /\(p_percentual::int % 2\) <> 0/);
  assert.match(s, /O Howard é da composta de embarque/);
  assert.match(s, /já está na composta #/);
});

test('044 drops: os de hoje pelo filtro do bot; desvio em 7, 13 e 25 °C com leitura em 5 dias', () => {
  const s = mig('044_drops_funcoes.sql');
  assert.match(s, /ELSE d\.data_prevista = CURRENT_DATE AND c\.origem = v_origem/);
  assert.match(s, /CURRENT_DATE \+ 5, p_quem/);
  assert.match(s, /NOT v_t <@ ARRAY\[7, 13, 25\]/);
  assert.match(s, /Esse drop já tem desvio/);
});

test('045 embarque: amostra repetida fica como está, load novo sem fábrica, outro item avisa', () => {
  const s = mig('045_embarque_funcoes.sql');
  assert.match(s, /ON CONFLICT \(embarque_id, numero\) DO NOTHING/);
  assert.match(s, /não está cadastrado: entra agora, sem fábrica/);
  assert.match(s, /com outro item \(/);
  assert.match(s, /já está na composta #/);
  assert.match(s, /Informe o navio com a viagem/);
});

test('workflow: os nós chamam as portas de entrada (a mesma regra do app)', () => {
  const chamadas = {
    'BD · Gravar coleta terra': /coleta_registrar_pelo_bot\(/,
    'BD · Gravar coleta navio': /coleta_registrar_pelo_bot\(/,
    'BD · Gravar análise': /analise_registrar_pelo_bot\(/,
    'BD · Concluir leituras': /leitura_concluir_pelo_bot\(/,
    'BD · Executar placas da foto': /placas_lancar_pelo_bot\(/,
    'BD · Executar NFC': /placas_lancar_pelo_bot\(/,
    'BD · Gravar compostas': /compostas_criar_pelo_bot\(/,
    'BD · TAB feito': /teste_feito_pelo_bot\(/,
    'BD · TAB em confirmação': /teste_acao_pelo_bot\(/,
    'BD · Atualizar TABs': /teste_acao_pelo_bot\(/,
    'BD · Concluir drops': /drops_concluir_pelo_bot\(/,
    'BD · Executar desvio': /desvio_drop_pelo_bot\(/,
    'BD · Gravar embarque': /embarque_registrar_pelo_bot\(/,
    'BD · Gravar compostas embarque': /compostas_embarque_criar_pelo_bot\(/,
    'BD · Gravar recebimento NFC': /recebimento_nfc_registrar_pelo_bot\(/,
    'BD · Gravar contagens NFC': /contagem_nfc_lancar_pelo_bot\(/,
  };
  for (const [no, re] of Object.entries(chamadas)) {
    assert.match(q(no), re, no);
    if (no === 'BD · Executar NFC') continue; // o desvio de tanque e a repetição ainda são do SQL próprio (PB17)
    assert.doesNotMatch(q(no), /INSERT INTO (coletas|analises|leituras_placas|compostas|testes|desvios_drop|embarques|embarque_amostras|recebimento_nfc|contagens_nfc)\b/, no + ' não grava por conta própria');
  }
  const ret = workflow.nodes.find((n) => n.name === 'Retomar resposta do sim').parameters.jsCode;
  for (const k of ['contagem_erro', 'placas_erro', 'placas_lote_erro', 'teste_erro', 'desvio_erro']) assert.ok(ret.includes(k), 'o sim avisa: ' + k);
});
