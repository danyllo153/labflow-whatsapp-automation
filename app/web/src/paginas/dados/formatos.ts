/** Como cada valor aparece na tela e na impressão. Datas sempre em America/Sao_Paulo. */
import type { Formato } from "./definicoes";

export function formatar(valor: unknown, formato: Formato = "texto"): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (formato === "data" && typeof valor === "string") {
    const [ano, mes, dia] = valor.slice(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
  }
  if (formato === "dataHora" && typeof valor === "string") {
    const partes = Object.fromEntries(
      new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(valor))
        .map((p) => [p.type, p.value]),
    );
    return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
  }
  return String(valor);
}

/** Etiqueta de situação (07: Ok/Não ok nunca só pela cor; sempre o texto). */
export function classeDaSituacao(situacao: string): string {
  if (situacao === "Ok") return "etiqueta etiqueta-ok";
  if (situacao === "Não ok" || situacao === "Atrasado") return "etiqueta etiqueta-nao-ok";
  if (situacao === "Vence hoje") return "etiqueta etiqueta-pendente";
  return "etiqueta etiqueta-neutra";
}
