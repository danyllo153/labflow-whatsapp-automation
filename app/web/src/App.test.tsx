import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

function abrir(caminho: string, demonstracao = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ demonstracao }), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
  return render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("moldura do app (APP-012)", () => {
  it("mostra os cinco itens do menu no computador e no celular", () => {
    abrir("/");
    const rotulos = ["Início", "Turno", "Páginas", "Esterilização", "Assistente"];
    const lateral = screen.getByRole("complementary", { name: "Menu" });
    const barra = screen.getByRole("navigation", { name: "Menu do celular" });
    for (const rotulo of rotulos) {
      expect(within(lateral).getByRole("link", { name: new RegExp(rotulo) })).toBeInTheDocument();
      expect(within(barra).getByRole("link", { name: rotulo })).toBeInTheDocument();
    }
  });

  it("abre o Início", () => {
    abrir("/");
    expect(screen.getByRole("heading", { level: 1, name: "Início" })).toBeInTheDocument();
  });

  it("mostra a faixa de demonstração quando o servidor é de demonstração", async () => {
    abrir("/", true);
    expect(await screen.findByText("Dados de demonstração.")).toBeInTheDocument();
  });

  it("não mostra a faixa fora da demonstração", async () => {
    abrir("/", false);
    await screen.findByRole("heading", { name: "Início" });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Dados de demonstração.")).not.toBeInTheDocument();
  });

  it("tela que ainda não existe aparece como Em breve, com a etapa", () => {
    abrir("/turno");
    expect(screen.getByRole("heading", { level: 1, name: "Turno" })).toBeInTheDocument();
    expect(screen.getByText("Etapa: APP-022")).toBeInTheDocument();
  });

  it("endereço desconhecido mostra página não encontrada com volta ao Início", () => {
    abrir("/nao-existe");
    expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao Início" })).toBeInTheDocument();
  });

  it("não usa emoji nos textos", () => {
    const { container } = abrir("/");
    expect(container.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
