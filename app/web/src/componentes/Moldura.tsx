import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useMarca } from "../marca";
import { MENU, TELAS_DO_COLETOR } from "../menu";
import { useSessao } from "../sessao";
import BotaoTema from "./BotaoTema";
import BuscaRapida from "./BuscaRapida";
import ChipEquipe from "./ChipEquipe";
import FaixaDemonstracao from "./FaixaDemonstracao";
import Icone from "./Icone";
import MenuConta from "./MenuConta";
import MenuNavegacao from "./MenuNavegacao";

/**
 * Moldura de todas as telas (APP-032; visual repaginado em 24/10, APP-049): menu lateral no computador e no tablet, com
 * as análises em grupos (26/10, MenuNavegacao); barra no topo com o chip do turno, as configurações e o avatar. No
 * celular: o mesmo menu numa gaveta (o botão de três linhas no topo ou "Análises" na barra de baixo) e a barra de baixo
 * com o dia a dia.
 */

const BARRA_DO_CELULAR = ["/", "/turno", "/leituras", "/esterilizacao"];
export default function Moldura() {
  const { pessoa } = useSessao();
  const { pathname } = useLocation();
  const [gaveta, setGaveta] = useState(false); // o menu no celular
  useEffect(() => setGaveta(false), [pathname]);
  const coletor = pessoa?.cargo === "Coletor"; // só Coletas e Turno (01/11)
  const barra = coletor
    ? MENU.filter((i) => TELAS_DO_COLETOR.includes(i.caminho))
    : MENU.filter((item) => !item.soNoMenuLateral && BARRA_DO_CELULAR.includes(item.caminho) && (!item.pode || pessoa?.pode.includes(item.pode)));

  return (
    <div className="moldura">
      <aside id="menu-lateral" className={`menu-lateral${gaveta ? " aberta" : ""}`} aria-label="Menu">
        <div className="menu-lateral-topo">
          <Marca />
          <button type="button" className="botao-icone fechar-gaveta" aria-label="Fechar o menu" onClick={() => setGaveta(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <MenuNavegacao />
      </aside>
      {gaveta && <div className="gaveta-fundo" aria-hidden="true" onClick={() => setGaveta(false)} />}

      <div className="coluna">
        <header className="topo-celular">
          <button type="button" className="botao-icone" aria-label="Abrir o menu" aria-expanded={gaveta} aria-controls="menu-lateral" onClick={() => setGaveta(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Marca />
          <Saudacao nome={pessoa?.nome || pessoa?.usuario} />
          <span className="topo-espaco" />
          {!coletor && <BuscaRapida />}
          <ChipEquipe />
          <BotaoTema />
          <MenuConta />
        </header>

        <main className="conteudo">
          <FaixaDemonstracao />
          <Outlet />
        </main>
      </div>

      <nav className="barra-baixo" aria-label="Menu do celular">
        {barra.map((item) => (
          <NavLink key={item.caminho} to={item.caminho} end={item.caminho === "/"} className="item-barra">
            <Icone caminho={item.caminho} />
            <span>{item.rotulo}</span>
          </NavLink>
        ))}
        {!coletor && (
          <button type="button" className="item-barra" aria-expanded={gaveta} aria-controls="menu-lateral" onClick={() => setGaveta(true)}>
            <svg className="icone" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span>Análises</span>
          </button>
        )}
      </nav>
    </div>
  );
}

/** "Bom dia, Ana" e o dia no topo do computador (visual StarAdmin, 26/10); "hoje" é sempre o de São Paulo. */
function Saudacao({ nome }: { nome?: string }) {
  const agora = new Date();
  const hora = Number(agora.toLocaleString("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }));
  const ola = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dia = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return (
    <div className="saudacao-topo">
      <strong>
        {ola}
        {nome && (
          <>
            , <b>{nome.split(" ")[0]}</b>
          </>
        )}
      </strong>
      <span>{dia.charAt(0).toUpperCase() + dia.slice(1)}</span>
    </div>
  );
}

/** Logo: o frasco num círculo marinho, com o nome ao lado; na Lite, a logo e o nome da instalação (dados\marca). */
function Marca() {
  const marca = useMarca();
  return (
    <div className="marca">
      {marca.logo ? (
        <img className="marca-logo marca-logo-imagem" src="/marca/logo.png" alt="" />
      ) : (
        <span className="marca-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6M10 3v6.5L4.6 18.2A1.8 1.8 0 0 0 6.1 21h11.8a1.8 1.8 0 0 0 1.5-2.8L14 9.5V3M7.5 15h9" />
          </svg>
        </span>
      )}
      <span className="marca-nome">{marca.nome}</span>
    </div>
  );
}
