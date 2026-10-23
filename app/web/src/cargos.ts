/**
 * Nome do cargo nas telas (decidido em 23/10): o "Operador" do banco e do bot aparece como "Analista".
 * O banco continua com "Operador" até a sessão do bot trocar o nome (pedido PB7 no rumo); a API aceita os dois.
 */
const NA_TELA: Record<string, string> = { Operador: "Analista" };

export function nomeDoCargo(cargo: string | null | undefined): string {
  if (!cargo) return "";
  return NA_TELA[cargo] ?? cargo;
}
