import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";

const pontos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: `Ponto ${i + 1}`, ordem: i + 1, ativo: true }));
const vazio = (ordem: number) => ({ ordem, ponto: `Ponto ${ordem}`, ct: null, bl: null, coliformes: null, ecoli: null, ph: null, cloro: null, observacao: null, fora: [] });
const COLETA = {
  id: 9, unidade: "TMG", tipo: "mensal", navio: null, dia: "2026-10-26", hora: "08:30", quem: "Ana Souza", analisada_em: null,
  analisada_por: null, resultados: [vazio(1), vazio(2)], faltas: ["Coliformes e E.coli (27/10)"], situacao: "Vence hoje: Coliformes e E.coli", nao_ok: 0,
};
const AGUA = {
  pode_coletar: true, pode_lancar: true, pode_configurar: false,
  pontos: { Santos: { mensal: pontos(2), semanal: pontos(2) }, TMG: { mensal: pontos(8), semanal: pontos(8) } },
  pontos_do_navio: { TEC: "Água técnica", COZ: "Água da cozinha" },
  limites: { ct: 500, bl: 50, ph_min: 6, ph_max: 9.5, cloro_min: 0.2, cloro_max: 5 },
  coletas: [COLETA], navios: [],
};
const QUEM_LANCA = { ...ANA, pode: ["ver_paginas", "registrar_analise", "registrar_coleta"] };

function abrir(caminho: string, rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: QUEM_LANCA }),
    "GET /aguas/consumo": () => ({ status: 200, corpo: AGUA }),
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

describe("Água de consumo (27/10)", () => {
  it("cartões de Santos e TMG com mensal e semanal; a coleta leva os pontos marcados", async () => {
    const api = abrir("/paginas/agua-consumo", {
      "POST /aguas/consumo/coletas": () => ({ status: 201, corpo: AGUA }),
    });
    expect(await screen.findByRole("button", { name: "TMG (Guarujá) mensal" })).toHaveAttribute("aria-pressed", "true");
    const form = await screen.findByRole("form", { name: "Nova coleta da água de consumo" });
    expect(within(form).getAllByRole("button", { pressed: true })).toHaveLength(8);
    await userEvent.click(within(form).getByRole("button", { name: "Ponto 8" }));
    await userEvent.click(within(form).getByRole("button", { name: "Registrar coleta (7)" }));
    expect(await screen.findByText(/Coleta registrada: 7 pontos/)).toBeInTheDocument();
    const enviado = api.chamadas.find((c) => c.rota === "POST /aguas/consumo/coletas")?.corpo;
    expect(enviado).toMatchObject({ unidade: "TMG", tipo: "mensal", pontos: [1, 2, 3, 4, 5, 6, 7] });
    await userEvent.click(screen.getByRole("button", { name: "Santos semanal" }));
    expect(within(screen.getByRole("form", { name: "Nova coleta da água de consumo" })).getAllByRole("button", { pressed: true })).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Registrar água do navio" }));
    expect(screen.getByLabelText("Navio e viagem")).toBeInTheDocument();
    expect(screen.getByText("Histórico dos navios")).toBeInTheDocument();
  });

  it("na aba Leituras: Ausente em todos, a prévia com o que passou do limite e o Confirmar", async () => {
    const api = abrir("/leituras?aba=agua-consumo", {
      "PUT /aguas/consumo/coletas/9/resultados": (c) => ({
        status: 200,
        corpo: { previa: c.previa, texto: "Ponto 1: Coliformes A, E.coli A\nPonto 2: Coliformes P, E.coli A", fora: ["Ponto 2: Coliformes fora do limite"], agua: c.previa ? null : { ...AGUA, coletas: [] } },
      }),
    });
    const cartao = await screen.findByRole("region", { name: /TMG \(Guarujá\) mensal · coleta 26\/10 08:30/ });
    await userEvent.click(within(cartao).getByRole("button", { name: /Ausente em todos/ }));
    const coli2 = within(cartao).getByRole("textbox", { name: "Coliformes (P/A) de Ponto 2" });
    await userEvent.clear(coli2);
    await userEvent.type(coli2, "P");
    await userEvent.click(within(cartao).getByRole("button", { name: "Ver o que vai ser gravado (2)" }));
    expect(await within(cartao).findByText("Ponto 2: Coliformes fora do limite")).toBeInTheDocument();
    await userEvent.click(within(cartao).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Nenhuma leitura pendente.")).toBeInTheDocument();
    const enviados = api.chamadas.filter((c) => c.rota === "PUT /aguas/consumo/coletas/9/resultados").map((c) => c.corpo);
    expect(enviados[0]).toEqual({ previa: true, itens: [{ ordem: 1, coliformes: "A", ecoli: "A" }, { ordem: 2, coliformes: "P", ecoli: "A" }] });
    expect(enviados[1].previa).toBe(false);
  });
});
