import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA } from "../../testes-servidor";

function abrir(caminho: string, respostas: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const json = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { "Content-Type": "application/json" } });
      if (url === "/me") return json(ANA);
      if (url === "/ambiente") return json({ demonstracao: false });
      if (url in respostas) return json(respostas[url]);
      return json({ detail: "Navio não encontrado." }, 404);
    }),
  );
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

const TANQUE = {
  resumo: { coleta_id: 7, origem: "Terra", tanque: "38", navio: null, data_coleta: "2026-10-21", leituras: 14, lidas: 2, pendentes: 12, atrasadas: 0, nao_ok: 0, drops_pendentes: 3, desvios_abertos: 0, status: "Em andamento" },
  leituras: [
    { analise: "Psicrotróficos", metodo: "Profundidade", frasco: "Normal", etapa: "Pré-leitura", prevista: "2026-10-26", situacao: "No prazo", resultado: "Pendente" },
    { analise: "Psicrotróficos", metodo: "Superficie", frasco: "Normal", etapa: "Pré-leitura", prevista: "2026-10-26", situacao: "No prazo", resultado: "Pendente" },
  ],
  drops: [{ drop: "D5", prevista: "2026-10-26", situacao: "No prazo" }],
  desvios: [],
  testes: [{ teste: "TAB", data_feito: "2026-10-22", status: "No caldo", situacao: "No prazo" }],
};

const NAVIO = {
  resumo: { navio: "O.SKY 189", produto: "NFC e FCOJ", status: "Atrasado", tanques_nfc: 10, pendentes_nfc: 40, embarques_fcoj: 1, pendentes_fcoj: 3, nao_ok: 1, desvios_abertos: 0, primeira_data: "2026-10-13", ultima_data: "2026-10-16" },
  tanques: [{ coleta_id: 31, origem: "Navio", navio: "O.SKY 189", tanque: "1C", data_coleta: "2026-10-13", status: "Em andamento", lidas: 10, pendentes: 4, nao_ok: 0, desvios_abertos: 0 }],
  embarques: [{ navio: "O.SKY 189", linha: 2, fase: 3, status: "Atrasado", amostras: 10, lidas: 27, pendentes: 3, nao_ok: 1, testes_abertos: 1, positivos: 0 }],
};

describe("página de um tanque (APP-019b)", () => {
  it("mostra o status, os números e as leituras com o método (o que parecia repetido)", async () => {
    abrir("/paginas/tanques-terra/7", { "/paginas/tanques-terra/7": TANQUE });
    const titulo = await screen.findByRole("heading", { level: 1, name: /Tanque 38/ });
    expect(within(titulo).getByText("Em andamento")).toHaveClass("etiqueta-pendente");
    expect(screen.getByText("2 de 14")).toBeInTheDocument();
    const leituras = screen.getByRole("heading", { name: /^Leituras/ }).closest(".cartao") as HTMLElement;
    expect(within(leituras).getByText("Profundidade")).toBeInTheDocument();
    expect(within(leituras).getByText("Superficie")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^TAB/ })).toBeInTheDocument();
    expect(screen.getByText("Nenhum desvio.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tanques terra" })).toHaveAttribute("href", "/paginas/tanques-terra");
  });

  it("tanque de navio volta para o navio e não mostra TAB", async () => {
    abrir("/paginas/tanques-terra/31", {
      "/paginas/tanques-terra/31": { ...TANQUE, resumo: { ...TANQUE.resumo, origem: "Navio", navio: "O.SKY 189", tanque: "1C" } },
    });
    await screen.findByRole("heading", { level: 1, name: /Tanque 1C/ });
    expect(screen.getByRole("link", { name: "O.SKY 189" })).toHaveAttribute("href", "/paginas/navios/O.SKY%20189");
    expect(screen.queryByRole("heading", { name: /^TAB/ })).toBeNull();
  });
});

describe("página de um navio (APP-019b)", () => {
  it("mostra o status e as duas partes: tanques NFC e concentrado FCOJ", async () => {
    abrir("/paginas/navios/O.SKY%20189", { "/paginas/navios/O.SKY%20189": NAVIO });
    const titulo = await screen.findByRole("heading", { level: 1, name: /O\.SKY 189/ });
    expect(within(titulo).getByText("Atrasado")).toHaveClass("etiqueta-nao-ok");
    const nfc = screen.getByRole("heading", { name: /^Tanques NFC do navio/ }).closest(".cartao") as HTMLElement;
    expect(within(nfc).getByRole("link", { name: "1C" })).toHaveAttribute("href", "/paginas/tanques-terra/31");
    const fcoj = screen.getByRole("heading", { name: /^Concentrado \(FCOJ\)/ }).closest(".cartao") as HTMLElement;
    expect(within(fcoj).getByRole("link", { name: "Linha 2 · fase 3" })).toHaveAttribute(
      "href",
      "/paginas/embarque?navio=O.SKY%20189&linha=2&fase=3",
    );
  });

  it("navio só de NFC diz que não tem concentrado", async () => {
    abrir("/paginas/navios/O.SKY%20189", { "/paginas/navios/O.SKY%20189": { ...NAVIO, embarques: [] } });
    expect(await screen.findByText("Este navio não tem concentrado (FCOJ).")).toBeInTheDocument();
  });

  it("navio que não existe mostra a mensagem", async () => {
    abrir("/paginas/navios/NAO", {});
    expect(await screen.findByText("Navio não encontrado.")).toBeInTheDocument();
  });
});
