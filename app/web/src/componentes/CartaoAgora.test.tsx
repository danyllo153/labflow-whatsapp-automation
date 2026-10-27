import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Pendencia } from "./BlocosDePendencias";
import { ESTADO_TURNO, servidorFalso } from "../testes-servidor";
import CartaoAgora, { destaquesDoDia, destinoDe, situacaoDoTurno } from "./CartaoAgora";

/** APP-056: o cartão "Agora" do Início (relógio do turno, registro livre e destaques). Dados fictícios. */

afterEach(() => vi.unstubAllGlobals());

const p = (bloco: string, tipo: string, grupo: string, situacao: Pendencia["situacao"] = "Vence hoje"): Pendencia => ({
  bloco, tipo, referencia: "x", analise: grupo, prevista: null, situacao, grupo,
});

describe("Cartão Agora (APP-056)", () => {
  it("diz quanto falta para o turno acabar, também na Tarde que vai até a meia-noite", () => {
    const tarde = situacaoDoTurno(ESTADO_TURNO as never, new Date("2026-10-22T20:42:00-03:00"));
    expect(tarde).toEqual({ texto: "Tarde · 16:00 às 00:00", faltam: "faltam 3 h 18" });
  });

  it("os destaques são os 3 grupos com mais coisa, atrasados primeiro, e levam ao app certo", () => {
    const itens = [
      ...Array.from({ length: 5 }, () => p("FCOJ Recebimento", "TAB", "TAB · para espalhar")),
      ...Array.from({ length: 2 }, () => p("FCOJ Recebimento", "C.T/B.L", "B.L 72h", "Atrasado")),
      ...Array.from({ length: 3 }, () => p("NFC Navio", "Leitura de NFC", "O.SKY 189 · Normal")),
      p("Desvios", "Desvio", "Desvio de drop · D10"),
    ];
    const d = destaquesDoDia(itens);
    expect(d.map((x) => [x.nome, x.n, x.caminho])).toEqual([
      ["Recebimento · B.L 72h", 2, "/leituras?aba=recebimento&analise=BL72"],
      ["Recebimento · TAB · para espalhar", 5, "/analises/tab"],
      ["O.SKY 189 · Normal", 3, "/leituras?aba=tanques-navio"],
    ]);
  });

  it("o botão do destaque diz a ação do grupo e abre o app (que só grava com o Confirmar)", () => {
    const d = (bloco: string, tipo: string, grupo: string) => destinoDe(p(bloco, tipo, grupo));
    expect(d("FCOJ Recebimento", "TAB", "TAB · para espalhar")).toEqual({ caminho: "/analises/tab", acao: "Espalhei todos" });
    expect(d("FCOJ Recebimento", "Coliformes", "Coliformes · para espalhar")).toEqual({ caminho: "/analises/coliformes", acao: "Estriei todos" });
    expect(d("FCOJ Embarque", "TAB", "TAB · para ler")).toEqual({ caminho: "/analises/tab", acao: null });
    expect(d("FCOJ Embarque", "Howard", "Howard")).toEqual({ caminho: "/analises/howard", acao: null });
    expect(d("NFC Tank farm", "Leitura de NFC", "Psicrotróficos Normal · Leitura final")).toEqual({ caminho: "/leituras?aba=tanques-terra", acao: "Ler as placas" });
    expect(d("NFC Navio", "Drop", "O.SKY 189 · Drops")).toEqual({ caminho: "/analises/drops", acao: "Concluir drops" });
    expect(d("FCOJ Embarque", "C.T/B.L", "C.T 48h")).toEqual({ caminho: "/leituras?aba=embarque", acao: "Lançar resultados" });
    expect(d("Recebimento NFC", "C.T/B.L", "B.L 72h")).toEqual({ caminho: "/leituras?aba=recebimento-nfc", acao: "Lançar resultados" });
    expect(d("Desvios", "Desvio de tanque", "Desvio de tanque · C.T")).toEqual({ caminho: "/analises/desvios?aba=abertos", acao: null });
    expect(d("Águas e superfícies", "Baia", "Baia 3")).toEqual({ caminho: "/paginas/baias", acao: null });
  });

  it("o registro livre vai para a linha do tempo do turno", async () => {
    const api = servidorFalso({ "POST /turno/registros": () => ({ status: 201, corpo: { itens: [] } }) });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CartaoAgora turno={ESTADO_TURNO as never} estufas={null} itens={[p("FCOJ Embarque", "TAB", "TAB · para ler")]} />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("O que você está fazendo?"), "troquei o filtro da capela");
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(api.chamadas.find((c) => c.rota === "POST /turno/registros")?.corpo).toEqual({ texto: "troquei o filtro da capela" });
    expect(await screen.findByText("Registrado na linha do tempo do turno.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver o 1" })).toHaveAttribute("href", "/analises/tab");
  });
});
