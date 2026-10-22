import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useSessao } from "../sessao";

const MINIMO = 8; // 06: pelo menos 8 caracteres (decidido em 17/10)

/** Troca de senha (06 §Primeiro acesso). Obrigatória depois da senha provisória; voluntária pede a senha atual. */
export default function TrocarSenha({ obrigatoria = false }: { obrigatoria?: boolean }) {
  const { pessoa, trocarSenha, sair } = useSessao();
  const navegar = useNavigate();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);

  function problema(): string {
    if (nova.length < MINIMO) return `A senha nova precisa ter pelo menos ${MINIMO} caracteres.`;
    if (pessoa && nova.trim().toLowerCase() === pessoa.usuario.toLowerCase()) return "A senha não pode ser igual ao seu usuário.";
    if (nova !== repetida) return "As duas senhas novas não são iguais.";
    if (!obrigatoria && !atual) return "Escreva a sua senha atual.";
    return "";
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const aviso = problema();
    setErro(aviso);
    if (aviso) return;
    setEnviando(true);
    try {
      await trocarSenha(nova, obrigatoria ? undefined : atual);
      if (!obrigatoria) {
        setPronto(true);
        setAtual("");
        setNova("");
        setRepetida("");
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível trocar a senha.");
    } finally {
      setEnviando(false);
    }
  }

  const tipo = mostrar ? "text" : "password";
  const formulario = (
    <form className={obrigatoria ? "cartao cartao-entrar" : "cartao"} onSubmit={enviar} noValidate>
      {obrigatoria && <div className="marca marca-entrar">LabFlow</div>}
      <h1>{obrigatoria ? "Crie a sua senha" : "Trocar senha"}</h1>
      {obrigatoria && (
        <p>
          Você entrou com uma senha provisória. Para continuar, crie uma senha <strong>só sua</strong>, com pelo menos{" "}
          {MINIMO} caracteres.
        </p>
      )}
      {!obrigatoria && (
        <label className="campo">
          Senha atual
          <input type={tipo} autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
        </label>
      )}
      <label className="campo">
        Senha nova
        <input type={tipo} autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
      </label>
      <label className="campo">
        Repita a senha nova
        <input type={tipo} autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </label>
      <label className="marcar">
        <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar as senhas
      </label>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {pronto && (
        <p className="mensagem-ok" role="status">
          Senha trocada.
        </p>
      )}
      <button type="submit" className="botao botao-principal" disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar a senha"}
      </button>
      {obrigatoria ? (
        <button type="button" className="botao botao-simples" onClick={() => void sair()}>
          Sair
        </button>
      ) : (
        <button type="button" className="botao botao-simples" onClick={() => navegar("/")}>
          Voltar
        </button>
      )}
    </form>
  );

  return obrigatoria ? <div className="tela-entrar">{formulario}</div> : <section>{formulario}</section>;
}
