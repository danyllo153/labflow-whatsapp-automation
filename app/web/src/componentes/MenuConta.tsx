import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { nomeDoCargo } from "../cargos";
import { useSessao } from "../sessao";
import Icone from "./Icone";

/**
 * Canto direito da barra do topo (APP-032), como nos LIMS: só dois símbolos. A engrenagem leva às configurações
 * (aparência e senha, em Minha conta); o boneco abre um menu com quem está logada, o cargo, trocar senha e sair.
 */
export default function MenuConta() {
  const { pessoa, sair } = useSessao();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const local = useLocation();
  const nome = pessoa?.nome || pessoa?.usuario;

  useEffect(() => setAberto(false), [local.pathname]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div className="topo-icones" ref={raiz}>
      <Link to="/conta" className="icone-topo" aria-label="Configurações" title="Configurações">
        <Icone caminho="@engrenagem" />
      </Link>
      <button
        type="button"
        className="icone-topo"
        aria-label={`Conta de ${nome}`}
        title={nome}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
      >
        <Icone caminho="@usuario" />
      </button>
      {aberto && (
        <div className="menu-conta" role="menu" aria-label="Conta">
          <div className="menu-conta-nome">{nome}</div>
          <div className="texto-secundario">
            {pessoa?.usuario} · {nomeDoCargo(pessoa?.cargo)}
          </div>
          <Link to="/conta" role="menuitem">
            Minha conta
          </Link>
          <Link to="/conta/senha" role="menuitem">
            Trocar senha
          </Link>
          <button type="button" role="menuitem" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
