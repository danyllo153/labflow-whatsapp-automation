import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { DiaDoMaterial } from "./MaterialAsseptico";

const VAZIO: DiaDoMaterial = {
  dia: "2026-10-22",
  pode_preencher: true,
  registro: null,
  sugestao: { ponteiras: "A954, A959", agua_diluicao: "A953", placas: "P26073, G9093", meios: "A964" },
  recentes: ["2026-10-21"],
};

function abrir(rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo: "Analista" } }),
    "GET /material-asseptico": () => ({ status: 200, corpo: VAZIO }),
    ...rotas,
  });
  render(
    <MemoryRouter initialEntries={["/material-asseptico"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Material asséptico (APP-041)", () => {
  it("traz a sugestão preenchida, com o resultado pendente, marca <1 em todos e salva no nome de quem gravou", async () => {
    const api = abrir({
      "PUT /material-asseptico/2026-10-22": (corpo) => ({
        status: 200,
        corpo: { ...VAZIO, registro: { ...corpo, quem: "Ana Souza", quando: "22/10 09:10" }, recentes: ["2026-10-22", "2026-10-21"] },
      }),
    });
    const form = await screen.findByRole("form", { name: "Material do dia" });
    expect(within(form).getByLabelText("Ponteira / pipeta")).toHaveValue("A954, A959");
    expect(within(form).getByLabelText("Placa de Petri")).toHaveValue("P26073, G9093");
    expect(within(form).getByLabelText("C.T. (UFC/ml)")).toHaveValue(""); // pendente até ler as placas
    expect(within(form).getByText(/o app sugeriu o que estava em uso/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "<1 em todos" }));
    expect(within(form).getByLabelText("B.L. (UFC/ml)")).toHaveValue("<1");

    const meio = within(form).getByLabelText("Meio de cultura");
    await userEvent.clear(meio);
    await userEvent.type(meio, "A964, A969");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar o dia" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /material-asseptico/2026-10-22")?.corpo).toEqual({
      ponteiras: "A954, A959", agua_diluicao: "A953", placas: "P26073, G9093", meios: "A964, A969", ct: "<1", bl: "<1",
    });
    expect(await within(form).findByText(/Preenchido por Ana Souza em 22\/10 09:10/)).toBeInTheDocument();
  });

  it("exclui o dia com o motivo", async () => {
    const PREENCHIDO = { ...VAZIO, registro: { ...VAZIO.sugestao, ct: null, bl: null, quem: "Ana Souza", quando: "22/10 09:10" } };
    const api = abrir({
      "GET /material-asseptico": () => ({ status: 200, corpo: PREENCHIDO }),
      "POST /material-asseptico/2026-10-22/excluir": () => ({ status: 200, corpo: VAZIO }),
    });
    const form = await screen.findByRole("form", { name: "Material do dia" });
    expect(within(form).getByText("Resultado pendente")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Excluir o dia" }));
    const grupo = within(form).getByRole("group", { name: "Excluir o dia 22/10" });
    await userEvent.type(within(grupo).getByLabelText("Motivo (opcional)"), "dia errado");
    await userEvent.click(within(grupo).getByRole("button", { name: "Excluir" }));
    expect(api.chamadas.find((c) => c.rota === "POST /material-asseptico/2026-10-22/excluir")?.corpo).toEqual({ motivo: "dia errado" });
  });

  it("escolher outro dia busca aquele dia", async () => {
    const api = abrir({
      "GET /material-asseptico?dia=2026-10-21": () => ({
        status: 200,
        corpo: { ...VAZIO, dia: "2026-10-21", registro: { ...VAZIO.sugestao, ct: "<1", bl: "<1", quem: "Bruno Lima", quando: "21/10 08:00" } },
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "21/10 ✓" }));
    expect(await screen.findByText(/Preenchido por Bruno Lima/)).toBeInTheDocument();
    expect(api.vezes("GET /material-asseptico?dia=2026-10-21")).toBe(1);
  });

  it("quem não preenche vê os campos travados", async () => {
    abrir({ "GET /material-asseptico": () => ({ status: 200, corpo: { ...VAZIO, pode_preencher: false } }) });
    const form = await screen.findByRole("form", { name: "Material do dia" });
    expect(within(form).getByLabelText("Ponteira / pipeta")).toBeDisabled();
    expect(within(form).queryByRole("button", { name: /Salvar/ })).not.toBeInTheDocument();
  });
});
