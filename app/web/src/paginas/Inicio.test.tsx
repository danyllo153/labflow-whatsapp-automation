import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { Pendencia } from "./Inicio";

function item(bloco: string, referencia: string, situacao: Pendencia["situacao"], analise = "B.L 72h", tipo = "C.T/B.L"): Pendencia {
  return { bloco, tipo, referencia, analise, prevista: situacao === "Atrasado" ? "2026-10-20" : "2026-10-22", situacao };
}

const ITENS: Pendencia[] = [
  item("FCOJ Recebimento", "Load 90008 · lote 4", "Atrasado"),
  item("FCOJ Recebimento", "Load 90009 · lote 1", "Vence hoje"),
  item("NFC Tank farm", "Tanque 41 (coleta 17/10)", "Vence hoje", "D5", "Drop"),
  item("Desvios", "Tanque 12", "Atrasado", "D10", "Desvio de drop"),
];

function abrir(pendencias: unknown = { vence_hoje: 2, atrasados: 2, desvios_abertos: 3, itens: ITENS }) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: ANA }),
    "GET /pendencias-hoje": () => ({ status: 200, corpo: pendencias }),
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Início: pendências de hoje (APP-014)", () => {
  it("mostra os três cartões com os números da API", async () => {
    abrir();
    expect(await screen.findByRole("button", { name: /2\s*Para hoje/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2\s*Atrasados/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3\s*Desvios abertos/ })).toBeInTheDocument();
  });

  it("agrupa por bloco, na ordem da API, com situação em texto e a data", async () => {
    abrir();
    const blocos = await screen.findAllByRole("heading", { level: 2 });
    expect(blocos.map((h) => h.textContent)).toEqual(["FCOJ Recebimento 2", "NFC Tank farm 1", "Desvios 1"]);
    const recebimento = blocos[0].closest(".cartao") as HTMLElement;
    expect(within(recebimento).getByText("Load 90008 · lote 4")).toBeInTheDocument();
    expect(within(recebimento).getByText("Atrasado")).toBeInTheDocument();
    expect(within(recebimento).getByText("20/10")).toBeInTheDocument();
    expect(screen.getByText("D5 · Drop")).toBeInTheDocument();
  });

  it("tocar num cartão filtra a lista; tocar de novo volta a mostrar tudo", async () => {
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /Atrasados/ }));
    expect(screen.getByRole("button", { name: /Atrasados/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Load 90009 · lote 1")).not.toBeInTheDocument();
    expect(screen.getByText("Load 90008 · lote 4")).toBeInTheDocument();
    expect(screen.getByText("Tanque 12")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: /Desvios abertos/ }));
    const blocos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
    expect(blocos.filter((t) => !t.startsWith("Para fazer agora"))).toEqual(["Desvios 1"]);

    await u.click(screen.getByRole("button", { name: /Desvios abertos/ }));
    expect(screen.getByText("Load 90009 · lote 1")).toBeInTheDocument();
  });

  it("bloco grande mostra 8 e um botão para ver todos", async () => {
    const muitos = Array.from({ length: 12 }, (_, n) => item("FCOJ Embarque", `Navio X · lote ${n + 1}`, "Atrasado"));
    abrir({ vence_hoje: 0, atrasados: 12, desvios_abertos: 0, itens: muitos });
    const u = userEvent.setup();
    await screen.findByText("Navio X · lote 8");
    expect(screen.queryByText("Navio X · lote 9")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Mostrar todos (12)" }));
    expect(screen.getByText("Navio X · lote 12")).toBeInTheDocument();
  });

  it("sem nada pendente diz isso em português", async () => {
    abrir({ vence_hoje: 0, atrasados: 0, desvios_abertos: 0, itens: [] });
    expect(await screen.findByText("Nada vencendo hoje e nada atrasado.")).toBeInTheDocument();
  });

  it("erro mostra a mensagem e o botão Tentar de novo", async () => {
    let falhar = true;
    servidorFalso({
      "GET /me": () => ({ status: 200, corpo: ANA }),
      "GET /pendencias-hoje": () =>
        falhar ? { status: 500, corpo: { detail: "Erro no servidor." } } : { status: 200, corpo: { vence_hoje: 1, atrasados: 0, desvios_abertos: 0, itens: [ITENS[1]] } },
    });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </MemoryRouter>,
    );
    const u = userEvent.setup();
    expect(await screen.findByText("Erro no servidor.")).toBeInTheDocument();
    falhar = false;
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Load 90009 · lote 1")).toBeInTheDocument();
  });

  it("atualiza sozinho a cada minuto", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = abrir();
    await screen.findByText("Load 90008 · lote 4");
    expect(api.vezes("GET /pendencias-hoje")).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.vezes("GET /pendencias-hoje")).toBe(2);
  });
});
