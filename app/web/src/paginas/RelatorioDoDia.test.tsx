import { render, screen, waitFor, within } from "@testing-library/react";
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
    expect(await screen.findByRole("heading", { level: 1, name: "Leituras" })).toBeInTheDocument(); // página com abas (27/10); o relatório é a 1ª
    const fcoj = await screen.findByRole("article", { name: "FCOJ — Recebimento" });
    expect(within(fcoj).getByText("3 de 4 lidas")).toBeInTheDocument();
    expect(within(fcoj).getByText("C.T 48h")).toBeInTheDocument();
    expect(within(fcoj).getAllByLabelText("lido")).toHaveLength(1);
    expect(within(fcoj).getByText("C.T 48h ≥ 200 — 77001: lote 6 = 250")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "NFC — Tank farm" })).toHaveTextContent("Amostra normal");
    expect(screen.getByRole("link", { name: "Enviar no WhatsApp" }).getAttribute("href")).toContain(encodeURIComponent("FCOJ — Recebimento"));
    expect(screen.getByRole("link", { name: "Exportar as leituras do dia para o Excel" }).getAttribute("href")).toMatch(/^\/relatorio-do-dia\/excel\?dia=\d{4}-\d{2}-\d{2}$/);
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

describe("Leituras com uma aba por análise (27/10)", () => {
  it("o atalho do Turno abre a aba certa e a leitura dos drops pede Confirmar", async () => {
    const DROPS = {
      pode_registrar: true,
      drops: [
        { drop_id: 7, drop: "D5", origem: "Terra", tanque: "41", navio: null, data_coleta: "2026-10-17", incubado_em: "2026-10-22", ler_em: "2026-10-27", atrasado: false },
        { drop_id: 8, drop: "D10", origem: "Navio", tanque: "2P", navio: "D.STAR 900", data_coleta: "2026-10-12", incubado_em: "2026-10-22", ler_em: "2026-10-27", atrasado: false },
      ],
    };
    const api = servidorFalso({
      "GET /me": () => ({ status: 200, corpo: ANA }),
      "GET /leituras/drops": () => ({ status: 200, corpo: DROPS }),
      "POST /leituras/drops/negativos": () => ({ status: 200, corpo: { ...DROPS, drops: [] } }),
      "GET /leituras/pendentes": () => ({ status: 200, corpo: { leituras: [{ grupo: "Drops", detalhe: "", itens: [{ rotulo: "Drop D5", quantidade: 2, unidade: "tanques", atrasadas: 1, caminho: "/leituras?aba=drops" }] }], analises: [] } }),
    });
    render(
      <MemoryRouter initialEntries={["/leituras?aba=drops"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </MemoryRouter>,
    );
    const cartao = await screen.findByRole("region", { name: "Leitura dos drops" });
    expect(screen.getByRole("button", { name: /^Drops/ })).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(screen.getByRole("button", { name: /^Drops/ })).toHaveTextContent("Drops2")); // para hoje e atrasadas (01/11)
    await userEvent.click(within(cartao).getByRole("checkbox", { name: /D10/ }));
    await userEvent.click(within(cartao).getByRole("button", { name: "Todos negativos (1)" }));
    expect(within(cartao).getByRole("group", { name: "O que vai ser gravado" })).toHaveTextContent("Negativo em 1 drop: D5 do tanque 41 (coleta 17/10)");
    expect(api.vezes("POST /leituras/drops/negativos")).toBe(0);
    await userEvent.click(within(cartao).getByRole("button", { name: "Confirmar" }));
    expect(api.chamadas.find((c) => c.rota === "POST /leituras/drops/negativos")?.corpo).toEqual({ drop_ids: [7] });
  });

  it("toda aba de leitura mostra o número quando chega o dia de ler, não só os atrasados (01/11)", async () => {
    const grupos = ["Recebimento concentrado", "Embarque FCOJ", "Recebimento NFC", "Tanques terra", "O.SKY 189", "Drops", "Água do processo",
      "CIP linha de embarque", "CIP baia", "TAB", "Coliformes", "Água de consumo"];
    const abas = ["Recebimento concentrado", "Embarque FCOJ", "Recebimento NFC", "Tanques terra", "Tanques navio", "Drops", "Água do processo",
      "CIP linha de embarque", "CIP baia", "TAB", "Coliformes", "Água de consumo"];
    servidorFalso({
      "GET /me": () => ({ status: 200, corpo: ANA }),
      "GET /relatorio-do-dia": () => ({ status: 200, corpo: REL }),
      "GET /pendencias-hoje": () => ({ status: 200, corpo: { itens: [], vence_hoje: 0, atrasados: 0 } }),
      "GET /analises/desvios": () => ({ status: 200, corpo: { para_abrir: [], abertos: [], dia_finalizado: false } }),
      "GET /leituras/pendentes": () => ({
        status: 200,
        corpo: { leituras: grupos.map((g) => ({ grupo: g, detalhe: "", itens: [{ rotulo: "x", quantidade: 3, unidade: "placas", atrasadas: 0, caminho: "/leituras" }] })), analises: [] },
      }),
    });
    render(
      <MemoryRouter initialEntries={["/leituras"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </MemoryRouter>,
    );
    const nav = await screen.findByRole("navigation", { name: "Partes de Leituras" });
    await waitFor(() => expect(within(nav).getByRole("button", { name: /^Coliformes/ })).toHaveTextContent("Coliformes3"));
    for (const aba of abas) expect(within(nav).getByRole("button", { name: new RegExp(`^${aba}`) })).toHaveTextContent(`${aba}3`);
  });

  it("o endereço antigo do relatório do dia leva a Leituras", async () => {
    servidorFalso({ "GET /me": () => ({ status: 200, corpo: ANA }) });
    render(
      <MemoryRouter initialEntries={["/relatorio-do-dia"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Leituras" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Relatório do dia" })).toHaveAttribute("aria-current", "page");
  });
});
