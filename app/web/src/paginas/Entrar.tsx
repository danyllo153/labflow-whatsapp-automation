import { useEffect, useState, type FormEvent } from "react";

import { lerJson } from "../api";
import FaixaDemonstracao from "../componentes/FaixaDemonstracao";
import { useMarca } from "../marca";
import { useSessao } from "../sessao";

/**
 * Tela de entrar (07 §1; 06 §Primeiro acesso). Na Lite (27/11, sem senha) a pessoa escolhe o próprio nome numa lista ou escreve
 * um nome novo; na Completa fica o usuário e a senha, como sempre foi.
 */
export default function Entrar() {
  const { lite } = useSessao();
  return lite ? <EntrarPorNome /> : <EntrarComSenha />;
}

function Cabecalho() {
  const marca = useMarca();
  return (
    <div className="marca marca-entrar">
      {marca.logo ? <img className="marca-logo-entrar" src="/marca/logo.png" alt={marca.nome} title={marca.nome} /> : marca.nome}
      <span className="marca-subtitulo">Laboratório de microbiologia</span>
    </div>
  );
}

interface NomeParaEntrar {
  usuario: string;
  nome: string;
}

/** Lite: quem abre toca no nome. Sem ninguém na lista (primeira abertura) pede o nome; em instalação antiga o nome digitado
 * primeiro assume o registro que era o Admin (a API decide). Nada de senha. */
function EntrarPorNome() {
  const { entrarPorNome, entrarComoNovo } = useSessao();
  const [nomes, setNomes] = useState<NomeParaEntrar[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    lerJson<NomeParaEntrar[]>("/entrar/nomes").then(setNomes, () => setNomes([]));
  }, []);

  async function tocar(usuario: string) {
    if (enviando) return;
    setErro("");
    setEnviando(true);
    try {
      await entrarPorNome(usuario);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  }

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro("");
    setEnviando(true);
    try {
      await entrarComoNovo(nome.trim());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  }

  if (nomes === null) return <p className="carregando">Carregando...</p>;
  const primeiraVez = nomes.length === 0;
  const pedindoNome = primeiraVez || novo;

  return (
    <div className="tela-entrar">
      <div className="cartao cartao-entrar">
        <Cabecalho />
        <FaixaDemonstracao />
        {pedindoNome ? (
          <form onSubmit={criar} noValidate aria-label="Sou novo aqui">
            <h1>{primeiraVez ? "Primeira vez aqui" : "Sou novo aqui"}</h1>
            <p className="texto-secundario">Escreva o seu nome. Ele fica na lista e você entra tocando nele, sem senha.</p>
            <label className="campo">
              Seu nome
              <input name="nome" autoComplete="name" maxLength={40} value={nome} onChange={(e) => setNome(e.target.value)} required />
            </label>
            {erro && (
              <p className="mensagem-erro" role="alert">
                {erro}
              </p>
            )}
            <div className="botoes-lado">
              <button type="submit" className="botao botao-principal" disabled={enviando || !nome.trim()}>
                {enviando ? "Entrando..." : "Entrar"}
              </button>
              {!primeiraVez && (
                <button type="button" className="botao botao-simples" disabled={enviando} onClick={() => setNovo(false)}>
                  Voltar à lista
                </button>
              )}
            </div>
          </form>
        ) : (
          <>
            <h1>Quem é você?</h1>
            <p className="texto-secundario">Toque no seu nome para entrar.</p>
            <ul className="lista-nomes">
              {nomes.map((n) => (
                <li key={n.usuario}>
                  <button type="button" className="botao botao-simples" disabled={enviando} onClick={() => void tocar(n.usuario)}>
                    {n.nome}
                  </button>
                </li>
              ))}
            </ul>
            {erro && (
              <p className="mensagem-erro" role="alert">
                {erro}
              </p>
            )}
            <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => setNovo(true)}>
              Sou novo aqui
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Completa: usuário e senha. O botão fica travado enquanto espera a resposta (19/10: dois cliques gastavam a senha provisória). */
function EntrarComSenha() {
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
        <Cabecalho />
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
