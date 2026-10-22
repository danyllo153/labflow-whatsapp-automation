import { useState, type FormEvent } from "react";

import FaixaDemonstracao from "../componentes/FaixaDemonstracao";
import { useSessao } from "../sessao";

/** Tela de entrar (07 §1; 06 §Primeiro acesso). O botão fica travado enquanto espera a resposta (19/10: dois cliques gastavam a senha provisória). */
export default function Entrar() {
  const { entrar } = useSessao();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro("");
    setEnviando(true);
    try {
      await entrar(usuario.trim(), senha);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  }

  return (
    <div className="tela-entrar">
      <form className="cartao cartao-entrar" onSubmit={enviar} noValidate>
        <div className="marca marca-entrar">LabFlow</div>
        <FaixaDemonstracao />
        <h1>Entrar</h1>
        <label className="campo">
          Usuário
          <input
            name="usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />
        </label>
        <label className="campo">
          Senha
          <input
            name="senha"
            type={mostrar ? "text" : "password"}
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>
        <label className="marcar">
          <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar a senha
        </label>
        {erro && (
          <p className="mensagem-erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" className="botao botao-principal" disabled={enviando || !usuario.trim() || !senha}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
        <p className="texto-secundario">Primeiro acesso ou esqueceu a senha? Peça uma senha provisória ao Admin.</p>
      </form>
    </div>
  );
}
