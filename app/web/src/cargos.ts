/**
 * Nome do cargo nas telas (decidido em 23/10): "Operador" passou a se chamar "Analista" (no banco pela migration 035,
 * pedido PB7). Um "Operador" que ainda aparecer (registro antigo, cache) é mostrado como "Analista".
 */
const NA_TELA: Record<string, string> = { Operador: "Analista" };

export function nomeDoCargo(cargo: string | null | undefined): string {
  if (!cargo) return "";
  return NA_TELA[cargo] ?? cargo;
}
