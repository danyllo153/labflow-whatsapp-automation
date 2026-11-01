import { afterEach, describe, expect, it, vi } from "vitest";

import { aplicarMarca, carregarMarca, cssDasCores, MARCA_PADRAO, misturar } from "./marca";

afterEach(() => {
  aplicarMarca(MARCA_PADRAO);
  vi.unstubAllGlobals();
});

describe("marca da instalação (Lite)", () => {
  it("mistura as cores para os tons claros e escuros", () => {
    expect(misturar("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(misturar("#123", "#ffffff", 0)).toBe("#112233");
  });

  it("sem cores não gera CSS (o visual do LabFlow fica como está)", () => {
    expect(cssDasCores({ cor_principal: null, cor_secundaria: null })).toBe("");
  });

  it("a cor principal vale nos botões e links, nos dois temas", () => {
    const css = cssDasCores({ cor_principal: "#0a7c4a", cor_secundaria: null });
    expect(css).toContain(":root { --acao: #0a7c4a;");
    expect(css).toContain(':root[data-tema="escuro"]');
    expect(css).toContain('@media (prefers-color-scheme: dark) { :root:not([data-tema="claro"])');
    expect(css).not.toContain("--menu-fundo");
  });

  it("a secundária vai no menu e no topo", () => {
    expect(cssDasCores({ cor_principal: null, cor_secundaria: "#223344" })).toContain("--menu-fundo: #223344; --topo-fundo: #223344;");
  });

  it("aplica nome, cores e estilo extra na página e tira tudo ao voltar ao padrão", () => {
    aplicarMarca({ nome: "Laboratório Exemplo", cor_principal: "#0a7c4a", cor_secundaria: null, logo: true, estilo: true });
    expect(document.title).toBe("Laboratório Exemplo · LabFlow");
    expect(document.getElementById("marca-cores")?.textContent).toContain("#0a7c4a");
    expect(document.getElementById("marca-estilo")?.getAttribute("href")).toBe("/marca/estilo.css");
    aplicarMarca(MARCA_PADRAO);
    expect(document.title).toBe("LabFlow");
    expect(document.getElementById("marca-cores")).toBeNull();
    expect(document.getElementById("marca-estilo")).toBeNull();
  });

  it("sem resposta da API fica a marca do LabFlow, sem erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sem rede")));
    await carregarMarca();
    expect(document.title).toBe("LabFlow");
  });
});
