import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA } from "../../testes-servidor";
import type { PontoG2 } from "./GraficoG2";

let endereco = "";
function Endereco() {
  const l = useLocation();
  endereco = l.pathname + l.search;
  return null;
}

const PONTOS: PontoG2[] = [
  { load: "90007", lote: 10, analise: "B.L 72h", data: "2026-10-10", valor: 60, resultado: "60", nao_ok: true },
  { load: "90008", lote: 4, analise: "B.L 72h", data: "2026-10-14", valor: 20, resultado: "20", nao_ok: false },
  { load: "90008", lote: 5, analise: "B.L 72h", data: "2026-10-14", valor: 10, resultado: "<10", nao_ok: false },
  { load: "90009", lote: 6, analise: "C.T 48h", data: "2026-10-17", valor: 250, resultado: "250", nao_ok: true },
];

function abrir(caminho: string, grafico: unknown = { limites: { "C.T 48h": 200, "B.L 72h": 50, "B.L 120h": 50 }, pontos: PONTOS, cortado: false }) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const so = url.split("?")[0];
      const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200, headers: { "Content-Type": "application/json" } });
      if (so === "/me") return json(ANA);
      if (so === "/ambiente") return json({ demonstracao: false });
      if (so === "/paginas/recebimento/grafico") return json(grafico);
      return json({ total: 0, pagina: 1, por_pagina: 50, linhas: [] });
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

describe("gráfico G2 no Recebimento (APP-020)", () => {
  it("um painel por análise, com quantas leituras e quantos Não ok, e a linha do limite", async () => {
    abrir("/paginas/recebimento");
    expect(await screen.findByRole("figure", { name: "B.L 72h: 3 leituras, 1 Não ok, limite 50" })).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "C.T 48h: 1 leituras, 1 Não ok, limite 200" })).toHaveTextContent("Limite 200");
    expect(screen.getByRole("figure", { name: "B.L 120h: 0 leituras, 0 Não ok, limite 50" })).toHaveTextContent("Nenhuma leitura");
  });

  it("Não ok é quadrado (não só a cor) e o menor que é círculo vazado", async () => {
    abrir("/paginas/recebimento");
    const bl = await screen.findByRole("figure", { name: /^B\.L 72h/ });
    expect(bl.querySelectorAll("rect.g2-nao-ok")).toHaveLength(1);
    expect(bl.querySelectorAll("circle.g2-ok")).toHaveLength(2);
    expect(bl.querySelectorAll("circle.g2-menor")).toHaveLength(1);
  });

  it("passar o dedo mostra o detalhe com Não ok escrito", async () => {
    abrir("/paginas/recebimento");
    const bl = await screen.findByRole("figure", { name: /^B\.L 72h/ });
    fireEvent.mouseEnter(within(bl).getAllByTestId("ponto-g2")[0].parentElement!);
    expect(within(bl).getByText("Load 90007 · lote 10 · B.L 72h = 60 · 10/10 · Não ok")).toBeInTheDocument();
  });

  it("tocar num ponto filtra a tabela por aquele load, mantendo os outros filtros", async () => {
    const urls = abrir("/paginas/recebimento?fabrica=AQA");
    const u = userEvent.setup();
    const ct = await screen.findByRole("figure", { name: /^C\.T 48h/ });
    await u.click(within(ct).getByTestId("ponto-g2"));
    expect(endereco).toBe("/paginas/recebimento?fabrica=AQA&load=90009");
    const ultima = urls.filter((x) => x.startsWith("/paginas/recebimento/grafico")).pop()!;
    expect(Object.fromEntries(new URLSearchParams(ultima.split("?")[1]))).toEqual({ fabrica: "AQA", load: "90009" });
  });

  it("sem leituras com os filtros, diz isso", async () => {
    abrir("/paginas/recebimento", { limites: { "C.T 48h": 200, "B.L 72h": 50, "B.L 120h": 50 }, pontos: [], cortado: false });
    expect(await screen.findByText("Nenhuma leitura feita com esses filtros.")).toBeInTheDocument();
  });

  it("muitas leituras: avisa que mostra as mais recentes", async () => {
    abrir("/paginas/recebimento", { limites: { "C.T 48h": 200, "B.L 72h": 50, "B.L 120h": 50 }, pontos: PONTOS, cortado: true });
    expect(await screen.findByText(/mostra as mais recentes/)).toBeInTheDocument();
  });

  it("só o Recebimento tem o gráfico", async () => {
    const urls = abrir("/paginas/coletas");
    await screen.findByRole("heading", { level: 1, name: "Coletas" });
    expect(urls.some((x) => x.includes("/grafico"))).toBe(false);
  });
});
