/** Servidor falso para os testes das telas: responde como a API do LabFlow (rotas e códigos reais). */
import { vi } from "vitest";

type Resposta = { status: number; corpo?: unknown } | Promise<{ status: number; corpo?: unknown }>;
type Rota = (corpo: any) => Resposta;

export const ANA = { usuario: "ana.souza", nome: "Ana Souza", cargo: "Operador", trocar_senha: false, pode: ["ver_paginas"] };

export function servidorFalso(rotas: Record<string, Rota>) {
  const chamadas: { rota: string; corpo: any }[] = [];
  const todas: Record<string, Rota> = { "GET /ambiente": () => ({ status: 200, corpo: { demonstracao: true } }), ...rotas };
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
