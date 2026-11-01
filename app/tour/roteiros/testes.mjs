// Vídeo 4: TAB, Coliformes e Howard.
import { cartao, demoResultados } from "../comum.mjs";

export default {
  titulo: "TAB, Coliformes e Howard",
  subtitulo: "Das compostas no caldo ao resultado e ao laudo",
  itens: ["Para fazer", "Iniciar análise", "No caldo e incubados", "Resultados", "Laudo", "Howard"],
  passos: [
    {
      antes: (p, f) => f.ir("/analises/tab"),
      destaque: (p) => p.locator(".numeros-app"),
      legenda: "No TAB, os números do topo mostram os atrasados esperando o caldo e o que está em andamento.",
    },
    {
      destaque: (p) => cartao(p, "TAB para espalhar"),
      legenda: "Em Para fazer, o TAB para espalhar já vem com a lista toda marcada. Um botão, Espalhei, faz a etapa de todos de uma vez.",
    },
    {
      antes: (p, f) => f.aba("Iniciar análise"),
      destaque: (p) => cartao(p, "Compostas que vão para o caldo"),
      legenda: "Em Iniciar análise ficam as compostas que vão para o caldo. Marca-se o que entra hoje, confere a prévia e confirma.",
    },
    {
      antes: (p, f) => f.aba("No caldo e incubados"),
      legenda: "No caldo e incubados mostra cada TAB na sua etapa: no caldo, incubado e em confirmação. Um toque abre a composta.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => cartao(p, "TAB positivos no ano"),
      legenda: "Em Resultados, além da situação de cada análise, o quadro TAB positivos no ano mostra os positivos mês a mês.",
    },
    ...demoResultados({
      busca: "90007",
      legendaBusca: "A busca acha a composta pelo load ou pelo tanque. Aqui, o load 90007.",
      falaBusca: "A busca acha a composta pelo load ou pelo tanque. Aqui, o load nove zero zero zero sete.",
      filtros: [{ campo: "Origem", valor: "Recebimento" }, { campo: "Status", valor: "Concluído" }],
      legendaFiltros: "Nos Filtros do TAB: a origem (recebimento, embarque ou tank farm), o status de cada etapa, o resultado e a situação. Aqui: recebimento, concluído.",
    }),
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "O Laudo do TAB sai no modelo do Método Dois, preenchido com as compostas analisadas.",
    },
    {
      antes: (p, f) => f.ir("/analises/coliformes"),
      destaque: (p) => p.locator(".numeros-app"),
      legenda: "Os Coliformes seguem o mesmo caminho: Para fazer, Iniciar análise, No caldo e incubados, Resultados e Laudo.",
    },
    {
      antes: (p, f) => f.aba("No caldo e incubados"),
      legenda: "Aqui o Coliformes estriado espera a leitura. O resultado de cada lote, negativo ou positivo, é lançado em Leituras, com a lista toda de uma vez.",
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E o Laudo de Coliformes em suco se preenche sozinho.",
    },
    {
      antes: (p, f) => f.ir("/analises/howard"),
      legenda: "No Howard, a contagem de bolores, a aba Lançar recebe os campos de cada amostra, e o Gravar o Howard registra tudo junto.",
    },
    {
      antes: (p, f) => f.aba("Resultados"),
      destaque: (p) => cartao(p, "Tendência do resultado"),
      legenda: "Os Resultados do Howard mostram a tendência da contagem ao longo do tempo.",
      durante: async (p, f) => { await f.espera(2500); await f.clicar(p.getByRole("button", { name: "Colunas", exact: true })); },
    },
    ...demoResultados({}).filter((x) => /Excel/.test(x.legenda)),
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E o Laudo da contagem de bolores sai pronto para finalizar e imprimir.",
    },
  ],
};
