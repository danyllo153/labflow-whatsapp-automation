import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { DiaDoFluxo } from "./BrancoDoDia";
import type { DiaDeIncubacao } from "./IncubacaoLeitura";
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
  it("registra a coleta com os pontos, edita data e resultados e exclui com motivo", async () => {
    const api = abrir("/paginas/agua-processo", {
      "GET /aguas/processo": () => ({ status: 200, corpo: AGUA }),
      "POST /aguas/processo": () => ({ status: 201, corpo: AGUA }),
      "PUT /aguas/processo/7": () => ({ status: 200, corpo: AGUA }),
      "PUT /aguas/processo/7/resultados": () => ({ status: 200, corpo: AGUA }),
      "POST /aguas/processo/7/excluir": () => ({ status: 200, corpo: { ...AGUA, coletas: [] } }),
    });
    const form = await screen.findByRole("form", { name: "Nova coleta da água do processo" });
    expect(within(form).getByRole("button", { name: "Câmara 5" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(form).getByRole("button", { name: "Câmara 5" })); // não coletou
    expect(within(form).getByRole("button", { name: "Câmara 5" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(within(form).getByRole("button", { name: "Registrar coleta" }));
    expect(api.chamadas.find((c) => c.rota === "POST /aguas/processo")?.corpo.pontos).toEqual(["manifold", "camara4", "camara6"]);

    await userEvent.click(screen.getByRole("button", { name: "Editar a coleta de 22/10 09:30" }));
    const edicao = screen.getByRole("group", { name: "Editar a coleta de 22/10 09:30" });
    await userEvent.clear(within(edicao).getByLabelText("Hora"));
    await userEvent.type(within(edicao).getByLabelText("Hora"), "10:15");
    await userEvent.click(within(edicao).getByRole("button", { name: "C.T. <1 em todos" }));
    await userEvent.click(within(edicao).getByRole("button", { name: "Salvar" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /aguas/processo/7")?.corpo).toMatchObject({ hora: "10:15", pontos: ["manifold", "camara6"] });
    expect(api.chamadas.find((c) => c.rota === "PUT /aguas/processo/7/resultados")?.corpo).toEqual({
      ct: { manifold: "<1", camara6: "<1" }, bl: { manifold: "", camara6: "" },
    });

    await userEvent.click(screen.getByRole("button", { name: "Excluir a coleta de 22/10 09:30" }));
    const exclusao = screen.getByRole("group", { name: "Excluir a coleta de 22/10 09:30" });
    await userEvent.type(within(exclusao).getByLabelText(/Motivo da exclusão/), "coleta de teste");
    await userEvent.click(within(exclusao).getByRole("button", { name: "Excluir a coleta" }));
    expect(api.chamadas.find((c) => c.rota === "POST /aguas/processo/7/excluir")?.corpo).toEqual({ motivo: "coleta de teste" });
    expect(await screen.findByText("Nenhuma coleta registrada.")).toBeInTheDocument();
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
      "PUT /aguas/superficies/9": () => ({ status: 200, corpo: BAIAS }),
    });
    const form = await screen.findByRole("form", { name: "Nova coleta de baias" });
    await userEvent.type(within(form).getByLabelText("Baias (uma ou mais)"), "08, 10");
    await userEvent.click(within(form).getByRole("button", { name: "Registrar coleta" }));
    expect(api.chamadas.find((c) => c.rota === "POST /aguas/superficies")?.corpo).toMatchObject({ tipo: "Baia", pontos: ["08", "10"] });
    await userEvent.type(screen.getByLabelText("C.T. 48h da Baia 08 de 22/10"), "<1");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Baia 08 de 22/10" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /aguas/superficies/9/resultados")?.corpo).toEqual({ ct_48: "<1", bl_72: "", bl_120: "" });
    await userEvent.click(screen.getByRole("button", { name: "Editar a coleta da Baia 08 de 22/10" }));
    const edicao = screen.getByRole("group", { name: "Editar a coleta da Baia 08" });
    await userEvent.clear(within(edicao).getByLabelText("Baia"));
    await userEvent.type(within(edicao).getByLabelText("Baia"), "09");
    await userEvent.click(within(edicao).getByRole("button", { name: "Salvar" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /aguas/superficies/9")?.corpo).toMatchObject({ ponto: "09", dia: "2026-10-22", hora: "07:10" });
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

const INCUBACAO: DiaDeIncubacao = {
  dia: "2026-10-22",
  amostras: ["TQ 38 (N), 40 (ST) · Receb. FCOJ: L 98770 (1, 2)", "Baias 08, 10"],
  meios: { OSA: "1000002", PDA: "2000001", PCA: null, Wort: "-" },
  leituras: { "48h": "2026-10-24", "72h": "2026-10-25", "120h": "2026-10-27", "240h": null },
  na_folha: false,
};

describe("Incubação e leitura (APP-040)", () => {
  it("mostra as amostras do dia, os lotes, as leituras e avisa o meio sem lote", async () => {
    abrir("/incubacao", { "GET /incubacao": () => ({ status: 200, corpo: INCUBACAO }) });
    const cartao = await screen.findByRole("generic", { name: "Incubação de 22/10" });
    expect(within(cartao).getByText("Baias 08, 10")).toBeInTheDocument();
    expect(within(cartao).getByText("1000002")).toBeInTheDocument();
    expect(within(cartao).getByText("sem lote em uso")).toBeInTheDocument();
    expect(within(cartao).getByText("Entra na folha amanhã")).toBeInTheDocument();
    expect(within(cartao).getByText("27/10")).toBeInTheDocument();
    expect(within(cartao).getByRole("link", { name: "Meios e lotes" })).toHaveAttribute("href", "/meios-lotes");
  });
});
