/**
 * O filtro de fábrica com várias ao mesmo tempo (pedido de 27/10, para comparar fábricas no gráfico): o valor vai para a
 * API como "AQA,COL"; tocar numa fábrica põe ou tira ela, e "Todas as fábricas" limpa.
 */

export const fabricasDe = (valor: string | undefined): string[] => (valor ?? "").split(",").filter(Boolean);

export function alternarFabrica(valor: string | undefined, fabrica: string): string {
  if (!fabrica) return "";
  const atuais = fabricasDe(valor);
  return (atuais.includes(fabrica) ? atuais.filter((f) => f !== fabrica) : [...atuais, fabrica]).join(",");
}
