import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA } from "../../testes-servidor";
import { PAGINAS } from "./definicoes";

let endereco = "";
function Endereco() {
  const l = useLocation();
  endereco = l.pathname + l.search;
  return null;
}

/** Servidor falso: cada página responde uma linha com todas as colunas preenchidas. */
function abrir(caminho: string, pessoa: any = ANA, extra: Record<string, unknown> = {}) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const so = url.split("?")[0];
      const json = (corpo: unknown, status = 200) =>
        new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
      if (so === "/me") return json(pessoa);
      if (so === "/ambiente") return json({ demonstracao: false });
      if (so in extra) return json(extra[so]);
      const def = PAGINAS.find((p) => p.api === so);
      if (def) {
        const linha = Object.fromEntries(def.colunas.map((c) => [c.chave, c.formato === "data" ? "2026-10-17" : `${c.rotulo} X`]));
        return json({ total: 1, pagina: 1, por_pagina: 50, linhas: [linha] });
      }
      return json({ detail: "Not Found" }, 404);
    }),
  );
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
        <Endereco />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

const VISAO = {
  data_de: "2026-09-24",
  data_ate: "2026-10-23",
  numeros: [
    { chave: "coletas", rotulo: "Coletas", valor: 66 },
    { chave: "recebimento_nao_ok", rotulo: "Recebimento Não ok", valor: 12 },
    { chave: "desvios_abertos", rotulo: "Desvios abertos (agora)", valor: 0 },
  ],
  pendencias: [
    { bloco: "FCOJ Recebimento", vence_hoje: 2, atrasados: 23 },
    { bloco: "Desvios", vence_hoje: 0, atrasados: 0 },
  ],
  serie: [
    { dia: "2026-10-19", registradas: 4, nao_ok: 1 },
    { dia: "2026-10-20", registradas: 9, nao_ok: 0 },
    { dia: "2026-10-21", registradas: 2, nao_ok: 3 },
  ],
  alertas: [{ pagina: "tanques", caminho: "/paginas/tanques-terra/5", referencia: "Tanque 92", analise: "B.L Normal · Leitura final", resultado: "<1, 3, 12", data: "2026-10-20" }],
};

describe("todas as páginas do Power BI no app (APP-019)", () => {
  it("a lista agrupa em Geral, NFC e FCOJ, sem a página antiga de Tanques", async () => {
    abrir("/paginas");
    const principal = (await screen.findByRole("heading", { level: 1, name: "Análises" })).closest("section") as HTMLElement;
    expect(within(principal).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Geral", "NFC", "FCOJ (concentrado)", "TAB, Coliformes e Howard", "Águas e superfícies", "Rotina do laboratório"]);
    const grupo = (nome: string) => within(within(principal).getByRole("heading", { level: 2, name: nome }).parentElement as HTMLElement);
    const hrefs = (nome: string) => grupo(nome).getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs("Geral")).toEqual(["/paginas/visao-geral", "/paginas/coletas"]);
    expect(hrefs("NFC")).toEqual(expect.arrayContaining(["/analises/tanques", "/analises/drops", "/analises/desvios", "/analises/recebimento-nfc"])); // apps da Fase E
    expect(hrefs("NFC").filter((h) => h === "/analises/tanques")).toHaveLength(1); // terra e navio num app só (25/10)
    expect(hrefs("FCOJ (concentrado)")).toEqual(["/analises/recebimento-fcoj", "/analises/embarque-fcoj"]); // viraram apps (Fase E)
    expect(hrefs("TAB, Coliformes e Howard")).toEqual(["/analises/tab", "/analises/coliformes", "/analises/howard"]); // um app para cada (25/10)
    expect(within(principal).queryByRole("link", { name: /^Tanques Leituras/ })).toBeNull();
    expect(within(principal).queryByText("Em breve")).toBeNull();
    expect(hrefs("Águas e superfícies")).toEqual(["/paginas/agua-processo", "/paginas/baias", "/paginas/linhas"]); // APP-037
    expect(hrefs("Rotina do laboratório")).toEqual(["/esterilizacao", "/estufas", "/material-asseptico", "/meios-lotes", "/fluxo-laminar", "/incubacao"]);
  });

  it("o Coletor só vê Coletas e a água do processo (baias e linhas são análise, 25/10)", async () => {
    abrir("/paginas", { ...ANA, cargo: "Coletor" });
    const principal = (await screen.findByRole("heading", { level: 1, name: "Análises" })).closest("section") as HTMLElement;
    expect(within(principal).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "/paginas/coletas", "/paginas/agua-processo",
    ]);
  });

  it.each(PAGINAS.map((p) => [p.titulo, p] as const))("%s abre, chama a API certa e mostra as colunas", async (_t, def) => {
    const urls = abrir(`/paginas/${def.caminho}`);
    expect(await screen.findByRole("heading", { level: 1, name: def.titulo })).toBeInTheDocument();
    expect(await screen.findByText(/^1 registro/)).toBeInTheDocument();
    expect(urls.some((u) => u.startsWith(`${def.api}?`))).toBe(true);
    for (const c of def.colunas) expect(screen.getByRole("columnheader", { name: c.rotulo })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exportar Excel" })).toHaveAttribute("href", `${def.api}/excel?${new URLSearchParams(def.fixos ?? {}).toString()}`);
  });

  it("Navios: filtrar só FCOJ e tocar no navio abre a página dele", async () => {
    const urls = abrir("/paginas/navios");
    const u = userEvent.setup();
    await screen.findByText(/^1 registro/);
    await u.click(screen.getByRole("button", { name: "Filtros" }));
    await u.selectOptions(screen.getByLabelText("Produto"), "FCOJ");
    await u.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(endereco).toBe("/paginas/navios?produto=FCOJ");
    expect(urls[urls.length - 1]).toContain("produto=FCOJ");
    expect(screen.getByRole("link", { name: "Navio e viagem X" })).toHaveAttribute("href", "/paginas/navios/Navio%20e%20viagem%20X");
  });

  it("resultado Positivo e Confirmado aparecem como alerta; Negativo como ok", async () => {
    abrir("/paginas/testes", ANA, {
      "/paginas/testes": {
        total: 2,
        pagina: 1,
        por_pagina: 50,
        linhas: [
          { teste: "TAB", referencia: "Load 1", resultado: "Positivo", situacao: "Concluído" },
          { teste: "Coliformes", referencia: "Load 2", resultado: "Negativo", situacao: "Concluído" },
        ],
      },
    });
    expect(await screen.findByText("Positivo")).toHaveClass("etiqueta-nao-ok");
    expect(screen.getByText("Negativo")).toHaveClass("etiqueta-ok");
  });
});

describe("Visão geral (APP-019)", () => {
  it("mostra os números, as pendências por bloco e os Não ok com link para a página", async () => {
    abrir("/paginas/visao-geral", ANA, { "/paginas/visao-geral": VISAO });
    expect(await screen.findByText("Período: 24/09/2026 a 23/10/2026 (últimos 30 dias)")).toBeInTheDocument();
    expect(screen.getByText("66").closest(".cartao-numero")).toHaveTextContent("Coletas");
    expect(screen.getByText("12").closest(".cartao-numero")).toHaveClass("alerta");
    expect(screen.getByText("0", { selector: ".numero" }).closest(".cartao-numero")).not.toHaveClass("alerta");
    expect(screen.getByRole("row", { name: "FCOJ Recebimento 2 23" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tanque 92" })).toHaveAttribute("href", "/paginas/tanques-terra/5");
  });

  it("escolher o período põe no endereço e manda para a API", async () => {
    const urls = abrir("/paginas/visao-geral", ANA, { "/paginas/visao-geral": VISAO });
    const u = userEvent.setup();
    await screen.findByText(/Período:/);
    const form = screen.getByRole("form", { name: "Período" });
    await u.type(within(form).getByLabelText("De"), "2026-10-01");
    await u.type(within(form).getByLabelText("Até"), "2026-10-15");
    await u.click(within(form).getByRole("button", { name: "Ver período" }));
    expect(endereco).toBe("/paginas/visao-geral?data_de=2026-10-01&data_ate=2026-10-15");
    expect(urls[urls.length - 1]).toBe("/paginas/visao-geral?data_de=2026-10-01&data_ate=2026-10-15");
  });

  it("sem Não ok no período diz isso", async () => {
    abrir("/paginas/visao-geral", ANA, { "/paginas/visao-geral": { ...VISAO, alertas: [] } });
    expect(await screen.findByText("Nenhum Não ok no período.")).toBeInTheDocument();
  });

  it("tem os gráficos de análises por dia e de Não ok por dia, como os painéis de LIMS (APP-032)", async () => {
    abrir("/paginas/visao-geral", ANA, { "/paginas/visao-geral": VISAO });
    const colunas = await screen.findByRole("region", { name: "Análises registradas por dia" });
    expect(within(colunas).getByRole("img", { name: "Análises registradas por dia: 15 no período" })).toBeInTheDocument();
    const linha = screen.getByRole("region", { name: "Não ok por dia" });
    expect(within(linha).getByRole("img", { name: "Não ok por dia: 4 no período" })).toBeInTheDocument();
  });

  it("sem a série (resposta antiga), a Visão geral abre sem os gráficos", async () => {
    const { serie: _, ...semSerie } = VISAO;
    abrir("/paginas/visao-geral", ANA, { "/paginas/visao-geral": semSerie });
    await screen.findByText(/^Período:/);
    expect(screen.queryByRole("region", { name: "Não ok por dia" })).not.toBeInTheDocument();
  });
});

describe("Resumo por situação acima da tabela (APP-032)", () => {
  const RESUMO = {
    total: 20,
    pagina: 1,
    por_pagina: 50,
    linhas: [{ load: "90009", lote: 1, fabrica: "AQA", item: "9100", analise: "B.L 72h", prevista: "2026-10-20", resultado: "", situacao: "Atrasado", lido_por: "", data_leitura: "" }],
    resumo: [
      { rotulo: "Atrasado", total: 12 },
      { rotulo: "Não ok", total: 3 },
      { rotulo: "Ok", total: 5 },
    ],
    resumo_coluna: "situacao",
  };

  it("mostra as barras por situação com os números do que está filtrado", async () => {
    abrir("/paginas/recebimento", ANA, { "/paginas/recebimento": RESUMO });
    const painel = await screen.findByRole("region", { name: "Por situação" });
    expect(within(painel).getAllByRole("button").map((b) => b.textContent)).toEqual(["Atrasado12 · 60%", "Não ok3 · 15%", "Ok5 · 25%"]);
  });

  it("tocar numa barra filtra a tabela pela situação (no endereço da página)", async () => {
    const urls = abrir("/paginas/recebimento", ANA, { "/paginas/recebimento": RESUMO });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /^Não ok/ }));
    expect(urls[urls.length - 1]).toContain("situacao=N%C3%A3o+ok");
  });

  it("página sem filtro daquela coluna mostra as barras sem botões", async () => {
    abrir("/paginas/coletas", ANA, { "/paginas/coletas": { ...RESUMO, resumo_coluna: "status", resumo: [{ rotulo: "Em andamento", total: 3 }] } });
    const painel = await screen.findByRole("region", { name: "Por situação" });
    expect(within(painel).queryByRole("button")).not.toBeInTheDocument();
    expect(painel).toHaveTextContent("Por status");
  });
});
