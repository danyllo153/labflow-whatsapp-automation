/**
 * Aparência (APP-031): Automático (segue o aparelho), Claro ou Escuro. A escolha fica só neste aparelho
 * (localStorage, uma conveniência por pessoa; sem o armazenamento, o app segue o aparelho). O CSS lê
 * `data-tema` na raiz: sem o atributo vale o `prefers-color-scheme` do aparelho.
 */
export type Tema = "auto" | "claro" | "escuro";

export const CHAVE_TEMA = "labflow:tema";
const COR_DA_BARRA: Record<"claro" | "escuro", string> = { claro: "#1C5A94", escuro: "#14283D" };

export function lerTema(): Tema {
  try {
    const v = window.localStorage.getItem(CHAVE_TEMA);
    return v === "claro" || v === "escuro" ? v : "auto";
  } catch {
    return "auto"; // armazenamento bloqueado (janela privada): segue o aparelho
  }
}

function escuroDoAparelho(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Põe o tema na página (atributo da raiz e cor da barra do navegador no celular). */
export function aplicarTema(tema: Tema = lerTema()): void {
  const raiz = document.documentElement;
  if (tema === "auto") raiz.removeAttribute("data-tema");
  else raiz.setAttribute("data-tema", tema);
  const escuro = tema === "escuro" || (tema === "auto" && escuroDoAparelho());
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_DA_BARRA[escuro ? "escuro" : "claro"]);
}

export function guardarTema(tema: Tema): void {
  try {
    if (tema === "auto") window.localStorage.removeItem(CHAVE_TEMA);
    else window.localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // sem armazenamento: vale só até fechar o app
  }
  aplicarTema(tema);
}
