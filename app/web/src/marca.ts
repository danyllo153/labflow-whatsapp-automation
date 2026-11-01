/**
 * Marca da instalação (LabFlow Lite, spec 12): nome, logo, cores e estilo extra vindos de GET /marca (a pasta
 * dados\marca do G:, lida quando o app abre). Sem marca, tudo fica como o LabFlow: o servidor de demonstração não muda.
 *
 * Cor principal: botões, links, abas e destaques. Cor secundária: menu lateral e topo. Os tons mais claros e mais escuros
 * saem das próprias cores, no tema claro e no escuro. O estilo.css entra por último, sobre tudo.
 */
import { useSyncExternalStore } from "react";

export interface Marca {
  nome: string;
  cor_principal: string | null;
  cor_secundaria: string | null;
  logo: boolean;
  estilo: boolean;
}

export const MARCA_PADRAO: Marca = { nome: "LabFlow", cor_principal: null, cor_secundaria: null, logo: false, estilo: false };

let atual: Marca = MARCA_PADRAO;
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((f) => f());
}

/** A marca em uso, para as telas (Moldura, Entrar). */
export function useMarca(): Marca {
  return useSyncExternalStore(
    (f) => (ouvintes.add(f), () => ouvintes.delete(f)),
    () => atual,
    () => atual,
  );
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const cheio = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(cheio.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mistura `cor` com `alvo` (0 = só a cor, 1 = só o alvo). */
export function misturar(cor: string, alvo: string, peso: number): string {
  const a = rgb(cor);
  const b = rgb(alvo);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * peso).toString(16).padStart(2, "0")).join("");
}

const ESCURO = [':root[data-tema="escuro"]', '@media (prefers-color-scheme: dark) { :root:not([data-tema="claro"])'];

function bloco(seletor: string, vars: Record<string, string>): string {
  const corpo = Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(" ");
  return seletor.startsWith("@media") ? `${seletor} { ${corpo} } }` : `${seletor} { ${corpo} }`;
}

/** O CSS das cores da marca (as mesmas variáveis do visual, nos dois temas). Vazio sem cores. */
export function cssDasCores(m: Pick<Marca, "cor_principal" | "cor_secundaria">): string {
  const claro: Record<string, string> = {};
  const escuro: Record<string, string> = {};
  const p = m.cor_principal;
  if (p) {
    Object.assign(claro, {
      "--acao": p, "--acao-botao": p, "--link": p, "--primaria": p,
      "--acao-escura": misturar(p, "#000000", 0.25), "--acao-fundo": misturar(p, "#ffffff", 0.88),
    });
    Object.assign(escuro, {
      "--acao": misturar(p, "#ffffff", 0.25), "--acao-botao": p, "--link": misturar(p, "#ffffff", 0.45), "--primaria": p,
      "--acao-escura": misturar(p, "#000000", 0.25), "--acao-fundo": misturar(p, "#1c2338", 0.75),
    });
  }
  const s = m.cor_secundaria;
  if (s) {
    const menu = { "--menu-fundo": s, "--topo-fundo": s, "--menu-ativo-fundo": misturar(s, "#ffffff", 0.12), "--topo-campo": misturar(s, "#ffffff", 0.12) };
    Object.assign(claro, menu);
    const fundoEscuro = misturar(s, "#000000", 0.45);
    Object.assign(escuro, { "--menu-fundo": fundoEscuro, "--topo-fundo": fundoEscuro, "--menu-ativo-fundo": misturar(fundoEscuro, "#ffffff", 0.1), "--topo-campo": misturar(fundoEscuro, "#ffffff", 0.1) });
  }
  if (!p && !s) return "";
  return [bloco(":root", claro), ...ESCURO.map((sel) => bloco(sel, escuro))].join("\n");
}

function elemento<T extends HTMLElement>(id: string, criar: () => T): T {
  const existente = document.getElementById(id) as T | null;
  if (existente) return existente;
  const novo = criar();
  novo.id = id;
  document.head.appendChild(novo); // no fim do <head>: vale sobre o visual do app
  return novo;
}

export function aplicarMarca(m: Marca): void {
  atual = m;
  document.title = m.nome === MARCA_PADRAO.nome ? "LabFlow" : `${m.nome} · LabFlow`;
  const cores = cssDasCores(m);
  if (cores) elemento("marca-cores", () => document.createElement("style")).textContent = cores;
  else document.getElementById("marca-cores")?.remove();
  if (m.estilo) {
    elemento("marca-estilo", () => Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/marca/estilo.css" }));
  } else document.getElementById("marca-estilo")?.remove();
  avisar();
}

/** Busca a marca na API; sem resposta (ou servidor sem marca) fica a do LabFlow, sem erro na tela. */
export async function carregarMarca(): Promise<void> {
  try {
    const r = await fetch("/marca", { credentials: "same-origin" });
    if (!r.ok) return;
    const m = (await r.json()) as Partial<Marca>;
    aplicarMarca({ ...MARCA_PADRAO, ...m, nome: m.nome || MARCA_PADRAO.nome });
  } catch {
    // sem a marca o app funciona igual
  }
}
