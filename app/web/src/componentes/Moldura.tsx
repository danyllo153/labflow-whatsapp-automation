import { NavLink, Outlet } from "react-router-dom";

import { MENU } from "../menu";
import { useSessao } from "../sessao";
import CartaoFolhas from "./CartaoFolhas";
import ChipEquipe from "./ChipEquipe";
import FaixaDemonstracao from "./FaixaDemonstracao";
import Icone from "./Icone";
import MenuConta from "./MenuConta";

/**
 * Moldura de todas as telas (APP-032; visual repaginado em 24/10, APP-049): menu lateral claro no computador e no tablet,
 * com o item ativo em cartão branco; barra no topo com o chip do turno, as configurações e o avatar à direita; barra de
 * ícones embaixo no celular.
 */
export default function Moldura() {
  const { pessoa } = useSessao();
  const menu = MENU.filter((item) => !item.pode || pessoa?.pode.includes(item.pode));

  return (
    <div className="moldura">
      <aside className="menu-lateral" aria-label="Menu">
        <Marca />
        <nav>
          {menu.map((item) => (
            <NavLink key={item.caminho} to={item.caminho} end={item.caminho === "/"} className="item-menu">
              <span className="item-rotulo">
                <Icone caminho={item.caminho} />
                {item.rotulo}
              </span>
              {!item.pronto && <span className="etiqueta-breve">Em breve</span>}
            </NavLink>
          ))}
        </nav>
        <CartaoFolhas />
      </aside>

      <div className="coluna">
        <header className="topo-celular">
          <Marca />
          <ChipEquipe />
          <MenuConta />
        </header>

        <main className="conteudo">
          <FaixaDemonstracao />
          <Outlet />
        </main>
      </div>

      <nav className="barra-baixo" aria-label="Menu do celular">
        {menu.filter((item) => !item.soNoMenuLateral).map((item) => (
          <NavLink key={item.caminho} to={item.caminho} end={item.caminho === "/"} className="item-barra">
            <Icone caminho={item.caminho} />
            <span>{item.rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Logo: o frasco num círculo marinho, com o nome ao lado. */
function Marca() {
  return (
    <div className="marca">
      <span className="marca-logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3h6M10 3v6.5L4.6 18.2A1.8 1.8 0 0 0 6.1 21h11.8a1.8 1.8 0 0 0 1.5-2.8L14 9.5V3M7.5 15h9" />
        </svg>
      </span>
      LabFlow
    </div>
  );
}
