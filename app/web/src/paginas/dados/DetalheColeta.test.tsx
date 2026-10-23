import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";
import type { Coleta } from "./DetalheColeta";

const COLETA: Coleta = {
  coleta_id: 41,
  origem: "Terra",
  tanque: "T91",
  navio_id: null,
  navio: null,
  data_coleta: "2026-10-20",
  coletado_por: "Fulano",
  digitado_por: "Ana Souza",
  registrado_em: "2026-10-20T13:00:00+00:00",
  com_analise: false,
  com_drop_concluido: false,
  com_tab: false,
  navios: [],
};

const PODE = ["ver_paginas", "corrigir_registro", "excluir_registro"];

function abrir(coleta: Coleta = COLETA, rotas: Parameters<typeof servidorFalso>[0] = {}, pode = PODE, caminho = "/paginas/coletas/41") {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, pode } }),
    "GET /coletas/41": () => ({ status: 200, corpo: coleta }),
    "GET /paginas/coletas": () => ({ status: 200, corpo: { total: 0, pagina: 1, por_pagina: 50, linhas: [] } }),
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

describe("Coleta: ver, corrigir e excluir (APP-029)", () => {
  it("mostra os dados e o que trava", async () => {
    abrir({ ...COLETA, com_analise: true, com_tab: true });
    expect(await screen.findByRole("heading", { level: 1, name: "Coleta · Tanque T91 · 20/10/2026" })).toBeInTheDocument();
    expect(screen.getByText("Digitado por")).toBeInTheDocument();
    expect(screen.getByText(/Já tem análise, TAB: não dá para excluir/)).toBeInTheDocument();
  });

  it("corrigir mostra o antes → depois e só grava depois de confirmar", async () => {
    const api = abrir(COLETA, {
      "PUT /coletas/41": (corpo) => ({ status: 200, corpo: { ...COLETA, tanque: String(corpo.tanque).toUpperCase(), coletado_por: corpo.coletado_por } }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Corrigir" }));
    const form = screen.getByRole("form", { name: "Corrigir a coleta" });
    await userEvent.click(within(form).getByRole("button", { name: "Revisar a correção" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Nada mudou");
    const tanque = within(form).getByLabelText("Tanque");
    await userEvent.clear(tanque);
    await userEvent.type(tanque, "t92");
    const quem = within(form).getByLabelText("Coletado por");
    await userEvent.clear(quem);
    await userEvent.type(quem, "Beltrano");
    await userEvent.click(within(form).getByRole("button", { name: "Revisar a correção" }));
    const confirmar = within(form).getByRole("group", { name: "Confirmar a correção" });
    expect(confirmar).toHaveTextContent("Tanque: T91 → T92");
    expect(confirmar).toHaveTextContent("Coletado por: Fulano → Beltrano");
    expect(api.vezes("PUT /coletas/41")).toBe(0);
    await userEvent.click(within(confirmar).getByRole("button", { name: "Confirmar a correção" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /coletas/41")?.corpo).toEqual({ tanque: "t92", coletado_por: "Beltrano" });
    expect(await screen.findByText("Coleta corrigida.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tanque T92");
  });

  it("a recusa do banco aparece em português", async () => {
    abrir(COLETA, { "PUT /coletas/41": () => ({ status: 422, corpo: { detail: "Já existe uma coleta desse tanque nessa data." } }) });
    await userEvent.click(await screen.findByRole("button", { name: "Corrigir" }));
    const form = screen.getByRole("form", { name: "Corrigir a coleta" });
    await userEvent.clear(within(form).getByLabelText("Tanque"));
    await userEvent.type(within(form).getByLabelText("Tanque"), "T92");
    await userEvent.click(within(form).getByRole("button", { name: "Revisar a correção" }));
    await userEvent.click(within(form).getByRole("button", { name: "Confirmar a correção" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Já existe uma coleta desse tanque nessa data.");
  });

  it("coleta de navio deixa escolher o navio", async () => {
    const navio: Coleta = { ...COLETA, origem: "Navio", navio_id: 7, navio: "D.STAR 434", navios: [{ id: 7, nome: "D.STAR 434" }, { id: 6, nome: "D.OCEAN 333" }] };
    const api = abrir(navio, { "PUT /coletas/41": () => ({ status: 200, corpo: navio }) });
    await userEvent.click(await screen.findByRole("button", { name: "Corrigir" }));
    const form = screen.getByRole("form", { name: "Corrigir a coleta" });
    await userEvent.selectOptions(within(form).getByLabelText("Navio"), "6");
    await userEvent.click(within(form).getByRole("button", { name: "Revisar a correção" }));
    expect(within(form).getByRole("group", { name: "Confirmar a correção" })).toHaveTextContent("Navio: D.STAR 434 → D.OCEAN 333");
    await userEvent.click(within(form).getByRole("button", { name: "Confirmar a correção" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /coletas/41")?.corpo).toEqual({ navio_id: 6 });
  });

  it("excluir explica que fica guardada, não pede motivo e volta para a lista", async () => {
    const api = abrir(COLETA, { "POST /coletas/41/excluir": () => ({ status: 200, corpo: { coleta_id: 41, avisos: "ok" } }) });
    await userEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    const form = screen.getByRole("form", { name: "Excluir a coleta" });
    expect(form).toHaveTextContent("fica guardada");
    expect(form).toHaveTextContent("Coleta não pede motivo");
    await userEvent.click(within(form).getByRole("button", { name: "Confirmar e excluir" }));
    expect(api.chamadas.find((c) => c.rota === "POST /coletas/41/excluir")?.corpo).toEqual({ motivo: "" });
    expect(await screen.findByRole("heading", { level: 1, name: "Coletas" })).toBeInTheDocument();
  });

  it("a recusa de excluir (já tem análise) aparece na tela", async () => {
    abrir(COLETA, { "POST /coletas/41/excluir": () => ({ status: 422, corpo: { detail: "A coleta já tem análises: exclua primeiro as análises, com motivo." } }) });
    await userEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e excluir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("já tem análises");
  });

  it("quem só consulta vê a coleta sem os botões", async () => {
    abrir(COLETA, {}, ["ver_paginas"]);
    expect(await screen.findByText("Fulano")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Corrigir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });

  it("coleta que não é sua (ou não existe) mostra o aviso", async () => {
    abrir(COLETA, { "GET /coletas/41": () => ({ status: 404, corpo: { detail: "Coleta não encontrada." } }) });
    expect(await screen.findByRole("alert")).toHaveTextContent("Coleta não encontrada.");
  });

  it("a página Coletas leva à coleta pelo tanque", async () => {
    abrir(COLETA, {
      "GET /paginas/coletas?pagina=1&por_pagina=50": () => ({
        status: 200,
        corpo: { total: 1, pagina: 1, por_pagina: 50, linhas: [{ coleta_id: 41, data_coleta: "2026-10-20", tanque: "T91", origem: "Terra", navio: null, coletado_por: "Fulano", digitado_por: "Ana", registrado_em: "2026-10-20T13:00:00+00:00" }] },
      }),
    }, PODE, "/paginas/coletas");
    const link = await screen.findByRole("link", { name: "T91" });
    expect(link).toHaveAttribute("href", "/paginas/coletas/41");
  });
});
