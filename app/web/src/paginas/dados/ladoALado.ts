/**
 * Tabelas "lado a lado" (pedido de 27/11): uma linha por tanque + coleta (Tanques) ou por tanque + coleta (Drops), com
 * cada análise em uma coluna, como no Recebimento FCOJ. Só apresentação: a API continua devolvendo uma linha por análise
 * (o bot e o gráfico leem assim) e o agrupamento é feito aqui, sem mudar regra de leitura nem o banco.
 */
import type { Coluna } from "./definicoes";

/** O que a célula de uma análise mostra: o resultado, ou "Pendente · dd/mm" com a leitura prevista. */
export interface CelulaDeAnalise {
  texto: string;
  situacao?: string; // etiqueta (Drops: Concluído, Atrasado...)
  nao_ok?: boolean;
  pendente?: boolean;
}

export type LinhaDaTabela = Record<string, unknown>;
export interface Agrupada {
  colunas: Coluna[];
  linhas: LinhaDaTabela[];
}

export type TipoDeAgrupamento = "tanques" | "drops";

const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** "2026-12-05" → "05/12" (sem fuso: a data da API já vem em America/Sao_Paulo). */
function diaMes(data: unknown): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(texto(data));
  return m ? `${m[2]}/${m[1]}` : "—";
}

const PIOR = ["Não ok", "Atrasado", "Vence hoje", "No prazo"];
function pior(situacoes: string[]): string | null {
  for (const s of PIOR) if (situacoes.includes(s)) return s;
  return null;
}

function juntar(a: unknown, b: unknown): string {
  const nomes = new Set([...texto(a).split(", "), ...texto(b).split(", ")].filter(Boolean));
  return [...nomes].join(", ");
}

/** Mantém a ordem em que o grupo apareceu pela primeira vez (a API já ordena por data da coleta, mais nova primeiro). */
function agrupar<T>(linhas: LinhaDaTabela[], chave: (l: LinhaDaTabela) => string, novo: (l: LinhaDaTabela) => T, somar: (g: T, l: LinhaDaTabela) => void): T[] {
  const grupos = new Map<string, T>();
  for (const l of linhas) {
    const k = chave(l);
    let g = grupos.get(k);
    if (!g) grupos.set(k, (g = novo(l)));
    somar(g, l);
  }
  return [...grupos.values()];
}

// ---------------------------------------------------------------- Tanques
const ANALISES_DOS_TANQUES = ["C.T", "B.L", "Psicrotróficos"];

interface GrupoTanque {
  linha: LinhaDaTabela;
  celulas: Map<string, LinhaDaTabela[]>;
}

/** A célula de uma análise: pré-leitura e leitura final juntas (sem duplicar a linha). */
export function celulaDeTanque(itens: LinhaDaTabela[]): CelulaDeAnalise {
  const lido = (l: LinhaDaTabela) => l.situacao === "Lido" || l.resultado === "Ok" || l.resultado === "Não ok";
  const etapas = [...new Set(itens.map((l) => texto(l.etapa)))];
  const ordem = (e: string) => (e === "Pré-leitura" ? 0 : 1);
  const partes = etapas
    .sort((a, b) => ordem(a) - ordem(b))
    .map((etapa) => {
      const dela = itens.filter((l) => texto(l.etapa) === etapa);
      const textos = [
        ...new Set(
          dela.map((l) => {
            const base = lido(l) ? texto(l.contagem) || texto(l.resultado) : `Pendente · ${diaMes(l.prevista)}`;
            return l.repeticao ? `${base} (repetição)` : base;
          }),
        ),
      ].join(" / ");
      return etapas.length > 1 ? `${etapa === "Pré-leitura" ? "Pré" : "Final"}: ${textos}` : textos;
    });
  return { texto: partes.join(" · "), nao_ok: itens.some((l) => l.resultado === "Não ok"), pendente: itens.every((l) => !lido(l)) };
}

export function agruparTanques(linhas: LinhaDaTabela[]): Agrupada {
  const extras: string[] = [];
  const grupos = agrupar<GrupoTanque>(
    linhas,
    (l) => [l.data_coleta, l.origem, l.navio, l.tanque, l.frasco].map(texto).join("|"),
    (l) => ({
      linha: { data_coleta: l.data_coleta, tanque: l.tanque, origem: l.origem, navio: l.navio, frasco: l.frasco, lida_por: "", _situacoes: [] as string[] },
      celulas: new Map(),
    }),
    (g, l) => {
      const analise = texto(l.analise);
      if (analise && !ANALISES_DOS_TANQUES.includes(analise) && !extras.includes(analise)) extras.push(analise);
      g.celulas.set(analise, [...(g.celulas.get(analise) ?? []), l]);
      g.linha.lida_por = juntar(g.linha.lida_por, l.lida_por);
      (g.linha._situacoes as string[]).push(l.resultado === "Não ok" ? "Não ok" : texto(l.situacao));
    },
  );
  const nomes = [...ANALISES_DOS_TANQUES, ...extras];
  const resultado = grupos.map((g) => {
    const { _situacoes, ...base } = g.linha;
    const linha: LinhaDaTabela = { ...base, situacao: pior(_situacoes as string[]) ?? "Ok" };
    for (const [i, nome] of nomes.entries()) {
      const itens = g.celulas.get(nome);
      if (itens) linha[`analise_${i}`] = celulaDeTanque(itens);
    }
    return linha;
  });
  const colunas: Coluna[] = [
    { chave: "data_coleta", rotulo: "Data da coleta", formato: "data" },
    { chave: "tanque", rotulo: "Tanque", principal: true },
    { chave: "origem", rotulo: "Origem" },
    { chave: "navio", rotulo: "Navio" },
    { chave: "frasco", rotulo: "Frasco" },
    ...nomes.map((nome, i): Coluna => ({ chave: `analise_${i}`, rotulo: nome, formato: "analise" })),
    { chave: "situacao", rotulo: "Situação", formato: "situacao" },
    { chave: "lida_por", rotulo: "Lido por" },
  ];
  return { colunas, linhas: resultado };
}

// ---------------------------------------------------------------- Drops
const DROPS = ["D5", "D10", "D15"];

export function celulaDeDrop(l: LinhaDaTabela): CelulaDeAnalise {
  return { situacao: texto(l.situacao), texto: `prevista ${diaMes(l.prevista)}` };
}

export function agruparDrops(linhas: LinhaDaTabela[]): Agrupada {
  const resultado = agrupar<LinhaDaTabela>(
    linhas,
    (l) => [l.data_coleta, l.origem, l.navio, l.tanque].map(texto).join("|"),
    (l) => ({ data_coleta: l.data_coleta, tanque: l.tanque, origem: l.origem, navio: l.navio, concluido_por: "", desvio_resultado: "", _situacoes: [] as string[] }),
    (g, l) => {
      const i = DROPS.indexOf(texto(l.drop));
      if (i >= 0) g[`drop_${i}`] = celulaDeDrop(l);
      g.concluido_por = juntar(g.concluido_por, l.concluido_por);
      g.desvio_resultado = juntar(g.desvio_resultado, l.desvio_resultado);
      (g._situacoes as string[]).push(texto(l.situacao));
    },
  ).map(({ _situacoes, ...g }) => ({ ...g, situacao: pior(_situacoes as string[]) ?? "Concluído" }));
  const colunas: Coluna[] = [
    { chave: "data_coleta", rotulo: "Data da coleta", formato: "data" },
    { chave: "tanque", rotulo: "Tanque", principal: true },
    { chave: "origem", rotulo: "Origem" },
    { chave: "navio", rotulo: "Navio" },
    ...DROPS.map((d, i): Coluna => ({ chave: `drop_${i}`, rotulo: d, formato: "analise" })),
    { chave: "situacao", rotulo: "Situação", formato: "situacao" },
    { chave: "concluido_por", rotulo: "Concluído por" },
    { chave: "desvio_resultado", rotulo: "Desvio", formato: "situacao" },
  ];
  return { colunas, linhas: resultado };
}

export function agruparLinhas(tipo: TipoDeAgrupamento, linhas: LinhaDaTabela[]): Agrupada {
  return tipo === "tanques" ? agruparTanques(linhas) : agruparDrops(linhas);
}

/** O gráfico "Por situação" acima da tabela, contado nas linhas já agrupadas. */
export function resumoDasLinhas(linhas: LinhaDaTabela[]): { rotulo: string; total: number }[] {
  const ordem = ["Atrasado", "Não ok", "Vence hoje", "No prazo", "Ok", "Concluído"];
  const contagem = new Map<string, number>();
  for (const l of linhas) contagem.set(texto(l.situacao), (contagem.get(texto(l.situacao)) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([rotulo, total]) => ({ rotulo, total }))
    .sort((a, b) => (ordem.indexOf(a.rotulo) + 1 || 99) - (ordem.indexOf(b.rotulo) + 1 || 99));
}
