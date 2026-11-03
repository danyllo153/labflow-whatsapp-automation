// Vídeo de portfólio (no máximo 90 s): o dia a dia do analista, do resultado lançado ao gráfico.
// Só dados FICTÍCIOS (banco de teste). Sem nome de empresa, de pasta de rede ou de pessoa real.
import { capa, cartao } from "../comum.mjs";

const CARTOES = {
  abertura: capa("LabFlow", "O dia a dia do analista: pendências, resultados e gráficos"),
  fim: capa("Do resultado lançado ao gráfico, sem planilha", "Dados de demonstração · LabFlow"),
};

export default {
  titulo: "O dia a dia do analista",
  semCapa: true,
  cartoes: CARTOES,
  passos: [
    { antes: (p, f) => f.cartao("abertura"), legenda: "", fala: "LabFlow, o sistema do laboratório. Veja o dia a dia do analista, do resultado lançado ao gráfico.", folga: 1 },
    {
      antes: (p, f) => f.abrir("/app/"),
      destaque: (p) => p.locator(".estatisticas"),
      legenda: "O dia começa no Início: o que analisar, o que ler hoje e os atrasados, de todas as áreas num lugar só.",
    },
    {
      destaque: (p) => cartao(p, "Para analisar agora"),
      legenda: "Cada pendência traz o prazo e um botão que leva direto à tela certa.",
    },
    {
      destaque: (p) => cartao(p, "Ler hoje"),
      legenda: "Em Ler hoje ficam as placas que vencem hoje. As atrasadas aparecem em vermelho.",
    },
    {
      antes: (p, f) => f.ir("/leituras"),
      destaque: (p) => p.locator("nav.abas-app"),
      legenda: "Na página Leituras, cada análise tem a sua aba, com o número do que vence.",
    },
    {
      antes: (p, f) => f.aba("Tanques terra"),
      legenda: "É só digitar o resultado da placa. O LabFlow confere o limite e mostra uma prévia antes de gravar.",
    },
    {
      antes: (p, f) => f.aba("Coliformes"),
      legenda: "No Coliformes, o resultado vai de uma vez para a lista toda, mudando só o que for diferente.",
    },
    {
      antes: (p, f) => f.ir("/leituras"),
      destaque: (p) => p.getByRole("button", { name: "Copiar o relatório" }),
      legenda: "Terminadas as leituras, o relatório do dia sai pronto para copiar e enviar.",
    },
    {
      destaque: (p) => p.getByRole("link", { name: "Exportar as leituras do dia para o Excel" }),
      legenda: "E o Excel baixa as leituras do dia, uma linha por leitura.",
    },
    {
      antes: async (p, f) => { await f.ir("/analises/recebimento-fcoj"); await f.aba("Resultados"); },
      destaque: (p) => cartao(p, "Por situação"),
      legenda: "Cada resultado lançado vira dado: atrasado, não ok, no prazo e ok, com a porcentagem de cada um.",
    },
    {
      destaque: (p) => cartao(p, "Tendência do resultado"),
      legenda: "E vira gráfico: a tendência ao longo do tempo, em linha ou em colunas.",
      durante: async (p, f) => { await f.espera(2500); await f.clicar(p.getByRole("button", { name: "Colunas", exact: true })); },
    },
    { antes: (p, f) => f.cartao("fim"), legenda: "", fala: "LabFlow: do resultado lançado ao gráfico, sem planilha. Dados de demonstração.", folga: 2 },
  ],
};
