import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { servidorFalso } from "../testes-servidor";
import NomesNoLaudo, { type NomesDaFolha } from "./NomesNoLaudo";

/** Quem vai no laudo (086, 27/11). Nomes fictícios. */
const FOLHA: NomesDaFolha = {
  laudo: "fluxo-laminar",
  pagina_id: 7,
  por: "dia",
  pode_mudar: true,
  pessoas: [
    { id: 1, nome: "Ana Souza" },
    { id: 2, nome: "Bruno Lima" },
  ],
  escolhas: [{ dia: "2026-10-20", pessoas: [], sugeridas: [2] }],
};

afterEach(() => vi.unstubAllGlobals());

describe("Quem vai no laudo (086)", () => {
  it("mostra cada data, quem estava no turno primeiro, e grava ao marcar", async () => {
    const api = servidorFalso({
      "GET /laudos-nomes/fluxo-laminar/7": () => ({ status: 200, corpo: FOLHA }),
      "PUT /laudos-nomes/fluxo-laminar/7": (c) => ({
        status: 200,
        corpo: { ...FOLHA, escolhas: [{ ...FOLHA.escolhas[0], pessoas: c.pessoas }] },
      }),
    });
    render(<NomesNoLaudo laudo="fluxo-laminar" paginaId={7} />);
    expect(await screen.findByText("20/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Ninguém marcado: o nome sai em branco.")).toBeInTheDocument();
    const caixas = screen.getAllByRole("checkbox");
    expect(caixas[0].closest("label")).toHaveTextContent("Bruno Lima"); // estava no turno: vem primeiro
    expect(caixas[0].closest("label")).toHaveTextContent("no turno");
    await userEvent.click(screen.getByRole("checkbox", { name: /Ana Souza/ }));
    expect(await screen.findByRole("checkbox", { name: /Ana Souza/ })).toBeChecked();
    expect(api.chamadas.find((c) => c.rota === "PUT /laudos-nomes/fluxo-laminar/7")?.corpo).toEqual({ dia: "2026-10-20", pessoas: [1] });
  });

  it("folha finalizada: só mostra, não deixa mudar", async () => {
    servidorFalso({
      "GET /laudos-nomes/recebimento-fcoj/3": () => ({
        status: 200,
        corpo: { ...FOLHA, laudo: "recebimento-fcoj", pagina_id: 3, por: "folha", pode_mudar: false, escolhas: [{ dia: null, pessoas: [1], sugeridas: [] }] },
      }),
    });
    render(<NomesNoLaudo laudo="recebimento-fcoj" paginaId={3} />);
    expect(await screen.findByText("Folha inteira")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Ana Souza/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ana Souza/ })).toBeDisabled();
  });
});
