// Vídeo 3: FCOJ (concentrado): recebimento e embarque.
import { cartao } from "../comum.mjs";

export default {
  titulo: "FCOJ (concentrado)",
  subtitulo: "Recebimento e embarque do suco concentrado",
  abertura: "FCOJ, o suco concentrado. Neste vídeo: o recebimento e o embarque, do registro ao laudo.",
  itens: ["Recebimento FCOJ", "Embarque FCOJ", "Compostas", "Resultados", "Laudos"],
  passos: [
    {
      antes: (p, f) => f.ir("/analises/recebimento-fcoj"),
      destaque: (p) => p.locator(".numeros-app"),
      legenda: "No Recebimento FCOJ, o Painel abre com os números: os atrasados e o que vence hoje. O contador vermelho na aba avisa os atrasados.",
      fala: "No Recebimento F C O J, o Painel abre com os números: os atrasados e o que vence hoje. O contador vermelho na aba avisa os atrasados.",
    },
    {
      destaque: (p) => cartao(p, "Para fazer agora"),
      legenda: "Em Para fazer agora estão as leituras de C.T e B.L de cada load, com o prazo. O botão Lançar leva direto a digitar o resultado.",
      fala: "Em Para fazer agora estão as leituras de C T e B L de cada load, com o prazo. O botão Lançar leva direto a digitar o resultado.",
    },
    {
      destaque: (p) => cartao(p, "Não ok por fábrica"),
      legenda: "Ao lado, Não ok por fábrica mostra quais unidades tiveram resultado fora do limite no mês.",
    },
    {
      antes: (p, f) => f.aba("Registrar"),
      destaque: (p) => cartao(p, "Registrar recebimento"),
      legenda: "Na aba Registrar entra o recebimento: o load, os lotes e a fábrica. A prévia mostra os lotes e as compostas que vão ser criados, e um Confirmar grava tudo.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => cartao(p, "Por situação"),
      legenda: "Em Resultados, os lotes aparecem por situação: atrasado, não ok, no prazo e ok, com a porcentagem de cada um.",
    },
    {
      destaque: (p) => p.locator("main").getByRole("button", { name: "Todas as fábricas" }),
      legenda: "O filtro de fábricas mostra uma unidade ou compara várias. O gráfico troca entre lotes por dia, com crescimento, ok e não ok, e por fábrica.",
      durante: async (p, f) => {
        await f.espera(2500);
        await f.clicar(p.locator("main").getByRole("button", { name: "Por fábrica", exact: true }));
      },
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "O Laudo do recebimento de FCOJ sai no modelo oficial. Em Correções fica o histórico do que foi corrigido depois de lançado.",
      fala: "O Laudo do recebimento de F C O J sai no modelo oficial. Em Correções fica o histórico do que foi corrigido depois de lançado.",
    },
    {
      antes: (p, f) => f.ir("/analises/embarque-fcoj"),
      destaque: (p) => cartao(p, "Últimos navios embarcados"),
      legenda: "No Embarque FCOJ, o Painel mostra os últimos navios embarcados, com as amostras de cada um e a situação: em andamento, ok ou não ok.",
      fala: "No Embarque F C O J, o Painel mostra os últimos navios embarcados, com as amostras de cada um e a situação: em andamento, ok ou não ok.",
    },
    {
      antes: (p, f) => f.aba("Registrar"),
      destaque: (p) => cartao(p, "Registrar amostras do embarque"),
      legenda: "Em Registrar entram as amostras do embarque: o navio, a linha, a fase e os loads, com prévia antes de gravar.",
    },
    {
      antes: (p, f) => f.aba("Compostas"),
      destaque: (p) => cartao(p, "Amostras sem composta"),
      legenda: "Na aba Compostas, as amostras sem composta são juntadas. Marca-se o que vai para TAB, Coliformes e Howard, confere a prévia e confirma.",
    },
    {
      destaque: (p) => cartao(p, "Compostas do embarque (30 dias)"),
      legenda: "Embaixo ficam as compostas do embarque dos últimos trinta dias, com o que cada uma vai analisar.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => p.locator("main").getByRole("button", { name: "Howard", exact: true }),
      legenda: "Os Resultados do embarque têm duas visões: as análises do embarque e o Howard, com os mesmos filtros e gráficos.",
      durante: async (p, f) => { await f.espera(2000); await f.clicar(p.locator("main").getByRole("button", { name: "Howard", exact: true })); },
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E o Laudo de análises do embarque se preenche sozinho, pronto para finalizar e imprimir.",
    },
  ],
};
