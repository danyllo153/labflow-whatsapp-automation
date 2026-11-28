import { describe, expect, it } from "vitest";

import { agruparDrops, agruparTanques, resumoDasLinhas, type CelulaDeAnalise } from "./ladoALado";

const base = { data_coleta: "2026-11-20", origem: "Terra", navio: null, tanque: "T99", frasco: "Normal", lida_por: "Ana (demo)", repeticao: false };

describe("Tanques lado a lado", () => {
  it("3 análises do mesmo tanque viram 1 linha, com as etapas dentro da célula", () => {
    const { linhas, colunas } = agruparTanques([
      { ...base, analise: "C.T", etapa: "Leitura final", prevista: "2026-11-22", contagem: "12", resultado: "Ok", situacao: "Lido" },
      { ...base, analise: "B.L", etapa: "Pré-leitura", prevista: "2026-11-23", contagem: "<1", resultado: "Ok", situacao: "Lido" },
      { ...base, analise: "B.L", etapa: "Leitura final", prevista: "2026-11-25", contagem: null, resultado: "Pendente", situacao: "Atrasado" },
      { ...base, analise: "Psicrotróficos", etapa: "Pré-leitura", prevista: "2026-11-25", contagem: null, resultado: "Pendente", situacao: "No prazo" },
    ]);
    expect(linhas).toHaveLength(1);
    expect(colunas.map((c) => c.rotulo)).toEqual(["Data da coleta", "Tanque", "Origem", "Navio", "Frasco", "C.T", "B.L", "Psicrotróficos", "Situação", "Lido por"]);
    const c = (n: number) => linhas[0][`analise_${n}`] as CelulaDeAnalise;
    expect(c(0).texto).toBe("12");
    expect(c(1).texto).toBe("Pré: <1 · Final: Pendente · 25/11");
    expect(c(2)).toMatchObject({ texto: "Pendente · 25/11", pendente: true });
    expect(linhas[0].situacao).toBe("Atrasado");
  });

  it("tanques e frascos diferentes ficam em linhas diferentes; Não ok vence a situação", () => {
    const { linhas } = agruparTanques([
      { ...base, analise: "C.T", etapa: "Leitura final", prevista: "2026-11-22", contagem: "250", resultado: "Não ok", situacao: "Lido" },
      { ...base, frasco: "Stress", analise: "C.T", etapa: "Leitura final", prevista: "2026-11-22", contagem: "3", resultado: "Ok", situacao: "Lido" },
      { ...base, tanque: "T100", analise: "C.T", etapa: "Leitura final", prevista: "2026-11-22", contagem: "3", resultado: "Ok", situacao: "Lido" },
    ]);
    expect(linhas.map((l) => [l.tanque, l.frasco, l.situacao])).toEqual([["T99", "Normal", "Não ok"], ["T99", "Stress", "Ok"], ["T100", "Normal", "Ok"]]);
    expect((linhas[0].analise_0 as CelulaDeAnalise).nao_ok).toBe(true);
  });

  it("as duas leituras do Wort (profundidade e superfície) ficam na mesma etapa da célula", () => {
    const wort = { ...base, analise: "Psicrotróficos", etapa: "Leitura final", prevista: "2026-11-30", resultado: "Ok", situacao: "Lido" };
    const { linhas } = agruparTanques([{ ...wort, contagem: "5" }, { ...wort, contagem: "<1" }]);
    expect(linhas).toHaveLength(1);
    expect((linhas[0].analise_2 as CelulaDeAnalise).texto).toBe("5 / <1");
  });

  it("origem e navio entram na chave: o mesmo tanque de navios diferentes não se mistura", () => {
    const n = { ...base, origem: "Navio", analise: "C.T", etapa: "Leitura final", prevista: "2026-11-22", contagem: "1", resultado: "Ok", situacao: "Lido" };
    expect(agruparTanques([{ ...n, navio: "O.SKY 189" }, { ...n, navio: "D.SKY 123" }]).linhas).toHaveLength(2);
  });
});

describe("Drops lado a lado", () => {
  const drop = { data_coleta: "2026-11-20", origem: "Terra", navio: null, tanque: "T99", concluido_por: null, desvio_resultado: null };

  it("D5, D10 e D15 do mesmo tanque e coleta viram 1 linha", () => {
    const { linhas, colunas } = agruparDrops([
      { ...drop, drop: "D5", prevista: "2026-11-25", situacao: "Concluído", concluido_por: "Ana (demo)" },
      { ...drop, drop: "D10", prevista: "2026-11-30", situacao: "Atrasado" },
      { ...drop, drop: "D15", prevista: "2026-12-05", situacao: "No prazo" },
    ]);
    expect(linhas).toHaveLength(1);
    expect(colunas.map((c) => c.rotulo)).toContain("D15");
    expect(linhas[0].drop_0).toEqual({ situacao: "Concluído", texto: "prevista 25/11" });
    expect(linhas[0].drop_1).toEqual({ situacao: "Atrasado", texto: "prevista 30/11" });
    expect(linhas[0].drop_2).toEqual({ situacao: "No prazo", texto: "prevista 05/12" });
    expect(linhas[0].situacao).toBe("Atrasado");
    expect(linhas[0].concluido_por).toBe("Ana (demo)");
  });

  it("coletas diferentes do mesmo tanque são linhas diferentes e o resumo conta as linhas", () => {
    const { linhas } = agruparDrops([
      { ...drop, drop: "D5", prevista: "2026-11-25", situacao: "Concluído" },
      { ...drop, data_coleta: "2026-11-27", drop: "D5", prevista: "2026-12-02", situacao: "No prazo" },
    ]);
    expect(linhas).toHaveLength(2);
    expect(resumoDasLinhas(linhas)).toEqual([{ rotulo: "No prazo", total: 1 }, { rotulo: "Concluído", total: 1 }]);
  });
});
