import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";

function abrir(caminho: string) {
  servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo: "Analista" } }),
    "GET /material-asseptico": () => ({
      status: 200,
      corpo: { dia: "2026-10-22", pode_preencher: true, registro: null, sugestao: { ponteiras: null, agua_diluicao: null, placas: null, meios: null }, recentes: [] },
    }),
  });
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Registros diários (APP-043)", () => {
  it("lista os laudos de rastreio como a aba Páginas e abre o que já existe", async () => {
    abrir("/registros-diarios");
    expect(await screen.findByRole("heading", { level: 1, name: "Registros diários" })).toBeInTheDocument();
    for (const titulo of ["Meio de cultura e fluxo laminar", "Incubação e leitura", "Água do processo", "Limpeza de superfícies", "Meios de cultura (lotes)"]) {
      expect(screen.getByRole("heading", { name: new RegExp(titulo.replace(/[()]/g, "\\$&")) })).toHaveTextContent("Em breve");
    }
    expect(screen.queryByText(/Ciclos de Esterilização/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /Material asséptico/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Material asséptico" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Registros diários" })).toBeInTheDocument();
  });

  it("no celular, as telas fora da barra de baixo ficam no menu da conta", async () => {
    abrir("/registros-diarios");
    await userEvent.click(await screen.findByRole("button", { name: /Conta de/ }));
    expect(within(screen.getByRole("menu", { name: "Conta" })).getByRole("menuitem", { name: "Registros diários" })).toHaveAttribute("href", "/registros-diarios");
  });
});
