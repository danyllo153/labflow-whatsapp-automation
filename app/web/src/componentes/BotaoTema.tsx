import { useEffect, useState } from "react";

import { guardarTema, lerTema } from "../tema";

/**
 * Claro / escuro num toque, na barra do topo (pedido de 26/10). Na lua, passa para o escuro; no sol, volta ao claro.
 * A escolha fica neste aparelho, igual à de Minha conta (lá continua o "Automático").
 */
function escuroAgora(): boolean {
  const tema = lerTema();
  if (tema !== "auto") return tema === "escuro";
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function BotaoTema() {
  const [escuro, setEscuro] = useState(escuroAgora);
  useEffect(() => setEscuro(escuroAgora()), []);

  function trocar() {
    guardarTema(escuro ? "claro" : "escuro");
    setEscuro(!escuro);
  }

  return (
    <button type="button" className="botao-tema" aria-label={escuro ? "Usar o tema claro" : "Usar o tema escuro"} title={escuro ? "Tema claro" : "Tema escuro"} onClick={trocar}>
      {escuro ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
