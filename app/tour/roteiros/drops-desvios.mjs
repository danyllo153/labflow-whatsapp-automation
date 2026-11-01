// Vídeo 5: Drops e Desvios.
import { cartao } from "../comum.mjs";

export default {
  titulo: "Drops e Desvios",
  subtitulo: "D5, D10 e D15, os não ok e as repetições",
  abertura: "Drops e Desvios. Neste vídeo: os drops D 5, D 10 e D 15, os não ok e as repetições.",
  itens: ["Para concluir", "Desvios de drop", "Não ok", "Em repetição", "Resultados"],
  passos: [
    {
      antes: (p, f) => f.ir("/analises/drops"),
      destaque: (p) => cartao(p, "Drops para concluir"),
      legenda: "Em Drops, a aba Para concluir lista os drops D5, D10 e D15 com o prazo de cada um. A lista já vem marcada.",
      fala: "Em Drops, a aba Para concluir lista os drops D 5, D 10 e D 15 com o prazo de cada um. A lista já vem marcada.",
    },
    {
      destaque: (p) => p.getByRole("button", { name: /^Concluir/ }),
      legenda: "O botão Concluir fecha todos os marcados de uma vez. O que não deu ok fica de fora e ganha o botão Abrir desvio.",
    },
    {
      antes: (p, f) => f.aba("Desvios de drop"),
      legenda: "Em Desvios de drop ficam os desvios abertos a partir de um drop, com a situação de cada um.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => cartao(p, "Por situação"),
      legenda: "Nos Resultados, os drops aparecem por situação: atrasado, vence hoje, no prazo e concluído. O botão Desvios troca a tabela.",
    },
    {
      antes: (p, f) => f.ir("/analises/desvios"),
      destaque: (p) => cartao(p, "Leituras não ok sem desvio"),
      legenda: "No app Desvios, a aba Não ok junta todas as leituras não ok que ainda não têm desvio. O LabFlow nunca abre um desvio sozinho: quem decide é o analista.",
    },
    {
      destaque: (p) => p.getByRole("button", { name: "Abrir desvio" }),
      legenda: "Com o botão Abrir desvio, o desvio é aberto e a leitura sai desta lista.",
    },
    {
      antes: (p, f) => f.aba("Em repetição"),
      legenda: "Em repetição ficam os desvios com a análise refeita com o frasco de arquivo, até o resultado da repetição.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => cartao(p, "Por situação"),
      legenda: "Nos Resultados ficam os desvios, no prazo e concluídos, e a visão Leituras de tanques, para achar a origem de cada um.",
    },
  ],
};
