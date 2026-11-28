import { describe, expect, it } from "vitest";

import { agruparDrops, agruparTanques, resumoDasLinhas, type CelulaDeAnalise } from "./ladoALado";

const base = { data_coleta: "2026-11-20", origem: "Terra", navio: null, tanque: "T99", frasco: "Normal", lida_por: "Ana (demo)", repeticao: false };

describe("Tanques lado a lado (Normal | Stress)", () => {
  const f = (frasco: string, analise: string, extra: Record<string, unknown> = {}) => ({
    ...base, frasco, analise, etapa: "Leitura final", prevista: "2026-11-22", contagem: "12", resultado: "Ok", situacao: "Lido", ...extra,
  });

  it("Normal e Stress do mesmo tanque viram 1 linha, em duas divisões com as mesmas análises", () => {
    const { linhas, colunas } = agruparTanques([
      f("Normal", "C.T"),
      f("Normal", "B.L", { etapa: "Pré-leitura", contagem: "<1" }),
      f("Normal", "B.L", { contagem: null, resultado: "Pendente", situacao: "Atrasado", prevista: "2026-11-25" }),
      f("Stress", "C.T", { contagem: "7" }),
      f("Stress", "Psicrotróficos", { contagem: null, resultado: "Pendente", situacao: "No prazo", prevista: "2026-11-25" }),
    ]);
    expect(linhas).toHaveLength(1);
    expect(colunas.map((c) => [c.grupo ?? "", c.rotulo])).toEqual([
      ["", "Tanque"], ["", "Data da coleta"], ["", "Origem"], ["", "Navio"],
      ["Normal", "C.T"], ["Normal", "B.L"], ["Normal", "Psicrotróficos"],
      ["Stress", "C.T"], ["Stress", "B.L"], ["Stress", "Psicrotróficos"],
      ["", "Situação"], ["", "Lido por"],
    ]);
    const c = (k: string) => linhas[0][k] as CelulaDeAnalise | undefined;
    expect(c("n_analise_0")?.texto).toBe("12");
    expect(c("n_analise_1")?.texto).toBe("Pré: <1 · Final: Atrasado · 25/11");
    expect(c("s_analise_0")?.texto).toBe("7");
    expect(c("s_analise_2")).toMatchObject({ texto: "Para ler · 25/11", pendente: true });
    expect(c("s_analise_1")).toBeUndefined(); // metade sem a análise: a tela mostra "—"
    expect(linhas[0].situacao).toBe("Atrasado");
  });

  it("a célula mostra os quatro estados: para ler, em análise, atrasado e o resultado", () => {
    const e = (analise: string, extra: Record<string, unknown>) => f("Normal", analise, { contagem: null, resultado: "Pendente", ...extra });
    const { linhas } = agruparTanques([
      f("Normal", "C.T"),
      e("B.L", { situacao: "Vence hoje", prevista: "2026-11-28" }),
      e("Psicrotróficos", { situacao: "No prazo", prevista: "2026-12-03" }),
      e("Wort", { situacao: "Atrasado", prevista: "2026-11-26" }),
    ]);
    const c = (n: number) => linhas[0][`n_analise_${n}`] as CelulaDeAnalise;
    expect([c(0).estado, c(0).texto]).toEqual(["resultado", "12"]);
    expect([c(1).estado, c(1).texto]).toEqual(["em_analise", "Em análise · 28/11"]);
    expect([c(2).estado, c(2).texto]).toEqual(["para_ler", "Para ler · 03/12"]);
    expect([c(3).estado, c(3).texto]).toEqual(["atrasado", "Atrasado · 26/11"]);
  });

  it("tanque só com Normal (ou só com Stress) deixa a outra metade vazia", () => {
    const { linhas } = agruparTanques([f("Normal", "C.T"), f("Stress", "C.T", { tanque: "T100" })]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].n_analise_0).toBeDefined();
    expect(linhas[0].s_analise_0).toBeUndefined();
    expect(linhas[1].n_analise_0).toBeUndefined();
    expect(linhas[1].s_analise_0).toBeDefined();
  });

  it("Não ok em qualquer metade vence a situação da linha", () => {
    const { linhas } = agruparTanques([f("Normal", "C.T"), f("Stress", "C.T", { contagem: "250", resultado: "Não ok" })]);
    expect(linhas[0].situacao).toBe("Não ok");
    expect((linhas[0].s_analise_0 as CelulaDeAnalise).nao_ok).toBe(true);
  });

  it("as duas leituras do Wort (profundidade e superfície) ficam na mesma etapa da célula", () => {
    const wort = { ...base, analise: "Psicrotróficos", etapa: "Leitura final", prevista: "2026-11-30", resultado: "Ok", situacao: "Lido" };
    const { linhas } = agruparTanques([{ ...wort, contagem: "5" }, { ...wort, contagem: "<1" }]);
    expect(linhas).toHaveLength(1);
    expect((linhas[0].n_analise_2 as CelulaDeAnalise).texto).toBe("5 / <1");
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
    expect(linhas[0].drop_0).toEqual({ situacao: "Concluído", texto: "prevista 25/11", estado: "resultado" });
    expect(linhas[0].drop_1).toEqual({ situacao: "Atrasado", texto: "prevista 30/11", estado: "atrasado" });
    expect(linhas[0].drop_2).toEqual({ situacao: "No prazo", texto: "prevista 05/12", estado: "para_ler" });
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
