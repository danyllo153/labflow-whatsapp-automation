// Vídeo 2: NFC (tanques terra, tanques navio e recebimento de NFC), com as abas comuns a todo app de análise.
import { barraDeAbas, cartao } from "../comum.mjs";

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
      destaque: (p) => p.locator("main .cartao").first(),
      legenda: "Nos Resultados do NFC, o filtro de fábricas compara as unidades no mesmo gráfico.",
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E o laudo do recebimento de NFC sai pronto, no modelo da empresa.",
    },
  ],
};
