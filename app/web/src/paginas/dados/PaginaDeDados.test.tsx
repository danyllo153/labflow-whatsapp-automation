import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";

function coleta(n: number) {
  return {
    coleta_id: n,
    origem: n % 2 ? "Terra" : "Navio",
    tanque: `T${n}`,
    navio: n % 2 ? null : "O.SKY 189",
    data_coleta: "2026-10-17",
    coletado_por: "Ana (demo)",
    digitado_por: "Ana (demo)",
    registrado_em: "2026-10-17T13:05:00Z",
  };
}

function paginaDe(todas: unknown[], url: string) {
  const p = new URL(url, "http://x").searchParams;
  const pagina = Number(p.get("pagina") ?? 1);
  const por = Number(p.get("por_pagina") ?? 50);
  return { status: 200, corpo: { total: todas.length, pagina, por_pagina: por, linhas: todas.slice((pagina - 1) * por, pagina * por) } };
}

let endereco = "";
function Endereco() {
  const l = useLocation();
  endereco = l.pathname + l.search;
  return null;
}

function abrir(caminho: string, rotas: Record<string, (c: any) => any>, pessoa = ANA) {
  const urls: string[] = [];
  const api = servidorFalso({ "GET /me": () => ({ status: 200, corpo: pessoa }), ...rotas });
  const original = globalThis.fetch as any;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    urls.push(url);
    const semConsulta = url.split("?")[0];
    const rota = rotas[`GET ${semConsulta}`];
    if ((init?.method ?? "GET") === "GET" && rota && url.includes("?")) {
      const r = await rota(url);
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    return original(url, init);
  }));
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
        <Endereco />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return { api, urls };
}

const COLETAS = Array.from({ length: 120 }, (_, i) => coleta(i + 1));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Páginas: Coletas e Recebimento (APP-015)", () => {
  it("a lista de páginas mostra Coletas e Recebimento", async () => {
    abrir("/paginas", {});
    expect(await screen.findByRole("link", { name: /^Coletas/ })).toHaveAttribute("href", "/paginas/coletas");
    expect(screen.getByRole("link", { name: /^Recebimento C\.T/ })).toBeInTheDocument();
  });

  it("o Coletor não vê Recebimento na lista", async () => {
    abrir("/paginas", {}, { ...ANA, cargo: "Coletor" });
    await screen.findByRole("link", { name: /^Coletas/ });
    expect(screen.queryByRole("link", { name: /Recebimento/ })).not.toBeInTheDocument();
  });

  it("Coletas mostra o total, a página e as linhas formatadas", async () => {
    abrir("/paginas/coletas", { "GET /paginas/coletas": (url: string) => paginaDe(COLETAS, url) });
    expect(await screen.findByText("120 registros · página 1 de 3")).toBeInTheDocument();
    const linhas = screen.getAllByRole("row");
    expect(linhas).toHaveLength(51); // cabeçalho + 50
    expect(within(linhas[1]).getByText("17/10/2026")).toBeInTheDocument();
    expect(within(linhas[1]).getByText("17/10/2026 10:05")).toBeInTheDocument(); // hora de Brasília
  });

  it("filtrar põe o filtro no endereço, manda para a API e mostra a etiqueta removível", async () => {
    const { urls } = abrir("/paginas/coletas", { "GET /paginas/coletas": (url: string) => paginaDe(COLETAS, url) });
    const u = userEvent.setup();
    await screen.findByText(/120 registros/);
    await u.click(screen.getByRole("button", { name: "Filtros" }));
    const form = screen.getByRole("form", { name: "Filtros" });
    await u.selectOptions(within(form).getByLabelText("Origem"), "Navio");
    await u.type(within(form).getByLabelText("Tanque"), "1c");
    await u.click(within(form).getByRole("button", { name: "Filtrar" }));
    expect(endereco).toBe("/paginas/coletas?origem=Navio&tanque=1c");
    expect(urls[urls.length - 1]).toBe("/paginas/coletas?origem=Navio&tanque=1c&pagina=1&por_pagina=50");
    const etiquetas = screen.getByRole("list", { name: "Filtros usados" });
    expect(within(etiquetas).getByText("Navio")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Tirar o filtro Origem" }));
    expect(endereco).toBe("/paginas/coletas?tanque=1c");
  });

  it("o Excel leva os mesmos filtros", async () => {
    abrir("/paginas/coletas?origem=Terra&data_de=2026-10-01", { "GET /paginas/coletas": (url: string) => paginaDe(COLETAS, url) });
    expect(await screen.findByRole("link", { name: "Exportar Excel" })).toHaveAttribute(
      "href",
      "/paginas/coletas/excel?data_de=2026-10-01&origem=Terra",
    );
    expect(screen.getByText("01/10/2026")).toBeInTheDocument(); // a etiqueta mostra a data em dd/mm/aaaa
  });

  it("Próxima e Anterior mudam a página", async () => {
    abrir("/paginas/coletas", { "GET /paginas/coletas": (url: string) => paginaDe(COLETAS, url) });
    const u = userEvent.setup();
    await screen.findByText(/página 1 de 3/);
    await u.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText(/página 2 de 3/)).toBeInTheDocument();
    expect(endereco).toBe("/paginas/coletas?pagina=2");
    await u.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText(/página 1 de 3/)).toBeInTheDocument();
  });

  it("Imprimir busca TODAS as linhas filtradas, não só a página da tela", async () => {
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    const { urls } = abrir("/paginas/coletas?origem=Terra", { "GET /paginas/coletas": (url: string) => paginaDe(COLETAS, url) });
    const u = userEvent.setup();
    await screen.findByText(/120 registros/);
    await u.selectOptions(screen.getByLabelText("Papel"), "deitado");
    await u.click(screen.getByRole("button", { name: "Imprimir" }));
    const folha = await screen.findByTestId("impressao");
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(within(folha).getAllByRole("row")).toHaveLength(121);
    expect(within(folha).getByText(/Origem: Terra/)).toBeInTheDocument();
    expect(folha.querySelector("style")?.textContent).toContain("A4 landscape");
    expect(urls.filter((x) => x.includes("por_pagina=200"))).toHaveLength(1);
    await act(async () => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(screen.queryByTestId("impressao")).not.toBeInTheDocument();
  });

  it("muitas linhas: Imprimir pede filtro ou Excel", async () => {
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    const muitas = Array.from({ length: 2001 }, (_, i) => coleta(i + 1));
    abrir("/paginas/coletas", { "GET /paginas/coletas": (url: string) => paginaDe(muitas, url) });
    const u = userEvent.setup();
    await screen.findByText(/2001 registros/);
    await u.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(screen.getByRole("alert")).toHaveTextContent("use o Excel");
    expect(imprimir).not.toHaveBeenCalled();
  });

  it("Recebimento mostra a situação como etiqueta de texto", async () => {
    abrir("/paginas/recebimento", {
      "GET /paginas/recebimento": (url: string) =>
        paginaDe(
          [
            { load: "90008", lote: 4, fabrica: "AQA", item: "2549", analise: "B.L 72h", prevista: "2026-10-14", resultado: "20", situacao: "Não ok", lido_por: "Ana", data_leitura: "2026-10-14" },
            { load: "90008", lote: 5, fabrica: "AQA", item: "2549", analise: "B.L 72h", prevista: "2026-10-14", resultado: "<10", situacao: "Ok", lido_por: "Ana", data_leitura: "2026-10-14" },
          ],
          url,
        ),
    });
    expect(await screen.findByText("Não ok")).toHaveClass("etiqueta-nao-ok");
    expect(screen.getByText("Ok")).toHaveClass("etiqueta-ok");
  });

  it("página sem permissão mostra a mensagem da API", async () => {
    abrir("/paginas/recebimento", {
      "GET /paginas/recebimento": () => ({ status: 403, corpo: { detail: "Seu cargo não permite esta página." } }),
    });
    expect(await screen.findByText("Seu cargo não permite esta página.")).toBeInTheDocument();
  });

  it("nenhum registro com esses filtros", async () => {
    abrir("/paginas/coletas?tanque=ZZ", { "GET /paginas/coletas": (url: string) => paginaDe([], url) });
    expect(await screen.findByText("Nenhum registro com esses filtros.")).toBeInTheDocument();
  });
});
