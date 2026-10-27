import { describe, expect, it } from "vitest";

import { diaDe, type PontoResultado } from "./GraficoResultado";
import { lotesPorPeriodo } from "./GraficoLotes";

const leitura = (data: string, lote: string, analise: string, valor: number, acima = false, menor = false): PontoResultado => ({
  data, analise, valor, menor, acima, load: "43783", lote, navio: null, lido: "Ana", diluicao: null, fabrica: "COL",
});

describe("gráfico dos lotes (27/10)", () => {
  it("conta cada lote uma vez por dia; Não ok se alguma leitura do dia passou do alerta", () => {
    const pontos = [
      leitura("2026-10-26", "1", "C.T 48h", 10, false, true),
      leitura("2026-10-26", "1", "B.L 72h", 10, false, true),
      leitura("2026-10-26", "2", "C.T 48h", 250, true),
      leitura("2026-10-27", "1", "B.L 120h", 10, false, true),
    ];
    const porDia = lotesPorPeriodo(pontos, "dia");
    expect([...porDia.keys()]).toEqual([diaDe("2026-10-26"), diaDe("2026-10-27")]);
    const dia26 = porDia.get(diaDe("2026-10-26"))!;
    expect(dia26.map((l) => [l.rotulo, l.naoOk, l.leituras.length])).toEqual([
      ["43783 · lote 1", false, 2],
      ["43783 · lote 2", true, 1],
    ]);
    // segunda 26/10 e terça 27/10 caem na mesma semana: o lote 1 conta uma vez, com as três leituras
    const porSemana = lotesPorPeriodo(pontos, "semana");
    expect(porSemana.size).toBe(1);
    expect([...porSemana.values()][0].map((l) => l.leituras.length)).toEqual([3, 1]);
  });
});
