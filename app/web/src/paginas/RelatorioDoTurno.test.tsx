import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { Relatorio } from "./RelatorioDoTurno";

const BASE: Relatorio = {
  turno_id: 1,
  turno: "Manhã",
  dia: "2026-10-22",
  inicio: "08:00",
  fim: "16:00",
  em_andamento: true,
  anterior: { turno_id: 3, turno: "Madrugada", dia: "2026-10-22" },
  proximo: null,
  analistas: [
    { nome: "Ana Souza", entrada: "08:05", saida: null, corrigido: false },
    { nome: "Bruno Lima", entrada: "08:00", saida: "16:00", corrigido: true },
  ],
  analistas_extras: "Carla",
  feito: [
    { tipo: "Coletas", total: 3, por_pessoa: [{ quem: "Ana Souza", n: 2 }, { quem: "Bruno Lima", n: 1 }] },
    { tipo: "Leituras de NFC", total: 0, por_pessoa: [] },
    { tipo: "Atividades do turno", total: 1, por_pessoa: [] },
  ],
  atividades_feitas: [{ texto: "Planilhas", quem: "Ana Souza", quando: "09:12" }],
  atividades_nao_feitas: ["Materiais", "Reagentes"],
  esterilizacoes: [{ id: 5, tipo: "Meio", ciclo: "103", meio: "PDA", descricao: null, quem: "Ana Souza", quando: "09:40" }],
  adiantados: { total: 1, itens: [{ tipo: "Drop D5", referencia: "Tanque 41 (coleta 17/10)", prevista: "2026-10-25", quem: "Danyllo" }] },
  pendentes: {
    vence_hoje: 4,
    atrasados: 2,
    desvios_abertos: 3,
    por_bloco: [{ bloco: "NFC Tank farm", vence_hoje: 4, atrasados: 2 }],
  },
  do_dia: { contagens_lidas: 12, testes_com_resultado: 5 },
  escritos: { pendencias_escritas: "Refazer meio X", esterilizacoes_pendentes: null, ocorrencias: null },
  encerramento: { encerrado: false, por: null, quando: null, automatico: false },
  adiante: { turno: "Tarde", dia: "2026-10-22", atividades_nao_feitas: 2, vence_hoje: 4, atrasados: 2, desvios_abertos: 3, recados: 1 },
  reaberto: null,
  atualizado_por: null,
  pode_editar: true,
  pode_encerrar: false,
  pode_reabrir: false,
};

function abrir(rel: Relatorio = BASE, caminho = "/turno/relatorio", rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: ANA }),
    "GET /turno/relatorio": () => ({ status: 200, corpo: rel }),
    ...rotas,
  });
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

describe("Relatório do turno (APP-024)", () => {
  it("mostra o turno, os analistas, o que foi feito e o que está pendente", async () => {
    abrir();
    expect(await screen.findByRole("heading", { level: 1, name: "Relatório do turno · Manhã de 22/10" })).toBeInTheDocument();
    expect(screen.getByText(/08:00 às 16:00 · em andamento/)).toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.getByText(/\(horário corrigido\)/)).toBeInTheDocument();
    expect(screen.getByText("Outros: Carla")).toBeInTheDocument();
    expect(screen.getByText(/Ana Souza 2, Bruno Lima 1/)).toBeInTheDocument();
    expect(screen.getByText(/Planilhas · Ana Souza às 09:12/)).toBeInTheDocument();
    expect(screen.getByText("Materiais · Reagentes")).toBeInTheDocument();
    expect(screen.getByText("Meio (PDA) · ciclo 103 · Ana Souza às 09:40")).toBeInTheDocument();
    expect(screen.getByText(/12 leituras de C.T\/B.L e 5 resultados/)).toBeInTheDocument();
    expect(screen.getByText("NFC Tank farm: 4 hoje, 2 atrasadas")).toBeInTheDocument();
  });

  it("o adiantado aparece numa linha separada", async () => {
    abrir();
    const bloco = await screen.findByRole("group", { name: "Adiantados" });
    expect(bloco).toHaveTextContent("Drop D5 · Tanque 41 (coleta 17/10) · prevista 25/10 · Danyllo");
    expect(bloco).toHaveTextContent("não contam como feitos neste turno");
  });

  it("sem adiantados, o bloco não aparece", async () => {
    abrir({ ...BASE, adiantados: { total: 0, itens: [] } });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("group", { name: "Adiantados" })).not.toBeInTheDocument();
  });

  it("grava os campos escritos à mão e mostra o aviso", async () => {
    const api = abrir(BASE, "/turno/relatorio", {
      "PUT /turno/relatorio": (corpo) => ({
        status: 200,
        corpo: { ...BASE, escritos: { ...BASE.escritos, ocorrencias: corpo.ocorrencias }, atualizado_por: "Ana Souza" },
      }),
    });
    const form = await screen.findByRole("form", { name: "Escrito à mão" });
    expect(within(form).getByLabelText("Pendências escritas à mão")).toHaveValue("Refazer meio X");
    await userEvent.type(within(form).getByLabelText("Ocorrências do turno"), "Falta de energia às 10h");
    await userEvent.click(within(form).getByRole("button", { name: "Gravar" }));
    const enviado = api.chamadas.find((c) => c.rota === "PUT /turno/relatorio")?.corpo;
    expect(enviado).toMatchObject({ turno_id: 1, dia: "2026-10-22", ocorrencias: "Falta de energia às 10h", pendencias_escritas: "Refazer meio X" });
    expect(await screen.findByText("Gravado.")).toBeInTheDocument();
    expect(screen.getByText("Última alteração: Ana Souza.")).toBeInTheDocument();
  });

  it("encerrado ou sem permissão: só leitura", async () => {
    abrir({ ...BASE, pode_editar: false, encerramento: { encerrado: true, por: "Bruno Lima", quando: "16:02", automatico: false } });
    expect(await screen.findByText(/encerrado por Bruno Lima às 16:02/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Escrito à mão" })).not.toBeInTheDocument();
    expect(screen.getByText("Refazer meio X")).toBeInTheDocument();
    expect(screen.getByText("Relatório encerrado: só leitura.")).toBeInTheDocument();
  });

  it("os botões de turno anterior e próximo levam ao turno certo", async () => {
    const madrugada = { ...BASE, turno_id: 3, turno: "Madrugada", inicio: "00:00", fim: "08:00", em_andamento: false };
    abrir({ ...BASE, proximo: { turno_id: 2, turno: "Tarde", dia: "2026-10-22" } }, "/turno/relatorio", {
      "GET /turno/relatorio?turno_id=3&dia=2026-10-22": () => ({ status: 200, corpo: madrugada }),
    });
    const anterior = await screen.findByRole("link", { name: "Turno anterior (Madrugada 22/10)" });
    expect(anterior).toHaveAttribute("href", "/turno/relatorio?turno=3&dia=2026-10-22");
    expect(screen.getByRole("link", { name: "Próximo turno (Tarde 22/10)" })).toHaveAttribute("href", "/turno/relatorio?turno=2&dia=2026-10-22");
    await userEvent.click(anterior);
    expect(await screen.findByRole("heading", { level: 1, name: "Relatório do turno · Madrugada de 22/10" })).toBeInTheDocument();
  });

  it("mostra o erro da API (turno que ainda não começou)", async () => {
    servidorFalso({
      "GET /me": () => ({ status: 200, corpo: ANA }),
      "GET /turno/relatorio?turno_id=2&dia=2026-10-22": () => ({ status: 422, corpo: { detail: "O turno Tarde de 22/10 ainda não começou." } }),
    });
    render(
      <MemoryRouter initialEntries={["/turno/relatorio?turno=2&dia=2026-10-22"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("ainda não começou");
    expect(screen.getByRole("link", { name: "Ver o turno de agora" })).toBeInTheDocument();
  });

  it("a tela Turno tem o link para o relatório", async () => {
    abrir(BASE, "/turno");
    expect(await screen.findByRole("link", { name: "Ver o relatório do turno" })).toHaveAttribute("href", "/turno/relatorio");
  });

  it("Encerrar turno mostra o que passa adiante e só grava depois de confirmar", async () => {
    const encerrado: Relatorio = {
      ...BASE,
      pode_editar: false,
      pode_encerrar: false,
      encerramento: { encerrado: true, por: "Ana Souza", quando: "15:58", automatico: false },
    };
    const api = abrir({ ...BASE, pode_encerrar: true }, "/turno/relatorio", {
      "POST /turno/relatorio/encerrar": () => ({ status: 200, corpo: encerrado }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar turno" }));
    const form = screen.getByRole("form", { name: "Encerrar o turno" });
    expect(form).toHaveTextContent("Ficam para a Tarde: 2 atividades sem Feito, 4 análises que vencem hoje, 2 atrasadas, 3 desvios abertos e 1 recados escritos.");
    expect(form).toHaveTextContent("sua saída do turno é registrada agora");
    expect(api.vezes("POST /turno/relatorio/encerrar")).toBe(0);
    await userEvent.click(within(form).getByRole("button", { name: "Confirmar e encerrar" }));
    expect(api.chamadas.find((c) => c.rota === "POST /turno/relatorio/encerrar")?.corpo).toEqual({ turno_id: 1, dia: "2026-10-22", forcar: false });
    expect(await screen.findByText(/encerrado por Ana Souza às 15:58/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Encerrar turno" })).not.toBeInTheDocument();
  });

  it("mostra o erro quando ainda tem gente no turno", async () => {
    abrir({ ...BASE, pode_encerrar: true }, "/turno/relatorio", {
      "POST /turno/relatorio/encerrar": () => ({
        status: 409,
        corpo: { detail: "Ainda estão no turno: Bruno Lima. Elas precisam tocar em Sair do turno antes de encerrar." },
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar turno" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e encerrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ainda estão no turno: Bruno Lima");
  });

  it("Admin vê a opção de fazer sair os outros e a de reabrir com motivo", async () => {
    const encerrado: Relatorio = {
      ...BASE,
      pode_editar: false,
      pode_reabrir: true,
      encerramento: { encerrado: true, por: null, quando: "16:00", automatico: true },
    };
    const api = abrir(encerrado, "/turno/relatorio", {
      "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo: "Admin" } }),
      "POST /turno/relatorio/reabrir": () => ({ status: 200, corpo: { ...BASE, reaberto: "Reaberto por Danyllo: Faltou uma ocorrência" } }),
    });
    expect(await screen.findByText(/encerrado automaticamente às 16:00/)).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Reabrir o turno" });
    await userEvent.type(within(form).getByLabelText("Motivo da reabertura"), "Faltou uma ocorrência");
    await userEvent.click(within(form).getByRole("button", { name: "Reabrir turno" }));
    expect(api.chamadas.find((c) => c.rota === "POST /turno/relatorio/reabrir")?.corpo).toEqual({
      turno_id: 1,
      dia: "2026-10-22",
      motivo: "Faltou uma ocorrência",
    });
    expect(await screen.findByText("Reaberto por Danyllo: Faltou uma ocorrência")).toBeInTheDocument();
  });

  it("só o Admin vê a caixa de fazer sair quem ainda está no turno", async () => {
    abrir({ ...BASE, pode_encerrar: true }, "/turno/relatorio", { "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo: "Admin" } }) });
    await userEvent.click(await screen.findByRole("button", { name: "Encerrar turno" }));
    expect(screen.getByRole("checkbox", { name: /fazer sair também quem ainda está no turno/i })).toBeInTheDocument();
  });
});
