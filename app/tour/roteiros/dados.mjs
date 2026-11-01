// Vídeo 8: Leituras (relatório do dia), Coletas e Arquivo de contra-amostras.
import { cartao, demoResultados } from "../comum.mjs";

export default {
  titulo: "Leituras, Coletas e Arquivo",
  subtitulo: "O relatório do dia, os resultados por análise, o histórico de coletas e as contra-amostras",
  itens: ["Relatório do dia", "Leituras por análise", "Coletas", "Arquivo"],
  passos: [
    {
      antes: (p, f) => f.ir("/leituras"),
      destaque: (p) => p.locator("nav.abas-app"),
      legenda: "A página Leituras tem uma aba por análise, com o número do que vence. A primeira é o Relatório do dia.",
    },
    {
      destaque: (p) => p.getByRole("button", { name: "Copiar o relatório" }),
      legenda: "O relatório do dia sai pronto para copiar e enviar: tudo o que sai hoje, ou só o que já foi lido. Os botões de data mostram os dias anteriores.",
      durante: async (p, f) => {
        await f.espera(1500); await f.clicar(p.getByRole("button", { name: "Só o lido (completo)" }));
        await f.espera(2000); await f.clicar(p.getByRole("button", { name: "Tudo o que sai" }));
      },
    },
    {
      destaque: (p) => p.getByRole("link", { name: "Exportar as leituras do dia para o Excel" }),
      legenda: "O Exportar Excel baixa as leituras do dia: uma aba de resumo e uma aba por bloco, uma linha por leitura, com filtro no cabeçalho.",
      durante: async (p, f) => { await f.espera(1500); await f.baixar(p.getByRole("link", { name: "Exportar as leituras do dia para o Excel" }), "resumo e uma aba por bloco"); },
    },
    {
      destaque: (p) => p.getByLabel("Finalizar o dia"),
      legenda: "Ao lado ficam as pendências de cada análise, com o atalho para lançar, e o Finalizar o dia marca como lido o que ninguém digitou, depois de mostrar a prévia.",
    },
    {
      antes: (p, f) => f.aba("Tanques terra"),
      legenda: "Em cada aba, como Tanques terra, aparece o que vence. É só digitar o resultado da placa e conferir antes de gravar.",
    },
    {
      antes: (p, f) => f.aba("Drops"),
      legenda: "Na aba Drops, o que não der ok já sai com o caminho para abrir o desvio.",
    },
    {
      antes: (p, f) => f.aba("Coliformes"),
      legenda: "E no Coliformes, o resultado de cada lote vai de uma vez: negativo ou positivo para a lista toda, mudando só o que for diferente.",
    },
    {
      antes: (p, f) => f.ir("/paginas/coletas"),
      legenda: "Em Coletas fica o histórico de todas as coletas, com o dashboard em cima e a tabela embaixo.",
    },
    ...demoResultados({
      busca: "Ana",
      legendaBusca: "A busca acha o tanque, o navio ou quem coletou. Aqui, as coletas da Ana.",
      visoes: [
        { botao: "Tendência", legenda: "O dashboard troca entre colunas e tendência: aqui, as coletas ao longo dos dias." },
        { botao: "Colunas", legenda: "E em colunas, a contagem agrupada pelo campo escolhido em Contar por, como quem coletou." },
      ],
      detalhe: "Tocando numa coleta, abre o detalhe: o tanque, quem coletou e as análises dela. Daqui o Admin edita ou exclui com o motivo.",
    }),
    {
      antes: (p, f) => f.aba("Registrar coleta"),
      legenda: "A aba Registrar coleta é a do Coletor: escolhe tanque terra ou tanque navio, preenche e confere a prévia.",
    },
    {
      antes: (p, f) => f.ir("/arquivo"),
      legenda: "No Arquivo de contra-amostras, a aba Para descartar mostra as caixas vencidas, com o descarte de cada uma.",
    },
    {
      destaque: (p) => p.getByRole("search", { name: "Procurar load no arquivo" }),
      legenda: "O Procurar diz em qual caixa está cada load ou navio, inclusive o que já foi descartado.",
      durante: async (p, f) => {
        const busca = p.getByRole("search", { name: "Procurar load no arquivo" });
        await f.digitar(busca.locator("input"), "90008"); await f.clicar(busca.getByRole("button", { name: "Procurar" })); await f.espera(2000);
      },
    },
    {
      antes: (p, f) => f.aba("Navios"),
      legenda: "Na aba Navios ficam as caixas de navio, com a data inicial e o laudo de cada caixa.",
    },
    {
      antes: (p, f) => f.aba("Recebimento"),
      destaque: (p) => cartao(p, "Arquivar recebimento"),
      legenda: "Em Recebimento, arquiva-se o load numa caixa. As caixas livres aparecem embaixo, e a prévia mostra o que vai ser arquivado.",
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "E os laudos de contra-amostra, do recebimento e do embarque, saem por caixa.",
    },
  ],
};
