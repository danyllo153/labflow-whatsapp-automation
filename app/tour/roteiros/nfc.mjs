// Vídeo 2: NFC (tanques terra, tanques navio e recebimento de NFC), com as abas comuns a todo app de análise.
import { barraDeAbas, cartao, demoResultados } from "../comum.mjs";

export default {
  titulo: "NFC",
  subtitulo: "Tanques terra, tanques navio e recebimento de NFC",
  itens: ["Painel", "Análise", "Resultados", "Laudo", "IT", "Vídeo"],
  passos: [
    {
      antes: (p, f) => f.ir("/analises/tanques-terra"),
      destaque: barraDeAbas,
      legenda: "Todo app de análise tem as mesmas abas: Painel, Análise, Resultados, Laudo, a IT e o Vídeo. Vamos ver cada uma em Tanques terra.",
      fala: "Todo app de análise tem as mesmas abas: Painel, Análise, Resultados, Laudo, a I T e o Vídeo. Vamos ver cada uma em Tanques terra.",
    },
    {
      destaque: (p) => cartao(p, "Coletas de tanques terra"),
      legenda: "O Painel mostra as coletas dos tanques. O gráfico se agrupa por semana, por mês ou por pessoa que coletou.",
      durante: async (p, f) => { await f.espera(2500); await f.clicar(p.getByRole("button", { name: "Pessoa", exact: true })); },
    },
    {
      antes: (p, f) => f.aba("Análise"),
      destaque: (p) => cartao(p, "Registrar análise"),
      legenda: "Na aba Análise registra-se a análise do tanque. O botão Ver o que vai ser criado mostra a prévia, e nada é gravado sem o Confirmar.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => cartao(p, "Por situação"),
      legenda: "Em Resultados, cada leitura aparece com a situação: atrasado, vence hoje, no prazo ou lido. Um toque na situação filtra a tabela.",
    },
    {
      destaque: (p) => cartao(p, "Tendência do resultado"),
      legenda: "A tendência do resultado mostra a contagem ao longo do tempo, em linha ou em colunas.",
      durante: async (p, f) => { await f.espera(2500); await f.clicar(p.getByRole("button", { name: "Colunas", exact: true })); },
    },
    {
      destaque: (p) => p.locator("main").getByRole("button", { name: "Um tanque por coleta" }),
      legenda: "A visão Um tanque por coleta junta numa linha só todas as análises do tanque naquela coleta: C.T, B.L e psicrotróficos, frasco normal e stress.",
      fala: "A visão Um tanque por coleta junta numa linha só todas as análises do tanque naquela coleta: C T, B L e psicrotróficos, frasco normal e stress.",
      durante: async (p, f) => {
        await f.espera(1500); await f.clicar(p.locator("main").getByRole("button", { name: "Um tanque por coleta" }));
        await f.espera(3000); await f.clicar(p.locator("main [role=group] button").filter({ hasText: /^\s*Resultados\s*$/ }));
      },
    },
    ...demoResultados({
      busca: "4C",
      legendaBusca: "A busca acha um tanque, um navio ou quem leu. Aqui, o tanque 4C.",
      falaBusca: "A busca acha um tanque, um navio ou quem leu. Aqui, o tanque 4 C.",
      filtros: [{ campo: "Frasco", valor: "Stress" }, { campo: "Etapa", valor: "Leitura final" }],
      legendaFiltros: "Nos Filtros dos tanques entram a data da coleta, o tanque, o navio, a análise, o frasco, a etapa, o resultado e a situação. Aqui: frasco Stress, leitura final.",
    }),
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "Na aba Laudo, o laudo sai no modelo oficial, preenchido linha a linha. Finalizar laudo põe o traço nas linhas vazias; Refazer folha e Apagar corrigem um erro.",
    },
    {
      antes: (p, f) => f.aba("IT"),
      legenda: "A aba IT guarda a instrução de trabalho da análise, escrita pelo Admin, sempre na versão em vigor.",
      fala: "A aba I T guarda a instrução de trabalho da análise, escrita pelo Admin, sempre na versão em vigor.",
    },
    {
      antes: (p, f) => f.aba("Vídeo"),
      legenda: "E a aba Vídeo traz o vídeo de explicação do app, como este.",
    },
    {
      antes: (p, f) => f.ir("/analises/tanques-navio"),
      destaque: (p) => cartao(p, "Últimos navios"),
      legenda: "Tanques navio funciona do mesmo jeito, mas por navio. No Painel, Últimos navios mostra os tanques de cada navio e a situação.",
    },
    {
      antes: async (p, f) => { await f.aba("Resultados"); },
      destaque: (p) => p.locator("main").getByRole("button", { name: "Navios", exact: true }),
      legenda: "Nos Resultados do navio, a visão Navios junta as leituras de cada navio numa linha só.",
      durante: async (p, f) => { await f.espera(1500); await f.clicar(p.locator("main").getByRole("button", { name: "Navios", exact: true })); },
    },
    {
      antes: (p, f) => f.ir("/analises/recebimento-nfc"),
      destaque: (p) => cartao(p, "Registrar recebimento NFC"),
      legenda: "No Recebimento NFC, o registro já começa na aba Registrar. O botão mais lote acrescenta cada lote do recebimento.",
      durante: async (p, f) => { await f.espera(2500); await f.clicar(p.getByRole("button", { name: "+ Lote" })); },
    },
    {
      destaque: (p) => p.getByRole("button", { name: /Ver o que vai ser criado/ }),
      legenda: "O contador do botão diz quantos lotes vão ser criados. Confere-se a prévia e confirma-se uma vez só.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => p.locator("main section.grafico-resultado").first(),
      legenda: "Nos Resultados do NFC, o gráfico mostra a tendência de cada análise, já com a diluição aplicada.",
    },
    ...demoResultados({
      filtros: [{ campo: "Amostra", valor: "Fresh" }],
      legendaFiltros: "Nos Filtros do NFC dá para separar a amostra Fresh da Pasteurizada, além das datas, do load, do lote e da análise. Aqui, só Fresh.",
      fabricas: ["CON", "TMG"],
      visoes: [{ botao: "Colunas", legenda: "E o gráfico troca entre linha e colunas, comparando as fábricas escolhidas." }],
    }),
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E o laudo do recebimento de NFC sai pronto, no modelo da empresa.",
    },
  ],
};
