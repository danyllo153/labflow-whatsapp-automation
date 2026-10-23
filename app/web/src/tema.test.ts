import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aplicarTema, CHAVE_TEMA, guardarTema, lerTema } from "./tema";

function preparar(escuroDoAparelho = false) {
  document.head.innerHTML = '<meta name="theme-color" content="#F6B04A" />';
  document.documentElement.removeAttribute("data-tema");
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: escuroDoAparelho && q.includes("dark"), media: q }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Aparência (APP-031)", () => {
  it("sem escolha, segue o aparelho: nenhum atributo na raiz", () => {
    preparar();
    expect(lerTema()).toBe("auto");
    aplicarTema();
    expect(document.documentElement.hasAttribute("data-tema")).toBe(false);
  });

  it("escolher Escuro grava, põe o atributo e muda a cor da barra do celular", () => {
    preparar();
    guardarTema("escuro");
    expect(window.localStorage.getItem(CHAVE_TEMA)).toBe("escuro");
    expect(document.documentElement.getAttribute("data-tema")).toBe("escuro");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#14283D");
    expect(lerTema()).toBe("escuro");
  });

  it("Claro força o claro mesmo num aparelho escuro", () => {
    preparar(true);
    guardarTema("claro");
    expect(document.documentElement.getAttribute("data-tema")).toBe("claro");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#1C5A94");
  });

  it("Automático num aparelho escuro usa a barra escura e apaga a escolha guardada", () => {
    preparar(true);
    guardarTema("claro");
    guardarTema("auto");
    expect(window.localStorage.getItem(CHAVE_TEMA)).toBeNull();
    expect(document.documentElement.hasAttribute("data-tema")).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#14283D");
  });

  it("valor guardado estranho vira Automático", () => {
    preparar();
    window.localStorage.setItem(CHAVE_TEMA, "roxo");
    expect(lerTema()).toBe("auto");
  });

  it("sem armazenamento (janela privada) o app continua funcionando", () => {
    preparar();
    const quebrado = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => guardarTema("escuro")).not.toThrow();
    expect(document.documentElement.getAttribute("data-tema")).toBe("escuro");
    quebrado.mockRestore();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(lerTema()).toBe("auto");
    vi.restoreAllMocks();
  });
});
