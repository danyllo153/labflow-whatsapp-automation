import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, ESTADO_TURNO, servidorFalso } from "../testes-servidor";

const NA_TARDE = {
  id: 41,
  turno_id: 2,
  turno: "Tarde",
  dia: "2026-10-22",
  entrada: "16:00",
  saida: null,
  entrada_registrada: "16:00",
  saida_registrada: null,
  motivo_correcao: null,
};

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
  it("sugere o turno pelo horário e entra com a hora do clique (sem digitar)", async () => {
    let estado: any = ESTADO_TURNO;
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: estado }),
      "POST /turno/entrar": () => {
        estado = { ...ESTADO_TURNO, no_turno: { ...NA_TARDE, entrada: "16:07", entrada_registrada: "16:07" } };
        return { status: 200, corpo: estado.no_turno };
      },
    });
    expect(await screen.findByRole("radio", { name: /Tarde.*sugerido pelo horário/ })).toBeChecked();
    expect(screen.queryByLabelText("Sua entrada")).not.toBeInTheDocument();
    expect(screen.getByText(/hora do toque no botão/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Madrugada/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Tarde/ }));
    await userEvent.click(screen.getByRole("button", { name: "Entrar no turno Tarde" }));

    expect(api.chamadas.find((c) => c.rota === "POST /turno/entrar")?.corpo).toEqual({ turno_id: 2 });
    expect(await screen.findByRole("heading", { name: "Você está no turno Tarde de 22/10" })).toBeInTheDocument();
    expect(screen.getByText("16:07")).toBeInTheDocument();
  });

  it("Sair do turno pede confirmação e registra a hora do clique", async () => {
    let estado: any = { ...ESTADO_TURNO, no_turno: NA_TARDE };
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: estado }),
      "POST /turno/sair": () => {
        estado = { ...ESTADO_TURNO, recentes: [{ ...NA_TARDE, saida: "23:30", saida_registrada: "23:30" }] };
        return { status: 200, corpo: estado.recentes[0] };
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sair do turno" }));
    const confirmar = screen.getByRole("form", { name: "Confirmar a saída" });
    expect(confirmar).toHaveTextContent(/agora, às \d\d:\d\d/);
    expect(within(confirmar).queryByLabelText("Saída")).not.toBeInTheDocument();
    expect(api.vezes("POST /turno/sair")).toBe(0);
    await userEvent.click(within(confirmar).getByRole("button", { name: "Confirmar saída" }));

    expect(api.chamadas.find((c) => c.rota === "POST /turno/sair")?.corpo).toEqual({});
    expect(await screen.findByText("Tarde de 22/10")).toBeInTheDocument();
    expect(screen.getByText(/16:00 às 23:30/)).toBeInTheDocument();
  });

  it("corrigir o horário pede motivo e mostra o que foi marcado no app", async () => {
    const passado = { ...NA_TARDE, saida: "00:00", saida_registrada: "00:00" };
    let recentes: any[] = [passado];
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, recentes } }),
      "PUT /turno/entradas/41": (corpo) => {
        recentes = [{ ...passado, entrada: corpo.entrada, motivo_correcao: corpo.motivo }];
        return { status: 200, corpo: recentes[0] };
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Corrigir o horário de Tarde de 22/10" }));
    const form = screen.getByRole("form", { name: "Corrigir Tarde de 22/10" });
    const entrada = within(form).getByLabelText("Entrada");
    await userEvent.clear(entrada);
    await userEvent.type(entrada, "15:00");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar correção" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Escreva o motivo");
    expect(api.vezes("PUT /turno/entradas/41")).toBe(0);

    await userEvent.type(within(form).getByLabelText("Motivo da correção"), "Escala das 15h, esqueci de marcar");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar correção" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /turno/entradas/41")?.corpo).toEqual({
      entrada: "15:00",
      saida: "00:00",
      motivo: "Escala das 15h, esqueci de marcar",
    });
    expect(await screen.findByText(/Corrigido \(marcado no app: 16:00 às 00:00\)\. Motivo: Escala das 15h/)).toBeInTheDocument();
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
    expect(await screen.findByRole("listitem", { name: /7\s*Feito no turno/ })).toHaveAttribute("href", "/turno");
    expect(screen.getByRole("link", { name: "Entrar no turno" })).toHaveAttribute("href", "/turno");
  });

  it("sem aviso para quem já está no turno", async () => {
    abrir("/", { "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, no_turno: NA_TARDE } }) });
    await screen.findByRole("listitem", { name: /Feito no turno/ });
    expect(screen.queryByRole("link", { name: "Entrar no turno" })).not.toBeInTheDocument();
  });

  it("o Início funciona mesmo se o turno falhar", async () => {
    abrir("/", { "GET /turno": () => ({ status: 500, corpo: { detail: "erro" } }) });
    expect(await screen.findByRole("listitem", { name: /Para analisar/ })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: /Feito no turno/ })).not.toBeInTheDocument();
  });
});

describe("Check-in: o resto do app só abre depois da entrada (APP-022b)", () => {
  const TRAVADO = { ...ESTADO_TURNO, checkin_obrigatorio: true };

  it("sem entrada, qualquer tela mostra o Turno com o aviso", async () => {
    abrir("/paginas", { "GET /turno": () => ({ status: 200, corpo: TRAVADO }) });
    expect(await screen.findByRole("heading", { level: 1, name: "Turno" })).toBeInTheDocument();
    expect(screen.getByText("Marque a sua entrada no turno para abrir o resto do app.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Análises" })).not.toBeInTheDocument();
  });

  it("depois de entrar, abre o app", async () => {
    let estado: any = TRAVADO;
    abrir("/", {
      "GET /turno": () => ({ status: 200, corpo: estado }),
      "POST /turno/entrar": () => {
        estado = { ...TRAVADO, no_turno: NA_TARDE };
        return { status: 200, corpo: NA_TARDE };
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Entrar no turno Tarde" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Início" })).toBeInTheDocument();
  });

  it("Minha conta continua aberta (para sair ou trocar a senha)", async () => {
    abrir("/conta", { "GET /turno": () => ({ status: 200, corpo: TRAVADO }) });
    expect(await screen.findByRole("heading", { level: 1, name: /conta/i })).toBeInTheDocument();
  });

  it("quem não precisa de check-in usa o app direto", async () => {
    abrir("/paginas");
    expect(await screen.findByRole("heading", { level: 1, name: "Análises" })).toBeInTheDocument();
  });
});
