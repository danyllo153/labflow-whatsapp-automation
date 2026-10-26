import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { servidorFalso } from "../testes-servidor";
import CartaoFolhas, { type Folha } from "./CartaoFolhas";
import GraficoSemana, { type Semana } from "./GraficoSemana";

/** APP-055: gráfico da semana e cartão das folhas (visual repaginado). Dados fictícios. */

afterEach(() => vi.unstubAllGlobals());

const SEMANA: Semana = {
  tipos: ["TAB", "Coliformes", "NFC", "C.T/B.L"],
  dias: ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"].map((dia, i) => ({
    dia,
    contagens: { TAB: i, Coliformes: 1, NFC: 2, "C.T/B.L": 0 },
  })),
  totais: { TAB: 21, Coliformes: 7, NFC: 14, "C.T/B.L": 0 },
};

function emRota(no: JSX.Element) {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{no}</MemoryRouter>);
}

describe("Painel do Início (APP-055)", () => {
  it("o gráfico mostra os 7 dias e os totais por tipo", async () => {
    servidorFalso({ "GET /painel/semana": () => ({ status: 200, corpo: SEMANA }) });
    emRota(<GraficoSemana />);
    const grafico = await screen.findByRole("img", { name: /Concluído por dia na semana/ });
    expect(grafico.getAttribute("aria-label")).toContain("sáb 24");
    expect(screen.getByText("Total").nextSibling).toHaveTextContent("42");
  });

  it("o cartão mostra a folha mais perto de encher, ou as cheias para imprimir", async () => {
    const folhas: Folha[] = [{ laudo: "agua-processo", titulo: "Água do processo", caminho: "/paginas/agua-processo", linhas: 18, capacidade: 23, cheias: 0 }];
    servidorFalso({ "GET /painel/folhas": () => ({ status: 200, corpo: folhas }) });
    emRota(<CartaoFolhas />);
    expect(await screen.findByText("Água do processo: faltam 5 linhas.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Linhas preenchidas" })).toHaveAttribute("aria-valuenow", "18");
    expect(screen.getByRole("link", { name: "Ver o laudo" })).toHaveAttribute("href", "/paginas/agua-processo");
  });

  it("com folha cheia, o cartão pede para imprimir", async () => {
    const folhas: Folha[] = [{ laudo: "incubacao", titulo: "Controle de incubação e leitura", caminho: "/incubacao", linhas: 7, capacidade: 7, cheias: 2 }];
    servidorFalso({ "GET /painel/folhas": () => ({ status: 200, corpo: folhas }) });
    emRota(<CartaoFolhas />);
    expect(await screen.findByText("Laudos para imprimir")).toBeInTheDocument();
    expect(screen.getByText(/2 folhas cheias esperando impressão/)).toBeInTheDocument();
  });
});
