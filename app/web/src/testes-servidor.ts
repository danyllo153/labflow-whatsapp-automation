/** Servidor falso para os testes das telas: responde como a API do LabFlow (rotas e códigos reais). */
import { vi } from "vitest";

type Resposta = { status: number; corpo?: unknown } | Promise<{ status: number; corpo?: unknown }>;
type Rota = (corpo: any) => Resposta;

export const ANA = { usuario: "ana.souza", nome: "Ana Souza", cargo: "Operador", trocar_senha: false, pode: ["ver_paginas"] };

/** GET /turno de quem ainda não entrou (APP-022): Tarde de 22/10 sugerida pelo horário. */
export const ESTADO_TURNO = {
  turnos: [
    { id: 1, nome: "Manhã", inicio: "08:00", fim: "16:00" },
    { id: 2, nome: "Tarde", inicio: "16:00", fim: "00:00" },
    { id: 3, nome: "Madrugada", inicio: "00:00", fim: "08:00" },
  ],
  sugestao: { turno_id: 2, dia: "2026-10-22" },
  pode_entrar: true,
  no_turno: null,
  recentes: [],
  feito_no_turno: { turno: "Tarde", dia: "2026-10-22", total: 7, coletas: 3, leituras: 4, drops: 0, atividades: 0 },
};

export function servidorFalso(rotas: Record<string, Rota>) {
  const chamadas: { rota: string; corpo: any }[] = [];
  const todas: Record<string, Rota> = {
    "GET /ambiente": () => ({ status: 200, corpo: { demonstracao: true } }),
    "GET /pendencias-hoje": () => ({ status: 200, corpo: { vence_hoje: 0, atrasados: 0, desvios_abertos: 0, itens: [] } }),
    "GET /turno": () => ({ status: 200, corpo: ESTADO_TURNO }),
    ...rotas,
  };
  const falso = vi.fn(async (url: string, init?: RequestInit) => {
    const rota = `${init?.method ?? "GET"} ${url}`;
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    chamadas.push({ rota, corpo });
    const tratar = todas[rota];
    const r = tratar ? await tratar(corpo) : { status: 404, corpo: { detail: "Not Found" } };
    return r.status === 204
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(r.corpo ?? {}), { status: r.status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", falso);
  return { chamadas, vezes: (rota: string) => chamadas.filter((c) => c.rota === rota).length };
}

export const naoLogado = () => ({ status: 401, corpo: { detail: "Entre com seu usuário e senha." } });
