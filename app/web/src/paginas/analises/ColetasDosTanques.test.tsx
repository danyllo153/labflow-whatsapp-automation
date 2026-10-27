import { describe, expect, it } from "vitest";

import { agrupar, CORES_CLARAS, inicioDaSemana } from "./ColetasDosTanques";

const coletas = [
  { data: "2026-09-29", pessoa: "Ana", alvo: "43", n: 2 },
  { data: "2026-10-01", pessoa: "Bruno", alvo: "44", n: 1 },
  { data: "2026-10-06", pessoa: "Ana", alvo: "43", n: 3 },
];

describe("Coletas dos tanques no painel (27/10)", () => {
  it("a semana começa na segunda; cada coluna empilha os tanques, o que mais aparece com o primeiro tom (verde claro)", () => {
    expect(inicioDaSemana("2026-10-01")).toBe("2026-09-28");
    const g = agrupar(coletas, "semana");
    expect(g.rotulos).toEqual(["28/09", "05/10"]);
    expect(g.series.map((s) => [s.nome, s.valores])).toEqual([
      ["43", [2, 3]],
      ["44", [1, 0]],
    ]);
    expect(g.series[0].cor).toBe(CORES_CLARAS[0]);
  });

  it("por mês soma o mês; por pessoa, quem coletou mais primeiro; passou de 10 tanques, o resto vira Outros", () => {
    const m = agrupar(coletas, "mes");
    expect(m.rotulos).toEqual(["Set/26", "Out/26"]);
    expect(m.series.find((s) => s.nome === "43")?.valores).toEqual([2, 3]);
    const p = agrupar(coletas, "pessoa");
    expect(p.rotulos).toEqual(["Ana", "Bruno"]);
    expect(p.series.map((s) => [s.nome, s.valores])).toEqual([
      ["43", [5, 0]],
      ["44", [0, 1]],
    ]);
    const muitos = Array.from({ length: 12 }, (_, i) => ({ data: "2026-10-06", pessoa: "Ana", alvo: String(30 + i), n: 12 - i }));
    const g = agrupar(muitos, "semana");
    expect(g.series).toHaveLength(11);
    expect(g.series[10]).toMatchObject({ nome: "Outros", valores: [3] }); // os dois menores: 2 + 1
  });
});
