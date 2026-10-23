import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { DadosEsterilizacao } from "./Esterilizacao";

const BASE: DadosEsterilizacao = {
  turno_id: 1,
  turno: "Manhã",
  dia: "2026-10-22",
  tipos: ["Ponteira", "Meio", "Frasco", "Descarte", "Outro"],
  pode_registrar: true,
  itens: [
    { id: 7, tipo: "Meio", ciclo: "103", meio: "PDA", descricao: null, quem: "Ana Souza", quando: "09:40", corrigida: false, motivo_correcao: null, antes: null },
  ],
};

const G4 = {
  de: "2026-10-17",
  ate: "2026-10-23",
  total: 3,
  barras: ["Manhã", "Tarde", "Madrugada"].flatMap((turno) =>
    ["Ponteira", "Meio", "Frasco", "Descarte", "Outro"].map((tipo) => ({ turno, tipo, total: turno === "Manhã" && tipo === "Ponteira" ? 2 : turno === "Tarde" && tipo === "Meio" ? 1 : 0 })),
  ),
};

function abrir(dados: DadosEsterilizacao = BASE, rotas: Parameters<typeof servidorFalso>[0] = {}, cargo = "Operador") {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo } }),
    "GET /esterilizacao": () => ({ status: 200, corpo: dados }),
    "GET /esterilizacao/grafico": () => ({ status: 200, corpo: G4 }),
    ...rotas,
  });
  render(
    <MemoryRouter initialEntries={["/esterilizacao"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Esterilização (APP-026)", () => {
  it("lista as do turno e mostra os cinco botões", async () => {
    abrir();
    expect(await screen.findByText("Meio (PDA) · ciclo 103")).toBeInTheDocument();
    const tipo = screen.getByRole("group", { name: "Tipo" });
    expect(within(tipo).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ponteira", "Meio", "Frasco", "Descarte", "Outro"]);
    expect(screen.getByRole("heading", { name: /Esterilizações do turno Manhã de 22\/10/ })).toHaveTextContent("1");
  });

  it("registra com tipo e ciclo; o meio só aparece no tipo Meio", async () => {
    const api = abrir(BASE, {
      "POST /esterilizacao": () => ({ status: 201, corpo: { ...BASE, itens: [{ ...BASE.itens[0], id: 8, tipo: "Ponteira", meio: null, ciclo: "102" }, ...BASE.itens] } }),
    });
    const form = await screen.findByRole("form", { name: "Registrar esterilização" });
    expect(within(form).queryByLabelText(/Nome do meio/)).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Meio" }));
    expect(within(form).getByLabelText(/Nome do meio/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Ponteira" }));
    await userEvent.type(within(form).getByLabelText("Número do ciclo"), "102");
    await userEvent.click(within(form).getByRole("button", { name: "Registrar" }));
    expect(api.chamadas.find((c) => c.rota === "POST /esterilizacao")?.corpo).toEqual({ tipo: "Ponteira", ciclo: "102", meio: "", descricao: "" });
    expect(await screen.findByText("Ponteira · ciclo 102")).toBeInTheDocument();
  });

  it("sem escolher o tipo, avisa e não envia", async () => {
    const api = abrir();
    const form = await screen.findByRole("form", { name: "Registrar esterilização" });
    await userEvent.click(within(form).getByRole("button", { name: "Registrar" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Escolha o que foi esterilizado.");
    expect(api.vezes("POST /esterilizacao")).toBe(0);
  });

  it("Outro pede a descrição (erro da API aparece)", async () => {
    abrir(BASE, { "POST /esterilizacao": () => ({ status: 422, corpo: { detail: "Descreva o que foi esterilizado (tipo Outro)." } }) });
    const form = await screen.findByRole("form", { name: "Registrar esterilização" });
    await userEvent.click(within(form).getByRole("button", { name: "Outro" }));
    await userEvent.type(within(form).getByLabelText("Número do ciclo"), "5");
    await userEvent.click(within(form).getByRole("button", { name: "Registrar" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Descreva o que foi esterilizado");
  });

  it("corrigir pede motivo e mostra o que estava antes", async () => {
    const api = abrir(BASE, {
      "PUT /esterilizacao/7": (corpo) => ({
        status: 200,
        corpo: { ...BASE, itens: [{ ...BASE.itens[0], ciclo: corpo.ciclo, corrigida: true, antes: "Meio (PDA), ciclo 103", motivo_correcao: corpo.motivo }] },
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: /^Corrigir Meio \(PDA\)/ }));
    const form = screen.getByRole("form", { name: "Corrigir esterilização" });
    const ciclo = within(form).getByLabelText("Ciclo");
    await userEvent.clear(ciclo);
    await userEvent.type(ciclo, "130");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar correção" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Escreva o motivo");
    expect(api.vezes("PUT /esterilizacao/7")).toBe(0);
    await userEvent.type(within(form).getByLabelText("Motivo"), "Digitei o ciclo errado");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar correção" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /esterilizacao/7")?.corpo).toMatchObject({ tipo: "Meio", ciclo: "130", motivo: "Digitei o ciclo errado" });
    expect(await screen.findByText(/Corrigido \(antes: Meio \(PDA\), ciclo 103\)\. Motivo: Digitei o ciclo errado/)).toBeInTheDocument();
  });

  it("excluir pede motivo e tira da lista", async () => {
    const api = abrir(BASE, { "POST /esterilizacao/7/excluir": () => ({ status: 200, corpo: { ...BASE, itens: [] } }) });
    await userEvent.click(await screen.findByRole("button", { name: /^Excluir Meio \(PDA\)/ }));
    const form = screen.getByRole("form", { name: "Excluir esterilização" });
    await userEvent.type(within(form).getByLabelText("Motivo"), "Registrei em duplicidade");
    await userEvent.click(within(form).getByRole("button", { name: "Excluir" }));
    expect(api.chamadas.find((c) => c.rota === "POST /esterilizacao/7/excluir")?.corpo).toEqual({ motivo: "Registrei em duplicidade" });
    expect(await screen.findByText("Nada registrado neste turno ainda.")).toBeInTheDocument();
  });

  it("quem só consulta vê a lista, sem registrar", async () => {
    abrir({ ...BASE, pode_registrar: false }, {}, "Consultor");
    expect(await screen.findByText("Meio (PDA) · ciclo 103")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Registrar esterilização" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Corrigir/ })).not.toBeInTheDocument();
  });

  it("o gráfico G4 tem os números por turno e tipo", async () => {
    abrir();
    const grafico = await screen.findByRole("region", { name: "Gráfico de esterilizações por tipo e turno" });
    expect(grafico).toHaveTextContent("De 17/10 a 23/10 · 3 no total");
    const tabela = within(grafico).getByRole("table");
    const manha = within(tabela).getByRole("row", { name: /^Manhã/ });
    expect(within(manha).getAllByRole("cell").map((c) => c.textContent)).toEqual(["2", "0", "0", "0", "0"]);
    expect(within(grafico).getAllByRole("listitem").map((li) => li.textContent?.trim())).toEqual(["Ponteira", "Meio", "Frasco", "Descarte", "Outro"]);
  });
});
