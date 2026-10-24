import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, ESTADO_TURNO, servidorFalso } from "../testes-servidor";

const NA_TARDE = {
  id: 41, turno_id: 2, turno: "Tarde", dia: "2026-10-22", entrada: "16:00", saida: null,
  entrada_registrada: "16:00", saida_registrada: null, motivo_correcao: null,
};

const EQUIPE = {
  turno: "Tarde",
  dia: "2026-10-22",
  no_turno: 2,
  pessoas: [
    { nome: "Ana Souza", entrada: "16:00", saida: null, sou_eu: true },
    { nome: "Bruno Lima", entrada: "16:10", saida: null, sou_eu: false },
    { nome: "Carla Dias", entrada: "16:00", saida: "18:00", sou_eu: false },
  ],
};

function abrir(caminho: string, rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({ "GET /me": () => ({ status: 200, corpo: ANA }), ...rotas });
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Turno como central (APP-033)", () => {
  it("mostra a equipe do turno e o chip com quantas pessoas estão nele", async () => {
    abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, no_turno: NA_TARDE } }),
      "GET /turno/equipe": () => ({ status: 200, corpo: EQUIPE }),
    });
    const cartao = await screen.findByRole("region", { name: "Equipe do turno" });
    expect(within(cartao).getByText("Bruno Lima")).toBeInTheDocument();
    expect(within(cartao).getByText("Você")).toBeInTheDocument();
    expect(within(cartao).getByText(/Já saíram: Carla Dias \(16:00–18:00\)/)).toBeInTheDocument();
    expect((await screen.findAllByRole("link", { name: "2 pessoas no turno, turno Tarde" })).length).toBeGreaterThan(0);
  });

  it("antes da entrada (check-in) mostra a equipe, mas não abre as atividades nem a linha do tempo", async () => {
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, checkin_obrigatorio: true } }),
      "GET /turno/equipe": () => ({ status: 200, corpo: EQUIPE }),
    });
    expect(await screen.findByRole("region", { name: "Equipe do turno" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Atividades realizadas" })).not.toBeInTheDocument();
    expect(api.vezes("GET /turno/registros")).toBe(0);
  });

  it("anota uma atividade realizada e mostra quem e a que horas; só quem escreveu exclui", async () => {
    let itens: any[] = [
      { tipo: "esterilizacao", texto: "Esterilização ponteira · ciclo 102", quem: "Bruno Lima", quando: "16:30", id: null, pode_excluir: false },
    ];
    const registros = () => ({ status: 200, corpo: { turno: "Tarde", dia: "2026-10-22", pode_escrever: true, itens } });
    const api = abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, no_turno: NA_TARDE } }),
      "GET /turno/registros": registros,
      "POST /turno/registros": (corpo) => {
        itens = [{ tipo: "livre", texto: corpo.texto, quem: "Ana Souza", quando: "17:05", id: 9, pode_excluir: true }, ...itens];
        return { ...registros(), status: 201 };
      },
      "DELETE /turno/registros/9": () => {
        itens = itens.filter((i) => i.id !== 9);
        return registros();
      },
    });
    const cartao = await screen.findByRole("region", { name: "Atividades realizadas" });
    expect(within(cartao).getByText("por Bruno Lima")).toBeInTheDocument();
    expect(within(cartao).queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();

    await userEvent.type(within(cartao).getByLabelText("O que foi feito"), "Limpeza da capela");
    await userEvent.click(within(cartao).getByRole("button", { name: "Anotar" }));
    expect(api.chamadas.find((c) => c.rota === "POST /turno/registros")?.corpo).toEqual({ texto: "Limpeza da capela" });
    expect(await within(cartao).findByText("por Ana Souza")).toBeInTheDocument();
    expect(within(cartao).getByText("17:05")).toBeInTheDocument();

    await userEvent.click(within(cartao).getByRole("button", { name: "Excluir: Limpeza da capela" }));
    expect(api.vezes("DELETE /turno/registros/9")).toBe(1);
    expect(await within(cartao).findByText(/Nada registrado|por Bruno Lima/)).toBeInTheDocument();
    expect(within(cartao).queryByText("Limpeza da capela")).not.toBeInTheDocument();
  });

  it("mostra as análises a fazer hoje na tela do Turno", async () => {
    abrir("/turno", {
      "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, no_turno: NA_TARDE } }),
      "GET /pendencias-hoje": () => ({
        status: 200,
        corpo: {
          vence_hoje: 1, atrasados: 0, desvios_abertos: 0,
          itens: [{ bloco: "Leituras NFC", tipo: "NFC", referencia: "T-01", analise: "NFC", prevista: "2026-10-22", situacao: "Vence hoje" }],
        },
      }),
    });
    expect(await screen.findByText("Análises a fazer hoje (1)")).toBeInTheDocument();
    expect(await screen.findByText("T-01")).toBeInTheDocument();
  });
});
