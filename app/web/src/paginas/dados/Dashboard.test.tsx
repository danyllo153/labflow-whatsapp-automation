import { describe, expect, it } from "vitest";

import { contarPor, contarPorDia } from "./Dashboard";

/** APP-067 (25/10): o Dashboard das páginas de dados conta as linhas do filtro. Dados fictícios. */
describe("Dashboard das páginas de dados", () => {
  const linhas = [
    { coletado_por: "Ana (demo)", data_coleta: "2026-10-20", origem: "Terra" },
    { coletado_por: "Bruno (demo)", data_coleta: "2026-10-20", origem: "Navio" },
    { coletado_por: "Ana (demo)", data_coleta: "2026-10-22", origem: "Terra" },
    { coletado_por: null, data_coleta: "2026-10-22T09:00:00", origem: "Terra" },
  ];

  it("colunas: conta por uma coluna de texto, do maior para o menor", () => {
    expect(contarPor(linhas, "coletado_por")).toEqual([
      { rotulo: "Ana (demo)", total: 2 },
      { rotulo: "(sem valor)", total: 1 },
      { rotulo: "Bruno (demo)", total: 1 },
    ]);
    expect(contarPor(linhas, "origem")[0]).toEqual({ rotulo: "Terra", total: 3 });
  });

  it("tendência: uma contagem por dia, com os dias sem nada em zero", () => {
    expect(contarPorDia(linhas, "data_coleta")).toEqual([
      { dia: "2026-10-20", valor: 2 },
      { dia: "2026-10-21", valor: 0 },
      { dia: "2026-10-22", valor: 2 },
    ]);
  });
});
