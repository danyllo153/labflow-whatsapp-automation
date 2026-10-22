import { NavLink, Outlet } from "react-router-dom";

import { MENU } from "../menu";
import FaixaDemonstracao from "./FaixaDemonstracao";

/** Moldura de todas as telas: menu lateral (computador e tablet) ou topo + barra embaixo (celular). */
export default function Moldura() {
  return (
    <div className="moldura">
      <aside className="menu-lateral" aria-label="Menu">
        <div className="marca">LabFlow</div>
        <nav>
          {MENU.map((item) => (
            <NavLink key={item.caminho} to={item.caminho} end={item.caminho === "/"} className="item-menu">
              {item.rotulo}
              {!item.pronto && <span className="etiqueta-breve">Em breve</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <header className="topo-celular">
        <span className="marca">LabFlow</span>
      </header>

      <main className="conteudo">
        <FaixaDemonstracao />
        <Outlet />
      </main>

      <nav className="barra-baixo" aria-label="Menu do celular">
        {MENU.map((item) => (
          <NavLink key={item.caminho} to={item.caminho} end={item.caminho === "/"} className="item-barra">
            {item.rotulo}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
