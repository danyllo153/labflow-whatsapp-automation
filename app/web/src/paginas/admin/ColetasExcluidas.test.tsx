import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";

const ADMIN = { ...ANA, cargo: "Admin", pode: ["ver_paginas", "configurar_turnos"] };
const EXCLUIDA = { id: 5, coleta_id: 41, origem: "terra", tanque: "T91", data_coleta: "2026-10-20", motivo: "Registrei em duplicidade", excluida_por: "Ana Souza", excluida_em: "2026-10-22T13:00:00+00:00" };

function abrir(lista: unknown[] = [EXCLUIDA], rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: ADMIN }),
    "GET /coletas/excluidas": () => ({ status: 200, corpo: lista }),
    ...rotas,
  });
  render(
    <MemoryRouter initialEntries={["/admin/coletas-excluidas"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Admin → Coletas excluídas (APP-029)", () => {
  it("lista as coletas arquivadas com quem excluiu e o motivo", async () => {
    abrir();
    const cartao = await screen.findByRole("region", { name: /Tanque T91/ });
    expect(cartao).toHaveTextContent("Excluída por Ana Souza");
    expect(cartao).toHaveTextContent("motivo: Registrei em duplicidade");
  });

  it("recuperar pede o motivo e avisa que voltou com o mesmo número", async () => {
    const api = abrir([EXCLUIDA], { "POST /coletas/excluidas/5/recuperar": () => ({ status: 200, corpo: { coleta_id: 41 } }) });
    await userEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    const form = screen.getByRole("form", { name: /^Recuperar Tanque T91/ });
    await userEvent.type(within(form).getByLabelText("Motivo da recuperação"), "Foi engano");
    await userEvent.click(within(form).getByRole("button", { name: "Confirmar a recuperação" }));
    expect(api.chamadas.find((c) => c.rota === "POST /coletas/excluidas/5/recuperar")?.corpo).toEqual({ motivo: "Foi engano" });
    expect(await screen.findByText(/recuperada, com o mesmo número/)).toBeInTheDocument();
  });

  it("mostra a recusa do banco (sem motivo)", async () => {
    abrir([EXCLUIDA], { "POST /coletas/excluidas/5/recuperar": () => ({ status: 422, corpo: { detail: "Para recuperar, escreva o motivo." } }) });
    await userEvent.click(await screen.findByRole("button", { name: "Recuperar" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar a recuperação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Para recuperar, escreva o motivo.");
  });

  it("o Admin apaga de vez, com motivo e o aviso de que não tem volta (27/10)", async () => {
    const api = servidorFalso({
      "GET /me": () => ({ status: 200, corpo: { ...ADMIN, pode: [...ADMIN.pode, "gerenciar_pessoas"] } }),
      "GET /coletas/excluidas": () => ({ status: 200, corpo: [EXCLUIDA] }),
      "POST /coletas/excluidas/5/apagar": () => ({ status: 204, corpo: null }),
    });
    render(
      <MemoryRouter initialEntries={["/admin/coletas-excluidas"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Apagar de vez" }));
    const form = screen.getByRole("form", { name: /^Apagar de vez Tanque T91/ });
    expect(form).toHaveTextContent("não tem volta");
    await userEvent.type(within(form).getByLabelText("Motivo para apagar de vez"), "Teste antigo");
    await userEvent.click(within(form).getByRole("button", { name: "Apagar de vez" }));
    expect(api.chamadas.find((c) => c.rota === "POST /coletas/excluidas/5/apagar")?.corpo).toEqual({ motivo: "Teste antigo" });
    expect(await screen.findByText(/apagada de vez/)).toBeInTheDocument();
  });

  it("sem gerenciar pessoas (não é Admin), não aparece o Apagar de vez", async () => {
    abrir();
    expect(await screen.findByRole("button", { name: "Recuperar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apagar de vez" })).toBeNull();
  });

  it("sem nenhuma excluída, avisa", async () => {
    abrir([]);
    expect(await screen.findByText("Nenhuma coleta excluída.")).toBeInTheDocument();
  });
});
