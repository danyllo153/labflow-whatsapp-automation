// Vídeo 6: Águas e superfícies (água do processo, água de consumo, CIP baia e CIP linha de embarque).
import { cartao } from "../comum.mjs";

export default {
  titulo: "Águas e superfícies",
  subtitulo: "Água do processo, água de consumo, CIP baia e CIP linha de embarque",
  itens: ["Água do processo", "Água de consumo", "CIP baia", "CIP linha de embarque"],
  passos: [
    {
      antes: (p, f) => f.ir("/paginas/agua-processo"),
      destaque: (p) => cartao(p, "Nova coleta"),
      legenda: "Na Água do processo, a nova coleta já vem com os quatro pontos marcados: o Manifold e as câmaras 4, 5 e 6. Um toque tira o ponto que não foi coletado.",
      durante: async (p, f) => {
        const ponto = p.getByRole("group", { name: "Pontos coletados" }).getByRole("button").filter({ hasText: "Câmara 6" });
        await f.espera(2500);
        await f.clicar(ponto);
        await f.espera(1200);
        await f.clicar(ponto);
      },
    },
    {
      destaque: (p) => cartao(p, "Coletas dos últimos 30 dias"),
      legenda: "Embaixo ficam as coletas dos últimos trinta dias. O resultado de C.T e B.L é lançado depois, na página Leituras.",
      fala: "Embaixo ficam as coletas dos últimos trinta dias. O resultado de C T e B L é lançado depois, na página Leituras.",
    },
    {
      antes: (p, f) => f.aba("Desvios"),
      legenda: "Na aba Desvios aparecem os desvios abertos: quando há crescimento, o desvio já vem indicado.",
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E na aba Laudo, o laudo da água do processo sai preenchido.",
    },
    {
      antes: (p, f) => f.ir("/paginas/agua-consumo"),
      legenda: "Na Água de consumo, primeiro escolhe-se a unidade, Santos ou TMG, e o tipo de coleta: mensal ou semanal.",
    },
    {
      destaque: (p) => cartao(p, "Nova coleta"),
      legenda: "Cada ponto tem o pH e o cloro. Marca-se os pontos coletados e o botão Registrar coleta mostra quantos vão ser gravados.",
      fala: "Cada ponto tem o p H e o cloro. Marca-se os pontos coletados e o botão Registrar coleta mostra quantos vão ser gravados.",
    },
    {
      destaque: (p) => p.getByRole("button", { name: "Registrar água do navio" }),
      legenda: "A água dos navios tem o botão próprio: Registrar água do navio.",
    },
    {
      antes: (p, f) => f.aba("Coletas"),
      legenda: "A aba Coletas mostra as coletas dos últimos sessenta dias da unidade escolhida.",
    },
    {
      antes: (p, f) => f.aba("Pontos e limites"),
      legenda: "Em Pontos e limites, o Admin acrescenta ou desativa pontos e grava os limites de cada análise. Os limites valem a partir da data em que são salvos.",
    },
    {
      antes: (p, f) => f.ir("/paginas/baias"),
      destaque: (p) => cartao(p, "Nova coleta"),
      legenda: "No CIP baia, a coleta dos mangotes do recebimento é registrada aqui. As leituras são de C.T em 48 horas e de B.L em 72 e 120 horas.",
      fala: "No CIP baia, a coleta dos mangotes do recebimento é registrada aqui. As leituras são de C T em 48 horas e de B L em 72 e 120 horas.",
    },
    {
      antes: (p, f) => f.aba("Gráfico"),
      legenda: "A aba Gráfico mostra a tendência dos resultados, em linha ou em colunas.",
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E o laudo de limpeza de superfícies se preenche com as coletas.",
    },
    {
      antes: (p, f) => f.ir("/paginas/linhas"),
      legenda: "O CIP linha de embarque funciona igual: coleta, gráfico e laudo, para as linhas de embarque.",
    },
  ],
};
