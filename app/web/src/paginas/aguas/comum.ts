/** Peças comuns das telas de águas (APP-037). */

export function hojeSP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function agoraSP(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function dm(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

export function classeDaSituacao(situacao: string): string {
  if (situacao === "Concluída") return "etiqueta etiqueta-ok";
  if (situacao.startsWith("Atrasado")) return "etiqueta etiqueta-nao-ok";
  return "etiqueta etiqueta-pendente";
}

export function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}
