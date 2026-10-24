import { NavLink, Outlet } from "react-router-dom";

import { MENU } from "../menu";
import { useSessao } from "../sessao";
import FaixaDemonstracao from "./FaixaDemonstracao";
import Icone from "./Icone";
import MenuConta from "./MenuConta";

/**
 * Moldura de todas as telas (APP-032): menu lateral azul no computador e no tablet; barra no topo com só os símbolos de
 * configurações e conta, à direita; barra de ícones embaixo no celular.
 */
export default function Moldura() {
  const { pessoa } = useSessao();
  const menu = MENU.filter((item) => !item.pode || pessoa?.pode.includes(item.pode));

  return (
    <div className="moldura">
      <aside className="menu-lateral" aria-label="Menu">
        <div className="marca">LabFlow</div>
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
      </aside>

      <div className="coluna">
        <header className="topo-celular">
          <span className="marca">LabFlow</span>
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
