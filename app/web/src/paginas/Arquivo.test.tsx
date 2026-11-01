import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { Caixa } from "./Arquivo";

const caixa = (c: Partial<Caixa> & Pick<Caixa, "tipo" | "numero">): Caixa => ({
  familia: null, navio: null, viagem: null, itens: 0, amostras: 0, descarte_em: null, situacao: "Disponível", itens_vencidos: 0, ...c,
});

const ARQUIVO = {
  sugerida_recebimento: 122,
  pode_gravar: true,
  caixas: [
    caixa({ tipo: "navio", numero: 27, familia: "O.BETA", navio: "O.BETA", viagem: "205", itens: 3, amostras: 7, descarte_em: "2028-10-25", situacao: "Em uso", ultima_amostra: "2026-10-20", inicio_em: "2026-10-25", inicio_fixado: false }),
    caixa({ tipo: "navio", numero: 28, familia: "O.GAMA", navio: "O.GAMA", viagem: "10", itens: 1, descarte_em: "2027-03-01", situacao: "Em uso", da_planilha: true }),
    caixa({ tipo: "recebimento", numero: 121, itens: 1, amostras: 3, descarte_em: "2026-10-18", situacao: "Vencida", itens_vencidos: 1 }),
    caixa({ tipo: "recebimento", numero: 122 }),
    caixa({ tipo: "tanque", numero: 34 }),
  ],
};

function abrir() {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, pode: ["ver_paginas", "registrar_analise"] } }),
    "GET /arquivo": () => ({ status: 200, corpo: ARQUIVO }),
    "GET /arquivo/recebimento/121": () => ({
      status: 200,
      corpo: { caixa: ARQUIVO.caixas[2], itens: [{ item: "recebimento", descricao: "load 98801", navio: null, viagem: null, tanque: null, load: "98801", lotes: "1-3", quantidade: 3, data_ref: "2026-10-11", data_descarte: "2026-10-18", situacao: "Vencido", descartado_em: null }] },
    }),
    "POST /arquivo/descartar": () => ({ status: 200, corpo: { ok: true, previa: true, texto: "Caixa 121 (recebimento): load 98801 lotes 1-3 (11/10/2026). A caixa fica disponível.", dados: {} } }),
    "GET /arquivo/busca?load=98801": () => ({ status: 200, corpo: [{ tipo: "recebimento", caixa: 121, load: "98801", lotes: "1-3", data_ref: "2026-10-11", data_descarte: "2026-10-18", situacao: "Vencido" }] }),
    "GET /arquivo/busca?load=O.BETA%20205": () => ({ status: 200, corpo: [{ tipo: "navio", caixa: 27, load: "", navio: "O.BETA 205", lotes: null, data_ref: null, data_descarte: "2028-10-25", situacao: "Em uso" }] }),
    "GET /arquivo/navio/27": () => ({ status: 200, corpo: { caixa: ARQUIVO.caixas[0], itens: [] } }),
    "GET /arquivo/navio/27/laudo": () => ({ status: 200, corpo: [{ laudo: "contra-embarque", pagina_id: 41, finalizada: true }] }),
    "GET /arquivo/recebimento/121/laudo": () => ({ status: 200, corpo: [] }),
    "POST /arquivo/data-inicial": () => ({ status: 200, corpo: { ok: true, previa: true, texto: "Caixa 27 (O.BETA 205): data inicial 30/10/2026 (escolhida à mão). FCOJ até 30/10/2028. A caixa libera em 30/10/2028.", dados: {} } }),
    "GET /arquivo/busca?load=O.GAMA%2010": () => ({ status: 200, corpo: [{ tipo: "navio", caixa: 28, load: "", navio: "O.GAMA 10", lotes: null, data_ref: null, data_descarte: "2027-03-01", situacao: "Em uso" }] }),
    "GET /arquivo/navio/28": () => ({ status: 200, corpo: { caixa: ARQUIVO.caixas[1], itens: [{ item: "carga", descricao: "carga inicial", navio: "O.GAMA", viagem: "10", tanque: null, load: null, lotes: null, quantidade: null, data_ref: null, data_descarte: "2027-03-01", situacao: "Arquivado", descartado_em: null, ref_id: 5 }] } }),
    "GET /arquivo/navio/28/laudo": () => ({ status: 200, corpo: [] }),
    "POST /arquivo/navio/28/planilha": () => ({ status: 200, corpo: { ok: true, previa: true, texto: "Caixa 28 (O.GAMA 10, da planilha): 2 linhas no laudo de contra-amostra: FCOJ 98831/98832 (4 amostras); NFC tanque 2P (1 pote). O vencimento continua o da planilha: 01/03/2027.", dados: {} } }),
    "POST /arquivo/arquivar": () => ({ status: 200, corpo: { ok: true, previa: true, texto: "Caixa 122 (recebimento): load 98802 lotes 1-5", dados: {} } }),
  });
  render(
    <MemoryRouter initialEntries={["/arquivo"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Arquivo de contra-amostras (PB21)", () => {
  it("abre em Para descartar com a caixa vencida e mostra o conteúdo em vermelho", async () => {
    const api = abrir();
    const grade = await screen.findByRole("list", { name: "Caixas" });
    expect(within(grade).getAllByRole("button")).toHaveLength(1);
    await userEvent.click(within(grade).getByRole("button", { name: "Caixa 121, Recebimento, Vencida" }));
    const conteudo = await screen.findByRole("article", { name: "Caixa 121 · Recebimento" });
    expect(await within(conteudo).findByText("load 98801")).toBeInTheDocument();
    expect(within(conteudo).getByText("load 98801").closest("tr")).toHaveClass("linha-vencida");
    await userEvent.click(within(conteudo).getByRole("button", { name: "Descartar o que venceu" }));
    expect(api.chamadas.find((c) => c.rota === "POST /arquivo/descartar")?.corpo).toEqual({ tipo: "recebimento", numero: 121, previa: true });
    expect(await screen.findByText(/A caixa fica disponível/)).toBeInTheDocument();
  });

  it("a busca mostra em qual caixa está o load", async () => {
    abrir();
    const busca = await screen.findByRole("search", { name: "Procurar load no arquivo" });
    await userEvent.type(within(busca).getByLabelText("Em qual caixa está o load ou o navio?"), "98801");
    await userEvent.click(within(busca).getByRole("button", { name: "Procurar" }));
    expect(await within(busca).findByRole("list", { name: "Caixas do load" })).toHaveTextContent("Caixa 121 (Recebimento) · load 98801 · lotes 1-3");
  });

  it("procurar um navio acha a caixa dele, abre a caixa e o Laudo leva à folha do laudo (01/11)", async () => {
    abrir();
    const busca = await screen.findByRole("search", { name: "Procurar load no arquivo" });
    await userEvent.type(within(busca).getByLabelText("Em qual caixa está o load ou o navio?"), "O.BETA 205");
    await userEvent.click(within(busca).getByRole("button", { name: "Procurar" }));
    expect(await within(busca).findByRole("list", { name: "Caixas do load" })).toHaveTextContent("Caixa 27 (Navio) · O.BETA 205");
    await userEvent.click(within(busca).getByRole("button", { name: "Abrir a caixa 27" }));
    const conteudo = await screen.findByRole("article", { name: /Caixa 27 · Navio/ });
    expect(await within(conteudo).findByRole("link", { name: /Laudo/ })).toHaveAttribute("href", "/laudos/contra-embarque/41/pdf");
    expect(within(conteudo).queryByRole("button", { name: /Imprimir/ })).toBeNull();
  });

  it("a caixa de navio mostra a data inicial e deixa escolher outra, com a prévia do descarte (PB24, 01/11)", async () => {
    const api = abrir();
    const busca = await screen.findByRole("search", { name: "Procurar load no arquivo" });
    await userEvent.type(within(busca).getByLabelText("Em qual caixa está o load ou o navio?"), "O.BETA 205");
    await userEvent.click(within(busca).getByRole("button", { name: "Procurar" }));
    await userEvent.click(await within(busca).findByRole("button", { name: "Abrir a caixa 27" }));
    const conteudo = await screen.findByRole("article", { name: /Caixa 27 · Navio/ });
    expect(conteudo).toHaveTextContent("Data inicial: 25/10/2026 (última amostra em 20/10/2026 + 5 dias)");
    await userEvent.click(within(conteudo).getByRole("button", { name: "Data inicial" }));
    const form = within(conteudo).getByRole("form", { name: "Escolher a data inicial" });
    const campo = within(form).getByLabelText("Data inicial");
    await userEvent.clear(campo);
    await userEvent.type(campo, "2026-10-30");
    await userEvent.click(within(form).getByRole("button", { name: "Ver o descarte" }));
    expect(await within(conteudo).findByText(/A caixa libera em 30\/10\/2028/)).toBeInTheDocument();
    expect(api.chamadas.find((c) => c.rota === "POST /arquivo/data-inicial")?.corpo).toEqual({ numero: 27, data: "2026-10-30", previa: true });
  });

  it("a caixa da planilha ganha o laudo digitado: FCOJ e pote, com a prévia (01/11)", async () => {
    const api = abrir();
    const busca = await screen.findByRole("search", { name: "Procurar load no arquivo" });
    await userEvent.type(within(busca).getByLabelText("Em qual caixa está o load ou o navio?"), "O.GAMA 10");
    await userEvent.click(within(busca).getByRole("button", { name: "Procurar" }));
    await userEvent.click(await within(busca).findByRole("button", { name: "Abrir a caixa 28" }));
    const conteudo = await screen.findByRole("article", { name: /Caixa 28 · Navio/ });
    await userEvent.click(within(conteudo).getByRole("button", { name: "Adicionar laudo" }));
    const form = within(conteudo).getByRole("form", { name: "Adicionar o laudo da caixa" });
    expect(form).toHaveTextContent("o vencimento continua o da planilha (01/03/2027)");
    await userEvent.type(within(form).getByLabelText("Loads da linha 1"), "98831/98832");
    await userEvent.clear(within(form).getByLabelText("Quantidade da linha 1"));
    await userEvent.type(within(form).getByLabelText("Quantidade da linha 1"), "4");
    await userEvent.click(within(form).getByRole("button", { name: "+ Linha" }));
    await userEvent.selectOptions(within(form).getByLabelText("Amostra da linha 2"), "pote");
    await userEvent.type(within(form).getByLabelText("Tanque da linha 2"), "2P");
    await userEvent.click(within(form).getByRole("button", { name: "Ver o laudo" }));
    expect(await within(conteudo).findByText(/O vencimento continua o da planilha: 01\/03\/2027/)).toBeInTheDocument();
    expect(api.chamadas.find((c) => c.rota === "POST /arquivo/navio/28/planilha")?.corpo).toEqual({
      linhas: [
        { tipo: "fcoj", loads: "98831/98832", tanque: "", quantidade: 4 },
        { tipo: "pote", loads: "", tanque: "2P", quantidade: 1 },
      ],
      previa: true,
    });
  });

  it("Recebimento tem o arquivar com a caixa sugerida e sem o Item", async () => {
    const api = abrir();
    await userEvent.click(await screen.findByRole("button", { name: "Recebimento" }));
    const form = screen.getByRole("form", { name: "Arquivar recebimento" });
    expect(within(form).getByLabelText("Caixa")).toHaveValue("122");
    expect(within(form).queryByLabelText(/Item/)).toBeNull();
    await userEvent.type(within(form).getByLabelText("Load"), "98802");
    await userEvent.type(within(form).getByLabelText("Lotes"), "1-5");
    await userEvent.click(within(form).getByRole("button", { name: "Ver o que vai ser arquivado" }));
    expect(api.chamadas.find((c) => c.rota === "POST /arquivo/arquivar")?.corpo).toMatchObject({ load: "98802", lotes: "1-5", caixa: 122, previa: true });
  });
});
