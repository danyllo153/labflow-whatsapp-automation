'use strict';

// Catalogo dos comandos que a IA (intencao "comando") pode gerar: um exemplo de cada
// formato oficial, com a intencao que o node "Interpretar comando" deve reconhecer
// e a classe que o node "Validar resposta da IA" deve dar:
//   consulta  -> roda direto (so le)
//   pede_sim  -> roda direto, porque o proprio fluxo do comando ja pergunta "sim"
//   grava     -> grava direto no fluxo do comando, entao a IA pede "sim" antes
// Usado por tests/validar-ia.test.js. Comando novo: acrescentar aqui tambem.

module.exports = [
  // Recebimento e compostas
  ['recebimento load 77001 item 444 fabrica AQA lotes 1-14', 'recebimento', 'grava'],
  ['recebimento load 77002 item 3333 fabrica BCD lotes 1-3,5 data 01/10/2026', 'recebimento', 'grava'],
  ['compostas do load 77001 (1-5)(6-10)(11,12,15)', 'criar_compostas', 'grava'],
  ['compostas do load 77001 item 444 (1-5)', 'criar_compostas', 'grava'],
  // Embarque
  ['embarque navio O.SKY 133 linha 2 fase 2 load 77010 item 444 amostras 1-10', 'embarque', 'grava'],
  ['compostas do navio O.SKY 133 linha 2 fase 2 (A1-A5)(A6-A10)', 'criar_compostas_embarque', 'grava'],
  // TAB e Coliformes
  ['tab feito das compostas #4 a #6', 'tab_feito', 'grava'],
  ['tab feito das compostas #4, #5, #7 data 28/09/2026', 'tab_feito', 'grava'],
  ['tab feito do load 77001 item 444 lotes 1-5', 'tab_feito', 'grava'],
  ['tab feito do navio O.SKY 133 linha 2 fase 2 (A1-A5)', 'tab_feito', 'grava'],
  ['coliformes feitos das compostas #4 a #6', 'tab_feito', 'grava'],
  ['coliformes feitos do load 77001 lotes 1-5', 'tab_feito', 'grava'],
  ['Tab feito dos tanques terra 42,43 coleta 28/09/2026', 'tab_feito_nfc', 'grava'],
  ['tabs de hoje espalhados', 'tab_etapa', 'pede_sim'],
  ['coliformes de hoje estriados', 'tab_etapa', 'pede_sim'],
  ['tabs de hoje lidos', 'tab_etapa', 'pede_sim'],
  ['coliformes de hoje lidos', 'tab_etapa', 'pede_sim'],
  ['tab #5 em confirmação', 'tab_em_confirmacao', 'grava'],
  ['tab tanque terra 42 coleta 28/09/2026 em confirmação', 'tab_em_confirmacao', 'grava'],
  ['confirmação do tab #5 positivo', 'tab_resultado', 'pede_sim'],
  ['confirmação do tab tanque terra 42 coleta 28/09/2026 negativo', 'tab_resultado', 'pede_sim'],
  ['coliformes #5 em confirmação', 'coli_abrir', 'pede_sim'],
  ['coliformes #5.7 positivo', 'tab_resultado', 'pede_sim'],
  // Howard
  ['howard #21 4%', 'howard_registrar', 'pede_sim'],
  ['Analise da composta de Howard do navio O.SKY 133 linha 2 fase 2 amostras 1-5, foi 2%', 'howard_registrar', 'pede_sim'],
  // C.T e B.L
  ['ct load 77001 lote 4 deu 10, lotes 5-10 deu <10', 'contagem_registrar', 'pede_sim'],
  ['bl120 load 77001 lotes 1-14 deu <10', 'contagem_registrar', 'pede_sim'],
  ['bl72 load 77001 item 444 lote 4 deu 8,5', 'contagem_registrar', 'pede_sim'],
  ['ct navio O.SKY 133 linha 2 fase 2 amostras 1-5 deu <10', 'contagem_registrar', 'pede_sim'],
  // Dia e drops
  ['leitura do dia finalizada', 'finalizar_dia', 'pede_sim'],
  ['drop d5 do tanque 45 data 30/09/2026 não ok', 'desvio_abrir', 'pede_sim'],
  ['drop d10 do tanque 1C navio O.SKY 123 data 28/09/2026 não ok', 'desvio_abrir', 'pede_sim'],
  ['desvio do drop d5 tanque 45 confirmou em 13 e 25 graus', 'desvio_resultado', 'pede_sim'],
  ['desvio do drop d5 tanque 45 não confirmou', 'desvio_resultado', 'pede_sim'],
  // Consultas
  ['relatório do dia', 'relatorio_dia', 'consulta'],
  ['relatório do dia completo', 'relatorio_dia', 'consulta'],
  ['relatório do dia recebimento', 'relatorio_dia', 'consulta'],
  ['relatório do dia tanques terra', 'relatorio_dia', 'consulta'],
  ['quais tabs tenho para espalhar hoje?', 'consulta_tab', 'consulta'],
  ['quais tabs tenho para ler hoje?', 'consulta_tab', 'consulta'],
  ['quais tabs foram lidos hoje?', 'consulta_tab', 'consulta'],
  ['quais coliformes tenho para estriar hoje?', 'consulta_tab', 'consulta'],
  ['quais coliformes tenho para ler hoje?', 'consulta_tab', 'consulta'],
  ['quais coliformes foram lidos hoje?', 'consulta_tab', 'consulta'],
  ['temos analise de howard para hoje?', 'consulta_howard', 'consulta'],
  ['quais howards foram lidos hoje?', 'consulta_howard', 'consulta'],
  ['quais ct tenho para ler hoje?', 'consulta_contagens', 'consulta'],
  ['quais bl72 tenho para ler hoje?', 'consulta_contagens', 'consulta'],
  ['quais bl120 foram lidos hoje?', 'consulta_contagens', 'consulta'],
  ['quais desvios de drops do tanque 45?', 'consulta_desvios', 'consulta'],
  ['quais desvios estão abertos?', 'consulta_desvios', 'consulta'],
];
