import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";

const PAINEL = {
  atrasados: 2,
  para_hoje: 1,
  nao_ok_semana: 1,
  hoje: [
    { analise: "C.T 48h", situacao: "Atrasado", n: 2, loads: "L 98704 (1-2)" },
    { analise: "B.L 72h", situacao: "Para hoje", n: 1, loads: "L 98705 (3)" },
  ],
  fabricas: [{ fabrica: "COL", nao_ok: 1, lidos: 12 }],
  pode_registrar: true,
};

const leitura = (resultado: string | null, prevista = "2026-01-03", nao_ok = false) => ({ resultado, nao_ok, prevista });
const LOTES = [
  { id: 11, load: "98704", item: "99902", fabrica: "COL", lote: 1, recebido_em: "2026-01-01", ct: leitura(null), bl72: leitura(null, "2026-01-04"), bl120: leitura(null, "2026-01-06"), situacao: "Atrasado" },
  { id: 12, load: "98704", item: "99902", fabrica: "COL", lote: 2, recebido_em: "2026-01-01", ct: leitura(null), bl72: leitura(null, "2026-01-04"), bl120: leitura(null, "2026-01-06"), situacao: "Atrasado" },
];
const RESULTADOS = "GET /analises/recebimento-fcoj/resultados?busca=&fabrica=&dias=30";

function abrir(caminho: string, rotas: Parameters<typeof servidorFalso>[0] = {}, pessoa = ANA) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: pessoa }),
    "GET /analises/recebimento-fcoj/painel": () => ({ status: 200, corpo: PAINEL }),
    [RESULTADOS]: () => ({ status: 200, corpo: { lotes: LOTES, total: 2 } }),
    [`${RESULTADOS}&so_pendentes=true`]: () => ({ status: 200, corpo: { lotes: LOTES, total: 2 } }),
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

describe("Páginas como apps (Fase E, E1)", () => {
  it("cada análise é um app com o estado do dia, e a busca filtra pelo nome", async () => {
    abrir("/paginas", {
      "GET /pendencias-hoje": () => ({
        status: 200,
        corpo: {
          vence_hoje: 1, atrasados: 2, desvios_abertos: 0,
          itens: [
            { bloco: "FCOJ Recebimento", tipo: "C.T/B.L", situacao: "Atrasado" },
            { bloco: "FCOJ Recebimento", tipo: "C.T/B.L", situacao: "Atrasado" },
            { bloco: "Águas e superfícies", tipo: "Baia", situacao: "Vence hoje" },
          ],
        },
      }),
    });
    const recebimento = await screen.findByRole("link", { name: /^Recebimento FCOJ/ });
    expect(recebimento).toHaveAttribute("href", "/analises/recebimento-fcoj");
    expect(await within(recebimento).findByText("2 atrasados")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /^Baias/ })).getByText("1 para hoje")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /^Linhas/ })).getByText("Em dia")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox", { name: "Procurar análise" }), "água");
    expect(screen.getByRole("link", { name: /^Água do processo/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Recebimento FCOJ/ })).toBeNull();
  });
});

describe("Recebimento FCOJ como app (Fase E, E2)", () => {
  it("o painel mostra atrasados, o que fazer agora e o não ok por fábrica", async () => {
    abrir("/analises/recebimento-fcoj");
    expect(await screen.findByRole("heading", { level: 1, name: "Recebimento FCOJ" })).toBeInTheDocument();
    expect(await screen.findByText("L 98704 (1-2)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2\s*Atrasados/ })).toBeInTheDocument();
    expect(screen.getByText("1 de 12")).toBeInTheDocument();
    const abas = screen.getByRole("navigation", { name: "Partes do Recebimento FCOJ" });
    expect(within(abas).getAllByRole("button").map((b) => b.textContent?.replace(/\d+$/, ""))).toEqual([
      "Painel", "Registrar", "Resultados", "Laudo", "Instrução", "Vídeo",
    ]);
  });

  it("registrar mostra a prévia do banco e só grava no Confirmar", async () => {
    const api = abrir("/analises/recebimento-fcoj?aba=registrar", {
      "POST /analises/recebimento-fcoj/registrar": (corpo) => ({
        status: 200,
        corpo: { ok: true, previa: corpo.previa, texto: "Load 98701 novo (item 99902, fábrica AQA): lotes 1-3 (3), recebidos em 24/10/2026.", gravados: corpo.previa ? 0 : 3, alarmes: 0 },
      }),
    });
    const form = await screen.findByRole("form", { name: "Registrar recebimento" });
    await userEvent.type(within(form).getByLabelText("Load"), "98701");
    await userEvent.type(within(form).getByLabelText("Item"), "99902");
    await userEvent.selectOptions(within(form).getByLabelText("Fábrica"), "AQA");
    await userEvent.type(within(form).getByLabelText("Lotes"), "1-3");
    await userEvent.click(within(form).getByRole("button", { name: "Ver o que vai ser criado" }));
    expect(await within(form).findByText(/Load 98701 novo/)).toBeInTheDocument();
    expect(api.chamadas.filter((c) => c.rota.startsWith("POST")).map((c) => c.corpo.previa)).toEqual([true]);

    await userEvent.click(within(form).getByRole("button", { name: "Confirmar" }));
    expect(await within(form).findByText(/^Registrado\./)).toBeInTheDocument();
    const enviado = api.chamadas.filter((c) => c.rota.startsWith("POST")).slice(-1)[0]?.corpo;
    expect(enviado).toMatchObject({ load: "98701", item: "99902", fabrica: "AQA", lotes: "1-3", previa: false });
  });

  it("resultados: <1 em todos os vazios, prévia com o alarme e Confirmar", async () => {
    const api = abrir("/analises/recebimento-fcoj?aba=resultados&analise=CT", {
      "POST /analises/recebimento-fcoj/lancar": (corpo) => ({
        status: 200,
        corpo: { ok: true, previa: corpo.previa, texto: "C.T 48h:\nload 98704 lote 1 = <1\nload 98704 lote 2 = 210\n🚨 Acima do limite", gravados: corpo.previa ? 0 : 2, alarmes: 1 },
      }),
    });
    expect(await screen.findByRole("textbox", { name: "C.T 48h do load 98704 lote 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "<1 em todos os vazios (2)" }));
    const lote2 = screen.getByRole("textbox", { name: "C.T 48h do load 98704 lote 2" });
    await userEvent.clear(lote2);
    await userEvent.type(lote2, "210");
    await userEvent.click(screen.getByRole("button", { name: "Ver o que vai ser gravado (2)" }));
    expect(await screen.findByText(/Acima do limite/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("2 resultados de C.T 48h gravados.")).toBeInTheDocument();
    const lancados = api.chamadas.filter((c) => c.rota === "POST /analises/recebimento-fcoj/lancar").map((c) => c.corpo);
    expect(lancados).toEqual([
      { analise: "CT", previa: true, itens: [{ recebimento_lote_id: 11, resultado: "<1" }, { recebimento_lote_id: 12, resultado: "210" }] },
      { analise: "CT", previa: false, itens: [{ recebimento_lote_id: 11, resultado: "<1" }, { recebimento_lote_id: 12, resultado: "210" }] },
    ]);
  });

  it("o Coletor vê os resultados, mas não lança nem registra", async () => {
    abrir("/analises/recebimento-fcoj?aba=resultados", {
      "GET /analises/recebimento-fcoj/painel": () => ({ status: 200, corpo: { ...PAINEL, pode_registrar: false } }),
    }, { ...ANA, cargo: "Coletor" });
    expect(await screen.findAllByText("98704", { exact: false })).not.toHaveLength(0);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /em todos/ })).toBeNull();
  });
});
