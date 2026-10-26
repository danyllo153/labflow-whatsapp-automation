/**
 * O ícone de cada material da esterilização (pedido de 25/10, rumo-do-app.md): Ponteira, Meio (frasco com líquido),
 * Frasco (grande, vazio), Água de diluição (garrafinhas), Descarte (saco com placas) e Outro (reticências). A cor é a mesma
 * do tipo no gráfico da esterilização (--g4-0 a --g4-5), para reconhecer de relance.
 */

export const TIPOS_DE_MATERIAL = ["Ponteira", "Meio", "Frasco", "Descarte", "Outro", "Água de diluição"]; // ordem das cores --g4-*

export function corDoMaterial(tipo: string): string {
  return `material-cor-${Math.max(0, TIPOS_DE_MATERIAL.indexOf(tipo))}`;
}

const DESENHOS: Record<string, JSX.Element> = {
  Ponteira: (
    <>
      <path d="M8.5 3h7l-.6 3h-5.8z" />
      <path d="M9.3 6l1.9 14.5h1.6L14.7 6" />
    </>
  ),
  Meio: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
      <path className="icone-liquido" d="M7.2 15h9.6l1.4 2.6a1.5 1.5 0 0 1-1.3 2.2H7.1a1.5 1.5 0 0 1-1.3-2.2z" />
    </>
  ),
  Frasco: (
    <>
      <path d="M9.5 2.5h5v3h-5z" />
      <path d="M9.5 5.5 7 8.5V20a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 20V8.5l-2.5-3" />
    </>
  ),
  "Água de diluição": (
    <>
      <path d="M5 9h4M5.5 9v2L4 13v6.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V13l-1.5-2V9" />
      <path d="M15 5h4M15.5 5v2.5L14 10v9.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V10l-1.5-2.5V5" />
      <path className="icone-liquido" d="M4.5 16h5v3.5h-5zM14.5 14h5v5.5h-5z" />
    </>
  ),
  Descarte: (
    <>
      <path d="M9 4.5 12 7l3-2.5M8.5 7h7l2.5 4.5V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7.5z" />
      <ellipse cx="10" cy="14" rx="2" ry="1" />
      <ellipse cx="14" cy="17" rx="2" ry="1" />
    </>
  ),
  Outro: (
    <>
      <circle cx="6" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18" cy="12" r="1.4" />
    </>
  ),
};

export default function IconeMaterial({ tipo, tamanho = 22 }: { tipo: string; tamanho?: number }) {
  return (
    <svg
      className={`icone-material ${corDoMaterial(tipo)}`}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {DESENHOS[tipo] ?? DESENHOS.Outro}
    </svg>
  );
}
