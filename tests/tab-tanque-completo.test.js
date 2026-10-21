'use strict';

// TAB de tanque de terra "completo" (só Admin): registra a coleta e as análises que faltam, marca <1,<1,<1 nas
// leituras que já venceram até a data do TAB e registra o TAB. Também: atalhos de texto ("tq 44 16/10"), foto com
// bloco só de tanques (sem load) e composta com lote repetido recusada antes do "sim". Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar, codigoDoNode, workflow } = require('./helpers/executar-node');

const ANO = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).slice(6);

// ---- comando e atalhos ----
test('"completo": o Admin pode; outro cargo é recusado e nada é gravado', () => {
  const a = interpretar('Tab feito dos tanques terra 44 coleta 16/10/2026 completo', { cargo: 'Admin' });
  assert.equal(a.tipo, 'tab_feito_nfc');
  assert.equal(a.completo, '1');
  assert.deepEqual(a.tanques, ['44']);
  assert.equal(a.dataColeta, '16/10/2026');
  const o = interpretar('Tab feito dos tanques terra 44 coleta 16/10/2026 completo', { cargo: 'Operador' });
  assert.equal(o.tipo, 'erro_coleta');
  assert.match(o.textoResposta, /Só um Admin registra o TAB de tanque junto com a coleta/);
  // sem o sufixo nada muda
  const n = interpretar('Tab feito dos tanques terra 44 coleta 16/10/2026', { cargo: 'Operador' });
  assert.equal(n.tipo, 'tab_feito_nfc');
  assert.equal(n.completo, '');
});

test('atalhos: "tq 44 16/10" e "tab tanque terra 47 06/10/26" valem o TAB do tanque (data = coleta)', () => {
  const casos = [
    ['tq 44 16/10', ['44'], `16/10/${ANO}`],
    ['TQ 44 16/10', ['44'], `16/10/${ANO}`],
    ['tab tanque terra 47 06/10/26', ['47'], '06/10/2026'],
    ['Tab feito tanque terra 42, data 16/10', ['42'], `16/10/${ANO}`],
    ['tabs feitos tanque terra, 42 16/10', ['42'], `16/10/${ANO}`],
    ['tq 44 e 45 16/10/2026', ['44', '45'], '16/10/2026'],
    ['tq 44, 45 16.10', ['44', '45'], `16/10/${ANO}`],
    ['tab tanque 9 coleta 5/10', ['9'], `05/10/${ANO}`],
  ];
  for (const [frase, tanques, data] of casos) {
    const r = interpretar(frase, { cargo: 'Admin' });
    assert.equal(r.tipo, 'tab_feito_nfc', frase);
    assert.deepEqual(r.tanques, tanques, frase);
    assert.equal(r.dataColeta, data, frase);
    assert.equal(r.completo, '', frase);
  }
});

test('atalhos: não atrapalham a confirmação do TAB nem a data inválida', () => {
  assert.equal(interpretar('tab tanque terra 42 coleta 28/09/2026 em confirmação', { cargo: 'Admin' }).tipo, 'tab_em_confirmacao');
  const ruim = interpretar('tq 44 45/13', { cargo: 'Admin' });
  assert.equal(ruim.tipo, 'erro_coleta');
  assert.match(ruim.textoResposta, /Não entendi a data da coleta/);
  // Consultor continua sem registrar
  assert.equal(interpretar('tq 44 16/10', { cargo: 'Consultor' }).tipo, 'erro_coleta');
});

// ---- resposta ----
function montar(r, item) {
  const $ = (nome) => { assert.equal(nome, 'Interpretar comando'); return { first: () => ({ json: item }) }; };
  return new Function('$', '$input', codigoDoNode('Montar resposta TAB NFC'))($, { first: () => ({ json: r }) })[0].json;
}
const SEM = { sem_coleta: '44, 45', ja_tinham: null, criados: null, espalhar_em: '21/10/2026' };

test('Admin: tanque sem coleta vira pergunta; o "sim" roda o comando completo com TODOS os tanques', () => {
  const item = interpretar('Tab feito dos tanques terra 44,45,46 coleta 16/10/2026', { cargo: 'Admin' });
  const m = montar(SEM, item);
  assert.equal(m.salvar, '1');
  assert.equal(m.tipoPendencia, 'IA');
  const hoje = item.dataFeito;
  assert.deepEqual(JSON.parse(m.payload).comandos, [`Tab feito dos tanques terra 44,45,46 coleta 16/10/2026 data ${hoje} completo`]);
  assert.match(m.textoResposta, /Não achei a coleta do\(s\) tanque\(s\) 44, 45 em 16\/10\/2026/);
  assert.match(m.textoResposta, /marco <1,<1,<1 nas leituras e como feitos os drops que já venceram/);
  // o comando que o "sim" reenvia é aceito pelo bot e vale o completo
  const re = interpretar(JSON.parse(m.payload).comandos[0], { cargo: 'Admin' });
  assert.equal(re.tipo, 'tab_feito_nfc');
  assert.equal(re.completo, '1');
  assert.deepEqual(re.tanques, ['44', '45', '46']);
});

test('Operador: tanque sem coleta continua sendo recusado, com a dica de pedir a um Admin', () => {
  const m = montar(SEM, interpretar('Tab feito dos tanques terra 44,45 coleta 16/10/2026', { cargo: 'Operador' }));
  assert.equal(m.salvar, '0');
  assert.match(m.textoResposta, /Não há coleta de terra/);
  assert.match(m.textoResposta, /Só um Admin registra o TAB junto com a coleta/);
});

test('resposta do completo conta o que foi feito e o que ficou sem marcar', () => {
  const item = interpretar('Tab feito dos tanques terra 44 coleta 06/10/2026 data 16/10/2026 completo', { cargo: 'Admin' });
  const ok = montar({ sem_coleta: null, ja_tinham: null, criados: ['44'], espalhar_em: '21/10/2026', coletas_criadas: '44', frascos_novos: 2, placas_gravadas: 42, drops_marcados: 2 }, item);
  assert.equal(ok.salvar, '0');
  assert.match(ok.textoResposta, /TAB de NFC no caldo \(1 tanque\)/);
  assert.match(ok.textoResposta, /Coleta registrada \(com os drops D5, D10, D15 e o arquivo\): tanque 44, 06\/10\/2026/);
  assert.match(ok.textoResposta, /Análises registradas \(C\.T, B\.L e WORT\) em 2 frasco\(s\)/);
  assert.match(ok.textoResposta, /Placas <1,<1,<1 marcadas em 14 leituras que já venceram até 16\/10\/2026/);
  assert.match(ok.textoResposta, /2 drops \(D5, D10, D15\) já vencidos até 16\/10\/2026 marcados como feitos; os que ainda não chegaram na data seguem pendentes/);
  const nada = montar({ sem_coleta: null, ja_tinham: null, criados: ['44'], espalhar_em: '21/10/2026', coletas_criadas: null, frascos_novos: 0, placas_gravadas: 0, drops_marcados: 0 }, item);
  assert.match(nada.textoResposta, /Nenhuma leitura tinha vencido até 16\/10\/2026/);
  assert.doesNotMatch(nada.textoResposta, /drop/);
});

test('o SQL do completo: coleta com drops e arquivo, análises, placas <1 só do que venceu e sem duplicar', () => {
  const q = workflow.nodes.find((n) => n.name === 'BD · TAB feito NFC').parameters.query;
  assert.match(q, /INSERT INTO coletas \(origem, tanque, data_coleta, registrado_por\)/);
  assert.match(q, /VALUES \(5\), \(10\), \(15\)/);                                  // drops
  assert.match(q, /CASE WHEN n\.data_coleta \+ x\.dia <= \(SELECT feito FROM dia\) THEN 'Concluído' ELSE 'Pendente' END/); // drop vencido nasce feito
  assert.match(q, /AND d\.data_prevista <= \(SELECT feito FROM dia\)/);               // coleta existente: só marca o vencido
  assert.match(q, /INSERT INTO arquivo_amostras/);
  assert.match(q, /WHERE \$5::text = '1' AND NOT EXISTS \(SELECT 1 FROM existentes/); // só com o "completo"
  assert.match(q, /\('CT',   'Profundidade', NULL::int, 2\)/);                       // prazos do comando de análise
  assert.match(q, /\('BL',   'Profundidade', 3,         5\)/);
  assert.match(q, /\('WORT', 'Profundidade', 5,         10\)/);
  assert.match(q, /'<', 1, 'automatico'/);                                           // <1 automático
  assert.match(q, /e\.prevista <= \(SELECT feito FROM dia\)/);                       // só o que já venceu
  assert.match(q, /ON CONFLICT \(analise_id, etapa, placa\) DO NOTHING/);            // não sobrescreve
  assert.match(q, /AND a\.repeticao_de IS NULL/);                                    // ignora repetição
  const opt = workflow.nodes.find((n) => n.name === 'BD · TAB feito NFC').parameters.options.queryReplacement;
  assert.match(opt, /\$json\.completo/);
});

test('workflow: a pergunta do completo guarda a pendência antes de responder', () => {
  const dest = (de) => (workflow.connections[de].main[0] || []).map((x) => x.node);
  assert.deepEqual(dest('Montar resposta TAB NFC'), ['BD · Salvar pendência tanque']);
  assert.deepEqual(dest('BD · Salvar pendência tanque'), ['Zap · TAB NFC']);
  const zap = workflow.nodes.find((n) => n.name === 'Zap · TAB NFC');
  assert.match(zap.parameters.bodyParameters.parameters.find((p) => p.name === 'text').value, /Montar resposta TAB NFC/);
});

// ---- foto ----
function rodarFoto(nome, entrada, vizinhos = {}) {
  const $ = (n) => {
    if (n === 'Interpretar comando') return { first: () => ({ json: { numero: '5511900000001@s.whatsapp.net', nomeContato: 'Usuario Teste', hoje: '16/10/2026', legenda: '', ...(vizinhos.ctx || {}) } }) };
    if (vizinhos[n]) return { first: () => ({ json: vizinhos[n] }) };
    throw new Error('o teste nao simula o node: ' + n);
  };
  const itens = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }));
  return new Function('$', '$input', codigoDoNode(nome))($, { first: () => itens[0], all: () => itens });
}
const lerFoto = (obj, nivel) => rodarFoto('Foto · Interpretar', { content: { parts: [{ text: JSON.stringify(obj) }] }, provedor: 'gemini' }, { ctx: { nivelAtual: nivel } })[0].json;
const FOTO_TQ = { formulario: 'tab', data: '16/10/2026', blocos: [{ load: null, tanques: [{ tanque: '44', data: '16/10' }, { tanque: '45', data: '16/10' }, { tanque: '47', data: '06/10' }] }] };

test('foto de TAB só com tanques (TQ 44 16/10): não exige load e agrupa por data da coleta', () => {
  const d = lerFoto(FOTO_TQ, 'Admin');
  assert.deepEqual(d.problemas, []);
  assert.deepEqual(d.comandos.map((c) => c.texto), [
    'Tab feito dos tanques terra 44,45 coleta 16/10/2026',
    'Tab feito dos tanques terra 47 coleta 06/10/2026',
  ]);
});

test('foto de tanques, Admin: um comando só com todos os grupos e "completo"; Operador fica com o comando simples', () => {
  const adm = rodarFoto('Foto · Montar resposta', [{}], { 'Foto · Interpretar': lerFoto(FOTO_TQ, 'Admin') })[0].json;
  assert.equal(adm.salvar, '1');
  const c = JSON.parse(adm.payload).comandos;
  assert.deepEqual(c, ['Tab feito dos tanques terra 44,45 coleta 16/10/2026 ; 47 coleta 06/10/2026 completo']);
  const re = interpretar(c[0], { cargo: 'Admin' });
  assert.equal(re.tipo, 'tab_feito_nfc');
  assert.equal(re.completo, '1');
  assert.deepEqual(re.grupos, [{ tanque: '44', coleta: '16/10/2026' }, { tanque: '45', coleta: '16/10/2026' }, { tanque: '47', coleta: '06/10/2026' }]);
  assert.match(adm.textoResposta, /Tanques de terra \(só o Admin faz isso pelo TAB\)/);
  const op = rodarFoto('Foto · Montar resposta', [{}], { 'Foto · Interpretar': lerFoto(FOTO_TQ, 'Operador') })[0].json;
  assert.deepEqual(JSON.parse(op.payload).comandos, ['Tab feito dos tanques terra 44,45 coleta 16/10/2026 ; 47 coleta 06/10/2026']);
  assert.equal(interpretar(JSON.parse(op.payload).comandos[0], { cargo: 'Operador' }).completo, '');
});

test('foto de TAB com load e tanques: os dois seguem; load sem número e sem tanque continua sendo problema', () => {
  const misto = lerFoto({ formulario: 'tab', blocos: [{ load: '43598', item: '2703', fabrica: 'AQA', compostas: ['1-5'] }, { tanques: [{ tanque: '42', data: '17/08' }] }] }, 'Admin');
  assert.equal(misto.comandos.length, 2);
  const sem = lerFoto({ formulario: 'tab', blocos: [{ load: null, compostas: ['1-5'] }] }, 'Admin');
  assert.equal(sem.falha, true);
  assert.match(sem.textoResposta, /bloco 1: não li o número do load/);
});

test('foto de TAB: composta com lote repetido é recusada antes do "sim" (nada de recebimento pela metade)', () => {
  const d = lerFoto({ formulario: 'tab', data: '16/10/2026', blocos: [
    { load: '43668', item: '2549', fabrica: 'UCH', compostas: ['1-2', '3-6', '7-10,12', '8,11,13-14', '15-20'] },
    { load: '43667', item: '2549', fabrica: 'UCH', compostas: ['1-5', '6-10'] },
  ] }, 'Admin');
  assert.equal(d.comandos.length, 2);                                   // só as do load 43667
  assert.ok(d.comandos.every((c) => c.load === '43667'));
  assert.match(d.problemas.join('|'), /load 43668: lote 8 em \(7-10,12\) e em \(8,11,13-14\)/);
  assert.match(d.problemas.join('|'), /Uma composta não pode repetir lote/);
});

test('prompts: a IA e a leitura da foto conhecem "TQ 44 16/10"', () => {
  const foto = codigoDoNode('Foto · Montar pedido');
  assert.match(foto, /"TQ 44 16\/10" \(TQ = tanque de terra, 44 = número, 16\/10 = data da coleta\)/);
  assert.match(foto, /NÃO tem load/);
  const ia = workflow.nodes.find((n) => n.name === 'IA · Montar pedido').parameters.assignments.assignments.find((a) => a.name === 'prompt').value;
  assert.match(ia, /"TQ 44 16\/10" e "tab tanque terra 44 16\/10" valem o mesmo/);
});

// situação de cada tanque no banco (BD · Compostas da foto, kind 'tanque')
const sit = (d, porTanque) => d.buscasTanques.map((b) => ({ kind: 'tanque', idx: b.idx, load_num: b.tanque, data_coleta: b.coleta, atual: porTanque[b.tanque] }));

test('foto de tanques: o que já tem TAB fica de fora; se tudo já está no sistema, nada a gravar', () => {
  const d = lerFoto(FOTO_TQ, 'Admin');
  assert.deepEqual(d.buscasTanques, [{ idx: 0, tanque: '44', coleta: '16/10/2026' }, { idx: 0, tanque: '45', coleta: '16/10/2026' }, { idx: 1, tanque: '47', coleta: '06/10/2026' }]);
  const tudo = rodarFoto('Foto · Montar resposta', sit(d, { 44: 'tab', 45: 'tab', 47: 'tab' }), { 'Foto · Interpretar': d })[0].json;
  assert.equal(tudo.salvar, '0');
  assert.match(tudo.textoResposta, /tudo o que está na foto já está no sistema \(tanque 44 \(coleta 16\/10\), 45 \(coleta 16\/10\), 47 \(coleta 06\/10\) já tem TAB\)\. Nada a gravar/);
  const parte = rodarFoto('Foto · Montar resposta', sit(d, { 44: 'tab', 45: 'coleta', 47: 'sem' }), { 'Foto · Interpretar': d })[0].json;
  assert.deepEqual(JSON.parse(parte.payload).comandos, ['Tab feito dos tanques terra 45 coleta 16/10/2026 ; 47 coleta 06/10/2026 completo']);
  assert.match(parte.textoResposta, /Já têm TAB \(ficam de fora\): tanque 44 \(coleta 16\/10\)/);
  assert.match(parte.textoResposta, /Sem coleta no sistema \(registro a coleta\): tanque 47 \(coleta 06\/10\)/);
  // Operador: o tanque sem coleta fica de fora (só o Admin registra a coleta pelo TAB)
  const dOp = lerFoto(FOTO_TQ, 'Operador');
  const op = rodarFoto('Foto · Montar resposta', sit(dOp, { 44: 'coleta', 45: 'tab', 47: 'sem' }), { 'Foto · Interpretar': dOp })[0].json;
  assert.deepEqual(JSON.parse(op.payload).comandos, ['Tab feito dos tanques terra 44 coleta 16/10/2026']);
  assert.match(op.textoResposta, /tanque 47 \(coleta 06\/10\): não achei a coleta; registre a coleta antes ou peça a um Admin \(ficou de fora\)/);
});

test('comando com vários grupos de coleta: pares tanque + coleta, data do TAB e limite de 24 tanques', () => {
  const a = interpretar('Tab feito dos tanques terra 39,46 coleta 17/10/2026 ; 43 coleta 18/10/2026 ; 44,45,47 coleta 19/10/2026 data 19/10/2026 completo', { cargo: 'Admin' });
  assert.equal(a.tipo, 'tab_feito_nfc');
  assert.equal(a.dataFeito, '19/10/2026');
  assert.equal(a.completo, '1');
  assert.deepEqual(a.tanques, ['39', '46', '43', '44', '45', '47']);
  assert.equal(a.grupos.length, 6);
  assert.deepEqual(a.grupos[2], { tanque: '43', coleta: '18/10/2026' });
  assert.equal(a.gruposTxt, '39,46 coleta 17/10/2026 ; 43 coleta 18/10/2026 ; 44,45,47 coleta 19/10/2026');
  // um grupo só continua no formato antigo (sem pares)
  assert.equal(interpretar('Tab feito dos tanques terra 44 coleta 16/10/2026', { cargo: 'Admin' }).grupos, null);
  const muitos = Array.from({ length: 25 }, (_, i) => String(i + 1));
  const m = interpretar(`Tab feito dos tanques terra ${muitos.slice(0, 13).join(',')} coleta 17/10/2026 ; ${muitos.slice(13).join(',')} coleta 18/10/2026`, { cargo: 'Admin' });
  assert.match(m.textoResposta, /Máximo de 24 tanques/);
  const bd = workflow.nodes.find((n) => n.name === 'BD · TAB feito NFC');
  assert.match(bd.parameters.options.queryReplacement, /\$json\.grupos \|\| \$json\.tanques/);
});

test('resposta com vários grupos: uma mensagem só, cada tanque com a data da coleta', () => {
  const item = interpretar('Tab feito dos tanques terra 39,46 coleta 17/10/2026 ; 43 coleta 18/10/2026 data 19/10/2026 completo', { cargo: 'Admin' });
  const ja = montar({ sem_coleta: null, ja_tinham: '39 (coleta 17/10), 46 (coleta 17/10), 43 (coleta 18/10)', criados: null, espalhar_em: '24/10/2026', placas_gravadas: 0, drops_marcados: 0 }, item);
  assert.match(ja.textoResposta, /^ℹ️ Tanque\(s\) 39 \(coleta 17\/10\), 46 \(coleta 17\/10\), 43 \(coleta 18\/10\) já tinha\(m\) TAB\. Nada novo foi gravado\./);
  const novo = montar({ sem_coleta: null, ja_tinham: '39 (coleta 17/10)', criados: ['46 (coleta 17/10)', '43 (coleta 18/10)'], espalhar_em: '24/10/2026', coletas_criadas: '43 (coleta 18/10)', frascos_novos: 2, placas_gravadas: 6, drops_marcados: 0 }, item);
  assert.match(novo.textoResposta, /TAB de NFC no caldo \(2 tanques\)[\s\S]*tanque 46 \(coleta 17\/10\)\ntanque 43 \(coleta 18\/10\)/);
  assert.match(novo.textoResposta, /Coleta registrada \(com os drops D5, D10, D15 e o arquivo\): tanque 43 \(coleta 18\/10\)\./);
  // Admin sem "completo": a pergunta reenvia os mesmos grupos com "completo"
  const sem = interpretar('Tab feito dos tanques terra 39 coleta 17/10/2026 ; 48 coleta 10/10/2026 data 19/10/2026', { cargo: 'Admin' });
  const p = montar({ sem_coleta: '48 (coleta 10/10)', ja_tinham: null, criados: null, espalhar_em: '24/10/2026' }, sem);
  assert.deepEqual(JSON.parse(p.payload).comandos, ['Tab feito dos tanques terra 39 coleta 17/10/2026 ; 48 coleta 10/10/2026 data 19/10/2026 completo']);
  assert.match(p.textoResposta, /Não achei a coleta do\(s\) tanque\(s\) 48 \(coleta 10\/10\)\./);
});
