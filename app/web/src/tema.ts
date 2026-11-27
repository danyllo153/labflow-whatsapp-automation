/**
 * Aparência: o padrão é o tema CLARO (decisão de 27/11). O escuro só aparece se a pessoa escolher
 * (localStorage, uma conveniência por pessoa). "auto" = sem escolha guardada = claro; o aparelho não decide.
 * O CSS lê `data-tema` na raiz, que sempre fica preenchido.
 */
export type Tema = "auto" | "claro" | "escuro";

export const CHAVE_TEMA = "labflow:tema";
const COR_DA_BARRA: Record<"claro" | "escuro", string> = { claro: "#1C5A94", escuro: "#14283D" };

export function lerTema(): Tema {
  try {
    const v = window.localStorage.getItem(CHAVE_TEMA);
    return v === "claro" || v === "escuro" ? v : "auto";
  } catch {
    return "auto"; // armazenamento bloqueado (janela privada): claro
  }
}

/** Põe o tema na página (atributo da raiz e cor da barra do navegador no celular). */
export function aplicarTema(tema: Tema = lerTema()): void {
  const raiz = document.documentElement;
  const efetivo = tema === "escuro" ? "escuro" : "claro";
  raiz.setAttribute("data-tema", efetivo);
  const escuro = efetivo === "escuro";
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
