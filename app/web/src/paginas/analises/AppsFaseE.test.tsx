import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";

const ANALISTA = { ...ANA, pode: ["ver_paginas", "registrar_analise", "registrar_coleta"] };
const gravacao = (texto: string, previa: boolean, dados = {}) => ({ status: 200, corpo: { ok: true, previa, texto, dados } });

function abrir(caminho: string, rotas: Parameters<typeof servidorFalso>[0], pessoa: object = ANALISTA) {
  const api = servidorFalso({ "GET /me": () => ({ status: 200, corpo: pessoa }), ...rotas });
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return { api, posts: (rota: string) => api.chamadas.filter((c) => c.rota === rota).map((c) => c.corpo) };
}

afterEach(() => vi.unstubAllGlobals());

const LEITURA = {
  analise_id: 7, etapa: "final", origem: "terra", tanque: "44", navio: null, frasco: "Normal", analise: "C.T 48h",
  prevista: "2026-10-20", situacao: "Atrasado", pode_placas: true,
};

describe("apps de análise da Fase E (E3 a E8)", () => {
  it("Tanques: digita as 3 placas, vê a prévia do banco e confirma", async () => {
    const { posts } = abrir("/leituras?aba=tanques-terra", { // a leitura fica só na página Leituras (27/10)
      "GET /analises/tanques/leituras": () => ({ status: 200, corpo: [LEITURA] }),
      "POST /analises/tanques/placas": (c) => gravacao(c.previa ? "Placas:\ntanque 44 normal CT = <1,<1,2" : "Placas:\ntanque 44 normal CT = <1,<1,2", c.previa),
    });
    await userEvent.type(await screen.findByRole("textbox", { name: "Placas de 44 Normal C.T 48h" }), "<1, <1, 2");
    await userEvent.click(screen.getByRole("button", { name: "Ler as placas (1)" }));
    expect(await screen.findByRole("status", { name: "O que vai ser gravado" })).toHaveTextContent("tanque 44 normal CT = <1,<1,2");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(posts("POST /analises/tanques/placas")).toEqual([
      { itens: [{ analise_id: 7, etapa: "final", placas: "<1, <1, 2" }], previa: true },
      { itens: [{ analise_id: 7, etapa: "final", placas: "<1, <1, 2" }], previa: false },
    ]);
  });

  it("Tanques: o Wort (profundidade e superfície) é uma linha só por frasco e <1 em todas grava as duas", async () => {
    const wort = { ...LEITURA, analise: "Psicrotróficos 240h", tanque: "41", situacao: "Vence hoje", prevista: "2026-10-25" };
    const { posts } = abrir("/leituras?aba=tanques-terra", {
      "GET /analises/tanques/leituras": () => ({ status: 200, corpo: [{ ...wort, analise_id: 7 }, { ...wort, analise_id: 8 }] }),
      "POST /analises/tanques/placas": (c) => gravacao("Placas:\ntanque 41 normal Wort = <1,<1,<1", c.previa),
    });
    expect(await screen.findByRole("checkbox", { name: /Marcar todas de Terra/ })).toBeChecked(); // o grupo acompanha os itens
    expect(screen.getAllByText(/Normal \(Wort 240h\) · leitura final/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Feitas sem placas/ })).not.toBeInTheDocument(); // saiu (25/10)
    await userEvent.click(screen.getByRole("button", { name: "<1 em todas as leituras (1)" }));
    expect(screen.getByRole("textbox", { name: "Placas de 41 Normal Wort 240h" })).toHaveValue("<1, <1, <1");
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    const itens = [
      { analise_id: 7, etapa: "final", placas: "<1, <1, <1" },
      { analise_id: 8, etapa: "final", placas: "<1, <1, <1" },
    ];
    expect(posts("POST /analises/tanques/placas")).toEqual([{ itens, previa: true }, { itens, previa: false }]);
  });

  it("Tanques: registrar coleta de navio com a prévia", async () => {
    const { posts } = abrir("/paginas/coletas?aba=registrar", {
      "GET /analises/tanques/leituras": () => ({ status: 200, corpo: [] }),
      "POST /analises/tanques/coleta": (c) => gravacao("Coleta do navio O.SKY 189: 1C, 2P (2 tanques, 6 drops).", c.previa),
    });
    // 01/11: a coleta saiu dos apps de tanques e mora na página Coletas, que escolhe terra ou navio
    await userEvent.click(await screen.findByRole("button", { name: "Tanque navio" }));
    const form = await screen.findByRole("form", { name: "Registrar coleta" });
    await userEvent.type(within(form).getByLabelText("Navio e viagem"), "O.SKY 189");
    await userEvent.type(within(form).getByLabelText("Tanques"), "1C, 2P");
    await userEvent.click(within(form).getByRole("button", { name: "Ver o que vai ser criado" }));
    expect(await within(form).findByText(/6 drops/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Confirmar" }));
    expect(posts("POST /analises/tanques/coleta").map((c) => [c.origem, c.navio, c.tanques, c.previa])).toEqual([
      ["navio", "O.SKY 189", "1C, 2P", true],
      ["navio", "O.SKY 189", "1C, 2P", false],
    ]);
  });

  it("TAB: o grupo vem todo marcado e um Confirmar espalha todos", async () => {
    const tab = (id: number, alvo: string) => ({ teste_id: id, teste: "Tab", alvo, status: "No caldo", proxima: "espalhar", prevista: "2026-10-24", situacao: "Vence hoje", lote_aberto: false });
    const { posts } = abrir("/analises/tab", {
      "GET /analises/testes/pendentes": () => ({ status: 200, corpo: [tab(1, "Load 43669 · #87 (1-5)"), tab(2, "Load 43669 · #88 (6-10)")] }),
      "POST /analises/testes/acao": () => gravacao("2 testes atualizados.", false),
    });
    const grupo = await screen.findByRole("region", { name: "TAB para espalhar" });
    await userEvent.click(within(grupo).getByRole("button", { name: "Espalhei (2)" }));
    expect(within(grupo).getByRole("status", { name: "Confirma?" })).toHaveTextContent("Load 43669 · #88 (6-10)");
    await userEvent.click(within(grupo).getByRole("button", { name: "Confirmar" }));
    expect(posts("POST /analises/testes/acao")).toEqual([{ acao: "espalhar", tipo: "TAB", ids: [1, 2], resultado: null }]);
    expect(await screen.findByText(/2 testes atualizados/)).toBeInTheDocument();
  });

  it("Coliformes: os atrasados são as compostas esperando o caldo; os cartões abrem Iniciar análise e No caldo e incubados (27/10)", async () => {
    const estriar = { teste_id: 4, teste: "Coliformes", alvo: "Load 43701 · #10 (1-4)", status: "No caldo", proxima: "espalhar", prevista: "2026-10-27", situacao: "Vence hoje", lote_aberto: false };
    const col = { teste_id: 3, teste: "Coliformes", alvo: "Load 43669 · #87 (1-5)", status: "Incubada", proxima: "ler", prevista: "2026-10-24", situacao: "Vence hoje", lote_aberto: false };
    abrir("/analises/coliformes", {
      "GET /analises/testes/pendentes": () => ({ status: 200, corpo: [col, estriar] }),
      "GET /analises/testes/compostas?tipo=COLIFORMES": () => ({
        status: 200, corpo: [{ composta_id: 90, alvo: "Load 43700 · #90 (1-5)", criada_em: "2026-10-26", pede: true }],
      }),
    });
    expect(await screen.findByRole("region", { name: "Coliformes para estriar" })).toBeInTheDocument(); // o Coliformes se estria
    await userEvent.click(await screen.findByRole("button", { name: "Atrasados (esperando o caldo): 1" }));
    expect(await screen.findByRole("heading", { name: "Compostas que vão para o caldo" })).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: /Load 43700 · #90/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Para fazer/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Em andamento: 2" }));
    const estufa = await screen.findByRole("region", { name: "Incubada" });
    expect(within(estufa).getByText(/Load 43669 · #87/)).toBeInTheDocument();
  });

  it("Embarque: as compostas novas levam o que foi marcado e as recentes se marcam ali mesmo (27/10)", async () => {
    const recente = { composta_id: 12, alvo: "O.SKY 189 L1 F2 · #12 (1-3)", criada_em: "2026-10-26", tab: false, coliformes: true, howard: false, feitos: [] };
    const { posts, api } = abrir("/analises/embarque-fcoj?aba=compostas", {
      "GET /analises/embarque/amostras": () => ({ status: 200, corpo: [] }),
      "GET /analises/embarque/compostas-recentes": () => ({ status: 200, corpo: [recente] }),
      "POST /analises/embarque/compostas": (c) => gravacao("2 compostas.\nVão esperar: TAB, Coliformes.", c.previa),
      "PUT /analises/compostas/12/testes": () => ({ status: 200, corpo: [{ ...recente, howard: true }] }),
    });
    const form = await screen.findByRole("form", { name: "Compostas do embarque" });
    await userEvent.type(within(form).getByLabelText("Compostas"), "(1-3)(4-6)");
    await userEvent.click(within(within(form).getByRole("group", { name: "Análises das compostas novas" })).getByRole("button", { name: "TAB" }));
    expect(within(form).getByRole("button", { name: "TAB" })).toHaveAttribute("aria-pressed", "true");
    const linha = await screen.findByRole("group", { name: "Análises da composta 12" });
    await userEvent.click(within(linha).getByRole("button", { name: "Howard" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /analises/compostas/12/testes")?.corpo).toEqual({ tab: false, coliformes: true, howard: true });
    expect(posts("POST /analises/embarque/compostas")).toEqual([]);
  });

  it("Drops: vêm todos marcados, vê a prévia e conclui", async () => {
    const drop = { drop_id: 5, drop: "D10", origem: "Terra", tanque: "44", navio: null, data_coleta: "2026-10-14", prevista: "2026-10-24", situacao: "Vence hoje" };
    const { posts } = abrir("/analises/drops", {
      "GET /analises/drops": () => ({ status: 200, corpo: { pendentes: [drop], desvios: [] } }),
      "POST /analises/drops/concluir": (c) => gravacao("1 drop: tanque 44 D10.", c.previa),
    });
    expect(await screen.findByRole("checkbox", { name: /tanque 44 · D10/ })).toBeChecked(); // a lista vem toda marcada
    await userEvent.click(screen.getByRole("button", { name: "Concluir (1)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    expect(posts("POST /analises/drops/concluir")).toEqual([{ ids: [5], previa: true }, { ids: [5], previa: false }]);
  });

  it("Desvios: abre o desvio de uma leitura não ok só depois do Confirmar", async () => {
    const { posts } = abrir("/analises/desvios", {
      "GET /analises/desvios": () => ({
        status: 200,
        corpo: { para_abrir: [{ ...LEITURA, resultado: ">300, 2, 2", lida_em: "2026-10-24" }], abertos: [], dia_finalizado: false },
      }),
      "POST /analises/desvios/abrir": () => gravacao("Desvio aberto: repetição com o frasco de arquivo.", false),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Abrir desvio" }));
    expect(posts("POST /analises/desvios/abrir")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(posts("POST /analises/desvios/abrir")).toEqual([{ analise_id: 7, etapa: "final" }]);
  });

  it("NFC: lança o lido e mostra o final da prévia", async () => {
    const pendente = { id: 9, load: "43777", fabrica: "UCH", lote: 123, amostra: "fresh", diluicao: 1, recebido_em: "2026-10-21", analise: "CT", prevista: "2026-10-23", situacao: "Atrasado" };
    const { posts } = abrir("/leituras?aba=recebimento-nfc", {
      "GET /analises/recebimento-nfc/pendentes": () => ({ status: 200, corpo: [pendente] }),
      "POST /analises/recebimento-nfc/lancar": (c) => gravacao("load 43777 lote 123 fresh · C.T 48h: lido 12 → 120 (10^1)", c.previa),
    });
    await userEvent.type(await screen.findByRole("textbox", { name: "C.T 48h do load 43777 lote 123 fresh" }), "12");
    await userEvent.click(screen.getByRole("button", { name: "Ver o que vai ser gravado (1)" }));
    expect(await screen.findByText(/lido 12 → 120/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(posts("POST /analises/recebimento-nfc/lancar").map((c) => c.previa)).toEqual([true, false]);
  });

  it("Embarque: o Consultor vê, mas não registra", async () => {
    abrir("/analises/embarque-fcoj?aba=registrar", { "GET /analises/embarque/amostras": () => ({ status: 200, corpo: [] }) }, { ...ANA, cargo: "Consultor" });
    expect(await screen.findByText(/Só Analista e Admin gravam aqui/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Registrar embarque" })).toBeNull();
  });

  it("Resultados mostra a tabela ali mesmo, com pílulas quando o app tem mais de uma (26/10)", async () => {
    const pagina = (linhas: object[]) => () => ({ status: 200, corpo: { total: linhas.length, pagina: 1, por_pagina: 50, linhas } });
    abrir("/analises/drops?aba=resultados", {
      "GET /analises/drops/abertos": () => ({ status: 200, corpo: [] }),
      "GET /analises/drops/desvios": () => ({ status: 200, corpo: [] }),
      "GET /paginas/drops?pagina=1&por_pagina=50": pagina([{ tanque: "T85", drop: "D5", situacao: "Concluído" }]),
      "GET /paginas/desvios?pagina=1&por_pagina=50": pagina([]),
    });
    expect(await screen.findByRole("columnheader", { name: "Drop" })).toBeInTheDocument();
    expect(screen.getByText("T85")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("link", { name: "Drops" })).toBeNull(); // não é mais um link para outra página
    await userEvent.click(screen.getByRole("button", { name: "Desvios" }));
    expect(await screen.findByText("Nenhum registro com esses filtros.")).toBeInTheDocument();
  });

  it("Embarque abre no painel: números e os últimos navios embarcados, que abrem a página do navio", async () => {
    abrir("/analises/embarque-fcoj", {
      "GET /analises/embarque/navios?pagina=1&por_pagina=10": () => ({
        status: 200,
        corpo: {
          total: 7,
          navios: Array.from({ length: 7 }, (_, i) => ({
            navio: `NAVIO EXEMPLO ${i + 1}`, ultima_data: "2026-10-2" + (7 - i), amostras: 5, lidos: 15, pendentes: 0, nao_ok: i === 0 ? 1 : 0,
          })),
        },
      }),
      "GET /analises/embarque/amostras": () => ({ status: 200, corpo: [] }),
      "GET /analises/embarque/painel": () => ({
        status: 200,
        corpo: { atrasados: 2, para_hoje: 0, nao_ok_semana: 1, navios: [{ navio: "NAVIO EXEMPLO 1", lidos: 12, nao_ok: 1 }] },
      }),
    });
    expect(await screen.findByText("NAVIO EXEMPLO 1")).toBeInTheDocument();
    expect(screen.getByText(/Últimos navios embarcados/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /NAVIO EXEMPLO 1/ })).toHaveAttribute("href", "/paginas/navios/NAVIO%20EXEMPLO%201");
    expect(screen.queryByText("NAVIO EXEMPLO 6")).toBeNull(); // 5 à vista
    await userEvent.click(screen.getByRole("button", { name: "Ver mais" }));
    expect(screen.getByText("NAVIO EXEMPLO 7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2\s*Atrasados/ })).toHaveClass("numero-atrasado");
    expect(screen.getByRole("button", { name: /0\s*Para hoje/ })).toHaveClass("numero-neutro");
  });
});
