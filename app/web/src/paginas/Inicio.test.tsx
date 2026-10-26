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

  it("agrupa por bloco e, dentro dele, mostra o número de cada grupo; tocar abre a lista (24/10)", async () => {
    abrir();
    const u = userEvent.setup();
    const blocos = await screen.findAllByRole("heading", { level: 2 });
    expect(blocos.map((h) => h.textContent)).toEqual(["FCOJ Recebimento 2", "NFC Tank farm 1", "Desvios 1"]);
    const recebimento = blocos[0].closest(".cartao") as HTMLElement;
    const grupo = within(recebimento).getByRole("button", { name: /^2\s*C\.T\/B\.L · B\.L 72h/ });
    expect(grupo).toHaveTextContent("1 atrasado");
    expect(grupo).toHaveTextContent("1 para hoje");
    expect(within(recebimento).queryByText("Load 90008 · lote 4")).not.toBeInTheDocument(); // fechado: só o número
    await u.click(grupo);
    expect(grupo).toHaveAttribute("aria-expanded", "true");
    expect(within(recebimento).getByText("Load 90008 · lote 4")).toBeInTheDocument();
    expect(within(recebimento).getByText("20/10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop · D5/ })).toBeInTheDocument();
  });

  it("usa o grupo e o item que vêm da API (navio com os tanques dentro)", async () => {
    const navio = (tanque: string): Pendencia => ({
      ...item("NFC Navio", `O.SKY 189 · tanque ${tanque} (coleta 13/10)`, "Vence hoje", "Psicrotróficos Normal · Leitura final", "Leitura de NFC"),
      grupo: "O.SKY 189 · Psicrotróficos Normal · Leitura final",
      item: `tanque ${tanque} (coleta 13/10)`,
    });
    abrir({ vence_hoje: 2, atrasados: 0, desvios_abertos: 0, itens: [navio("1C"), navio("2P")] });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /^2\s*O\.SKY 189 · Psicrotróficos Normal · Leitura final/ }));
    expect(screen.getByText("tanque 1C (coleta 13/10)")).toBeInTheDocument();
    expect(screen.getByText("tanque 2P (coleta 13/10)")).toBeInTheDocument();
  });

  it("tocar num cartão filtra a lista; tocar de novo volta a mostrar tudo", async () => {
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: /Atrasados/ }));
    expect(screen.getByRole("button", { name: /Atrasados/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^1\s*C\.T\/B\.L · B\.L 72h/ })).toHaveTextContent("1 atrasado");
    expect(screen.queryByRole("button", { name: /Drop · D5/ })).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: /Desvios abertos/ }));
    const blocos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
    expect(blocos.filter((t) => !t.startsWith("Para fazer agora"))).toEqual(["Desvios 1"]);

    await u.click(screen.getByRole("button", { name: /Desvios abertos/ }));
    expect(screen.getByRole("button", { name: /^2\s*C\.T\/B\.L · B\.L 72h/ })).toBeInTheDocument();
  });

  it("muitos itens iguais viram um grupo com o número", async () => {
    const muitos = Array.from({ length: 12 }, (_, n) => item("FCOJ Embarque", `Navio X · lote ${n + 1}`, "Atrasado", "TAB · para espalhar", "TAB"));
    abrir({ vence_hoje: 0, atrasados: 12, desvios_abertos: 0, itens: muitos });
    const u = userEvent.setup();
    const grupo = await screen.findByRole("button", { name: /^12\s*TAB · para espalhar/ });
    expect(screen.queryByText("Navio X · lote 1")).not.toBeInTheDocument();
    await u.click(grupo);
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
    expect(await screen.findByRole("button", { name: /C\.T\/B\.L · B\.L 72h/ })).toBeInTheDocument();
  });

  it("atualiza sozinho a cada minuto", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = abrir();
    await screen.findByRole("button", { name: /C\.T\/B\.L · B\.L 72h/ });
    const antes = api.vezes("GET /pendencias-hoje"); // o Início e o número de atrasados do menu lateral
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.vezes("GET /pendencias-hoje")).toBe(antes + 1); // só o Início recarrega a cada minuto
  });
});
