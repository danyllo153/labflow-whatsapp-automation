'use strict';

// Testa o jsCode REAL do node "Interpretar comando" (LabFlow.json) com mensagens
// de exemplo, sem n8n, sem banco e sem WhatsApp. Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar } = require('./helpers/executar-node');

// Confere so os campos citados em `esperado` (o resto do retorno e ignorado).
function confere(frase, esperado, opcoes) {
  const r = interpretar(frase, opcoes);
  assert.ok(r, `a mensagem foi descartada: ${frase}`);
  const recebido = Object.fromEntries(Object.keys(esperado).map((k) => [k, r[k]]));
  assert.deepStrictEqual(recebido, esperado, `frase: ${frase}`);
  return r;
}

// ---------------------------------------------------------------------------
// 1. Cada comando da cheatsheet cai na intencao (tipo) certa
// ---------------------------------------------------------------------------
const RECONHECIDOS = [
  // Tanques (NFC)
  ['registrar coleta tanque terra 42,43,44 data 24/09/2026', 'coleta_terra'],
  ['Coleta navio O.SKY 123 tanques 5,6,7 data 24/09/2026', 'coleta_navio'],
  ['Analise do normal dos tanques 42,43, data 24/09/2026', 'registro_analise'],
  ['Analise do Stress do tanque 42, data 24/09/2026', 'registro_analise'],
  ['Analise do normal do tanque 5 navio O.SKY 123, data 24/09/2026', 'registro_analise'],
  ['drops para hoje', 'consulta_drops'],
  ['Quais analises de tanques terra saem hoje?', 'consulta_analises_terra'],
  ['Quais analises de Tanques navio saem hoje?', 'consulta_analises_navio'],
  ['quais bags descartar hoje', 'consulta_bags'],
  ['quais potes do navio posso descartar hoje', 'consulta_potes'],
  ['Concluir drops D5 terra', 'concluir_drops'],
  ['Concluir drops navio O.SKY 123', 'concluir_drops'],
  ['Concluir final leitura CT normal terra', 'concluir_leitura_terra'],
  ['Concluir pre leitura BL stress navio O.SKY 123', 'concluir_leitura_navio'],
  ['sim', 'confirmar_pendencia'],
  ['não', 'cancelar_pendencia'],
  ['nao', 'cancelar_pendencia'],
  // Usuarios
  ['adicionar cargo Operador para o numero 5511987654321 nome Joao', 'gerenciar_usuario'],
  ['trocar cargo Consultor para o numero 5511987654321', 'gerenciar_usuario'],
  // Ajuda (sem IA)
  ['comandos', 'erro_ia'],
  ['comandos para drops', 'erro_ia'],
  // Concentrado: recebimento e compostas
  ['recebimento load 77001 item 444 fabrica AQA lotes 1-14', 'recebimento'],
  ['compostas do load 77001 (1-5)(6-10)(11,12,15)', 'criar_compostas'],
  // TAB
  ['tab feito das compostas #4 a #6', 'tab_feito'],
  ['tab feito do load 77001, item 444, lotes 1-5', 'tab_feito'],
  ['quais tabs tenho para espalhar hoje?', 'consulta_tab'],
  ['tabs de hoje espalhados', 'tab_etapa'],
  ['quais tabs tenho para ler hoje?', 'consulta_tab'],
  ['tab #5 em confirmação', 'tab_em_confirmacao'],
  ['confirmação do tab #5 positivo', 'tab_resultado'],
  ['tabs de hoje lidos', 'tab_etapa'],
  ['quais tabs foram lidos hoje?', 'consulta_tab'],
  ['Tab feito dos tanques terra 42,43 coleta 28/09/2026', 'tab_feito_nfc'],
  // Coliformes
  ['coliformes feitos das compostas #4 a #6', 'tab_feito'],
  ['quais coliformes tenho para estriar hoje?', 'consulta_tab'],
  ['coliformes de hoje estriados', 'tab_etapa'],
  ['coliformes #5 em confirmação', 'coli_abrir'],
  ['coliformes #5.7 positivo', 'tab_resultado'],
  // Embarque e Howard
  ['embarque navio O.SKY 133 linha 2 fase 2 load 77010 item 444 amostras 1-10', 'embarque'],
  ['compostas do navio O.SKY 133 linha 2 fase 2 (A1-A5)(A6-A10)', 'criar_compostas_embarque'],
  ['howard #21 2%', 'howard_registrar'],
  ['temos analise de howard para hoje?', 'consulta_howard'],
  ['quais howards foram lidos hoje?', 'consulta_howard'],
  // C.T e B.L por lote e amostra
  ['ct load 77001 lote 4 deu 10, lotes 5-10 deu <10', 'contagem_registrar'],
  ['bl72 load 77001 lotes 1-14 deu <10', 'contagem_registrar'],
  ['bl120 load 77001 item 444 lote 4 deu 8,5', 'contagem_registrar'],
  ['ct navio O.SKY 133 linha 2 fase 2 amostras 1-5 deu <10, amostra 6 deu 30', 'contagem_registrar'],
  ['quais ct tenho para ler hoje?', 'consulta_contagens'],
  ['quais bl72 tenho para ler hoje?', 'consulta_contagens'],
  ['quais bl120 foram lidos hoje?', 'consulta_contagens'],
  ['quais cts foram lidos hoje?', 'consulta_contagens'],
  // Relatorio
  ['relatório do dia', 'relatorio_dia'],
  ['relatório do dia completo', 'relatorio_dia'],
  ['relatório do dia recebimento', 'relatorio_dia'],
  ['leitura do dia finalizada', 'finalizar_dia'],
  ['Leitura de hoje finalizada', 'finalizar_dia'],
  ['leitura finalizada', 'finalizar_dia'],
  ['finalizar leitura do dia', 'finalizar_dia'],
  ['drop d5 do tanque 45 data 30/09/2026 não ok', 'desvio_abrir'],
  ['Drop D10 tanque 1C navio O.SKY 123 coleta 28/09/2026 nao ok', 'desvio_abrir'],
  ['desvio do drop d5 tanque 45 confirmou em 13 e 25 graus', 'desvio_resultado'],
  ['Desvio do drop D5 do tanque 45 não confirmou', 'desvio_resultado'],
  ['quais últimos desvios de drops relacionados ao tanque 45?', 'consulta_desvios'],
  ['quais desvios estão abertos?', 'consulta_desvios'],
];

test('reconhecimento: cada comando cai na intencao certa', async (t) => {
  for (const [frase, tipo] of RECONHECIDOS) {
    await t.test(`${tipo} <- ${frase}`, () => {
      assert.equal(interpretar(frase).tipo, tipo);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Campos extraidos (o que vai para o banco)
// ---------------------------------------------------------------------------
test('campos: recebimento com lotes soltos e intervalos', () => {
  confere('recebimento load 77001 item 444 fabrica AQA lotes 1-5,7,9-10 data 01/10/2026', {
    load: '77001',
    item: '444',
    fabrica: 'AQA',
    lotes: [1, 2, 3, 4, 5, 7, 9, 10],
    dataRecebimento: '01/10/2026',
  });
});

test('campos: compostas, uma por parentese', () => {
  confere('compostas do load 77001 (1-5)(6-10)(11,12,15)', {
    load: '77001',
    compostas: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 15]],
  });
});

test('campos: embarque com linha, fase e amostras', () => {
  confere('embarque navio O.SKY 133 linha 4 fase 1 load 77011 item 444 amostras 8-12 data 03/10/2026', {
    navio: 'O.SKY 133',
    linha: '4',
    fase: '1',
    load: '77011',
    item: '444',
    amostras: [8, 9, 10, 11, 12],
    dataEmbarque: '03/10/2026',
  });
});

test('campos: tab feito por intervalo de compostas (#4 a #6)', () => {
  confere('tab feito das compostas #4 a #6', { compostaIds: [4, 5, 6] });
});

test('campos: tab de NFC por tanque, sempre com a data da coleta', () => {
  confere('Tab feito dos tanques terra 42,43 coleta 28/09/2026', {
    tanques: ['42', '43'],
    dataColeta: '28/09/2026',
  });
});

test('campos: howard em porcentagem par', () => {
  confere('howard #21 2%', { compostaId: 21, percentual: 2 });
});

test('campos: C.T com varios grupos e sinal (< nunca vira igual)', () => {
  confere('ct load 77001 lote 4 deu 10, lotes 5-10 deu <10', {
    analise: 'CT',
    origem: 'recebimento',
    load: '77001',
    grupos: [
      { numeros: [4], sinal: '=', valor: 10 },
      { numeros: [5, 6, 7, 8, 9, 10], sinal: '<', valor: 10 },
    ],
  });
});

test('campos: B.L aceita virgula decimal e item', () => {
  confere('bl120 load 77001 item 444 lote 4 deu 8,5', {
    analise: 'BL120',
    item: '444',
    grupos: [{ numeros: [4], sinal: '=', valor: 8.5 }],
  });
});

test('campos: "bl" sozinho vale BL120 e "bl72" continua valendo 72 (consulta e registro)', () => {
  const consultas = [
    ['quais bl tenho para ler hoje?', 'BL120', 'ler'],
    ['quais bls foram lidos hoje?', 'BL120', 'lidos'],
    ['quais bl120 tenho para ler hoje?', 'BL120', 'ler'],
    ['quais bl72 tenho para ler hoje?', 'BL72', 'ler'],
    ['quais bl72 foram lidos hoje?', 'BL72', 'lidos'],
  ];
  for (const [frase, analise, etapa] of consultas) {
    confere(frase, { tipo: 'consulta_contagens', analise, etapa });
  }
  confere('bl load 77001 lotes 1-3 deu <10', { tipo: 'contagem_registrar', analise: 'BL120' });
  confere('bl72 load 77001 lotes 1-3 deu <10', { tipo: 'contagem_registrar', analise: 'BL72' });
  confere('bl navio O.SKY 133 linha 2 fase 2 amostras 1-5 deu 8', { analise: 'BL120', origem: 'embarque' });
});

test('campos: C.T de embarque guarda navio, linha e fase', () => {
  confere('ct navio O.SKY 133 linha 2 fase 2 amostras 1-5 deu <10, amostra 6 deu 30', {
    analise: 'CT',
    origem: 'embarque',
    navio: 'O.SKY 133',
    linha: '2',
    fase: '2',
  });
});

test('campos: concluir drops filtra por estagio, tipo e navio', () => {
  confere('Concluir drops D5 navio O.SKY 123', {
    diaFiltro: 'D5',
    tipoTanqueFiltro: 'Navio',
    navioFiltro: 'O.SKY 123',
  });
});

test('campos: relatorio do dia, blocos e modo completo', () => {
  confere('relatório do dia completo', {
    blocosNfc: ['Tank farm', 'Navio'],
    blocosConc: ['Recebimento', 'Embarque'],
    completo: true,
  });
  confere('relatório do dia tanques navio', {
    blocosNfc: ['Navio'],
    blocosConc: [],
    completo: false,
  });
});

// ---------------------------------------------------------------------------
// 3. Prazos de negocio (datas calculadas a partir da data informada)
// ---------------------------------------------------------------------------
test('prazos: coleta de terra gera D5/D10/D15 e descarte em 365 dias', () => {
  const r = interpretar('registrar coleta tanque terra 42,43,44 data 24/09/2026');
  assert.equal(r.drops.length, 9, '3 tanques x 3 drops');
  const do42 = r.drops.filter((d) => d.tanque === '42');
  assert.deepStrictEqual(
    do42.map((d) => [d.diaDrop, d.dataPrevista]),
    [['D5', '29/09/2026'], ['D10', '04/10/2026'], ['D15', '09/10/2026']],
  );
  assert.equal(r.bagsArquivo.length, 3);
  assert.ok(r.bagsArquivo.every((b) => b.dataDescarte === '24/09/2027' && b.status === 'Arquivado'));
});

test('prazos: coleta de navio usa a mesma regra e guarda o navio', () => {
  const r = interpretar('Coleta navio O.SKY 123 tanques 5,6,7 data 24/09/2026');
  assert.equal(r.navio, 'O.SKY 123');
  assert.equal(r.drops.length, 9);
  assert.equal(r.arquivosNavio.length, 3);
  assert.ok(r.arquivosNavio.every((a) => a.dataDescarte === '24/09/2027'));
});

test('prazos: analise gera 4 linhas (CT 48h, BL 72/120h, WORT 120/240h)', () => {
  const r = interpretar('Analise do Stress do tanque 42, data 24/09/2026');
  assert.equal(r.analises.length, 4);
  const [ct, bl, wortProf, wortSup] = r.analises;
  assert.deepStrictEqual([ct.subAnalise, ct.dataPreLeitura, ct.dataLeituraFinal], ['CT', '', '26/09/2026']);
  assert.deepStrictEqual([bl.subAnalise, bl.dataPreLeitura, bl.dataLeituraFinal], ['BL', '27/09/2026', '29/09/2026']);
  assert.deepStrictEqual([wortProf.metodo, wortProf.dataPreLeitura, wortProf.dataLeituraFinal], ['Profundidade', '29/09/2026', '04/10/2026']);
  assert.deepStrictEqual([wortSup.metodo, wortSup.dataLeituraFinal], ['Superficie', '04/10/2026']);
  assert.ok(r.analises.every((a) => a.tipoFrasco === 'Stress'));
});

// ---------------------------------------------------------------------------
// 4. Recusas: o node barra antes de chegar ao banco
// ---------------------------------------------------------------------------
test('recusa: coleta de 9 tanques (limite 8)', () => {
  const r = interpretar('registrar coleta tanque terra 1,2,3,4,5,6,7,8,9 data 24/09/2026');
  assert.equal(r.tipo, 'erro_coleta');
  assert.match(r.textoResposta, /até 8 tanques/);
  assert.equal(r.itensColeta, undefined, 'nada pode ser preparado para gravar');
});

test('recusa: Howard so aceita porcentagem par (50 campos)', () => {
  const r = interpretar('howard #21 3%');
  assert.equal(r.tipo, 'erro_coleta');
  assert.match(r.textoResposta, /sempre par/);
});

// ---------------------------------------------------------------------------
// 5. Permissoes (validadas no codigo, nunca no prompt - Bug 23)
// ---------------------------------------------------------------------------
test('permissao: numero nao cadastrado e bloqueado ate para consulta', () => {
  const r = interpretar('drops para hoje', { cadastrado: false });
  assert.equal(r.tipo, 'nao_cadastrado');
  assert.match(r.textoResposta, /não está cadastrado/);
});

test('permissao: Consultor consulta, mas nao grava', () => {
  assert.equal(interpretar('drops para hoje', { cargo: 'Consultor' }).tipo, 'consulta_drops');

  const gravacoes = [
    'registrar coleta tanque terra 42 data 24/09/2026',
    'recebimento load 77001 item 444 fabrica AQA lotes 1-14',
    'bl120 load 77001 lotes 1-3 deu 60',
    'leitura do dia finalizada',
    'drop d5 do tanque 45 data 30/09/2026 não ok',
    'desvio do drop d5 tanque 45 não confirmou',
  ];
  for (const frase of gravacoes) {
    const r = interpretar(frase, { cargo: 'Consultor' });
    assert.equal(r.tipo, 'erro_coleta', frase);
    assert.match(r.textoResposta, /somente de consulta/, frase);
  }
});

test('permissao: Operador grava, mas nao troca cargo', () => {
  assert.equal(
    interpretar('recebimento load 77001 item 444 fabrica AQA lotes 1-14', { cargo: 'Operador' }).tipo,
    'recebimento',
  );
  const r = interpretar('trocar cargo Operador para o numero 5511987654321', { cargo: 'Operador' });
  assert.equal(r.tipo, 'gerenciar_usuario');
  assert.equal(r.autorizado, false);
  assert.match(r.textoResposta, /Só administradores/);
});

test('permissao: Admin troca cargo', () => {
  const r = interpretar('trocar cargo Consultor para o numero 5511987654321');
  assert.equal(r.tipo, 'gerenciar_usuario');
  assert.notEqual(r.autorizado, false);
});

// ---------------------------------------------------------------------------
// 6. Frase livre, IA e protecoes contra loop
// ---------------------------------------------------------------------------
test('ia: frase que nenhuma regex reconhece vai para a IA', () => {
  for (const frase of ['bom dia', 'coletei os tanques 60 e 61 hoje']) {
    const r = interpretar(frase);
    assert.equal(r.tipo, 'interpretar_ia', frase);
    assert.equal(r.mensagem_original, frase);
  }
});

test('ia: mensagem reenviada pela IA que ainda nao bate vira erro (sem loop)', () => {
  const r = interpretar('bom dia', { reenvio: true });
  assert.equal(r.tipo, 'erro_ia');
});

test('ia: a IA recebe o cargo de quem mandou (para o codigo decidir)', () => {
  assert.equal(interpretar('bom dia', { cargo: 'Consultor' }).nivelAtual, 'Consultor');
});

test('descarte: mensagem enviada pelo proprio bot (fromMe) e ignorada', () => {
  // O executor monta fromMe=false; aqui simulamos o caso direto pelo node.
  const { codigoDoNode } = require('./helpers/executar-node');
  const webhook = {
    body: { data: { key: { remoteJid: '5511900000001@s.whatsapp.net', fromMe: true }, message: { conversation: 'drops para hoje' } } },
  };
  const executar = new Function('$', '$input', codigoDoNode('Interpretar comando'));
  const saida = executar(() => ({ first: () => ({ json: webhook }) }), { all: () => [] });
  assert.deepStrictEqual(saida, []);
});

test('campos: desvio de drop (abrir pela coleta, resultado por temperatura, consulta)', () => {
  confere('drop d5 do tanque 45 data 30/09/2026 não ok', {
    tipo: 'desvio_abrir', dia: 5, tanque: '45', navio: '', dataColeta: '30/09/2026',
  });
  confere('Drop D10 tanque 1c navio O.SKY 123 coleta 28/09/2026 nao ok', {
    tipo: 'desvio_abrir', dia: 10, tanque: '1C', navio: 'O.SKY 123', dataColeta: '28/09/2026',
  });
  confere('desvio do drop d5 tanque 45 confirmou em 25 e 13 graus', {
    tipo: 'desvio_resultado', dia: 5, tanque: '45', dataColeta: '', temps: [13, 25],
  });
  confere('desvio do drop d5 tanque 45 data 30/09/2026 não confirmou', {
    tipo: 'desvio_resultado', dataColeta: '30/09/2026', temps: [],
  });
  confere('quais desvios de drops do tanque 45?', { tipo: 'consulta_desvios', modo: 'tanque', tanque: '45' });
  confere('quais desvios estão abertos?', { tipo: 'consulta_desvios', modo: 'abertos' });
  // temperatura fora de 7, 13 e 25: recusa sem gravar
  const r = interpretar('desvio do drop d5 tanque 45 confirmou em 30 graus');
  assert.equal(r.tipo, 'erro_coleta');
  assert.match(r.textoResposta, /7, 13 ou 25/);
});
