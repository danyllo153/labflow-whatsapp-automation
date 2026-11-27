import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { aplicarMarca, MARCA_PADRAO } from "./marca";
import { ProvedorDeSessao } from "./sessao";
import { ANA, servidorFalso } from "./testes-servidor";

function abrir() {
  return render(
    <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
}

afterEach(() => {
  aplicarMarca(MARCA_PADRAO);
  vi.unstubAllGlobals();
});

describe("topo com a marca da instalação", () => {
  it("com logo: só a imagem (nome no alt e no title), sem o texto", async () => {
    aplicarMarca({ ...MARCA_PADRAO, nome: "Laboratório Exemplo", logo: true });
    servidorFalso({ "GET /me": () => ({ status: 200, corpo: ANA }) });
    const { container } = abrir();
    await screen.findByRole("heading", { level: 1, name: "Início" });
    const imagens = screen.getAllByRole("img", { name: "Laboratório Exemplo" });
    expect(imagens.length).toBeGreaterThan(0);
    imagens.forEach((i) => {
      expect(i).toHaveAttribute("src", "/marca/logo.png");
      expect(i).toHaveAttribute("title", "Laboratório Exemplo");
    });
    expect(container.querySelector(".marca-nome")).toBeNull();
  });

  it("sem logo: aparece o texto do nome", async () => {
    aplicarMarca({ ...MARCA_PADRAO, logo: false });
    servidorFalso({ "GET /me": () => ({ status: 200, corpo: ANA }) });
    const { container } = abrir();
    await screen.findByRole("heading", { level: 1, name: "Início" });
    expect(container.querySelector(".marca-nome")?.textContent).toBe("LabFlow");
    expect(container.querySelector("img.marca-logo-imagem")).toBeNull();
  });
});
