import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";
import type { Configuracao } from "./TurnosEstufas";

const ADMIN = { ...ANA, cargo: "Admin", pode: ["ver_paginas", "configurar_turnos", "gerenciar_pessoas"] };

const BASE: Configuracao = {
  turnos: [
    { id: 1, nome: "Manhã", inicio: "08:00", fim: "16:00" },
    { id: 2, nome: "Tarde", inicio: "16:00", fim: "00:00" },
    { id: 3, nome: "Madrugada", inicio: "00:00", fim: "08:00" },
  ],
  atividades: [
    { id: 1, turno_id: 1, texto: "Leitura de placa", dias_semana: null, ordem: 1, ativa: true },
    { id: 2, turno_id: 1, texto: "Planilhas", dias_semana: null, ordem: 2, ativa: false },
    { id: 3, turno_id: 3, texto: "Coliformes demais fábricas", dias_semana: [5], ordem: 1, ativa: true },
  ],
  estufas: [
    { id: 3, auxiliar: false, ativa: true, faixa: { id: 1, minimo: "35.0", maximo: "37.0", desde: "2026-01-01", ate: null }, historico: [{ id: 1, minimo: "35.0", maximo: "37.0", desde: "2026-01-01", ate: null }] },
    { id: 6, auxiliar: true, ativa: true, faixa: null, historico: [] },
  ],
};

function abrir(rotas: Parameters<typeof servidorFalso>[0] = {}, pessoa = ADMIN) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: pessoa }),
    "GET /admin/turnos": () => ({ status: 200, corpo: BASE }),
    ...rotas,
  });
  render(
    <MemoryRouter initialEntries={["/admin/turnos"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Admin → Turnos e estufas (APP-028)", () => {
  it("só o Admin tem o item no menu lateral", async () => {
    abrir();
    expect(await screen.findByRole("heading", { level: 1, name: "Turnos e estufas" })).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Menu" })).getByRole("link", { name: "Turnos e estufas" })).toBeInTheDocument();
  });

  it("grava os horários dos três turnos de uma vez", async () => {
    const api = abrir({ "PUT /admin/turnos/horarios": () => ({ status: 200, corpo: BASE }) });
    const form = await screen.findByRole("form", { name: "Horários dos turnos" });
    const inicio = within(form).getByLabelText("Início de Manhã");
    await userEvent.clear(inicio);
    await userEvent.type(inicio, "07:00");
    await userEvent.click(within(form).getByRole("button", { name: "Gravar horários" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /admin/turnos/horarios")?.corpo).toEqual({
      turnos: [
        { id: 1, inicio: "07:00", fim: "16:00" },
        { id: 2, inicio: "16:00", fim: "00:00" },
        { id: 3, inicio: "00:00", fim: "08:00" },
      ],
    });
    expect(await within(form).findByText("Horários gravados.")).toBeInTheDocument();
  });

  it("mostra o erro da API quando os horários não fecham as 24 horas", async () => {
    abrir({ "PUT /admin/turnos/horarios": () => ({ status: 422, corpo: { detail: "Os três turnos precisam cobrir as 24 horas: cada um começa na hora em que o anterior termina." } }) });
    const form = await screen.findByRole("form", { name: "Horários dos turnos" });
    await userEvent.click(within(form).getByRole("button", { name: "Gravar horários" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("cobrir as 24 horas");
  });

  it("lista as atividades do turno (as desativadas só se pedir), com os dias", async () => {
    abrir();
    const grupo = await screen.findByRole("group", { name: "Atividades fixas" });
    expect(within(grupo).getByText("Leitura de placa")).toBeInTheDocument();
    expect(within(grupo).queryByText("Planilhas")).not.toBeInTheDocument();
    await userEvent.click(within(grupo).getByRole("checkbox", { name: "Mostrar as desativadas" }));
    expect(within(grupo).getByText("Planilhas")).toBeInTheDocument();
    await userEvent.click(within(grupo).getByRole("button", { name: "Madrugada" }));
    expect(within(grupo).getByText(/Coliformes demais fábricas/)).toHaveTextContent("sex");
  });

  it("adiciona atividade, desativa, sobe e edita", async () => {
    const api = abrir({
      "POST /admin/turnos/atividades": () => ({ status: 201, corpo: BASE }),
      "PUT /admin/turnos/atividades/1": () => ({ status: 200, corpo: BASE }),
      "POST /admin/turnos/atividades/1/mover": () => ({ status: 200, corpo: BASE }),
    });
    const grupo = await screen.findByRole("group", { name: "Atividades fixas" });
    const nova = within(grupo).getByRole("form", { name: "Nova atividade" });
    await userEvent.type(within(nova).getByLabelText("Nova atividade neste turno"), "Conferir o freezer");
    await userEvent.click(within(nova).getByRole("checkbox", { name: "sex" }));
    await userEvent.click(within(nova).getByRole("button", { name: "Adicionar atividade" }));
    expect(api.chamadas.find((c) => c.rota === "POST /admin/turnos/atividades")?.corpo).toEqual({ turno_id: 1, texto: "Conferir o freezer", dias_semana: [5] });

    await userEvent.click(within(grupo).getByRole("button", { name: "Subir Leitura de placa" }));
    expect(api.chamadas.find((c) => c.rota === "POST /admin/turnos/atividades/1/mover")?.corpo).toEqual({ direcao: "cima" });

    await userEvent.click(within(grupo).getByRole("button", { name: "Desativar Leitura de placa" }));
    expect(api.chamadas.filter((c) => c.rota === "PUT /admin/turnos/atividades/1").slice(-1)[0]?.corpo).toEqual({ texto: "Leitura de placa", dias_semana: null, ativa: false });

    await userEvent.click(within(grupo).getByRole("button", { name: "Editar Leitura de placa" }));
    const form = within(grupo).getByRole("form", { name: "Editar Leitura de placa" });
    await userEvent.clear(within(form).getByLabelText("Atividade"));
    await userEvent.type(within(form).getByLabelText("Atividade"), "Leitura das placas");
    await userEvent.click(within(form).getByRole("checkbox", { name: "seg" }));
    await userEvent.click(within(form).getByRole("button", { name: "Salvar" }));
    expect(api.chamadas.filter((c) => c.rota === "PUT /admin/turnos/atividades/1").slice(-1)[0]?.corpo).toEqual({ texto: "Leitura das placas", dias_semana: [1], ativa: true });
  });

  it("estufas: mostra a faixa vigente, grava faixa nova com data e desativa", async () => {
    const api = abrir({
      "PUT /admin/turnos/estufas/3/faixa": () => ({ status: 200, corpo: BASE }),
      "PUT /admin/turnos/estufas/3": () => ({ status: 200, corpo: BASE }),
    });
    const e3 = await screen.findByRole("group", { name: "Estufa 03" });
    expect(e3).toHaveTextContent("faixa 35,0 a 37,0 °C desde 01/01");
    expect(screen.getByRole("group", { name: "Estufa 06" })).toHaveTextContent("auxiliar, sem faixa");
    expect(within(screen.getByRole("group", { name: "Estufa 06" })).queryByRole("button", { name: /Faixa da/ })).not.toBeInTheDocument();
    await userEvent.click(within(e3).getByRole("button", { name: "Faixa da Estufa 03" }));
    const form = within(e3).getByRole("form", { name: "Nova faixa da Estufa 03" });
    const minimo = within(form).getByLabelText("Mínimo (°C)");
    await userEvent.clear(minimo);
    await userEvent.type(minimo, "34,5");
    await userEvent.clear(within(form).getByLabelText("Máximo (°C)"));
    await userEvent.type(within(form).getByLabelText("Máximo (°C)"), "36,5");
    await userEvent.type(within(form).getByLabelText("Vale desde (vazio = hoje)"), "2026-10-23");
    await userEvent.click(within(form).getByRole("button", { name: "Gravar faixa" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /admin/turnos/estufas/3/faixa")?.corpo).toEqual({ minimo: 34.5, maximo: 36.5, desde: "2026-10-23" });
    await userEvent.click(within(e3).getByRole("button", { name: "Desativar a Estufa 03" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /admin/turnos/estufas/3")?.corpo).toEqual({ ativa: false });
  });

  it("adiciona uma estufa nova", async () => {
    const api = abrir({ "POST /admin/turnos/estufas": () => ({ status: 201, corpo: BASE }) });
    const form = await screen.findByRole("form", { name: "Nova estufa" });
    await userEvent.type(within(form).getByLabelText("Número da nova estufa"), "13");
    await userEvent.click(within(form).getByRole("button", { name: "Adicionar estufa" }));
    expect(api.chamadas.find((c) => c.rota === "POST /admin/turnos/estufas")?.corpo).toEqual({ id: 13, auxiliar: false });
  });
});
