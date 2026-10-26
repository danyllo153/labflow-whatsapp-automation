import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { DadosEstufas, EstufaDoTurno } from "./Estufas";

function estufa(id: number, extra: Partial<EstufaDoTurno> = {}): EstufaDoTurno {
  return {
    id,
    auxiliar: id === 6,
    faixa: id === 6 ? null : { minimo: "35.0", maximo: "37.0" },
    supervisorio: null,
    field_chart: null,
    status: "Pendente",
    diferenca: null,
    ...extra,
  };
}

const BASE: DadosEstufas = {
  turno_id: 1,
  turno: "Manhã",
  dia: "2026-10-22",
  pode_registrar: true,
  resumo: { total: 3, conferidas: 1, nao_ok: 1, pendentes: 2 },
  estufas: [
    estufa(3, {
      status: "Não ok",
      supervisorio: { ok: false, temperatura: "43.8", observacao: "porta aberta", quem: "Ana Souza", quando: "09:10" },
      field_chart: { ok: false, temperatura: "45.0", observacao: null, quem: "Ana Souza", quando: "09:11" },
      diferenca: "1.2",
    }),
    estufa(4),
    estufa(6),
  ],
};

function abrir(caminho = "/turno", dados: DadosEstufas = BASE, rotas: Parameters<typeof servidorFalso>[0] = {}, cargo = "Operador") {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo } }),
    "GET /estufas": () => ({ status: 200, corpo: dados }),
    ...rotas,
  });
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Estufas (APP-027; no Turno desde 26/10)", () => {
  it("mostra o resumo, a faixa, as duas leituras e a diferença", async () => {
    abrir();
    expect(await screen.findByText(/^Turno Manhã de 22\/10:/)).toHaveTextContent("Turno Manhã de 22/10: 1 de 3 conferidas · 1 Não ok.");
    const e3 = screen.getByRole("region", { name: "Estufa 03" });
    expect(e3).toHaveTextContent("35,0 °C a 37,0 °C");
    expect(within(e3).getByRole("group", { name: "Supervisório da Estufa 03" })).toHaveTextContent("43,8 °C");
    expect(within(e3).getByRole("group", { name: "Supervisório da Estufa 03" })).toHaveTextContent("porta aberta");
    expect(e3).toHaveTextContent("Diferença (field chart − supervisório): 1,2 °C");
    expect(screen.getByRole("region", { name: "Estufa 06" })).toHaveTextContent("auxiliar");
    const e4 = within(screen.getByRole("group", { name: "Supervisório da Estufa 04" }));
    expect(e4.getByRole("button", { name: "Ok" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Ok grava na hora, sem pedir número", async () => {
    const api = abrir("/turno", BASE, { "PUT /estufas/4": () => ({ status: 200, corpo: BASE }) });
    const grupo = await screen.findByRole("group", { name: "Supervisório da Estufa 04" });
    await userEvent.click(within(grupo).getByRole("button", { name: "Ok" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /estufas/4")?.corpo).toEqual({ leitura: "Supervisório", ok: true });
  });

  it("Não ok abre a temperatura (obrigatória) e a observação", async () => {
    const api = abrir("/turno", BASE, { "PUT /estufas/4": () => ({ status: 200, corpo: BASE }) });
    const grupo = await screen.findByRole("group", { name: "Field chart da Estufa 04" });
    await userEvent.click(within(grupo).getByRole("button", { name: "Não ok" }));
    const form = screen.getByRole("form", { name: "Não ok: Field chart da Estufa 04" });
    await userEvent.click(within(form).getByRole("button", { name: "Gravar Não ok" }));
    expect(within(grupo).getByRole("alert")).toHaveTextContent("Digite a temperatura");
    expect(api.vezes("PUT /estufas/4")).toBe(0);
    await userEvent.type(within(form).getByLabelText("Temperatura (°C)"), "43,8");
    await userEvent.type(within(form).getByLabelText("Observação (opcional)"), "porta aberta");
    await userEvent.click(within(form).getByRole("button", { name: "Gravar Não ok" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /estufas/4")?.corpo).toEqual({
      leitura: "Field chart",
      ok: false,
      temperatura: 43.8,
      observacao: "porta aberta",
    });
  });

  it("mostra o erro da API", async () => {
    abrir("/turno", BASE, { "PUT /estufas/4": () => ({ status: 422, corpo: { detail: "Não ok pede a temperatura que a leitura está marcando." } }) });
    const grupo = await screen.findByRole("group", { name: "Supervisório da Estufa 04" });
    await userEvent.click(within(grupo).getByRole("button", { name: "Ok" }));
    expect(await within(grupo).findByRole("alert")).toHaveTextContent("Não ok pede a temperatura");
  });

  it("quem só consulta vê as estufas sem os botões", async () => {
    abrir("/turno", { ...BASE, pode_registrar: false }, {}, "Consultor");
    expect(await screen.findByText("O seu cargo vê as estufas, mas não confere.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ok" })).not.toBeInTheDocument();
  });

  it("as estufas ficam só no Turno (26/10): o Início não tem a conferência", async () => {
    abrir("/");
    expect(await screen.findByRole("heading", { name: "Início" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Estufa 04" })).not.toBeInTheDocument();
  });

  it("o endereço antigo /estufas leva ao Turno, com a conferência no cartão Estufas", async () => {
    abrir("/estufas");
    const cartao = await screen.findByRole("region", { name: "Estufas agora" });
    expect(await within(cartao).findByRole("group", { name: "Supervisório da Estufa 04" })).toBeInTheDocument();
  });

  it("Todas as pendentes Ok mostra o que vai gravar e grava só depois do Confirmar", async () => {
    const api = abrir("/turno", BASE, {
      "PUT /estufas/4": () => ({ status: 200, corpo: BASE }),
      "PUT /estufas/6": () => ({ status: 200, corpo: BASE }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Todas as pendentes Ok (4)" }));
    expect(screen.getByRole("group", { name: "Confirmar todas Ok" })).toHaveTextContent("Grava Ok em 4 leituras: Estufa 04, Estufa 06.");
    expect(api.vezes("PUT /estufas/4")).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(api.vezes("PUT /estufas/4")).toBe(2);
    expect(api.vezes("PUT /estufas/6")).toBe(2);
    expect(api.chamadas.find((c) => c.rota === "PUT /estufas/6")?.corpo).toEqual({ leitura: "Supervisório", ok: true });
  });
});
