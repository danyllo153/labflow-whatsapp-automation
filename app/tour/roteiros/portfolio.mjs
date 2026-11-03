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
    { antes: (p, f) => f.cartao("abertura"), legenda: "", fala: "LabFlow, o sistema do laboratório. Veja o dia a dia do analista, do resultado lançado ao gráfico.", folga: 0.5 },
    {
      antes: (p, f) => f.abrir("/app/"),
      destaque: (p) => p.locator(".estatisticas"),
      legenda: "O dia começa no Início: o que analisar, o que ler hoje e os atrasados, num lugar só.",
    },
    {
      destaque: (p) => cartao(p, "Ler hoje"),
      legenda: "Em Ler hoje ficam as placas que vencem hoje, e as atrasadas aparecem em vermelho. Cada pendência leva direto à tela certa.",
    },
    {
      antes: async (p, f) => { await f.ir("/leituras"); await f.aba("Tanques terra"); },
      destaque: (p) => p.locator("nav.abas-app"),
      legenda: "Em Leituras, cada análise tem a sua aba. Digita-se o resultado da placa, e o LabFlow confere o limite antes de gravar.",
    },
    {
      antes: (p, f) => f.ir("/leituras"),
      destaque: (p) => p.getByRole("button", { name: "Copiar o relatório" }),
      legenda: "Terminadas as leituras, o relatório do dia sai pronto para copiar e enviar.",
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
    { antes: (p, f) => f.cartao("fim"), legenda: "", fala: "LabFlow: do resultado lançado ao gráfico, sem planilha. Dados de demonstração.", folga: 1 },
  ],
};
