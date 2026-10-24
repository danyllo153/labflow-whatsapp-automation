import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, servidorFalso } from "../testes-servidor";
import type { DadosEsterilizacao } from "./Esterilizacao";
import type { DadosLaudos } from "./LaudoEsterilizacao";

const ITEM = {
  id: 7, tipo: "Meio", ciclo: "A1092/26", meio: "PDA", descricao: null, eficiente: true, pagina_impressa: false,
  quem: "Ana Souza", quando: "09:40", corrigida: false, motivo_correcao: null, antes: null,
};

const BASE: DadosEsterilizacao = {
  turno_id: 1, turno: "Manhã", dia: "2026-10-22", tipos: ["Ponteira", "Meio", "Frasco", "Descarte", "Outro"], pode_registrar: true, itens: [ITEM],
};

const G4 = { de: "2026-10-17", ate: "2026-10-23", total: 0, barras: [] };

const LAUDOS: DadosLaudos = {
  pode_enviar_modelo: true,
  modelo_enviado: false,
  modelo_enviado_em: null,
  paginas: [
    { id: 2, numero: 2, linhas: 35, capacidade: 35, cheia: true, impresso: false, impresso_por: null, impresso_em: null, de: "2026-10-22", ate: "2026-10-23" },
    { id: 1, numero: 1, linhas: 35, capacidade: 35, cheia: true, impresso: true, impresso_por: "Ana Souza", impresso_em: "21/10 17:05", de: "2026-10-01", ate: "2026-10-20" },
  ],
};

function abrir(rotas: Parameters<typeof servidorFalso>[0] = {}) {
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: { ...ANA, cargo: "Analista" } }),
    "GET /esterilizacao": () => ({ status: 200, corpo: BASE }),
    "GET /esterilizacao/grafico": () => ({ status: 200, corpo: G4 }),
    "GET /esterilizacao/laudos": () => ({ status: 200, corpo: LAUDOS }),
    ...rotas,
  });
  render(
    <MemoryRouter initialEntries={["/esterilizacao"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Laudo de esterilização (APP-035)", () => {
  it("mostra a página cheia como pendente de imprimir e a impressa no arquivo", async () => {
    abrir();
    const laudo = await screen.findByRole("region", { name: "Laudo de esterilização" });
    expect(within(laudo).getByText("Página 2")).toBeInTheDocument();
    expect(within(laudo).getByText("Cheia: imprimir")).toBeInTheDocument();
    expect(within(laudo).getByRole("link", { name: "Abrir o PDF da página 2" })).toHaveAttribute("href", "/esterilizacao/laudos/2/pdf");
    expect(within(laudo).getByRole("link", { name: "Reimprimir a página 1" })).toHaveAttribute("href", "/esterilizacao/laudos/1/pdf");
    expect(within(laudo).getByText(/impressa 21\/10 17:05 por Ana Souza/)).toBeInTheDocument();
    expect(within(laudo).getByText(/sem o modelo da empresa/)).toBeInTheDocument();
  });

  it("marcar como impressa manda a página para o arquivo", async () => {
    const api = abrir({
      "POST /esterilizacao/laudos/2/impresso": () => ({
        status: 200,
        corpo: { ...LAUDOS, paginas: LAUDOS.paginas.map((p) => (p.id === 2 ? { ...p, impresso: true, impresso_por: "Ana Souza", impresso_em: "22/10 09:00" } : p)) },
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Marcar a página 2 como impressa" }));
    expect(api.vezes("POST /esterilizacao/laudos/2/impresso")).toBe(1);
    expect(await screen.findByText("Nenhuma página pendente de impressão.")).toBeInTheDocument();
  });

  it("avisa, sem bloquear, quando o ciclo digitado já tem material", async () => {
    abrir({ "GET /esterilizacao/ciclo?ciclo=A1092%2F26": () => ({ status: 200, corpo: [{ tipo: "Meio", quem: "Ana Souza", quando: "09:40" }] }) });
    await userEvent.click(await screen.findByRole("button", { name: "Frasco" }));
    const campo = screen.getByLabelText("Número do ciclo");
    await userEvent.type(campo, "A1092/26");
    await userEvent.tab();
    expect(await screen.findByRole("status")).toHaveTextContent("O ciclo A1092/26 já tem Meio (Ana Souza às 09:40)");
    expect(screen.getByRole("button", { name: "Registrar" })).toBeEnabled();
  });

  it("Não eficiente pede motivo e Voltar para Sim não pede", async () => {
    let item = ITEM;
    const api = abrir({
      "GET /esterilizacao": () => ({ status: 200, corpo: { ...BASE, itens: [item] } }),
      "PUT /esterilizacao/7/eficiente": (corpo) => {
        item = { ...item, eficiente: corpo.eficiente };
        return { status: 200, corpo: { ...BASE, itens: [item] } };
      },
    });
    expect(await screen.findByText("Eficiente: Sim")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Marcar não eficiente/ }));
    await userEvent.click(screen.getByRole("button", { name: "Marcar Não eficiente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escreva o motivo");
    await userEvent.type(screen.getByLabelText("Motivo"), "fita não virou");
    await userEvent.click(screen.getByRole("button", { name: "Marcar Não eficiente" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /esterilizacao/7/eficiente")?.corpo).toEqual({ eficiente: false, motivo: "fita não virou" });
    expect(await screen.findByText("Eficiente: Não")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Voltar para eficiente/ }));
    expect(await screen.findByText("Eficiente: Sim")).toBeInTheDocument();
    expect(api.chamadas.filter((c) => c.rota === "PUT /esterilizacao/7/eficiente").slice(-1)[0]?.corpo).toEqual({ eficiente: true });
  });

  it("o Admin envia o modelo da empresa (PDF)", async () => {
    let enviado = false;
    const api = abrir({
      "GET /esterilizacao/laudos": () => ({ status: 200, corpo: { ...LAUDOS, modelo_enviado: enviado, modelo_enviado_em: enviado ? "23/10/2026 20:00" : null } }),
      "PUT /esterilizacao/laudos/modelo": () => {
        enviado = true;
        return { status: 200, corpo: { ...LAUDOS, modelo_enviado: true, modelo_enviado_em: "23/10/2026 20:00" } };
      },
    });
    const entrada = await screen.findByLabelText("Arquivo PDF do modelo do laudo");
    await userEvent.upload(entrada, new File(["%PDF-1.7"], "laudo.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/Modelo da empresa enviado em 23\/10\/2026 20:00/)).toBeInTheDocument();
    expect(api.vezes("PUT /esterilizacao/laudos/modelo")).toBe(1);
  });
});
