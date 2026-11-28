import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { ProvedorDeSessao } from "../sessao";
import { ANA, ESTADO_TURNO, servidorFalso } from "../testes-servidor";

/** Lite (28/11): sem WhatsApp nem bot nos textos; a Completa continua igual. Nomes fictícios. */
const NA_TARDE = {
  id: 41, turno_id: 2, turno: "Tarde", dia: "2026-10-22", entrada: "16:00", saida: null,
  entrada_registrada: "16:00", saida_registrada: null, motivo_correcao: null,
};
const ESTUFAS = {
  turno_id: 2, turno: "Tarde", dia: "2026-10-22", pode_registrar: true,
  resumo: { total: 1, conferidas: 0, nao_ok: 0, pendentes: 1 },
  estufas: [{ id: 4, auxiliar: false, faixa: { minimo: "35.0", maximo: "37.0" }, supervisorio: null, field_chart: null, status: "Pendente", diferenca: null }],
};

function abrir(lite: boolean) {
  const api = servidorFalso({
    "GET /ambiente": () => ({ status: 200, corpo: { demonstracao: false, lite } }),
    "GET /me": () => ({ status: 200, corpo: { ...ANA, trocar_senha: false } }),
    "GET /turno": () => ({ status: 200, corpo: { ...ESTADO_TURNO, no_turno: NA_TARDE } }),
    "GET /estufas": () => ({ status: 200, corpo: ESTUFAS }),
  });
  render(
    <MemoryRouter initialEntries={["/turno"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe("Turno na Lite e na Completa", () => {
  it("Lite: o cartão Feito no turno não fala de WhatsApp", async () => {
    abrir(true);
    expect(await screen.findByText(/Conta o que foi registrado no horário do turno\./)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/whatsapp/i);
  });

  it("Completa: continua falando de app ou WhatsApp", async () => {
    abrir(false);
    expect(await screen.findByText(/horário do turno \(app ou WhatsApp\)/)).toBeInTheDocument();
  });

  it("Quem fez o quê vem antes das Estufas, e as estufas continuam marcáveis", async () => {
    const api = abrir(true);
    const quem = await screen.findByRole("region", { name: "Atividades realizadas" });
    const estufas = await screen.findByRole("region", { name: "Estufas agora" });
    expect(quem.compareDocumentPosition(estufas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const grupo = within(estufas).getByRole("group", { name: "Supervisório da Estufa 04" });
    expect(within(grupo).getByRole("button", { name: "Ok" })).toBeInTheDocument();
    expect(within(estufas).getByRole("group", { name: "Field chart da Estufa 04" })).toBeInTheDocument();
    expect(api.vezes("GET /estufas")).toBeGreaterThan(0);
  });
});
