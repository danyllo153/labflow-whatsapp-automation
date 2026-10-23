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
  alertas: [{ pagina: "tanques", referencia: "Tanque 92", analise: "B.L Normal · Leitura final", resultado: "<1, 3, 12", data: "2026-10-20" }],
};

describe("todas as páginas do Power BI no app (APP-019)", () => {
  it("a lista tem a Visão geral e as nove páginas, nenhuma Em breve", async () => {
    abrir("/paginas");
    const principal = (await screen.findByRole("heading", { level: 1, name: "Páginas" })).closest("section") as HTMLElement;
    const links = within(principal).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/paginas/visao-geral",
      ...PAGINAS.map((p) => `/paginas/${p.caminho}`),
    ]);
    expect(within(principal).queryByText("Em breve")).toBeNull();
  });

  it("o Coletor só vê Coletas", async () => {
    abrir("/paginas", { ...ANA, cargo: "Coletor" });
    const principal = (await screen.findByRole("heading", { level: 1, name: "Páginas" })).closest("section") as HTMLElement;
    expect(within(principal).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/paginas/coletas"]);
  });

  it.each(PAGINAS.map((p) => [p.titulo, p] as const))("%s abre, chama a API certa e mostra as colunas", async (_t, def) => {
    const urls = abrir(`/paginas/${def.caminho}`);
    expect(await screen.findByRole("heading", { level: 1, name: def.titulo })).toBeInTheDocument();
    expect(await screen.findByText(/^1 registro/)).toBeInTheDocument();
    expect(urls.some((u) => u.startsWith(`${def.api}?`))).toBe(true);
    for (const c of def.colunas) expect(screen.getByRole("columnheader", { name: c.rotulo })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exportar Excel" })).toHaveAttribute("href", `${def.api}/excel?`);
  });

  it("Navios: 'Só com pendência' manda true e a etiqueta mostra Sim", async () => {
    const urls = abrir("/paginas/navios");
    const u = userEvent.setup();
    await screen.findByText(/^1 registro/);
    await u.click(screen.getByRole("button", { name: "Filtros" }));
    await u.selectOptions(screen.getByLabelText("Só com pendência"), "true");
    await u.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(endereco).toBe("/paginas/navios?com_pendencia=true");
    expect(urls[urls.length - 1]).toContain("com_pendencia=true");
    expect(within(screen.getByRole("list", { name: "Filtros usados" })).getByText("Sim")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Tanque 92" })).toHaveAttribute("href", "/paginas/tanques");
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
});
