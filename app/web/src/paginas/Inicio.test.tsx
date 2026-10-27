import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { tipoDa } from "../componentes/TabelaDePendencias";
import { ProvedorDeSessao } from "../sessao";
import { ANA, ATIVIDADES_VAZIAS, servidorFalso } from "../testes-servidor";
import type { Pendencia } from "./Inicio";

function item(bloco: string, referencia: string, situacao: Pendencia["situacao"], analise = "B.L 72h", tipo = "C.T/B.L"): Pendencia {
  return { bloco, tipo, referencia, analise, prevista: situacao === "Atrasado" ? "2026-10-20" : "2026-10-22", situacao };
}

const ITENS: Pendencia[] = [
  item("FCOJ Recebimento", "Load 90008 · lote 4", "Atrasado"),
  item("FCOJ Recebimento", "Load 90009 · lote 1", "Vence hoje"),
  item("NFC Tank farm", "Tanque 41 (coleta 17/10)", "Vence hoje", "D5", "Drop"),
  item("FCOJ Embarque", "Load 90013 · Composta #8", "Atrasado", "TAB · para espalhar", "TAB"),
  item("Desvios", "Tanque 12", "Atrasado", "D10", "Desvio de drop"),
];

const HERDADAS = {
  ...ATIVIDADES_VAZIAS,
  herdadas: [{ atividade_id: 9, texto: "Calibração", turno: "Madrugada", dia: "2026-10-22", quem: "Bruno Lima" }],
  recados: [{ texto: "Refazer meio X", turno: "Madrugada", dia: "2026-10-22", por: "Bruno Lima" }],
};

const TURNOS = {
  dias: 30,
  turnos: [
    { turno: "Manhã", inicio: "08:00", fim: "16:00", analises: 12.5, esterilizacoes: 2, hoje_analises: 4, hoje_esterilizacoes: 1, agora: true },
    { turno: "Tarde", inicio: "16:00", fim: "00:00", analises: 8, esterilizacoes: 1.5, hoje_analises: 0, hoje_esterilizacoes: 0, agora: false },
    { turno: "Madrugada", inicio: "00:00", fim: "08:00", analises: 3, esterilizacoes: 0, hoje_analises: 2, hoje_esterilizacoes: 0, agora: false },
  ],
};

function abrir(pendencias: unknown = { vence_hoje: 2, atrasados: 3, desvios_abertos: 3, itens: ITENS }, rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: ANA }),
    "GET /pendencias-hoje": () => ({ status: 200, corpo: pendencias }),
    "GET /painel/turnos": () => ({ status: 200, corpo: TURNOS }),
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Início no modelo StarAdmin (26/10)", () => {
  it("separa o que é para analisar do que é para ler; desvio fica de fora das duas", () => {
    expect(ITENS.map(tipoDa)).toEqual(["ler", "ler", "analisar", "analisar", "desvio"]);
    expect(tipoDa(item("NFC Tank farm", "Tanque 5", "Vence hoje", "TAB · para ler", "TAB"))).toBe("ler");
    expect(tipoDa(item("Águas e superfícies", "Coleta 21/10", "Vence hoje", "C.T 48h", "Água do processo"))).toBe("ler");
  });

  it("mostra os números do dia", async () => {
    abrir();
    expect(await screen.findByRole("listitem", { name: /^2\s*Para analisar/ })).toHaveTextContent("1 para hoje");
    expect(screen.getByRole("listitem", { name: /^2\s*Ler hoje/ })).toHaveTextContent("1 atrasadas");
    expect(screen.getByRole("listitem", { name: /^3\s*Atrasados/ })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /^3\s*Desvios abertos/ })).toHaveAttribute("href", "/analises/desvios?aba=abertos");
  });

  it("Para analisar e Ler hoje são tabelas com o grupo, quantos, a situação e o atalho para o app", async () => {
    abrir();
    const analisar = await screen.findByRole("region", { name: "Para analisar agora" });
    const linhas = within(analisar).getAllByRole("row").slice(1);
    expect(linhas.map((l) => within(l).getAllByRole("cell")[0].textContent)).toEqual(["TAB · para espalharFCOJ Embarque", "Drop · D5NFC Tank farm"]);
    expect(within(linhas[0]).getByText("1 atrasado")).toBeInTheDocument();
    expect(within(linhas[0]).getByRole("link", { name: "TAB · para espalhar" })).toHaveAttribute("href", "/analises/tab");

    const ler = screen.getByRole("region", { name: "Ler hoje" });
    const linha = within(ler).getAllByRole("row")[1];
    expect(linha).toHaveTextContent("B.L 72h");
    expect(linha).toHaveTextContent("Load 90008 · lote 4, Load 90009 · lote 1");
    expect(within(linha).getByText("1 atrasado")).toBeInTheDocument();
    expect(within(linha).getByText("1 para hoje")).toBeInTheDocument();
    expect(within(linha).getByRole("link", { name: /^Abrir .*B\.L 72h$/ })).toHaveAttribute("href", "/leituras?aba=recebimento&analise=BL72");
  });

  it("as estufas e as atividades fixas não ficam mais no Início", async () => {
    abrir();
    await screen.findByRole("region", { name: "Para analisar agora" });
    expect(screen.queryByRole("region", { name: "Atividades do turno" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Estufas do turno/)).not.toBeInTheDocument();
  });

  it("do turno anterior: o que ficou sem fazer e os recados, para marcar", async () => {
    const api = abrir(undefined, {
      "GET /turno/atividades": () => ({ status: 200, corpo: HERDADAS }),
      "PUT /turno/atividades/9": () => ({ status: 200, corpo: { ...HERDADAS, herdadas: [] } }),
    });
    const cartao = await screen.findByRole("region", { name: "Do turno anterior" });
    expect(await within(cartao).findByRole("checkbox", { name: /Calibração/ })).not.toBeChecked();
    expect(cartao).toHaveTextContent("Recado do turno Madrugada de 22/10 · Bruno Lima");
    expect(screen.getByRole("listitem", { name: /^2\s*Turno anterior/ })).toBeInTheDocument();
    await userEvent.click(within(cartao).getByRole("checkbox", { name: /Calibração/ }));
    expect(api.chamadas.find((c) => c.rota === "PUT /turno/atividades/9")?.corpo).toEqual({ feito: true });
    await vi.waitFor(() => expect(within(cartao).queryByText("Calibração")).not.toBeInTheDocument());
  });

  it("a média por turno mostra cada turno, o de agora marcado", async () => {
    abrir();
    const cartao = await screen.findByRole("region", { name: "Média por turno" });
    expect(await within(cartao).findByRole("img", { name: /Manhã: média de 12,5 análises e 2 esterilizações/ })).toBeInTheDocument();
    expect(within(cartao).getByText("agora")).toBeInTheDocument();
    expect(cartao).toHaveTextContent("hoje: 2 análises, 0 esterilizações");
  });

  it("as abas mostram a lista toda de cada parte", async () => {
    abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Ler hoje" }));
    expect(screen.getByRole("region", { name: "Ler hoje" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Para analisar agora" })).not.toBeInTheDocument();
    await u.click(screen.getByRole("listitem", { name: /Para analisar/ }));
    expect(screen.getByRole("region", { name: "Para analisar" })).toBeInTheDocument();
  });

  it("sem nada pendente diz isso em português", async () => {
    abrir({ vence_hoje: 0, atrasados: 0, desvios_abertos: 0, itens: [] });
    expect(await screen.findByText("Nada para analisar hoje.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma placa para ler hoje.")).toBeInTheDocument();
  });

  it("erro mostra a mensagem e o botão Tentar de novo", async () => {
    let falhar = true;
    abrir(undefined, {
      "GET /pendencias-hoje": () =>
        falhar ? { status: 500, corpo: { detail: "Erro no servidor." } } : { status: 200, corpo: { vence_hoje: 1, atrasados: 0, desvios_abertos: 0, itens: [ITENS[1]] } },
    });
    const u = userEvent.setup();
    expect(await screen.findByText("Erro no servidor.")).toBeInTheDocument();
    falhar = false;
    await u.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("link", { name: /^Abrir .*B\.L 72h$/ })).toBeInTheDocument();
  });

  it("atualiza sozinho a cada minuto", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = abrir();
    await screen.findByRole("region", { name: "Para analisar agora" });
    const antes = api.vezes("GET /pendencias-hoje"); // o Início e o número de atrasados do menu lateral
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.vezes("GET /pendencias-hoje")).toBe(antes + 1); // só o Início recarrega a cada minuto
  });
});
