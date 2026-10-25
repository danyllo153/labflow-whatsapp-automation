import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";

/** APP-062 (E9): Instrução e Vídeo em todos os apps de análise; só o Admin escreve. Textos fictícios. */

const VAZIA = { texto: "", video_url: null, versao: 0, escrita_por: null, escrita_em: null };

function abrir(caminho: string, rotas: Parameters<typeof servidorFalso>[0], cargo = "Analista") {
  const pessoa = { ...ANA, cargo, pode: ["ver_paginas", "registrar_analise", ...(cargo === "Admin" ? ["configurar_turnos"] : [])] };
  const api = servidorFalso({ "GET /me": () => ({ status: 200, corpo: pessoa }), ...rotas });
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

describe("Instrução e Vídeo dos apps (E9)", () => {
  it.each([
    ["/analises/drops", "drops"],
    ["/analises/tanques", "tanques"],
    ["/analises/testes", "testes"],
    ["/analises/embarque-fcoj", "embarque-fcoj"],
    ["/analises/recebimento-nfc", "recebimento-nfc"],
    ["/analises/desvios", "desvios"],
    ["/analises/recebimento-fcoj", "recebimento-fcoj"],
  ])("%s mostra a instrução escrita pelo Admin", async (caminho, app) => {
    abrir(`${caminho}?aba=instrucao`, {
      [`GET /analises/instrucoes/${app}`]: () => ({
        status: 200,
        corpo: { app, texto: "1. Separe as placas.\n2. Confira a data.", video_url: null, versao: 2, escrita_por: "Ana Souza", escrita_em: "24/10/2026 10:00", pode_editar: false },
      }),
    });
    expect(await screen.findByText(/1\. Separe as placas\./)).toBeInTheDocument();
    expect(screen.getByText("Versão 2 · Ana Souza em 24/10/2026 10:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar a IT/ })).not.toBeInTheDocument();
  });

  it("o Admin escreve a instrução e grava", async () => {
    const api = abrir(
      "/analises/drops?aba=instrucao",
      {
        "GET /analises/instrucoes/drops": () => ({ status: 200, corpo: { app: "drops", ...VAZIA, pode_editar: true } }),
        "PUT /analises/instrucoes/drops": (c) => ({
          status: 200,
          corpo: { app: "drops", texto: c.texto, video_url: null, versao: 1, escrita_por: "Ana Souza", escrita_em: "24/10/2026 11:00", pode_editar: true },
        }),
      },
      "Admin",
    );
    await userEvent.click(await screen.findByRole("button", { name: "Adicionar IT" }));
    await userEvent.type(screen.getByLabelText(/Instrução de trabalho/), "Conclua os drops do dia.");
    await userEvent.click(screen.getByRole("button", { name: "Gravar" }));
    expect(await screen.findByText("Conclua os drops do dia.")).toBeInTheDocument();
    expect(api.chamadas.find((c) => c.rota === "PUT /analises/instrucoes/drops")?.corpo).toEqual({ texto: "Conclua os drops do dia.", video_url: null });
  });

  it("o vídeo abre pelo link; sem link, avisa que ainda não há", async () => {
    abrir("/analises/testes?aba=video", {
      "GET /analises/instrucoes/testes": () => ({ status: 200, corpo: { app: "testes", ...VAZIA, video_url: "https://exemplo.com/video-ficticio", versao: 1, escrita_por: "Ana Souza", escrita_em: "24/10/2026 11:00", pode_editar: false } }),
    });
    expect(await screen.findByRole("link", { name: "Abrir o vídeo" })).toHaveAttribute("href", "https://exemplo.com/video-ficticio");
  });
});
