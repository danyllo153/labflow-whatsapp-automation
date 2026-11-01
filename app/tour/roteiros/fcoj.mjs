// Vídeo 3: FCOJ (concentrado): recebimento e embarque.
import { cartao, demoResultados } from "../comum.mjs";

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
    ...demoResultados({
      busca: "90008",
      legendaBusca: "A busca procura em todas as colunas, em todos os registros: aqui, o load 90008 e os lotes dele.",
      falaBusca: "A busca procura em todas as colunas, em todos os registros: aqui, o load nove zero zero zero oito e os lotes dele.",
      filtros: [{ campo: "Análise", valor: "B.L 72h" }, { campo: "Situação", valor: "Não ok" }],
      legendaFiltros: "O botão Filtros abre os campos: as datas, o load, o lote, a análise, a situação, o resultado e quem leu. Aqui: B.L 72h e Não ok.",
      falaFiltros: "O botão Filtros abre os campos: as datas, o load, o lote, a análise, a situação, o resultado e quem leu. Aqui: B L 72 horas e não ok.",
      fabricas: ["AQA", "UCH"],
      visoes: [
        { botao: "Ok / Não ok", legenda: "O gráfico Lotes lidos mostra os lotes por dia. Em Ok e Não ok, cada coluna se divide em verde e vermelho." },
        { botao: "Por fábrica", legenda: "Em Por fábrica, a coluna se divide pelas unidades, cada uma com a sua cor." },
        { botao: "Semana", legenda: "E o agrupamento troca entre dia e semana, para ver a tendência de um período maior." },
        { tocar: true, legenda: "Tocando numa coluna, aparecem embaixo os lotes daquele período, com o resultado de cada um." },
        { botao: "Com crescimento", legenda: "A visão Com crescimento mostra só as leituras com contagem, para ver onde e quando houve crescimento." },
      ],
      detalhe: "E tocando no número do load, abre a página dele: o recebimento, os lotes, as leituras e em que caixa do arquivo está a contra-amostra.",
    }),
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
      durante: async (p, f) => {
        await f.espera(2000); await f.clicar(p.locator("main").getByRole("button", { name: "Howard", exact: true }));
        await f.espera(2500); await f.clicar(p.locator("main").getByRole("button", { name: "Embarque FCOJ", exact: true }));
      },
    },
    ...demoResultados({
      filtros: [{ campo: "Análise", valor: "C.T 48h" }],
      legendaFiltros: "Nos Filtros do embarque entram também o navio, a linha e a fase. Aqui, só o C.T 48h.",
      falaFiltros: "Nos Filtros do embarque entram também o navio, a linha e a fase. Aqui, só o C T 48 horas.",
      detalhe: "E o nome do navio abre a página dele, com os tanques de NFC e o concentrado embarcado, tudo junto.",
    }).filter((x) => !/Imprimir pergunta/.test(x.legenda)),
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E o Laudo de análises do embarque se preenche sozinho, pronto para finalizar e imprimir.",
    },
  ],
};
