import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, ESTADO_TURNO, servidorFalso } from "../testes-servidor";

const NA_TARDE = { id: 41, turno_id: 2, turno: "Tarde", dia: "2026-10-22", entrada: "16:00", saida: null };

function abrir(caminho: string, rotas: Parameters<typeof servidorFalso>[0] = {}, me: unknown = ANA) {
  const api = servidorFalso({ "GET /me": () => ({ status: 200, corpo: me }), ...rotas });
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

describe("Turno: entrar e sair (APP-022)", () => {
  it("sugere o turno pelo horário e entra com o horário padrão", async () => {
    let estado: any = ESTADO_TURNO;
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: estado }),
      "POST /turno/entrar": (corpo) => {
        estado = { ...ESTADO_TURNO, no_turno: { ...NA_TARDE, entrada: corpo.entrada } };
        return { status: 200, corpo: estado.no_turno };
      },
    });
    const tarde = await screen.findByRole("radio", { name: /Tarde.*sugerido pelo horário/ });
    expect(tarde).toBeChecked();
    expect(screen.getByLabelText("Sua entrada")).toHaveValue("16:00");

    await userEvent.click(screen.getByRole("radio", { name: /Madrugada/ }));
    expect(screen.getByLabelText("Sua entrada")).toHaveValue("00:00");
    await userEvent.click(screen.getByRole("radio", { name: /Tarde/ }));
    await userEvent.click(screen.getByRole("button", { name: "Entrar no turno Tarde" }));

    expect(api.chamadas.find((c) => c.rota === "POST /turno/entrar")?.corpo).toEqual({ turno_id: 2, entrada: "16:00" });
    expect(await screen.findByRole("heading", { name: "Você está no turno Tarde de 22/10" })).toBeInTheDocument();
  });

  it("Sair do turno pede confirmação com a hora, que dá para mudar", async () => {
    let estado: any = { ...ESTADO_TURNO, no_turno: NA_TARDE };
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: estado }),
      "POST /turno/sair": (corpo) => {
        estado = { ...ESTADO_TURNO, recentes: [{ ...NA_TARDE, saida: corpo.saida }] };
        return { status: 200, corpo: estado.recentes[0] };
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sair do turno" }));
    const confirmar = screen.getByRole("form", { name: "Confirmar a saída" });
    expect(api.vezes("POST /turno/sair")).toBe(0);
    const saida = within(confirmar).getByLabelText("Saída");
    await userEvent.clear(saida);
    await userEvent.type(saida, "23:30");
    await userEvent.click(within(confirmar).getByRole("button", { name: "Confirmar saída" }));

    expect(api.chamadas.find((c) => c.rota === "POST /turno/sair")?.corpo).toEqual({ saida: "23:30" });
    expect(await screen.findByText("Tarde de 22/10")).toBeInTheDocument();
    expect(screen.getByText(/16:00 às 23:30/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar no turno/ })).toBeInTheDocument();
  });

  it("corrige o horário de um turno passado", async () => {
    const passado = { ...NA_TARDE, saida: "00:00" };
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, recentes: [passado] } }),
      "PUT /turno/entradas/41": () => ({ status: 200, corpo: { ...passado, entrada: "15:00" } }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Corrigir o horário de Tarde de 22/10" }));
    const form = screen.getByRole("form", { name: "Corrigir Tarde de 22/10" });
    const entrada = within(form).getByLabelText("Entrada");
    await userEvent.clear(entrada);
    await userEvent.type(entrada, "15:00");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /turno/entradas/41")?.corpo).toEqual({ entrada: "15:00", saida: "00:00" });
  });

  it("mostra o erro da API (já está em outro turno)", async () => {
    abrir("/turno", {
      "POST /turno/entrar": () => ({ status: 409, corpo: { detail: "Você ainda está no turno Manhã de 22/10. Toque em Sair do turno antes." } }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Entrar no turno Tarde" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Manhã de 22/10");
  });

  it("Consultor não entra em turno", async () => {
    abrir("/turno", { "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, pode_entrar: false } }) }, { ...ANA, cargo: "Consultor" });
    expect(await screen.findByText(/não entra em turno/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Entrar no turno/ })).not.toBeInTheDocument();
  });

  it("mostra o que foi feito no turno", async () => {
    abrir("/turno");
    const feito = await screen.findByRole("generic", { name: "Feito no turno" });
    expect(within(feito).getByRole("heading")).toHaveTextContent("Feito no turno Tarde de 22/10 7");
    expect(feito).toHaveTextContent("3 coletas");
    expect(feito).toHaveTextContent("4 leituras de NFC");
  });
});

describe("Início com o turno (APP-022)", () => {
  it("tem o cartão Feito no turno e o aviso para entrar", async () => {
    abrir("/");
    expect(await screen.findByRole("button", { name: /7\s*Feito no turno/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar no turno" })).toHaveAttribute("href", "/turno");
  });

  it("sem aviso para quem já está no turno", async () => {
    abrir("/", { "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, no_turno: NA_TARDE } }) });
    await screen.findByRole("button", { name: /Feito no turno/ });
    expect(screen.queryByRole("link", { name: "Entrar no turno" })).not.toBeInTheDocument();
  });

  it("o Início funciona mesmo se o turno falhar", async () => {
    abrir("/", { "GET /turno": () => ({ status: 500, corpo: { detail: "erro" } }) });
    expect(await screen.findByRole("button", { name: /Para hoje/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Feito no turno/ })).not.toBeInTheDocument();
  });
});
