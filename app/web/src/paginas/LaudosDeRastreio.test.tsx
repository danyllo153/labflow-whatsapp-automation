import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { DiaDoFluxo } from "./BrancoDoDia";
import type { MeiosELotes } from "./MeiosLotes";
import type { AguaDoProcesso } from "./aguas/AguaProcesso";
import type { Superficies } from "./aguas/Superficies";
import type { LoadRecebido } from "./dados/CorrigirRecebimento";

/** APP-036 a APP-045: meios e lotes, branco do dia, água do processo, baias e linhas, corrigir recebimento. Dados fictícios. */

const ANALISTA = { ...ANA, cargo: "Analista", pode: ["ver_paginas", "registrar_analise", "registrar_coleta", "corrigir_registro"] };

function abrir(caminho: string, rotas: Parameters<typeof servidorFalso>[0] = {}, me: unknown = ANALISTA) {
  const api = servidorFalso({ "GET /me": () => ({ status: 200, corpo: me }), ...rotas });
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

const FLUXO: DiaDoFluxo = {
  dia: "2026-10-22",
  pode_preencher: true,
  registro: null,
  sugestao: { capela_ct: "<1", capela_bl: "<1", osa: "<1", pda: "<1", wort: "-", pca: "<1" },
  motivo_wort: "nenhum tanque de NFC no dia",
  motivo_pca: "1 coleta(s) de água, baia ou linha no dia",
  recentes: [],
};

describe("Branco do dia (APP-038)", () => {
  it("traz a sugestão, explica o traço e salva", async () => {
    const api = abrir("/fluxo-laminar", {
      "GET /fluxo-laminar": () => ({ status: 200, corpo: FLUXO }),
      "PUT /fluxo-laminar/2026-10-22": (corpo) => ({ status: 200, corpo: { ...FLUXO, registro: { ...corpo, quem: "Ana Souza", quando: "22/10 10:00" } } }),
    });
    const form = await screen.findByRole("form", { name: "Branco do dia" });
    expect(within(form).getByText(/Wort: nenhum tanque de NFC no dia/)).toBeInTheDocument();
    expect(within(form).getByLabelText("Wort")).toHaveValue("-");
    expect(within(form).getByLabelText("PCA")).toHaveValue("<1");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar o dia" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /fluxo-laminar/2026-10-22")?.corpo).toEqual(FLUXO.sugestao);
    expect(await within(form).findByText(/Preenchido por Ana Souza/)).toBeInTheDocument();
  });
});

const MEIOS: MeiosELotes = {
  pode_registrar: true,
  pode_importar: false,
  meios: [
    {
      meio: "OSA",
      em_uso: { lote_id: 2, lote: "1000002", desde: "02/03/2026 08:00", quem: "Ana Souza" },
      lotes: [
        { id: 3, lote: "1000003", recebido_em: "2026-10-13", conservacao: "OK", ph: "OK", observacao: null, quem: "Ana Souza", em_uso: false, usos: [] },
        {
          id: 2, lote: "1000002", recebido_em: "2026-03-02", conservacao: "OK", ph: "OK", observacao: null, quem: "Ana Souza", em_uso: true,
          usos: [{ desde: "02/03/2026", ate: null }],
        },
      ],
    },
    { meio: "PDA", em_uso: null, lotes: [] },
    { meio: "PCA", em_uso: null, lotes: [] },
    { meio: "Wort", em_uso: null, lotes: [] },
  ],
};

describe("Meios e lotes (APP-036)", () => {
  it("mostra o lote em uso, troca com um toque e cadastra lote novo", async () => {
    const api = abrir("/meios-lotes", {
      "GET /meios": () => ({ status: 200, corpo: MEIOS }),
      "POST /meios/3/usar": () => ({ status: 200, corpo: MEIOS }),
      "POST /meios": () => ({ status: 201, corpo: MEIOS }),
    });
    const emUso = await screen.findByRole("region", { name: "Lote em uso de OSA" });
    expect(within(emUso).getByText("1000002")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar o lote 1000002" })).not.toBeInTheDocument(); // já está em uso
    await userEvent.click(screen.getByRole("button", { name: "Usar o lote 1000003" }));
    expect(api.vezes("POST /meios/3/usar")).toBe(1);
    const form = screen.getByRole("form", { name: "Novo lote de OSA" });
    await userEvent.type(within(form).getByLabelText("Número do lote"), "1000004");
    await userEvent.click(within(form).getByLabelText("Já passa a ser o lote em uso"));
    await userEvent.click(within(form).getByRole("button", { name: "Cadastrar lote" }));
    expect(api.chamadas.find((c) => c.rota === "POST /meios")?.corpo).toMatchObject({ meio: "OSA", lote: "1000004", conservacao: "OK", ph: "OK", usar: true });
  });
});

const AGUA: AguaDoProcesso = {
  pode_coletar: true,
  pode_lancar: true,
  coletas: [
    {
      id: 7, dia: "2026-10-22", hora: "09:30",
      pontos: {
        manifold: { coletado: true, ct: null, bl: null },
        camara4: { coletado: false, ct: null, bl: null },
        camara5: { coletado: false, ct: null, bl: null },
        camara6: { coletado: true, ct: null, bl: null },
      },
      observacao: "Esterilizando", quem: "Ana Souza", resultado_por: null, situacao: "Aguardando C.T 48h (24/10)",
    },
  ],
};

describe("Água do processo (APP-037)", () => {
  it("registra a coleta com os pontos e lança <1 em todos", async () => {
    const api = abrir("/paginas/agua-processo", {
      "GET /aguas/processo": () => ({ status: 200, corpo: AGUA }),
      "POST /aguas/processo": () => ({ status: 201, corpo: AGUA }),
      "PUT /aguas/processo/7/resultados": () => ({ status: 200, corpo: AGUA }),
    });
    const form = await screen.findByRole("form", { name: "Nova coleta da água do processo" });
    await userEvent.click(within(form).getByRole("button", { name: "Câmara 5" })); // não coletou
    await userEvent.click(within(form).getByRole("button", { name: "Registrar coleta" }));
    expect(api.chamadas.find((c) => c.rota === "POST /aguas/processo")?.corpo.pontos).toEqual(["manifold", "camara4", "camara6"]);
    expect(screen.getByText(/Câmara 4: -/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Lançar resultados da coleta de 22\/10 09:30/ }));
    await userEvent.click(screen.getByRole("button", { name: "C.T. <1 em todos" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar resultados" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /aguas/processo/7/resultados")?.corpo).toEqual({
      ct: { manifold: "<1", camara6: "<1" }, bl: { manifold: "", camara6: "" },
    });
  });
});

const BAIAS: Superficies = {
  tipo: "Baia",
  pode_coletar: true,
  pode_lancar: true,
  coletas: [
    {
      id: 9, tipo: "Baia", ponto: "08", dia: "2026-10-22", hora: "07:10", analisada_em: "2026-10-22", ct_48: null, bl_72: null, bl_120: null,
      observacao: null, quem: "Ana Souza", resultado_por: null, situacao: "Aguardando C.T 48h (24/10)",
    },
  ],
};

describe("Baias e linhas (APP-037)", () => {
  it("registra várias baias de uma vez e lança o C.T. na tabela", async () => {
    const api = abrir("/paginas/baias", {
      "GET /aguas/superficies?tipo=Baia": () => ({ status: 200, corpo: BAIAS }),
      "POST /aguas/superficies": () => ({ status: 201, corpo: BAIAS }),
      "PUT /aguas/superficies/9/resultados": () => ({ status: 200, corpo: BAIAS }),
    });
    const form = await screen.findByRole("form", { name: "Nova coleta de baias" });
    await userEvent.type(within(form).getByLabelText("Baias (uma ou mais)"), "08, 10");
    await userEvent.click(within(form).getByRole("button", { name: "Registrar coleta" }));
    expect(api.chamadas.find((c) => c.rota === "POST /aguas/superficies")?.corpo).toMatchObject({ tipo: "Baia", pontos: ["08", "10"] });
    await userEvent.type(screen.getByLabelText("C.T. 48h da Baia 08 de 22/10"), "<1");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Baia 08 de 22/10" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /aguas/superficies/9/resultados")?.corpo).toEqual({ ct_48: "<1", bl_72: "", bl_120: "" });
  });
});

const LOAD: LoadRecebido[] = [{ id: 4, numero: "98765", item: "99901", fabrica: "AQA", lotes: [{ id: 11, lote: 2, data_recebimento: "2026-10-20" }] }];

describe("Corrigir recebimento (APP-045)", () => {
  it("busca o load e mostra a recusa do banco como veio", async () => {
    const api = abrir("/paginas/recebimento/corrigir", {
      "GET /recebimento-fcoj/load?numero=98765": () => ({ status: 200, corpo: LOAD }),
      "PUT /recebimento-fcoj/lotes/11": () => ({ status: 422, corpo: { detail: "Esse load já tem o lote 1." } }),
    });
    await userEvent.type(await screen.findByLabelText("Número do load"), "98765");
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Corrigir o lote 2" }));
    const form = screen.getByRole("form", { name: "Corrigir o lote 2" });
    await userEvent.clear(within(form).getByLabelText("Número do lote"));
    await userEvent.type(within(form).getByLabelText("Número do lote"), "1");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar correção" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /recebimento-fcoj/lotes/11")?.corpo).toEqual({ motivo: "", lote: 1 });
    expect(await within(form).findByRole("alert")).toHaveTextContent("Esse load já tem o lote 1.");
  });
});
