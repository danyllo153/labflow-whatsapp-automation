import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { servidorFalso } from "../testes-servidor";
import EquipeDoTurno from "./EquipeDoTurno";

/** Adicionar os colegas no turno pelo mesmo PC (27/11). Nomes fictícios. */
const SO_EU = {
  turno: "Manhã",
  dia: "2026-10-22",
  no_turno: 1,
  pessoas: [{ usuario_id: 1, nome: "Ana Souza", entrada: "09:00", saida: null, sou_eu: true }],
  pode_colocar: true,
  disponiveis: [{ usuario_id: 2, nome: "Bruno Lima" }],
};

const COM_BRUNO = {
  ...SO_EU,
  no_turno: 2,
  pessoas: [...SO_EU.pessoas, { usuario_id: 2, nome: "Bruno Lima", entrada: "09:30", saida: null, sou_eu: false }],
  disponiveis: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("Adicionar ao turno", () => {
  it("adiciona um colega e mostra o botão para tirá-lo", async () => {
    const pedidos: unknown[] = [];
    servidorFalso({
      "GET /turno/equipe": () => ({ status: 200, corpo: SO_EU }),
      "POST /turno/equipe": (corpo) => {
        pedidos.push(corpo);
        return { status: 200, corpo: COM_BRUNO };
      },
    });
    render(<EquipeDoTurno contarRegistros={false} />);
    await userEvent.selectOptions(await screen.findByLabelText("Adicionar ao turno"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    const equipe = screen.getByRole("region", { name: "Equipe do turno" });
    expect(await within(equipe).findByText("Bruno Lima")).toBeInTheDocument();
    expect(pedidos).toEqual([{ usuario_id: 2 }]);
    expect(within(equipe).getByRole("button", { name: "Tirar Bruno Lima do turno" })).toBeInTheDocument();
    expect(within(equipe).queryByRole("button", { name: /Tirar Ana/ })).not.toBeInTheDocument();
  });

  it("fora do turno não mostra o Adicionar", async () => {
    servidorFalso({ "GET /turno/equipe": () => ({ status: 200, corpo: { ...SO_EU, pode_colocar: false, disponiveis: [] } }) });
    render(<EquipeDoTurno contarRegistros={false} />);
    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(screen.queryByLabelText("Adicionar ao turno")).not.toBeInTheDocument();
  });
});
