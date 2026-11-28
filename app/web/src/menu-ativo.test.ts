import { describe, expect, it } from "vitest";

// o Vitest não lê CSS pelo ?raw; lê-se o arquivo direto (as definições de tipo do Node não fazem parte do app)
// @ts-expect-error módulo do Node, sem tipos neste projeto
const { readFileSync } = (await import("node:fs")) as { readFileSync: (c: string, e: string) => string };
const paleta = readFileSync("src/paleta.css", "utf8"); // o Vitest roda na pasta app/web

/** Tira os blocos @media (min-width) do CSS, para sobrar só o que vale em qualquer largura. */
function semMedia(css: string): string {
  let saida = "";
  let i = 0;
  while (i < css.length) {
    const m = css.indexOf("@media", i);
    if (m < 0) return saida + css.slice(i);
    saida += css.slice(i, m);
    let n = css.indexOf("{", m);
    let fundo = 1;
    n += 1;
    while (fundo > 0 && n < css.length) fundo += css[n] === "{" ? 1 : css[n] === "}" ? -1 : 0, n++;
    i = n;
  }
  return saida;
}

describe("Menu lateral, item ativo no tema claro", () => {
  const css = paleta;
  const geral = semMedia(css);

  it("o grupo com a tela aberta usa o texto marinho em qualquer largura (não o branco do menu escuro)", () => {
    expect(geral).toMatch(
      /:root\[data-tema="claro"\] \.menu-grupo\.com-ativo > \.menu-grupo-botao\s*\{[^}]*color:\s*var\(--menu-texto-ativo\)/,
    );
  });

  it("o subitem ativo ganha fundo suave e o texto fica no marinho", () => {
    expect(geral).toMatch(/:root\[data-tema="claro"\] \.menu-filho\.active\s*\{[^}]*background:\s*var\(--menu-ativo-fundo\)/);
  });

  it("no claro, o texto do ativo é escuro (contraste) e não branco", () => {
    expect(css).toMatch(/--menu-texto-ativo:\s*#1e2a4a/);
    expect(css).toMatch(/--menu-ativo-fundo:\s*#fdebd3/);
  });
});
