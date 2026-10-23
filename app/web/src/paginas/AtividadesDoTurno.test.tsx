import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, ATIVIDADES_VAZIAS, servidorFalso } from "../testes-servidor";
import type { DadosAtividades } from "./AtividadesDoTurno";

const BASE: DadosAtividades = {
  ...ATIVIDADES_VAZIAS,
  turno: "Manhã",
  dia: "2026-10-22",
  total: 2,
  atividades: [
    { id: 1, texto: "Leitura de placa", estado: null, quem: null, quando: null },
    { id: 2, texto: "Planilhas", estado: "feito", quem: "Ana Souza", quando: "09:12" },
  ],
  feitas: 1,
  herdadas: [{ atividade_id: 9, texto: "Calibração", turno: "Madrugada", dia: "2026-10-22", quem: "Bruno Lima" }],
  recados: [{ texto: "Refazer meio X", turno: "Madrugada", dia: "2026-10-22", por: "Bruno Lima" }],
} as DadosAtividades;

function abrir(inicial: DadosAtividades = BASE, cargo = "Operador", rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo } }),
    "GET /turno/atividades": () => ({ status: 200, corpo: inicial }),
    ...rotas,
  });
  render(
    <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Início: atividades fixas do turno (APP-023)", () => {
  it("mostra a lista do turno com quem e quando, e quantas estão feitas", async () => {
    abrir();
    const cartao = await screen.findByRole("region", { name: "Atividades do turno" });
    expect(within(cartao).getByRole("heading", { level: 2 })).toHaveTextContent("Para fazer agora · Manhã 1 de 2");
    expect(within(cartao).getByText(/Feito por Ana Souza às 09:12/)).toBeInTheDocument();
    const feito = within(cartao).getByRole("group", { name: "Marcar Planilhas" });
    expect(within(feito).getByRole("button", { name: "Feito" })).toHaveAttribute("aria-pressed", "true");
    expect(within(feito).getByRole("button", { name: "Não feito" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Feito e Não feito gravam pela API; tocar no marcado desmarca", async () => {
    const api = abrir(BASE, "Operador", {
      "PUT /turno/atividades/1": (corpo) => ({
        status: 200,
        corpo: {
          ...BASE,
          atividades: [
            { id: 1, texto: "Leitura de placa", estado: corpo.feito ? "feito" : "nao_feito", quem: "Ana Souza", quando: "10:00" },
            BASE.atividades[1],
          ],
        },
      }),
    });
    const grupo = await screen.findByRole("group", { name: "Marcar Leitura de placa" });
    await userEvent.click(within(grupo).getByRole("button", { name: "Não feito" }));
    expect(api.chamadas.filter((c) => c.rota === "PUT /turno/atividades/1").map((c) => c.corpo)).toEqual([{ feito: false }]);
    expect(await screen.findByText(/Não feito por Ana Souza às 10:00/)).toBeInTheDocument();
    const marcado = screen.getByRole("group", { name: "Marcar Leitura de placa" });
    expect(within(marcado).getByRole("button", { name: "Não feito" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(marcado).getByRole("button", { name: "Não feito" }));
    expect(api.chamadas.filter((c) => c.rota === "PUT /turno/atividades/1").map((c) => c.corpo)).toEqual([{ feito: false }, { feito: null }]);
  });

  it("pendência herdada tem a caixa de Feito e diz de onde veio", async () => {
    const api = abrir(BASE, "Operador", {
      "PUT /turno/atividades/9": () => ({ status: 200, corpo: { ...BASE, herdadas: [], recados: [] } }),
    });
    const herdadas = await screen.findByRole("group", { name: "Pendências herdadas" });
    expect(herdadas).toHaveTextContent("Calibração · não feito no turno Madrugada de 22/10 (Bruno Lima)");
    await userEvent.click(within(herdadas).getByRole("checkbox", { name: /Calibração/ }));
    expect(api.chamadas.find((c) => c.rota === "PUT /turno/atividades/9")?.corpo).toEqual({ feito: true });
    await vi.waitFor(() => expect(screen.queryByRole("group", { name: "Pendências herdadas" })).not.toBeInTheDocument());
  });

  it("recado escrito à mão no turno anterior tem a caixa de Feito e grava pela API", async () => {
    const api = abrir(BASE, "Operador", {
      "PUT /turno/atividades/recados/feito": () => ({ status: 200, corpo: { ...BASE, recados: [] } }),
    });
    const herdadas = await screen.findByRole("group", { name: "Pendências herdadas" });
    expect(herdadas).toHaveTextContent("Refazer meio X · recado do turno Madrugada de 22/10 (Bruno Lima)");
    await userEvent.click(within(herdadas).getByRole("checkbox", { name: /Refazer meio X/ }));
    expect(api.chamadas.find((c) => c.rota === "PUT /turno/atividades/recados/feito")?.corpo).toEqual({ texto: "Refazer meio X" });
    await vi.waitFor(() => expect(screen.queryByText(/Refazer meio X/)).not.toBeInTheDocument());
  });

  it("quem só consulta vê a lista, sem os botões", async () => {
    abrir({ ...BASE, pode_marcar: false }, "Consultor");
    expect(await screen.findByText("Leitura de placa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Feito" })).not.toBeInTheDocument();
    for (const caixa of screen.getAllByRole("checkbox")) expect(caixa).toBeDisabled(); // aparecem, mas só quem registra marca
  });

  it("mostra o erro da API ao gravar", async () => {
    abrir(BASE, "Operador", { "PUT /turno/atividades/1": () => ({ status: 404, corpo: { detail: "Essa atividade não é do seu turno de hoje." } }) });
    const grupo = await screen.findByRole("group", { name: "Marcar Leitura de placa" });
    await userEvent.click(within(grupo).getByRole("button", { name: "Feito" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("não é do seu turno de hoje");
  });
});
