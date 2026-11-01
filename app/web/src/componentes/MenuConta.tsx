import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { nomeDoCargo } from "../cargos";
import { MENU, TELAS_DO_COLETOR } from "../menu";
import { useSessao } from "../sessao";
import Icone from "./Icone";

/**
 * Canto direito da barra do topo (APP-032), como nos LIMS: só dois símbolos. A engrenagem leva às configurações
 * (aparência e senha, em Minha conta); o avatar com as iniciais (24/10) abre um menu com quem está logada, o cargo, trocar senha e sair.
 */
export default function MenuConta() {
  const { pessoa, sair } = useSessao();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const local = useLocation();
  const nome = pessoa?.nome || pessoa?.usuario;
  // no celular a barra de baixo tem só os 5 fixos: as outras telas ficam aqui (no computador estão no menu lateral)
  const outras = MENU.filter(
    (item) =>
      item.soNoMenuLateral &&
      (!item.pode || pessoa?.pode.includes(item.pode)) &&
      (pessoa?.cargo !== "Coletor" || TELAS_DO_COLETOR.includes(item.caminho)), // o Coletor: só Coletas (01/11)
  );

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
        className="icone-topo botao-avatar"
        aria-label={`Conta de ${nome}`}
        title={nome}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
      >
        <span className="avatar" aria-hidden="true">
          {iniciais(nome)}
        </span>
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
          {outras.map((item) => (
            <Link key={item.caminho} to={item.caminho} role="menuitem" className="so-celular">
              {item.rotulo}
            </Link>
          ))}
          <button type="button" role="menuitem" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

/** "Ana Souza" → "AS"; "ana" → "A"; "Vis (teste)" → "VT" (só as palavras com letra). */
export function iniciais(nome: string | undefined): string {
  const partes = (nome ?? "")
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "?";
  const letras = partes.length === 1 ? partes[0][0] : partes[0][0] + partes[partes.length - 1][0];
  return letras.toUpperCase();
}
