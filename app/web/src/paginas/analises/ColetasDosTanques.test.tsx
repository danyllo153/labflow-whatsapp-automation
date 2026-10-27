import { describe, expect, it } from "vitest";

import { agrupar, COR_DO_MES, inicioDaSemana } from "./ColetasDosTanques";

const coletas = [
  { data: "2026-09-29", pessoa: "Ana", n: 2 },
  { data: "2026-10-01", pessoa: "Bruno", n: 1 },
  { data: "2026-10-06", pessoa: "Ana", n: 3 },
];

describe("Coletas dos tanques no painel (27/10)", () => {
  it("a semana começa na segunda e pega a cor do mês em que começa", () => {
    expect(inicioDaSemana("2026-10-01")).toBe("2026-09-28");
    const g = agrupar(coletas, "semana");
    if (g.tipo !== "periodo") throw new Error("esperava período");
    expect(g.rotulos).toEqual(["28/09", "05/10"]);
    expect(g.valores).toEqual([3, 3]);
    expect(g.cores).toEqual([COR_DO_MES[8], COR_DO_MES[9]]);
  });

  it("por mês soma o mês; por pessoa empilha os meses, quem coletou mais primeiro", () => {
    const m = agrupar(coletas, "mes");
    if (m.tipo !== "periodo") throw new Error("esperava período");
    expect(m.rotulos).toEqual(["Set/26", "Out/26"]);
    expect(m.valores).toEqual([2, 4]);
    const p = agrupar(coletas, "pessoa");
    if (p.tipo !== "pessoa") throw new Error("esperava pessoa");
    expect(p.rotulos).toEqual(["Ana", "Bruno"]);
    expect(p.series.map((s) => [s.nome, s.valores])).toEqual([
      ["Set/26", [2, 0]],
      ["Out/26", [3, 1]],
    ]);
  });
});
