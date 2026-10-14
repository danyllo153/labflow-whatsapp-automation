'use strict';

// Cadeia de IA resiliente (texto e áudio): Gemini com tempo máximo, Groq e Gemini 3.8 de reserva,
// limite diário por pessoa, e respostas padronizadas para o resto do fluxo.
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { codigoDoNode, workflow } = require('./helpers/executar-node');

const node = (nome) => workflow.nodes.find((n) => n.name === nome);
const destinos = (origem, saida = 0) => ((workflow.connections[origem] || { main: [] }).main[saida] || []).map((d) => d.node);

// Roda um Code node: `nodes` simula a saída de outros nodes ({ nome: { json, binary } }).
function rodar(nome, entrada, nodes = {}) {
  const $ = (n) => {
    if (!(n in nodes)) throw new Error(`O teste nao simula o node: ${n}`);
    const item = nodes[n];
    return { first: () => item, item };
  };
  const itens = [].concat(entrada).map((json) => ({ json }));
  const $input = { all: () => itens, first: () => itens[0] };
  return new Function('$', '$input', codigoDoNode(nome))($, $input);
}

// ------------------------------------------------------------------ desenho da cadeia
test('texto livre: atalho -> limite -> pedido -> Gemini -> Groq -> Gemini 3.8, sempre terminando no Normalizar', () => {
  assert.deepEqual(destinos('Rotear comando', 16), ['IA · Já entendi?']);
  assert.deepEqual(destinos('IA · Já entendi?', 0), ['IA · Resposta pronta'], 'comando já completo não chama IA');
  assert.deepEqual(destinos('IA · Já entendi?', 1), ['BD · Limite IA texto']);
  assert.deepEqual(destinos('IA · Resposta pronta'), ['Validar resposta da IA']);
  assert.deepEqual(destinos('BD · Limite IA texto'), ['IA liberada? (texto)']);
  assert.deepEqual(destinos('IA liberada? (texto)', 0), ['IA · Montar pedido'], 'liberado segue');
  assert.deepEqual(destinos('IA liberada? (texto)', 1), ['IA · Limite atingido texto'], 'barrado nao chama IA');
  assert.deepEqual(destinos('IA · Montar pedido'), ['IA · Gemini texto']);
  assert.deepEqual(destinos('IA · Gemini texto', 0), ['IA · Normalizar texto'], 'sucesso');
  assert.deepEqual(destinos('IA · Gemini texto', 1), ['IA · Groq texto'], 'falha vai para o Groq');
  assert.deepEqual(destinos('IA · Groq texto', 0), ['IA · Normalizar texto']);
  assert.deepEqual(destinos('IA · Groq texto', 1), ['IA · Gemini 3.8 texto'], 'falha vai para o ultimo recurso');
  assert.deepEqual(destinos('IA · Gemini 3.8 texto', 0), ['IA · Normalizar texto']);
  assert.deepEqual(destinos('IA · Gemini 3.8 texto', 1), ['IA · Normalizar texto'], 'ate o erro passa pelo Normalizar');
  assert.deepEqual(destinos('IA · Normalizar texto'), ['Validar resposta da IA']);
  assert.deepEqual(destinos('IA · Limite atingido texto'), ['Validar resposta da IA']);
});

test('áudio: limite -> Gemini -> Whisper do Groq, terminando em Montar transcrição', () => {
  assert.deepEqual(destinos('Áudio em arquivo'), ['BD · Limite IA áudio']);
  assert.deepEqual(destinos('IA liberada? (áudio)', 0), ['IA · Gemini áudio']);
  assert.deepEqual(destinos('IA liberada? (áudio)', 1), ['IA · Limite atingido áudio']);
  assert.deepEqual(destinos('IA · Gemini áudio', 0), ['IA · Normalizar áudio']);
  assert.deepEqual(destinos('IA · Gemini áudio', 1), ['IA · Áudio para o Groq']);
  assert.deepEqual(destinos('IA · Áudio para o Groq'), ['IA · Groq Whisper']);
  assert.deepEqual(destinos('IA · Groq Whisper', 0), ['IA · Normalizar áudio']);
  assert.deepEqual(destinos('IA · Groq Whisper', 1), ['IA · Normalizar áudio']);
  assert.deepEqual(destinos('IA · Normalizar áudio'), ['Montar transcrição']);
  assert.deepEqual(destinos('IA · Limite atingido áudio'), ['Montar transcrição']);
});

test('os nodes de IA antigos (sem tempo máximo) não existem mais', () => {
  assert.equal(node('Gemini · Interpretar mensagem'), undefined);
  assert.equal(node('Gemini · Transcrever áudio'), undefined);
});

test('cada chamada de IA tem tempo máximo curto e segue a próxima em vez de travar', () => {
  const chamadas = ['IA · Gemini texto', 'IA · Groq texto', 'IA · Gemini 3.8 texto', 'IA · Gemini áudio', 'IA · Groq Whisper'];
  for (const nome of chamadas) {
    const n = node(nome);
    const t = n.parameters.options.timeout;
    assert.ok(t >= 10000 && t <= 30000, `${nome}: tempo máximo ${t} ms fora de 10 a 30 s`);
    assert.equal(n.onError, 'continueErrorOutput', `${nome} precisa seguir pela saída de erro`);
    assert.ok(!n.retryOnFail, `${nome}: sem repetir sozinho (o próximo provedor é a nova tentativa)`);
  }
});

test('provedores e modelos configurados', () => {
  assert.match(node('IA · Gemini texto').parameters.url, /models\/gemini-3\.1-flash-lite:generateContent$/);
  assert.match(node('IA · Gemini 3.8 texto').parameters.url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.match(node('IA · Gemini áudio').parameters.url, /models\/gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(node('IA · Groq texto').parameters.url, 'https://api.groq.com/openai/v1/chat/completions');
  // o modelo precisa existir na conta do Groq (lista de Limits do console): llama-3.3 nao existe mais la
  assert.match(node('IA · Groq texto').parameters.jsonBody, /model: 'openai\/gpt-oss-120b'/);
  assert.doesNotMatch(node('IA · Groq texto').parameters.jsonBody, /llama/);
  assert.match(node('IA · Groq texto').parameters.jsonBody, /max_tokens: 1200/, 'resposta curta: o limite gratuito e de 8 mil tokens por minuto');
  assert.equal(node('IA · Groq Whisper').parameters.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  // a chave do Gemini e a do Groq ficam em credenciais do n8n, nunca no arquivo
  assert.equal(node('IA · Gemini texto').parameters.nodeCredentialType, 'googlePalmApi');
  assert.ok(node('IA · Groq texto').credentials.httpHeaderAuth);
  assert.ok(node('IA · Groq Whisper').credentials.httpHeaderAuth);
  const txt = JSON.stringify(workflow);
  assert.doesNotMatch(txt, /AIza[0-9A-Za-z_-]{20,}/, 'chave do Google no arquivo');
  assert.doesNotMatch(txt, /gsk_[0-9A-Za-z]{20,}/, 'chave do Groq no arquivo');
});

test('o Whisper recebe português, temperatura 0 e o arquivo de áudio', () => {
  const campos = Object.fromEntries(node('IA · Groq Whisper').parameters.bodyParameters.parameters.map((p) => [p.name, p]));
  assert.equal(campos.language.value, 'pt');
  assert.equal(campos.temperature.value, '0');
  assert.equal(campos.model.value, 'whisper-large-v3-turbo');
  assert.equal(campos.file.parameterType, 'formBinaryData');
  assert.equal(campos.file.inputDataFieldName, 'data');
  assert.match(campos.prompt.value, /load.*lote/s, 'vocabulário do laboratório para o Whisper');
});

test('o limite diário conta antes de chamar e só conta o que foi liberado', () => {
  for (const nome of ['BD · Limite IA texto', 'BD · Limite IA áudio']) {
    const q = node(nome).parameters.query;
    assert.match(q, /INSERT INTO uso_ia/);
    assert.match(q, /usuario_hoje < 100 AND antes\.total_hoje < 500/, 'só soma dentro do limite');
    assert.match(q, /\$1::text/);
    assert.match(q, /\$2::text/);
  }
  assert.match(node('BD · Limite IA texto').parameters.options.queryReplacement, /"texto"/);
  assert.match(node('BD · Limite IA áudio').parameters.options.queryReplacement, /"audio"/);
});

test('o reenvio do áudio espera o fluxo inteiro sem derrubar a execução por lentidão', () => {
  const n = node('Reenviar áudio como texto');
  assert.equal(n.parameters.options.timeout, 120000);
  assert.equal(n.onError, 'continueRegularOutput');
});

// ------------------------------------------------------------------ Normalizar (resposta de cada provedor)
const normalizar = (r) => rodar('IA · Normalizar texto', r)[0].json;

test('normalizar: resposta do Gemini vira o formato padrão', () => {
  const r = normalizar({ candidates: [{ content: { parts: [{ text: '{"intencao":"consulta_drops"}' }] } }] });
  assert.equal(r.provedor, 'gemini');
  assert.equal(r.content.parts[0].text, '{"intencao":"consulta_drops"}');
  assert.equal(r.error, undefined);
});

test('normalizar: junta as partes do Gemini e ignora espaços nas pontas', () => {
  const r = normalizar({ candidates: [{ content: { parts: [{ text: ' {"a":' }, { text: '1} \n' }] } }] });
  assert.equal(r.content.parts[0].text, '{"a":1}');
});

test('normalizar: resposta do Groq (chat) e do Whisper', () => {
  const chat = normalizar({ choices: [{ message: { role: 'assistant', content: '{"intencao":"comando"}' } }] });
  assert.deepEqual([chat.provedor, chat.content.parts[0].text], ['groq', '{"intencao":"comando"}']);
  const whisper = normalizar({ text: ' Coletei os tanques 42 e 43.' });
  assert.deepEqual([whisper.provedor, whisper.content.parts[0].text], ['groq', 'Coletei os tanques 42 e 43.']);
});

test('normalizar: erro de rede, bloqueio e resposta vazia viram { error }, nunca texto vazio', () => {
  assert.match(normalizar({ error: { message: 'Service unavailable' } }).error, /Service unavailable/);
  assert.match(normalizar({ error: 'The connection was aborted' }).error, /aborted/);
  assert.match(normalizar({ candidates: [{ finishReason: 'SAFETY' }], promptFeedback: { blockReason: 'SAFETY' } }).error, /bloqueada|sem resposta/);
  assert.ok(normalizar({}).error);
  assert.ok(normalizar({ choices: [{ message: { content: '   ' } }] }).error);
  assert.equal(normalizar({ error: { message: 'x'.repeat(500) } }).error.length, 200, 'erro cortado em 200');
});

test('normalizar de áudio é o mesmo código do de texto', () => {
  assert.equal(codigoDoNode('IA · Normalizar áudio'), codigoDoNode('IA · Normalizar texto'));
});

// ------------------------------------------------------------------ limite atingido
test('limite atingido: devolve { limite } sem chamar IA e guarda os números', () => {
  const r = rodar('IA · Limite atingido texto', { usuario_hoje: 100, limite_usuario: 100, total_hoje: 130, limite_total: 500, liberado: false })[0].json;
  assert.deepEqual([r.limite, r.tipo, r.usuario_hoje, r.limite_usuario], [true, 'texto', 100, 100]);
  assert.equal(rodar('IA · Limite atingido áudio', {})[0].json.tipo, 'audio');
});

// ------------------------------------------------------------------ Validar resposta da IA (limite e erro)
const validar = (raw) => rodar('Validar resposta da IA', raw, {
  'Interpretar comando': { json: { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Teste', nivelAtual: 'Admin', mensagem_original: 'coletei os tanques 60 e 61 hoje', hoje: '14/10/2026' } },
})[0].json;

test('validar: limite diário avisa sem gravar e sem culpar a IA', () => {
  const r = validar({ limite: true, tipo: 'texto', limite_usuario: 100 });
  assert.match(r.textoResposta, /Limite diário de IA atingido \(100 pedidos/);
  assert.match(r.textoResposta, /formato do comando/);
  assert.equal(r.reenviarComando, '');
  assert.equal(r.comando_ia, null);
});

test('validar: nenhum provedor respondeu mantém a mensagem de "IA indisponível"', () => {
  const r = validar({ error: 'Service unavailable', provedor: 'nenhum' });
  assert.match(r.textoResposta, /A IA está indisponível/);
  assert.equal(r.comando_ia, null);
});

test('validar: resposta normal continua funcionando (consulta executa direto)', () => {
  const r = validar({ content: { parts: [{ text: '{"intencao":"consulta_drops"}' }] }, provedor: 'groq' });
  assert.equal(r.reenviarComando, 'drops para hoje');
});

// ------------------------------------------------------------------ áudio
test('áudio em arquivo: o base64 segue no json (para o Gemini) e no binário (para o Groq)', () => {
  const r = rodar('Áudio em arquivo', { base64: 'QUJD', mimetype: 'audio/ogg; codecs=opus' })[0];
  assert.deepEqual([r.json.audio_b64, r.json.mime], ['QUJD', 'audio/ogg']);
  assert.equal(r.binary.data.data, 'QUJD');
  assert.throws(() => rodar('Áudio em arquivo', {}), /não devolveu o áudio/);
});

test('áudio para o Groq: religa o arquivo guardado no node anterior', () => {
  const binary = { data: { data: 'QUJD', mimeType: 'audio/ogg', fileName: 'audio.ogg' } };
  const r = rodar('IA · Áudio para o Groq', {}, { 'Áudio em arquivo': { json: {}, binary } })[0];
  assert.deepEqual(r.binary, binary);
});

const transcrever = (raw, segundos = 10) => rodar('Montar transcrição', raw, {
  'Interpretar comando': { json: { segundos } },
})[0].json;

test('transcrição: texto normal mostra "Ouvi"; limite e indisponível avisam o que houve', () => {
  const ok = transcrever({ content: { parts: [{ text: 'Coletei os tanques 42 e 43' }] } });
  assert.match(ok.textoResposta, /Ouvi: "Coletei os tanques 42 e 43"/);
  assert.equal(ok.transcricao, 'Coletei os tanques 42 e 43');
  assert.match(transcrever({ limite: true }).textoResposta, /Limite diário de IA atingido/);
  assert.match(transcrever({ error: 'Service unavailable' }).textoResposta, /IA de áudio está indisponível/);
  assert.equal(transcrever({ error: 'x' }).transcricao, '');
});

test('transcrição: áudio curto só vale sim ou não (regra antiga preservada)', () => {
  assert.equal(transcrever({ content: { parts: [{ text: 'Sim.' }] } }, 1).transcricao, 'sim');
  assert.equal(transcrever({ content: { parts: [{ text: 'Coletei o tanque 42' }] } }, 1).transcricao, '');
  assert.equal(transcrever({ content: { parts: [{ text: 'VAZIO' }] } }, 20).transcricao, '');
});

// ------------------------------------------------------------------ fala e ditado (sem IA)
const { interpretar } = require('./helpers/executar-node');
const falado = (texto, extra = {}) => interpretar(texto, { transcrito: true, ...extra });

test('fala: "lotes 11 a 16" e "menor que 10" viram um C.T que a regex entende', () => {
  const r = interpretar('CT load 43699, lote 9 deu 0, lote 10 deu 120, lotes 11 a 16 deu 0.');
  assert.equal(r.tipo, 'contagem_registrar');
  assert.deepEqual(r.grupos.map((g) => [g.numeros.length, g.sinal, g.valor]), [[1, '=', 0], [1, '=', 120], [6, '=', 0]]);
});

test('fala: ditado inteiro do C.T (lote 43668), com data no fim, vira o comando padrão', () => {
  const frase = 'Leitura do CT do lote 43668. Lote 3 menor que 10, lote 4 20, lote 5 menor que 10, lote 6 10, lote 7 menor que 10, lote 9 menor que 10. Lote 10 20, lote 12 menor que 10. Data 10/10/2026.';
  const r = interpretar(frase);
  assert.equal(r.tipo, 'contagem_registrar');
  assert.equal(r.load, '43668');
  assert.deepEqual(r.grupos.map((g) => `${g.numeros}${g.sinal}${g.valor}`), ['3<10', '4=20', '5<10', '6=10', '7<10', '9<10', '10=20', '12<10']);
});

test('fala: "Lod 43 699" e número por extenso (dito pelo teclado de voz)', () => {
  const r = interpretar('CT Lod 43 699 lote nove deu zero, lote 10 deu cento e vinte');
  assert.equal(r.tipo, 'contagem_registrar');
  assert.equal(r.load, '43699');
  assert.deepEqual(r.grupos.map((g) => `${g.numeros}=${g.valor}`), ['9=0', '10=120']);
});

test('fala: recebimento ditado com "ente", lotes por espaço e "e"', () => {
  const r = interpretar('Recebimento load 43699 fábrica AQA ente 2655 lotes 35 36 37 e 38 data 12/10/2026');
  assert.equal(r.tipo, 'recebimento');
  assert.deepEqual([r.load, r.item, r.fabrica, r.lotes.join(',')], ['43699', '2655', 'AQA', '35,36,37,38']);
});

test('fala: recebimento com vírgulas entre as palavras', () => {
  const r = interpretar('Recebimento, load 43701, fábrica AQA, item 319, lotes 1 a 4, data 12/10/2026.');
  assert.equal(r.tipo, 'recebimento');
  assert.deepEqual([r.load, r.item, r.fabrica, r.lotes.join(',')], ['43701', '319', 'AQA', '1,2,3,4']);
});

test('fala: comando já certo e frases comuns passam sem mudar', () => {
  assert.equal(interpretar('ct load 77001 lote 4 deu 10, lotes 5-10 deu <10').grupos.length, 2);
  assert.equal(interpretar('registrar coleta tanque terra 42,43,44 data 24/09/2026').tipo, 'coleta_terra');
  assert.equal(interpretar('quais tabs tenho para ler hoje?').tipo, 'consulta_tab');
  assert.equal(interpretar('bom dia').tipo, 'interpretar_ia');
  assert.equal(interpretar('bom dia').mensagem_original, 'bom dia');
  const uma = interpretar('uma composta feita');
  assert.equal(uma.tipo, 'interpretar_ia');
  assert.equal(uma.mensagem_original, 'uma composta feita', '"uma" solto não vira o número 1');
  assert.equal(interpretar('lote um deu dez').mensagem_original, 'lote 1 deu 10', '"um" depois de lote vira número');
});

test('fala: o que chega da IA/áudio continua sem gravar sem perguntar', () => {
  // áudio é sempre proposta: nunca cai direto no comando que grava
  const r = falado('Recebimento load 43699 fábrica AQA item 2655 lotes 35 a 38 data 12/10/2026');
  assert.equal(r.tipo, 'interpretar_ia');
  assert.equal(r.audio, true);
});

test('atalho de áudio: fala que já é um comando completo não chama a IA, e vai como "comando" ao Validar', () => {
  const frase = 'Leitura do CT do lote 43668. Lote 3 menor que 10, lote 4 20. Data 10/10/2026.';
  const r = falado(frase);
  assert.equal(r.tipo, 'interpretar_ia');
  const pronta = JSON.parse(r.ia_pronta);
  assert.equal(pronta.intencao, 'comando');
  assert.equal(pronta.comando, 'ct load 43668 lote 3 deu <10, lote 4 deu 20');

  const rec = JSON.parse(falado('Recebimento load 43699 fábrica AQA ente 2655 lotes 35 36 37 e 38 data 12/10/2026').ia_pronta);
  assert.equal(rec.comando, 'Recebimento load 43699 item 2655 fábrica AQA lotes 35,36,37,38 data 12/10/2026');

  const comp = JSON.parse(falado('compostas do load 43599 item 2703 (21-25)(26-30)(31-34)').ia_pronta);
  assert.match(comp.comando, /^compostas do load 43599/);
});

test('atalho de áudio: frase solta ou incompleta segue para a IA (sem atalho)', () => {
  assert.equal(falado('coletei os tanques 60 e 61 hoje').ia_pronta, '');
  assert.equal(falado('CT load 43699 lote 9').ia_pronta, '');
  assert.equal(falado('Recebimento load 43699').ia_pronta, '');
});

test('atalho de áudio: o comando pronto passa pelo Validar e pede "sim" quando grava', () => {
  const r = rodar('Validar resposta da IA',
    { content: { parts: [{ text: JSON.stringify({ intencao: 'comando', comando: 'Recebimento load 43699 fábrica AQA item 2655 lotes 35,36,37,38 data 12/10/2026' }) }] }, provedor: 'regra' },
    { 'Interpretar comando': { json: { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Teste', nivelAtual: 'Operador', mensagem_original: 'x', hoje: '14/10/2026' } } })[0].json;
  assert.match(r.textoResposta, /Entendi:/);
  assert.match(r.textoResposta, /Responda \*sim\*/);
  assert.ok(r.comando_ia.startsWith('Recebimento load 43699'));
  const consultor = rodar('Validar resposta da IA',
    { content: { parts: [{ text: JSON.stringify({ intencao: 'comando', comando: 'ct load 43668 lote 3 deu <10' }) }] }, provedor: 'regra' },
    { 'Interpretar comando': { json: { numero: 'x@s.whatsapp.net', nomeContato: 'T', nivelAtual: 'Consultor', mensagem_original: 'x', hoje: '14/10/2026' } } })[0].json;
  assert.match(consultor.textoResposta, /somente de consulta/);
});