import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { Relatorio } from "./RelatorioDoDia";

const REL: Relatorio = {
  dia: "2026-10-25",
  hoje: "2026-10-25",
  completo: false,
  lidos: 3,
  total: 5,
  alertas: 1,
  finalizado_por: null,
  finalizado_as: null,
  texto: "📋 *Relatório do dia 25/10/2026*\n\n*FCOJ — Recebimento*\nC.T 48h: 77001 (4-5 ✅, 6 🚨, 7)",
  blocos: [
    {
      titulo: "FCOJ — Recebimento",
      lidos: 3,
      total: 4,
      alertas: ["🚨 C.T 48h ≥ 200 — 77001: lote 6 = 250"],
      secoes: [{ titulo: "", linhas: [{ rotulo: "C.T 48h", entradas: [{ texto: "77001 (4-5 ✅, 6 🚨, 7)", alarme: true }], lidos: 3, total: 4, situacao: null }] }],
    },
    {
      titulo: "NFC — Tank farm",
      lidos: 0,
      total: 1,
      alertas: [],
      secoes: [{ titulo: "AMOSTRA NORMAL", linhas: [{ rotulo: "B.L 72h", entradas: [{ texto: "42", alarme: false }], lidos: 0, total: 1, situacao: null }] }],
    },
  ],
};

function abrir() {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: ANA }),
    "GET /relatorio-do-dia": () => ({ status: 200, corpo: REL }),
    "GET /relatorio-do-dia?completo=true": () => ({ status: 200, corpo: { ...REL, completo: true } }),
    "GET /relatorio-do-dia?dia=2026-10-24&completo=true": () => ({ status: 200, corpo: { ...REL, dia: "2026-10-24", completo: true } }),
    "GET /pendencias-hoje": () => ({ status: 200, corpo: { itens: [], vence_hoje: 2, atrasados: 0 } }),
    "GET /analises/desvios": () => ({ status: 200, corpo: { para_abrir: [], abertos: [], dia_finalizado: false } }),
  });
  render(
    <MemoryRouter initialEntries={["/relatorio-do-dia"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Leituras do dia (relatório do dia como o do bot)", () => {
  it("mostra os blocos, as linhas com lido e alarme, e os alertas, sem emoji na tela", async () => {
    abrir();
    expect(await screen.findByRole("heading", { level: 1, name: "Leituras do dia" })).toBeInTheDocument();
    const fcoj = await screen.findByRole("article", { name: "FCOJ — Recebimento" });
    expect(within(fcoj).getByText("3 de 4 lidas")).toBeInTheDocument();
    expect(within(fcoj).getByText("C.T 48h")).toBeInTheDocument();
    expect(within(fcoj).getAllByLabelText("lido")).toHaveLength(1);
    expect(within(fcoj).getByText("C.T 48h ≥ 200 — 77001: lote 6 = 250")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "NFC — Tank farm" })).toHaveTextContent("Amostra normal");
    expect(screen.getByRole("link", { name: "Enviar no WhatsApp" }).getAttribute("href")).toContain(encodeURIComponent("FCOJ — Recebimento"));
    expect(document.querySelector(".relatorio-do-dia")?.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("Só o lido pede o relatório completo e outro dia pede aquele dia", async () => {
    const api = abrir();
    await screen.findByRole("article", { name: "FCOJ — Recebimento" });
    await userEvent.click(screen.getByRole("button", { name: "Só o lido (completo)" }));
    await userEvent.click(screen.getByRole("button", { name: "24/10" }));
    expect(api.vezes("GET /relatorio-do-dia?completo=true")).toBe(1);
    expect(api.vezes("GET /relatorio-do-dia?dia=2026-10-24&completo=true")).toBe(1);
  });

  it("está na barra do celular", async () => {
    abrir();
    const barra = await screen.findByRole("navigation", { name: "Menu do celular" });
    expect(within(barra).getByRole("link", { name: "Leituras" })).toBeInTheDocument();
  });
});
