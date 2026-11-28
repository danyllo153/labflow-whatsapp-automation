import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { enviarJson, lerJson } from "../../api";
import { useSessao } from "../../sessao";
import { nomeDoCargo } from "../../cargos";

/**
 * Admin → Pessoas (07 §10; APP-016). Tudo o que grava pede confirmação, dizendo o que vai acontecer.
 * Cadastrar e trocar cargo usam as mesmas funções do bot: quem é cadastrado aqui já é reconhecido no WhatsApp.
 */

export interface Pessoa {
  id: number;
  nome: string | null;
  cargo: string;
  usuario: string | null;
  situacao: string;
}

interface Provisoria {
  usuario: string;
  senha_provisoria: string;
  valida_ate: string;
}

export const CARGOS = ["Admin", "Analista", "Consultor", "Coletor"];

/** "Ana Souza" → "ana.souza" (sem acento; o Admin pode trocar). */
export function sugerirUsuario(nome: string): string {
  const partes = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "";
  return (partes.length === 1 ? partes[0] : `${partes[0]}.${partes[partes.length - 1]}`).slice(0, 40);
}

/** Só dígitos; com DDD e número (10 ou 11 dígitos) o 55 do Brasil entra sozinho. */
export function telefoneComDdi(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
}

/** Acesso bloqueado pelo Admin (Completa) ou "Acesso bloqueado" (Lite, sem Admin). */
function estaBloqueado(situacao: string): boolean {
  return situacao === "Bloqueado pelo Admin" || situacao === "Acesso bloqueado";
}

function classeDaSituacao(situacao: string): string {
  if (situacao === "Ativo") return "etiqueta etiqueta-ok";
  if (situacao.startsWith("Bloqueado") || situacao === "Acesso bloqueado") return "etiqueta etiqueta-nao-ok";
  if (situacao === "Senha provisória pendente") return "etiqueta etiqueta-pendente";
  return "etiqueta etiqueta-neutra";
}

/** Pergunta antes de gravar: mostra o que vai acontecer, com Confirmar e Cancelar. */
function Confirmar(props: { children: ReactNode; ocupado: boolean; onSim: () => void; onNao: () => void; rotulo?: string }) {
  return (
    <div className="confirmar" role="dialog" aria-label="Confirmar">
      <p>{props.children}</p>
      <div className="botoes-lado">
        <button type="button" className="botao botao-principal" disabled={props.ocupado} onClick={props.onSim}>
          {props.ocupado ? "Gravando..." : props.rotulo ?? "Confirmar"}
        </button>
        <button type="button" className="botao botao-simples" disabled={props.ocupado} onClick={props.onNao}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SenhaParaEntregar({ dados, onPronto }: { dados: Provisoria; onPronto: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="cartao senha-entregar" role="status">
      <h2>Senha provisória de {dados.usuario}</h2>
      <p className="senha-grande">{dados.senha_provisoria}</p>
      <p>
        Vale até <strong>{dados.valida_ate}</strong> e serve para <strong>um login só</strong>. No primeiro login a pessoa cria a
        senha dela. Anote e entregue: <strong>ela não aparece de novo</strong>.
      </p>
      <div className="botoes-lado">
        <button
          type="button"
          className="botao botao-simples"
          onClick={() => {
            void navigator.clipboard?.writeText(dados.senha_provisoria).then(() => setCopiado(true));
          }}
        >
          {copiado ? "Copiada" : "Copiar"}
        </button>
        <button type="button" className="botao botao-principal" onClick={onPronto}>
          Pronto, entreguei
        </button>
      </div>
    </div>
  );
}

type Acao =
  | { tipo: "provisoria" }
  | { tipo: "cargo"; cargo: string }
  | { tipo: "desbloquear" }
  | { tipo: "acesso"; ativo: boolean }
  | { tipo: "usuario"; usuario: string };

function Gerenciar({ p, souEu, lite, aoMudar, aoProvisoria }: { p: Pessoa; souEu: boolean; lite: boolean; aoMudar: () => void; aoProvisoria: (d: Provisoria) => void }) {
  const [cargo, setCargo] = useState(p.cargo);
  const [usuario, setUsuario] = useState(p.usuario ?? sugerirUsuario(p.nome ?? ""));
  const [pedindo, setPedindo] = useState<Acao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const nome = p.nome || p.usuario || `Pessoa ${p.id}`;

  async function fazer(acao: Acao) {
    setOcupado(true);
    setErro("");
    try {
      if (acao.tipo === "provisoria") aoProvisoria(await enviarJson<Provisoria>(`/admin/pessoas/${p.id}/senha-provisoria`));
      if (acao.tipo === "cargo") await enviarJson(`/admin/pessoas/${p.id}/cargo`, { cargo: acao.cargo }, "PUT");
      if (acao.tipo === "desbloquear") await enviarJson(`/admin/pessoas/${p.id}/desbloquear`);
      if (acao.tipo === "acesso") await enviarJson(`/admin/pessoas/${p.id}/acesso`, { ativo: acao.ativo }, "PUT");
      if (acao.tipo === "usuario") await enviarJson(`/admin/pessoas/${p.id}/usuario`, { usuario: acao.usuario }, "PUT");
      setPedindo(null);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setOcupado(false);
    }
  }

  const texto: Record<Acao["tipo"], string> = {
    provisoria: `Gerar uma senha provisória para ${nome}? A senha atual dela deixa de valer e ela sai do app nos aparelhos onde estiver.`,
    cargo: `Trocar o cargo de ${nome} de ${nomeDoCargo(p.cargo)} para ${nomeDoCargo(cargo)}? Vale também no WhatsApp.`,
    desbloquear: `Desbloquear ${nome}? A senha continua a mesma; só zera as senhas erradas.`,
    acesso: estaBloqueado(p.situacao)
      ? `Liberar o acesso de ${nome} ao app?`
      : lite
        ? `Bloquear o acesso de ${nome}? O nome sai da lista e, se estiver com o app aberto, sai na hora. Os lançamentos ficam.`
        : `Bloquear o acesso de ${nome} ao app? Ela sai do app na hora. O WhatsApp não muda.`,
    usuario: `Dar o usuário "${usuario.trim().toLowerCase()}" para ${nome}?`,
  };

  return (
    <div className="gerenciar">
      {pedindo ? (
        <Confirmar ocupado={ocupado} onSim={() => void fazer(pedindo)} onNao={() => setPedindo(null)}>
          {texto[pedindo.tipo]}
        </Confirmar>
      ) : (
        <>
          {!lite && (
          <form
            className="linha-acao"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (usuario.trim()) setPedindo({ tipo: "usuario", usuario: usuario.trim().toLowerCase() });
            }}
          >
            <label className="campo">
              Usuário no app
              <input value={usuario} autoCapitalize="none" spellCheck={false} onChange={(e) => setUsuario(e.target.value)} />
            </label>
            <button type="submit" className="botao-secundario" disabled={!usuario.trim() || usuario.trim().toLowerCase() === p.usuario}>
              Salvar usuário
            </button>
          </form>
          )}

          {!lite && (
          <form
            className="linha-acao"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setPedindo({ tipo: "cargo", cargo });
            }}
          >
            <label className="campo">
              Cargo
              <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
                {CARGOS.map((c) => (
                  <option key={c} value={c}>
                    {nomeDoCargo(c)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="botao-secundario" disabled={cargo === p.cargo}>
              Trocar cargo
            </button>
          </form>
          )}

          <div className="botoes-acao">
            {p.usuario && !lite && (
              <button type="button" className="botao-secundario" onClick={() => setPedindo({ tipo: "provisoria" })}>
                Gerar senha provisória
              </button>
            )}
            {p.situacao === "Bloqueado por senhas erradas" && !lite && (
              <button type="button" className="botao-secundario" onClick={() => setPedindo({ tipo: "desbloquear" })}>
                Desbloquear
              </button>
            )}
            {p.usuario && !souEu && (
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setPedindo({ tipo: "acesso", ativo: estaBloqueado(p.situacao) })}
              >
                {estaBloqueado(p.situacao) ? "Liberar acesso" : "Bloquear acesso"}
              </button>
            )}
          </div>
        </>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Lite (sem senha, sem cargo, sem telefone): só o nome. A pessoa entra tocando no próprio nome na tela de entrar. */
function NovaPessoaPeloNome({ aoTerminar }: { aoTerminar: () => void }) {
  const [nome, setNome] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function cadastrar() {
    setOcupado(true);
    setErro("");
    try {
      await enviarJson<Pessoa>("/admin/pessoas/por-nome", { nome: nome.trim() });
      aoTerminar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cadastrar.");
      setConferindo(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form
      className="cartao"
      aria-label="Adicionar pessoa"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setErro("");
        if (!nome.trim()) return setErro("Escreva o nome.");
        setConferindo(true);
      }}
    >
      <h2>Adicionar pessoa</h2>
      {conferindo ? (
        <Confirmar ocupado={ocupado} rotulo="Cadastrar" onSim={() => void cadastrar()} onNao={() => setConferindo(false)}>
          Vai cadastrar <strong>{nome.trim()}</strong>. O nome entra na lista e a pessoa entra clicando nele, sem senha.
        </Confirmar>
      ) : (
        <>
          <label className="campo">
            Nome
            <input value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} />
          </label>
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal">
              Continuar
            </button>
            <button type="button" className="botao botao-simples" onClick={aoTerminar}>
              Cancelar
            </button>
          </div>
        </>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </form>
  );
}

function NovaPessoa({ aoTerminar, aoProvisoria }: { aoTerminar: () => void; aoProvisoria: (d: Provisoria) => void }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cargo, setCargo] = useState("Analista");
  const [usuario, setUsuario] = useState("");
  const [usuarioMexido, setUsuarioMexido] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const tel = telefoneComDdi(telefone);
  // (na Lite não há telefone nem senha: ela usa NovaPessoaPeloNome)
  const usuarioFinal = (usuarioMexido ? usuario : sugerirUsuario(nome)).trim().toLowerCase();

  function conferir(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Escreva o nome.");
    if (!/^[0-9]{12,13}$/.test(tel)) return setErro("Telefone com DDD e número (ex.: 11 98765-4321).");
    if (!usuarioFinal) return setErro("Escreva o usuário no app (ex.: ana.souza).");
    setConferindo(true);
  }

  async function cadastrar() {
    setOcupado(true);
    setErro("");
    try {
      const r = await enviarJson<{ senha_provisoria: string; valida_ate: string; pessoa: Pessoa }>("/admin/pessoas", {
        nome: nome.trim(),
        telefone: tel,
        cargo,
        usuario: usuarioFinal,
      });
      aoProvisoria({ usuario: r.pessoa.usuario ?? usuarioFinal, senha_provisoria: r.senha_provisoria, valida_ate: r.valida_ate });
      aoTerminar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cadastrar.");
      setConferindo(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="cartao" onSubmit={conferir} aria-label="Adicionar pessoa">
      <h2>Adicionar pessoa</h2>
      {conferindo ? (
        <Confirmar ocupado={ocupado} rotulo="Cadastrar e gerar senha provisória" onSim={() => void cadastrar()} onNao={() => setConferindo(false)}>
          Vai cadastrar <strong>{nome.trim()}</strong> como <strong>{nomeDoCargo(cargo)}</strong>
          , telefone <strong>{tel}</strong>, usuário no app <strong>{usuarioFinal}</strong>, e gerar
          uma senha provisória de 24 horas. A pessoa também passa a ser reconhecida no WhatsApp.
        </Confirmar>
      ) : (
        <>
          <label className="campo">
            Nome
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="campo">
            Telefone (WhatsApp)
            <input type="tel" inputMode="tel" placeholder="11 98765-4321" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </label>
          <label className="campo">
            Cargo
            <select value={cargo} onChange={(e) => setCargo(e.target.value)}>
              {CARGOS.map((c) => (
                <option key={c} value={c}>
                    {nomeDoCargo(c)}
                  </option>
              ))}
            </select>
          </label>
          <label className="campo">
            Usuário no app
            <input
              autoCapitalize="none"
              spellCheck={false}
              value={usuarioMexido ? usuario : sugerirUsuario(nome)}
              onChange={(e) => {
                setUsuarioMexido(true);
                setUsuario(e.target.value);
              }}
            />
          </label>
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal">
              Continuar
            </button>
            <button type="button" className="botao botao-simples" onClick={aoTerminar}>
              Cancelar
            </button>
          </div>
        </>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </form>
  );
}

export default function Pessoas() {
  const { pessoa: eu, lite } = useSessao();
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [provisoria, setProvisoria] = useState<Provisoria | null>(null);

  const carregar = useCallback(async () => {
    try {
      setPessoas(await lerJson<Pessoa[]>("/admin/pessoas"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as pessoas.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!eu?.pode.includes("gerenciar_pessoas")) {
    return (
      <section>
        <h1>Pessoas</h1>
        <div className="cartao">
          <p>Só o Admin cadastra pessoas e troca cargos.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Pessoas</h1>
      {provisoria && !lite && <SenhaParaEntregar dados={provisoria} onPronto={() => setProvisoria(null)} />}
      {!cadastrando && !provisoria && (
        <div className="barra-acoes">
          <button type="button" className="botao-secundario" onClick={() => setCadastrando(true)}>
            Adicionar pessoa
          </button>
        </div>
      )}
      {cadastrando && lite && (
        <NovaPessoaPeloNome
          aoTerminar={() => {
            setCadastrando(false);
            void carregar();
          }}
        />
      )}
      {cadastrando && !lite && (
        <NovaPessoa
          aoProvisoria={setProvisoria}
          aoTerminar={() => {
            setCadastrando(false);
            void carregar();
          }}
        />
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {!pessoas && !erro && <p className="carregando">Carregando...</p>}
      <ul className="lista-pessoas">
        {!!pessoas?.length && (
          <li className="cabeca-tabela" aria-hidden="true">
            <span>Nome{lite ? "" : " e acesso"}</span>
            <span>Situação</span>
            <span />
          </li>
        )}
        {pessoas?.map((p) => (
          <li key={p.id} className="cartao">
            <div className="pessoa-cabeca">
              <div>
                <strong>{p.nome || "(sem nome)"}</strong>
                {!lite && (
                  <div className="texto-secundario">
                    {p.usuario ? `Usuário ${p.usuario}` : "Sem usuário no app"} · {nomeDoCargo(p.cargo)}
                  </div>
                )}
              </div>
              <span className={classeDaSituacao(p.situacao)}>{p.situacao}</span>
            </div>
            <button
              type="button"
              className="botao-secundario botao-da-linha"
              aria-expanded={aberta === p.id}
              aria-label={aberta === p.id ? "Fechar" : `Editar ${p.nome || ""}`.trim()}
              onClick={() => setAberta(aberta === p.id ? null : p.id)}
            >
              {aberta === p.id ? "Fechar" : "Editar"}
            </button>
            {aberta === p.id && (
              <Gerenciar
                key={`${p.id}-${p.cargo}-${p.usuario}-${p.situacao}`}
                p={p}
                lite={lite}
                souEu={p.usuario === eu.usuario}
                aoMudar={() => void carregar()}
                aoProvisoria={setProvisoria}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
