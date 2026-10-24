import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BarrasPorSituacao, ColunasPorDia, LinhaPorDia } from "./Graficos";

const DIAS = Array.from({ length: 10 }, (_, n) => ({ dia: `2026-10-${String(10 + n).padStart(2, "0")}`, valor: n % 4 }));

describe("Gráficos (APP-032)", () => {
  it("barras por situação: rótulo, número e porcentagem escritos, e a ordem recebida", () => {
    render(<BarrasPorSituacao itens={[{ rotulo: "Atrasado", total: 6 }, { rotulo: "Ok", total: 3 }, { rotulo: "Concluído", total: 1 }]} />);
    const lista = screen.getByRole("list", { name: "Por situação: Atrasado 6, Ok 3, Concluído 1" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens.map((li) => li.textContent)).toEqual(["Atrasado6 · 60%", "Ok3 · 30%", "Concluído1 · 10%"]);
  });

  it("tocar numa barra chama o filtro; tocar na escolhida também (para o filtro desfazer)", async () => {
    const escolher = vi.fn();
    render(<BarrasPorSituacao itens={[{ rotulo: "Atrasado", total: 6 }, { rotulo: "Ok", total: 3 }]} aoEscolher={escolher} escolhido="Ok" />);
    await userEvent.click(screen.getByRole("button", { name: /^Atrasado/ }));
    expect(escolher).toHaveBeenCalledWith("Atrasado");
    expect(screen.getByRole("button", { name: /^Ok/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Ok/ }));
    expect(escolher).toHaveBeenLastCalledWith("Ok");
  });

  it("sem aoEscolher não há botões (só leitura)", () => {
    render(<BarrasPorSituacao itens={[{ rotulo: "Ok", total: 3 }]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("colunas por dia: resumo no rótulo, uma coluna por dia com o valor ao passar o mouse, e o número em cima", () => {
    const { container } = render(<ColunasPorDia pontos={DIAS} descricao="Análises registradas por dia" />);
    expect(screen.getByRole("img", { name: "Análises registradas por dia: 13 no período" })).toBeInTheDocument();
    expect(container.querySelectorAll("rect.coluna-dia")).toHaveLength(10);
    expect(container.querySelector("rect.coluna-dia title")?.textContent).toBe("10/10: 0");
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toContain("3");
  });

  it("colunas de um período longo não escrevem o número em cima (só no mouse)", () => {
    const longo = Array.from({ length: 30 }, (_, n) => ({ dia: `2026-09-${String(n + 1).padStart(2, "0")}`, valor: 3 }));
    const { container } = render(<ColunasPorDia pontos={longo} descricao="Dias" />);
    expect(container.querySelectorAll("rect.coluna-dia")).toHaveLength(30);
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).not.toContain("3"); // a escala é 0, 2, 4
    expect(container.querySelector("rect.coluna-dia title")?.textContent).toBe("01/09: 3");
  });

  it("linha por dia: um ponto por dia, com título e área sob a linha", () => {
    const { container } = render(<LinhaPorDia pontos={DIAS} descricao="Não ok por dia" />);
    expect(screen.getByRole("img", { name: "Não ok por dia: 13 no período" })).toBeInTheDocument();
    expect(container.querySelectorAll("circle.ponto-dia")).toHaveLength(10);
    expect(container.querySelector("path.linha-dia")?.getAttribute("d")).toMatch(/^M.* L/);
    expect(container.querySelector("path[fill^='url(']")).not.toBeNull();
  });

  it("escala nunca é zero, mesmo com tudo zerado", () => {
    const { container } = render(<ColunasPorDia pontos={DIAS.map((d) => ({ ...d, valor: 0 }))} descricao="Zero" />);
    expect(container.querySelectorAll("text").length).toBeGreaterThan(3);
  });
});
