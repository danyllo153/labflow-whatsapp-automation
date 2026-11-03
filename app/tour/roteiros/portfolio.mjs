// Vídeo de portfólio (no máximo 90 s): o dia a dia do analista, do resultado lançado ao gráfico.
// Só dados FICTÍCIOS (banco de teste). Sem nome de empresa, de pasta de rede ou de pessoa real.
import { capa, cartao } from "../comum.mjs";

const CARTOES = {
  abertura: capa("O dia a dia do analista", "Pendências, resultados e gráficos"),
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
      antes: async (p, f) => { await f.ir("/analises/recebimento-nfc"); await f.aba("Resultados"); await f.clicar(p.getByRole("button", { name: "Filtros" })); },
      destaque: (p) => p.locator("form.formulario-filtros"),
      legenda: "Cada resultado lançado vira dado. No Recebimento de NFC, um filtro separa a amostra Fresh.",
      durante: async (p, f) => {
        await f.escolher(p.locator("form.formulario-filtros label.campo").filter({ hasText: /^\s*Amostra/ }).locator("select"), "Fresh");
      },
      depois: async (p, f) => { await f.clicar(p.locator("form.formulario-filtros").getByRole("button", { name: "Filtrar" })); await f.espera(1500); },
    },
    {
      destaque: (p) => p.locator(".pilulas-fabrica"),
      legenda: "Duas fábricas lado a lado, para comparar.",
      durante: async (p, f) => {
        for (const fab of ["CON", "TMG"]) { await f.espera(900); await f.clicar(p.locator(".pilulas-fabrica button").filter({ hasText: new RegExp(`^\\s*${fab}\\s*$`) })); }
        await f.espera(900);
        await f.clicar(p.getByRole("button", { name: "Por fábrica", exact: true }));
        await f.espera(900);
        await f.escolher(p.locator("main section.grafico-resultado label.campo select").first(), "C.T 48h");
      },
    },
    {
      destaque: (p) => p.locator("main section.grafico-resultado").first(),
      legenda: "Cada fábrica com a sua cor: a tendência do C.T ao longo do tempo, em linha ou em colunas.",
      durante: async (p, f) => { await f.espera(2500); await f.clicar(p.getByRole("button", { name: "Colunas", exact: true })); },
    },
    { antes: (p, f) => f.cartao("fim"), legenda: "", fala: "LabFlow: do resultado lançado ao gráfico, sem planilha. Dados de demonstração.", folga: 1 },
  ],
};
