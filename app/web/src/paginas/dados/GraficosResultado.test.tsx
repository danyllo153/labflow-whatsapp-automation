import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GraficoResultado, { coresDasSeries, estadoDo, faixaNormal, type PontoResultado } from "./GraficoResultado";
import TabPositivos, { agruparPorReferencia, contarPorMes, type TabPositivo } from "./TabPositivos";

function ponto(dia: number, valor: number, extra: Partial<PontoResultado> = {}): PontoResultado {
  return {
    data: `2026-10-${String(dia).padStart(2, "0")}`,
    analise: "C.T 48h",
    valor,
    menor: false,
    acima: false,
    load: `4350${dia}`,
    lote: "1",
    navio: null,
    lido: String(valor),
    diluicao: null,
    ...extra,
  };
}

function servir(rotas: Record<string, unknown>) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const corpo = rotas[url.split("?")[0]];
      return new Response(JSON.stringify(corpo ?? {}), { status: corpo ? 200 : 404, headers: { "Content-Type": "application/json" } });
    }),
  );
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Faixa normal e estado do ponto", () => {
  it("a faixa é a média dos últimos 30 dias ± 2 desvios, sem os '<'", () => {
    const pontos = [ponto(1, 100), ponto(2, 100), ponto(3, 100), ponto(4, 5, { menor: true })];
    expect(faixaNormal(pontos)).toEqual({ de: 100, ate: 100 });
    expect(faixaNormal([ponto(1, 100), ponto(2, 100)])).toBeNull(); // poucos pontos: sem faixa
  });

  it("cada série tem a sua cor: C.T, B.L 72h e B.L 120h fixas, as outras sem repetir", () => {
    const cores = coresDasSeries(["B.L", "B.L pré", "C.T", "Psicrotróficos", "Psicrotróficos pré"]);
    expect(cores[0]).toBe("#db2777");
    expect(cores[2]).toBe("#2563eb");
    expect(new Set(cores).size).toBe(5);
  });

  it("acima do alerta vem antes de 'fora da faixa'; o '<' nunca fica fora", () => {
    const faixa = { de: 20, ate: 80 };
    expect(estadoDo(ponto(1, 300, { acima: true }), faixa)).toBe("acima");
    expect(estadoDo(ponto(1, 150), faixa)).toBe("fora");
    expect(estadoDo(ponto(1, 10, { menor: true }), faixa)).toBe("menor");
    expect(estadoDo(ponto(1, 50), faixa)).toBe("normal");
  });
});

describe("Tendência do resultado", () => {
  it("monta uma série por análise com o filtro da página e conta o que pede atenção", async () => {
    const pontos = [
      ...[40, 45, 50, 42, 48, 44].map((v, i) => ponto(i + 1, v)),
      ponto(7, 250, { acima: true }),
      ponto(8, 12, { analise: "B.L 120h" }),
      ponto(9, 10, { analise: "B.L 120h", menor: true, lido: "<10" }),
    ];
    const urls = servir({ "/paginas/recebimento/resultados": { alertas: { "C.T 48h": 200, "B.L 120h": 50 }, pontos, cortado: false } });
    render(<GraficoResultado api="/paginas/recebimento" consulta="analise=C.T+48h" rotuloData="data da leitura" />);
    const grafico = await screen.findByRole("img", { name: /Tendência de B.L 120h, C.T 48h: 9 leituras/ });
    expect(JSON.parse(grafico.getAttribute("data-series")!)).toEqual([["B.L 120h", 2], ["C.T 48h", 7]]);
    expect(urls[0]).toBe("/paginas/recebimento/resultados?analise=C.T+48h");
    expect(screen.getByText(/9 leituras com o filtro da tela · 1 acima do alerta/)).toBeInTheDocument();
    expect(screen.getByText(/Acima do alerta \(linha tracejada\)/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Colunas" }));
    expect(screen.getByRole("img", { name: /Tendência/ })).toHaveAttribute("data-tipo", "bar");
  });

  it("compara as fábricas: uma série por fábrica, na análise escolhida (27/10)", async () => {
    const pontos = [
      ponto(1, 40, { fabrica: "AQA" }),
      ponto(2, 60, { fabrica: "CON" }),
      ponto(3, 30, { fabrica: "AQA" }),
      ponto(4, 12, { analise: "B.L 72h", fabrica: "CON" }),
    ];
    servir({ "/paginas/recebimento/resultados": { alertas: { "C.T 48h": 200 }, pontos, cortado: false } });
    render(<GraficoResultado api="/paginas/recebimento" consulta="" rotuloData="data da leitura" />);
    await screen.findByRole("img", { name: /Tendência/ });
    await userEvent.setup().click(screen.getByRole("button", { name: "Por fábrica" }));
    const grafico = screen.getByRole("img", { name: /Tendência de AQA, CON/ });
    expect(JSON.parse(grafico.getAttribute("data-series")!)).toEqual([["AQA", 2], ["CON", 1]]);
    await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Análise" }), "B.L 72h");
    expect(JSON.parse(screen.getByRole("img", { name: /Tendência de CON/ }).getAttribute("data-series")!)).toEqual([["CON", 1]]);
  });

  it("sem alerta (NFC) não mostra a legenda do alerta; sem leitura avisa", async () => {
    servir({ "/paginas/recebimento-nfc/resultados": { alertas: {}, pontos: [ponto(1, 14000, { diluicao: "10⁻³" })], cortado: false } });
    render(<GraficoResultado api="/paginas/recebimento-nfc" consulta="" rotuloData="recebido em" />);
    await screen.findByRole("img", { name: /Tendência de C.T 48h: 1 leituras/ });
    expect(screen.queryByText(/Acima do alerta/)).not.toBeInTheDocument();
  });
});

describe("Limite das tabelas com vigência (tanques, Howard)", () => {
  it("a linha é o Limite (vermelho), não o alerta; Howard em % na escala comum", async () => {
    servir({
      "/paginas/howard/resultados": {
        alertas: { Howard: 24 },
        rotulo_limite: "Limite",
        escala: "linear",
        unidade: "Howard (%)",
        pontos: [ponto(1, 32, { analise: "Howard", acima: true, ref: "NAVIO EXEMPLO L1 F2" }), ponto(2, 10, { analise: "Howard" })],
        cortado: false,
      },
    });
    render(<GraficoResultado api="/paginas/howard" consulta="teste=Howard" rotuloData="feito em" />);
    expect(await screen.findByText(/2 leituras com o filtro da tela · 1 acima do limite/)).toBeInTheDocument();
    expect(screen.getByText(/Acima do limite \(linha tracejada\)/)).toBeInTheDocument();
  });
});

describe("TAB positivos no ano", () => {
  const POSITIVOS: TabPositivo[] = [
    { data: "2026-03-04", fabrica: "AQA", origem: "Recebimento", referencia: "43100" },
    { data: "2026-03-20", fabrica: "CON", origem: "Embarque", referencia: "NAVIO EXEMPLO 1 F2" },
    { data: "2026-07-02", fabrica: null, origem: "Tank farm", referencia: "T5" },
  ];

  it("conta por mês e fábrica", () => {
    const c = contarPorMes(POSITIVOS);
    expect(c.get("AQA")![2]).toBe(1);
    expect(c.get("Sem fábrica")![6]).toBe(1);
  });

  it("o mesmo load aparece uma vez na lista do mês, com quantas vezes deu positivo", () => {
    const mesmo = { fabrica: "AQA", origem: "Recebimento", referencia: "43100" };
    const g = agruparPorReferencia([
      { ...mesmo, data: "2026-03-09" },
      { ...mesmo, data: "2026-03-04" },
      { data: "2026-03-20", fabrica: "CON", origem: "Embarque", referencia: "NAVIO EXEMPLO 1 F2" },
    ]);
    expect(g.map((p) => [p.referencia, p.vezes, p.data, p.ultima])).toEqual([
      ["43100", 2, "2026-03-04", "2026-03-09"],
      ["NAVIO EXEMPLO 1 F2", 1, "2026-03-20", "2026-03-20"],
    ]);
  });

  it("empilha por fábrica, filtra por fábrica e lista os positivos do mês", async () => {
    const urls = servir({ "/paginas/testes/positivos": POSITIVOS });
    render(<TabPositivos />);
    const grafico = await screen.findByRole("img", { name: /TAB positivos por mês/ });
    expect(JSON.parse(grafico.getAttribute("data-series")!)).toEqual([["AQA", 12], ["CON", 12], ["Sem fábrica", 12]]);
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText("Mês"), "2");
    const lista = screen.getByRole("heading", { name: "Março · 2 positivos" }).parentElement!;
    expect(within(lista).getByText("NAVIO EXEMPLO 1 F2")).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText("Fábrica"), "AQA");
    expect(urls[urls.length - 1]).toMatch(/\/paginas\/testes\/positivos\?teste=TAB&ano=\d{4}&fabrica=AQA$/);
  });
});
