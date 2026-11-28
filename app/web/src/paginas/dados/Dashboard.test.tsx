import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Dashboard, { contarPor, contarPorDia } from "./Dashboard";
import { PAGINAS, type DefinicaoDePagina } from "./definicoes";

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

  // Coletas (28/11): "não tem nada a ver tendência em coleta" - só Colunas; as outras definições seguem com as duas opções
  const coletas = PAGINAS.find((p) => p.caminho === "coletas") as DefinicaoDePagina;
  const dados = [{ coletado_por: "Ana (demo)", data_coleta: "2026-10-20", tanque: "T1", origem: "Terra" }];

  it("Coletas só oferece Colunas: sem Tendência, sem Por dia de e sem Linha/Colunas", () => {
    render(<Dashboard def={coletas} linhas={dados} total={1} inicial={coletas.dashboard} aoFechar={() => {}} />);
    expect(screen.getByLabelText("Contar por")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tendência" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Por dia de")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Forma" })).not.toBeInTheDocument();
  });

  it("outra definição, sem a opção, continua com Colunas e Tendência", () => {
    const outra: DefinicaoDePagina = { ...coletas, dashboard: undefined };
    render(<Dashboard def={outra} linhas={dados} total={1} aoFechar={() => {}} />);
    expect(screen.getByRole("button", { name: "Colunas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tendência" })).toBeInTheDocument();
  });
});
