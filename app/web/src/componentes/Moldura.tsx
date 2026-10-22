import { Link, NavLink, Outlet } from "react-router-dom";

import { MENU } from "../menu";
import { useSessao } from "../sessao";
import FaixaDemonstracao from "./FaixaDemonstracao";

/** Moldura de todas as telas: menu lateral (computador e tablet) ou topo + barra embaixo (celular). */
export default function Moldura() {
  const { pessoa, sair } = useSessao();
  const nome = pessoa?.nome || pessoa?.usuario;

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
        <div className="conta">
          <div className="conta-nome">{nome}</div>
          <div className="texto-secundario">{pessoa?.cargo}</div>
          <Link to="/conta/senha" className="conta-link">
            Trocar senha
          </Link>
          <button type="button" className="botao botao-simples" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </aside>

      <header className="topo-celular">
        <span className="marca">LabFlow</span>
        <span className="topo-conta">
          <Link to="/conta/senha" className="conta-link" aria-label="Trocar senha">
            {nome}
          </Link>
          <button type="button" className="botao-topo" onClick={() => void sair()}>
            Sair
          </button>
        </span>
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
