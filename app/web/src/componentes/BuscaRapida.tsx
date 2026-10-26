import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { APPS } from "../paginas/Paginas";
import { useSessao } from "../sessao";

/**
 * Busca da barra do topo (modelo kaiadmin, 26/10): digite o nome de uma análise ("drops", "tab", "água") e o Enter
 * abre; as sugestões aparecem embaixo. Para procurar um load ou tanque, a página de cada análise tem a sua busca.
 */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function BuscaRapida() {
  const navegar = useNavigate();
  const { pessoa } = useSessao();
  const [texto, setTexto] = useState("");
  const coletor = pessoa?.cargo === "Coletor";
  const achados = useMemo(() => {
    const t = semAcento(texto.trim());
    if (!t) return [];
    return APPS.filter((a) => !(a.semColetor && coletor) && semAcento(`${a.titulo} ${a.descricao}`).includes(t)).slice(0, 6);
  }, [texto, coletor]);

  function abrir(caminho: string) {
    setTexto("");
    navegar(caminho);
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (achados[0]) abrir(achados[0].caminho);
  }

  return (
    <form className="busca-rapida" role="search" onSubmit={enviar}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" aria-label="Ir para a análise" placeholder="Procurar análise..." value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={40} />
      {achados.length > 0 && (
        <ul className="busca-rapida-sugestoes" aria-label="Análises encontradas">
          {achados.map((a) => (
            <li key={a.caminho}>
              <button type="button" onClick={() => abrir(a.caminho)}>
                <strong>{a.titulo}</strong>
                <span>{a.descricao}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
