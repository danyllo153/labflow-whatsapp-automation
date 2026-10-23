import { useState } from "react";
import { Link } from "react-router-dom";

import { useSessao } from "../sessao";
import { nomeDoCargo } from "../cargos";
import { guardarTema, lerTema, type Tema } from "../tema";

/** Minha conta: no celular é por aqui que se chega a Trocar senha, Pessoas (Admin) e Sair. */
export default function Conta() {
  const { pessoa, sair } = useSessao();
  const [tema, setTema] = useState<Tema>(lerTema);
  function escolher(novo: Tema) {
    setTema(novo);
    guardarTema(novo);
  }
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
      <fieldset className="cartao aparencia">
        <legend>Aparência</legend>
        <p className="texto-secundario">A escolha vale só neste aparelho.</p>
        {(
          [
            ["auto", "Automático (segue o aparelho)"],
            ["claro", "Claro"],
            ["escuro", "Escuro"],
          ] as const
        ).map(([valor, rotulo]) => (
          <label key={valor} className="marcar-feito">
            <input type="radio" name="tema" value={valor} checked={tema === valor} onChange={() => escolher(valor)} />
            <span>{rotulo}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
