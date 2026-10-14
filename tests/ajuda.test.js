'use strict';

// Ajuda por assunto ("comandos tab", "comandos coleta"...): o menu lista NFC e concentrado, todo assunto abre,
// e CADA comando que a ajuda mostra é reconhecido pelo bot (a ajuda nunca ensina comando que não funciona).
// Rodar: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretar } = require('./helpers/executar-node');

const ajuda = (pedido) => interpretar(pedido).textoResposta;
const linhasComando = (texto) => texto.split('\n').filter((l) => l.startsWith('• ')).map((l) => l.slice(2).trim());
// "comandos recebimento (e compostas)" -> tira a observação entre parênteses que tem letras; "(1-5)(6-10)" fica
const semObservacao = (c) => c.replace(/\s+\([^)]*[a-zA-ZÀ-ÿ]{3,}[^)]*\)\s*$/, '').trim();

const ASSUNTOS = {
  nfc: ['nfc'],
  concentrado: ['concentrado'],
  drops: ['drops'],
  coleta: ['coleta', 'coletas', 'tanques'],
  analise: ['análise', 'analises', 'analise nfc'],
  placas: ['placas', 'placas nfc', 'repetição'],
  leituras: ['leituras', 'leitura'],
  descarte: ['descarte', 'bags e potes'],
  recebimento: ['recebimento', 'compostas', 'recebimento e compostas'],
  tab: ['tab', 'tabs'],
  coliformes: ['coliformes'],
  embarque: ['embarque'],
  howard: ['howard'],
  ctbl: ['ct bl', 'c.t e b.l', 'ct', 'bl', 'contagens'],
  relatorio: ['relatório', 'relatorio do dia'],
  consultas: ['consultas', 'quem coletou', 'resultados'],
  foto: ['foto', 'foto do laudo', 'laudo'],
  cargos: ['cargos'],
};

test('o menu lista NFC e concentrado, e não só consultas', () => {
  const menu = ajuda('comandos');
  assert.match(menu, /\*NFC \(tanques\)\*/);
  assert.match(menu, /\*Concentrado\*/);
  for (const assunto of ['coleta', 'análise', 'placas', 'drops', 'leituras', 'descarte', 'recebimento', 'tab', 'coliformes', 'embarque', 'howard', 'ct bl', 'relatório', 'consultas', 'foto', 'cargos']) {
    assert.ok(menu.includes(`• comandos ${assunto}`), `o menu não lista "comandos ${assunto}"`);
  }
  assert.doesNotMatch(menu, /consultar /, 'o menu antigo falava em "consultar"');
});

test('"comandos" sozinho e as formas antigas continuam levando ao menu ou ao assunto', () => {
  assert.equal(ajuda('comandos'), ajuda('consultar comandos'));
  assert.match(ajuda('comandos para drops'), /Comandos de drops/);
  assert.match(ajuda('comandos de leitura'), /Comandos de leitura/);
  assert.match(ajuda('consultar tanques'), /coleta de tanques/);
  assert.match(ajuda('consultar relatório'), /Relatório do dia/);
});

test('assunto desconhecido explica e mostra o menu', () => {
  const r = ajuda('comandos para foguete');
  assert.match(r, /Não encontrei comandos para "foguete"/);
  assert.match(r, /Lista de comandos/);
});

for (const [chave, nomes] of Object.entries(ASSUNTOS)) {
  test(`assunto ${chave}: abre por todos os nomes e não pede nada fora do menu`, () => {
    const textos = new Set();
    for (const nome of nomes) {
      const t = ajuda(`comandos ${nome}`);
      assert.doesNotMatch(t, /Não encontrei comandos/, `"comandos ${nome}" não abriu um assunto`);
      assert.match(t, /^📖/);
      textos.add(t);
    }
    assert.equal(textos.size, 1, `os nomes de ${chave} abrem textos diferentes`);
    const [texto] = [...textos];
    assert.ok(texto.length < 3500, `${chave}: ${texto.length} caracteres (cabe bem numa mensagem de WhatsApp abaixo de 3500)`);
    assert.ok(linhasComando(texto).length >= 2, `${chave}: sem exemplos`);
  });

  test(`assunto ${chave}: todo comando de exemplo é reconhecido pelo bot`, () => {
    const texto = ajuda(`comandos ${nomes[0]}`);
    for (const bruto of linhasComando(texto)) {
      const comando = semObservacao(bruto);
      if (/[<>]\w*\s*número|<número/.test(comando)) continue; // modelo com campo a preencher
      const r = interpretar(comando);
      assert.ok(r, `descartado: ${comando}`);
      if (/^comandos /i.test(comando)) {
        assert.match(r.textoResposta, /^📖/, `o ponteiro "${comando}" não abre ajuda`);
        assert.doesNotMatch(r.textoResposta, /Não encontrei/, `o ponteiro "${comando}" não abre o assunto`);
        continue;
      }
      assert.notEqual(r.tipo, 'interpretar_ia', `"${comando}" (de comandos ${nomes[0]}) não é reconhecido: iria para a IA`);
      assert.ok(!(r.tipo === 'erro_coleta' && /❌/.test(r.textoResposta || '')), `"${comando}" (de comandos ${nomes[0]}) deu erro: ${r.textoResposta}`);
    }
  });
}

test('os pontos do menu e dos resumos (NFC e concentrado) levam a assuntos que existem', () => {
  for (const resumo of ['comandos', 'comandos nfc', 'comandos concentrado']) {
    for (const bruto of linhasComando(ajuda(resumo))) {
      const t = ajuda(semObservacao(bruto));
      assert.doesNotMatch(t, /Não encontrei/, `"${bruto}" (em "${resumo}") não abre nada`);
    }
  }
});
