import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";
import { useSessao } from "../../sessao";
import { formatar } from "./formatos";

/**
 * Uma coleta (07 §Regras e §Permissões; APP-029): ver, corrigir e excluir pelas funções do banco do bot (a regra e a
 * permissão moram lá). Corrigir mostra "antes → depois" e pede confirmação. Excluir não apaga: a coleta fica guardada e o
 * Admin recupera. Coleta não pede motivo. Se já tem análise, drop concluído ou TAB, o banco recusa e a mensagem aparece.
 */

interface Navio {
  id: number;
  nome: string;
}

export interface Coleta {
  coleta_id: number;
  origem: string;
  tanque: string;
  navio_id: number | null;
  navio: string | null;
  data_coleta: string;
  coletado_por: string | null;
  digitado_por: string | null;
  registrado_em: string;
  com_analise: boolean;
  com_drop_concluido: boolean;
  com_tab: boolean;
  navios: Navio[];
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

export default function DetalheColeta() {
  const { id } = useParams();
  const { pessoa } = useSessao();
  const navegar = useNavigate();
  const [coleta, setColeta] = useState<Coleta | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [modo, setModo] = useState<"corrigir" | "excluir" | null>(null);
  const coletor = pessoa?.cargo === "Coletor"; // 01/11: corrige só o tanque e a data; exclui com motivo

  const carregar = useCallback(async () => {
    try {
      setColeta(await lerJson<Coleta>(`/coletas/${id}`));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar a coleta."));
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !coleta)
    return (
      <section>
        <p className="trilha">
          {!coletor && <><Link to="/paginas">Análises</Link> / </>}<Link to="/paginas/coletas?aba=lista">Coletas</Link>
        </p>
        <h1>Coleta</h1>
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      </section>
    );
  if (!coleta) return <p className="carregando">Carregando...</p>;

  const c = coleta;
  const pode = (acao: string) => pessoa?.pode.includes(acao) ?? false;
  const travas = [c.com_analise && "análise", c.com_drop_concluido && "drop concluído", c.com_tab && "TAB"].filter(Boolean) as string[];

  return (
    <section className="detalhe-coleta">
      <p className="trilha">
        {!coletor && <><Link to="/paginas">Análises</Link> / </>}<Link to="/paginas/coletas?aba=lista">Coletas</Link> / Tanque {c.tanque}
      </p>
      <h1>
        Coleta · Tanque {c.tanque} · {formatar(c.data_coleta, "data")}
      </h1>

      <div className="cartao">
        <dl className="dados-coleta">
          <dt>Origem</dt>
          <dd>{c.origem}</dd>
          {c.navio && (
            <>
              <dt>Navio</dt>
              <dd>{c.navio}</dd>
            </>
          )}
          <dt>Tanque</dt>
          <dd>{c.tanque}</dd>
          <dt>Data da coleta</dt>
          <dd>{formatar(c.data_coleta, "data")}</dd>
          <dt>Coletado por</dt>
          <dd>{c.coletado_por ?? "—"}</dd>
          <dt>Digitado por</dt>
          <dd>{c.digitado_por ?? "—"}</dd>
          <dt>Registrado em</dt>
          <dd>{formatar(c.registrado_em, "dataHora")}</dd>
        </dl>
        {travas.length > 0 && (
          <p className="texto-secundario">
            Já tem {travas.join(", ")}: não dá para excluir a coleta nem mudar a data (peça a um Analista ou Admin; primeiro se resolve o que está ligado a ela).
          </p>
        )}
        {aviso && <p role="status">{aviso}</p>}
        {!modo && (pode("corrigir_registro") || pode("excluir_registro")) && (
          <div className="botoes-lado">
            {pode("corrigir_registro") && (
              <button type="button" className="botao-secundario" onClick={() => { setAviso(""); setModo("corrigir"); }}>
                Corrigir
              </button>
            )}
            {pode("excluir_registro") && (
              <button type="button" className="botao-secundario" onClick={() => { setAviso(""); setModo("excluir"); }}>
                Excluir
              </button>
            )}
          </div>
        )}
      </div>

      {modo === "corrigir" && (
        <Corrigir
          coleta={c}
          coletor={coletor}
          aoTerminar={(nova) => {
            setModo(null);
            if (nova) {
              setColeta(nova);
              setAviso("Coleta corrigida.");
            }
          }}
        />
      )}
      {modo === "excluir" && <Excluir coleta={c} coletor={coletor} aoCancelar={() => setModo(null)} aoExcluir={() => navegar("/paginas/coletas?aba=lista")} />}
    </section>
  );
}

function Corrigir({ coleta: c, coletor, aoTerminar }: { coleta: Coleta; coletor: boolean; aoTerminar: (nova: Coleta | null) => void }) {
  const [tanque, setTanque] = useState(c.tanque);
  const [data, setData] = useState(c.data_coleta);
  const [quem, setQuem] = useState(c.coletado_por ?? "");
  const [navioId, setNavioId] = useState(c.navio_id ? String(c.navio_id) : "");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const mudancas: { campo: string; antes: string; depois: string; corpo: Record<string, unknown> }[] = [];
  if (tanque.trim().toUpperCase() !== c.tanque) mudancas.push({ campo: "Tanque", antes: c.tanque, depois: tanque.trim().toUpperCase(), corpo: { tanque } });
  if (data !== c.data_coleta) mudancas.push({ campo: "Data da coleta", antes: formatar(c.data_coleta, "data"), depois: formatar(data, "data"), corpo: { data_coleta: data } });
  if (quem.trim() !== (c.coletado_por ?? "")) mudancas.push({ campo: "Coletado por", antes: c.coletado_por ?? "—", depois: quem.trim() || "—", corpo: { coletado_por: quem } });
  if (c.origem === "Navio" && navioId && Number(navioId) !== c.navio_id) {
    const novo = c.navios.find((n) => n.id === Number(navioId));
    mudancas.push({ campo: "Navio", antes: c.navio ?? "—", depois: novo?.nome ?? navioId, corpo: { navio_id: Number(navioId) } });
  }

  function revisar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    if (mudancas.length === 0) {
      setErro("Nada mudou: mude pelo menos um campo.");
      return;
    }
    setConfirmando(true);
  }

  async function confirmar() {
    setEnviando(true);
    setErro("");
    try {
      const corpo = Object.assign({}, ...mudancas.map((m) => m.corpo));
      aoTerminar(await enviarJson<Coleta>(`/coletas/${c.coleta_id}`, corpo, "PUT"));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível corrigir."));
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={revisar} aria-label="Corrigir a coleta">
      <h2>Corrigir a coleta</h2>
      <div className="linha-formulario">
        <label className="campo campo-hora">
          Tanque
          <input value={tanque} maxLength={40} onChange={(e) => setTanque(e.target.value)} />
        </label>
        <label className="campo">
          Data da coleta
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        {!coletor && (
          <label className="campo">
            Coletado por
            <input value={quem} maxLength={40} onChange={(e) => setQuem(e.target.value)} />
          </label>
        )}
        {c.origem === "Navio" && !coletor && (
          <label className="campo">
            Navio
            <select value={navioId} onChange={(e) => setNavioId(e.target.value)}>
              {c.navios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {confirmando ? (
        <div className="confirmacao" role="group" aria-label="Confirmar a correção">
          <p>Vai mudar:</p>
          <ul className="lista-simples">
            {mudancas.map((m) => (
              <li key={m.campo}>
                <strong>{m.campo}:</strong> {m.antes} → {m.depois}
              </li>
            ))}
          </ul>
          <div className="botoes-lado">
            <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void confirmar()}>
              Confirmar a correção
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setConfirmando(false)}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="botoes-lado">
          <button type="submit" className="botao botao-principal">
            Revisar a correção
          </button>
          <button type="button" className="botao botao-simples" onClick={() => aoTerminar(null)}>
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}

function Excluir({ coleta: c, coletor, aoCancelar, aoExcluir }: { coleta: Coleta; coletor: boolean; aoCancelar: () => void; aoExcluir: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function excluir(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      await enviarJson(`/coletas/${c.coleta_id}/excluir`, { motivo });
      aoExcluir();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível excluir."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao confirmacao" onSubmit={excluir} aria-label="Excluir a coleta">
      <h2>
        Excluir a coleta do tanque {c.tanque} de {formatar(c.data_coleta, "data")}?
      </h2>
      <p>
        Ela sai das páginas e das contas, mas fica guardada com quem excluiu e quando: o Admin pode recuperar.
        {!coletor && " Coleta não pede motivo."}
      </p>
      <label className="campo">
        {coletor ? "Motivo" : "Motivo (opcional)"}
        <input maxLength={300} required={coletor} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="botoes-lado">
        <button type="submit" className="botao botao-principal" disabled={enviando}>
          Confirmar e excluir
        </button>
        <button type="button" className="botao botao-simples" onClick={aoCancelar}>
          Voltar
        </button>
      </div>
    </form>
  );
}
