/**
 * Ícone de cada app de análise (visual novo, APP-065): no lugar das siglas, um desenho de traço simples, branco sobre a
 * cor da família (NFC verde-água, FCOJ laranja, testes roxo/rosa/índigo, águas azul, rotina cinza). Decorativo: o nome
 * do app vem sempre ao lado.
 */
const FORMAS: Record<string, JSX.Element> = {
  tanques: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="2.5" />
      <path d="M5 5v14c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  drops: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  "recebimento-nfc": (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  desvios: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  "recebimento-fcoj": (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  "embarque-fcoj": <path d="M2 20c2 1 4 1 6 0s4-1 6 0 4 1 6 0M4 17l-1-5h18l-2 5M12 4v8M8 8h8" />,
  tab: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9" />,
  coliformes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.5" />
      <circle cx="15" cy="13" r="1.5" />
      <circle cx="11" cy="15.5" r="1" />
    </>
  ),
  howard: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18" />
    </>
  ),
  agua: <path d="M2 8c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M2 14c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M2 20c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0" />,
  baias: <path d="M4 20V10l8-6 8 6v10M9 20v-6h6v6" />,
  linhas: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  esterilizacao: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M8 7V4h8v3M12 11v5M9.5 13.5h5" />
    </>
  ),
  estufas: <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" />,
  material: (
    <>
      <ellipse cx="12" cy="14" rx="9" ry="5" />
      <path d="M3 14v-2c0-2.8 4-5 9-5s9 2.2 9 5v2" />
    </>
  ),
  arquivo: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
    </>
  ),
  meios: (
    <>
      <path d="M8 3h8M9 3v4l-3 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9l-3-4V3" />
      <path d="M6 14h12" />
    </>
  ),
  branco: <path d="M3 8h12a3 3 0 1 0-3-3M3 12h17a3 3 0 1 1-3 3M3 16h8" />,
  incubacao: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4M8 14l2.5 2.5L16 12" />
    </>
  ),
  "visao-geral": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  coletas: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </>
  ),
};

export const ICONES_DE_APP = Object.keys(FORMAS);

export default function IconeApp({ nome, tamanho = 22 }: { nome: string; tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FORMAS[nome] ?? <circle cx="12" cy="12" r="5" />}
    </svg>
  );
}
