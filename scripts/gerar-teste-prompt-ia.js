// Gera o workflow descartável "LabFlow · Teste do prompt da IA": manda frases ao Gemini (com o
// MESMO prompt do bot, lido do arquivo de importação) e dá o placar. Ver docs/scripts.md.
// Uso: node scripts/gerar-teste-prompt-ia.js LabFlow_importar_n8n.json LabFlow_importar_n8n_teste_ia.json
// Os dois arquivos têm IDs reais e ficam fora do Git (.gitignore: LabFlow_importar_n8n*.json).
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const [, , arquivo, saida] = process.argv;
const wf = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const gem = JSON.parse(JSON.stringify(wf.nodes.find((n) => n.name === 'Gemini · Interpretar mensagem')));

let prompt = gem.parameters.messages.values[0].content;
const HOJE = "{{ $('Interpretar comando').first().json.hoje }}";
const MSG = "{{ $('Interpretar comando').first().json.mensagem_original }}";
if (!prompt.includes(HOJE) || !prompt.includes(MSG)) throw new Error('expressões do prompt não encontradas');
prompt = prompt.split(HOJE).join('{{ $json.hoje }}').split(MSG).join('{{ $json.frase }}');
gem.parameters.messages.values[0].content = prompt;
gem.id = crypto.randomUUID(); gem.name = 'Gemini (mesmo prompt do bot)'; gem.position = [700, 0];

// [frase, esperado]: esperado = comando oficial, ou "intencao:<nome>"
const FRASES = [
  ['recebemos os lotes de 1 a 8 do load 78005, item 555, fábrica ZTX', 'recebimento load 78005 item 555 fabrica ZTX lotes 1-8'],
  ['chegou do load 78006 item 4100 fabrica AQA os lotes 1, 3 e 5 no dia 02/10', 'recebimento load 78006 item 4100 fabrica AQA lotes 1,3,5 data 02/10/2026'],
  ['chegaram 10 lotes do load 78007', 'intencao:incompleto'],
  ['faz as compostas do load 78005: de 1 a 4 e de 5 a 8', 'compostas do load 78005 (1-4)(5-8)'],
  ['registra o embarque do navio ORANGE STAR 112 linha 3 fase 1, load 78010 item 555, amostras 1 a 6', 'embarque navio ORANGE STAR 112 linha 3 fase 1 load 78010 item 555 amostras 1-6'],
  ['compostas do ORANGE STAR 112 linha 3 fase 1: A1 a A3 e A4 a A6', 'compostas do navio ORANGE STAR 112 linha 3 fase 1 (A1-A3)(A4-A6)'],
  ['TAB no caldo das compostas 10 a 12', 'tab feito das compostas #10 a #12|tab feito das compostas #10, #11, #12'],
  ['fiz os coliformes das compostas 10 e 11', 'coliformes feitos das compostas #10, #11'],
  ['tab dos tanques de terra 50 e 51 coletados em 01/10', 'Tab feito dos tanques terra 50,51 coleta 01/10/2026'],
  ['plaqueei os TABs', 'tabs de hoje espalhados'],
  ['fiz a estria dos coliformes de hoje', 'coliformes de hoje estriados'],
  ['leitura dos TABs feita, tudo negativo', 'tabs de hoje lidos'],
  ['coliformes lidos, sem crescimento', 'coliformes de hoje lidos'],
  ['apareceu colônia no TAB 11', 'tab #11 em confirmação'],
  ['a PCA do tab 11 deu negativo', 'confirmação do tab #11 negativo'],
  ['vou abrir a composta 10 dos coliformes', 'coliformes #10 em confirmação'],
  ['nos coliformes da composta 10 o lote 3 deu negativo', 'coliformes #10.3 negativo'],
  ['o howard da composta 30 deu 6%', 'howard #30 6%'],
  ['contagem total do load 78005 lotes 1 a 8 menor que 10', 'ct load 78005 lotes 1-8 deu <10'],
  ['bl72 do load 78005 lote 2 deu 20', 'bl72 load 78005 lote 2 deu 20'],
  ['ct do navio ORANGE STAR 112 linha 3 fase 1 amostras 1 a 6 menor que 10', 'ct navio ORANGE STAR 112 linha 3 fase 1 amostras 1-6 deu <10'],
  ['fechei a leitura do dia', 'leitura do dia finalizada'],
  ['drop d10 do tanque 52 coletado dia 25/09/2026 reprovou', 'drop d10 do tanque 52 data 25/09/2026 não ok'],
  ['o drop d5 do tanque 53 não ficou ok', 'intencao:incompleto'],
  ['desvio do drop d10 tanque 52 positivo a 7 graus', 'desvio do drop d10 tanque 52 confirmou em 7 graus'],
  ['desvio do drop d10 do tanque 52 não cresceu em nenhuma', 'desvio do drop d10 tanque 52 não confirmou'],
  ['me manda o relatório do dia completo', 'relatório do dia completo'],
  ['relatório de hoje dos tanques de navio', 'relatório do dia tanques navio'],
  ['quais tabs eu espalho hoje?', 'quais tabs tenho para espalhar hoje?'],
  ['tem coliforme pra estriar hoje?', 'quais coliformes tenho para estriar hoje?'],
  ['quais coliformes já foram lidos hoje', 'quais coliformes foram lidos hoje?'],
  ['tem howard pendente hoje?', 'temos analise de howard para hoje?'],
  ['quais bl120 eu leio hoje?', 'quais bl120 tenho para ler hoje?'],
  ['tem algum desvio aberto?', 'quais desvios estão abertos?'],
  ['quais desvios teve no tanque 52?', 'quais desvios de drops do tanque 52?'],
  // estilo áudio (números por extenso, sem pontuação)
  ['chegaram os lotes um a cinco do load setenta e oito mil e cinco item quinhentos e cinquenta e cinco fábrica ZTX', 'recebimento load 78005 item 555 fabrica ZTX lotes 1-5'],
  ['o drop d cinco do tanque quarenta e cinco da coleta de trinta do nove de dois mil e vinte e seis deu não ok', 'drop d5 do tanque 45 data 30/09/2026 não ok'],
  ['terminei a leitura do dia de hoje', 'leitura do dia finalizada'],
  // placas de NFC e repetição (versão 1.2.0)
  ['o C.T do tanque 47 normal deu trinta, doze e oito', 'ct do tanque 47 normal 30,12,8'],
  ['nada cresceu no bl72 do tanque 5 stress', 'bl72 do tanque 5 stress 0,0,0'],
  ['bl do tanque 48 normal deu 0, 2 e 0', 'bl120 do tanque 48 normal 0,2,0|bl do tanque 48 normal 0,2,0'],
  ['wort superfície 240 horas do tanque 47 stress zero zero e um', 'wort superficie 240h do tanque 47 stress 0,0,1'],
  ['li o C.T do tanque 1C do navio D.SKY 123 stress: 5, 3 e 0', 'ct do tanque 1C navio D.SKY 123 stress 5,3,0'],
  ['o C.T do tanque 47 deu 12 e 8', 'intencao:incompleto'],
  ['fiz a reanálise do tanque 47 stress bl120', 'repetição do tanque 47 stress bl120'],
  ['repeti o ct do tanque 47 normal com o frasco de arquivo', 'repetição do tanque 47 normal ct|repetição do tanque 47 ct normal'],
  // intenções antigas (regressão)
  ['coletei os tanques 70 e 71 hoje', 'intencao:coleta_terra'],
  ['fiz os drops D10 de terra', 'intencao:concluir_drops'],
  ['li o BL final stress de navio', 'intencao:concluir_leitura'],
  ['quais bags posso jogar fora hoje?', 'intencao:consulta_bags'],
  ['muda o cargo do 11 98888-7777 para gerente', 'intencao:gerenciar_cargo'],
  ['bom dia, tudo bem?', 'intencao:desconhecido'],
];

const code = (nome, js, pos, extra = {}) => ({
  parameters: { jsCode: js, ...extra }, type: 'n8n-nodes-base.code', typeVersion: 2,
  position: pos, id: crypto.randomUUID(), name: nome,
});
const nodes = [
  { parameters: {}, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], id: crypto.randomUUID(), name: 'Executar teste' },
  code('Frases', `const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const FRASES = ${JSON.stringify(FRASES, null, 2)};
return FRASES.map(([frase, esperado]) => ({ json: { frase, esperado, hoje } }));`, [220, 0]),
  { parameters: { options: {} }, type: 'n8n-nodes-base.splitInBatches', typeVersion: 3, position: [460, 0], id: crypto.randomUUID(), name: 'Uma por vez' },
  gem,
  code('Juntar', `const r = $input.item.json;
const texto = String(r?.content?.parts?.[0]?.text ?? '').replace(/\`\`\`json|\`\`\`/g, '').trim();
const f = $('Uma por vez').item.json;
return { json: { frase: f.frase, esperado: f.esperado, resposta: texto } };`, [940, 0], { mode: 'runOnceForEachItem' }),
  { parameters: { amount: 4, unit: 'seconds' }, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [1160, 0], id: crypto.randomUUID(), name: 'Esperar 4s', webhookId: crypto.randomUUID() },
  code('Placar', `const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
  .replace(/\\s*,\\s*/g, ',').replace(/\\s+/g, ' ').replace(/[?!.]+$/, '').trim();
const linhas = $input.all().map(i => i.json);
const res = linhas.map(l => {
  let ia = {};
  try { ia = JSON.parse(l.resposta); } catch (e) { ia = { erro: 'JSON inválido' }; }
  const ok = l.esperado.startsWith('intencao:')
    ? ia.intencao === l.esperado.slice(9)
    : ia.intencao === 'comando' && l.esperado.split('|').some(e => norm(ia.comando) === norm(e));
  return { ok, frase: l.frase, esperado: l.esperado, obtido: ia.intencao === 'comando' ? ia.comando : (ia.intencao + (ia.falta ? ' (falta: ' + ia.falta + ')' : '')) };
});
const falhas = res.filter(r => !r.ok);
const texto = [\`Placar: \${res.length - falhas.length} de \${res.length} certas\`, '',
  ...falhas.map(f => \`ERRO\\n  frase:    \${f.frase}\\n  esperado: \${f.esperado}\\n  obtido:   \${f.obtido}\`)].join('\\n');
return [{ json: { placar: \`\${res.length - falhas.length} de \${res.length}\`, texto, falhas } }];`, [700, -220]),
];
const con = (de, saidas) => ({ [de]: { main: saidas.map((s) => s.map((node) => ({ node, type: 'main', index: 0 }))) } });
const connections = Object.assign({},
  con('Executar teste', [['Frases']]),
  con('Frases', [['Uma por vez']]),
  con('Uma por vez', [['Placar'], ['Gemini (mesmo prompt do bot)']]),
  con('Gemini (mesmo prompt do bot)', [['Juntar']]),
  con('Juntar', [['Esperar 4s']]),
  con('Esperar 4s', [['Uma por vez']]),
);
fs.writeFileSync(saida, JSON.stringify({ name: 'LabFlow · Teste do prompt da IA (apagar depois)', nodes, connections,
  settings: { executionOrder: 'v1' }, pinData: {} }, null, 2), 'utf8');
console.log('teste gerado:', FRASES.length, 'frases');
