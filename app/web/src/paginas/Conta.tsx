import { Link } from "react-router-dom";

import { useSessao } from "../sessao";
import { nomeDoCargo } from "../cargos";

/** Minha conta: no celular é por aqui que se chega a Trocar senha, Pessoas (Admin) e Sair. O claro/escuro é o botão de sol e
 * lua do topo (27/10: saiu daqui a escolha de aparência). */
export default function Conta() {
  const { pessoa, sair } = useSessao();
  return (
    <section>
      <h1>Minha conta</h1>
      <div className="cartao">
        <h2>{pessoa?.nome || pessoa?.usuario}</h2>
        <p className="texto-secundario">
          Usuário {pessoa?.usuario} · {nomeDoCargo(pessoa?.cargo)}
        </p>
        <ul className="lista-links">
          <li>
            <Link to="/conta/senha">Trocar senha</Link>
          </li>
          {pessoa?.pode.includes("gerenciar_pessoas") && (
            <li>
              <Link to="/admin/pessoas">Pessoas (cadastrar, cargos, senhas)</Link>
            </li>
          )}
        </ul>
        <button type="button" className="botao botao-simples" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </section>
  );
}
