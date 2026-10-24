import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";

/**
 * Corrigir ou excluir recebimento de FCOJ (07 §5; APP-045). Busca o load pelo número e mostra os lotes. As regras são as
 * das funções do banco (as mesmas do bot): só Admin e Analista; lote com C.T/B.L lido, composta ou teste não muda a data
 * nem se exclui; excluir ARQUIVA (um Admin recupera). A mensagem de recusa do banco aparece como veio.
 */

interface LoteRecebido {
  id: number;
  lote: number;
  data_recebimento: string;
}

export interface LoadRecebido {
  id: number;
  numero: string;
  item: string;
  fabrica: string | null;
  lotes: LoteRecebido[];
}

function dma(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

export default function CorrigirRecebimento() {
  const [numero, setNumero] = useState("");
  const [loads, setLoads] = useState<LoadRecebido[] | null>(null);
  const [erro, setErro] = useState("");

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      setLoads(await lerJson<LoadRecebido[]>(`/recebimento-fcoj/load?numero=${encodeURIComponent(numero.trim())}`));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível buscar."));
    }
  }

  return (
    <section>
      <p className="voltar">
        <Link to="/paginas/recebimento">← Recebimento FCOJ</Link>
      </p>
      <h1>Corrigir recebimento</h1>
      <p className="texto-secundario">
        Para o número do load, o item, a fábrica, o número ou a data de um lote. Lote com leitura ou teste não muda a data nem se
        exclui; excluir arquiva (um Admin recupera).
      </p>
      <form className="cartao linha-registro" onSubmit={buscar} aria-label="Buscar load">
        <label className="campo">
          Número do load
          <input inputMode="numeric" maxLength={10} value={numero} onChange={(e) => setNumero(e.target.value)} />
        </label>
        <button type="submit" className="botao" disabled={!numero.trim()}>
          Buscar
        </button>
      </form>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {loads && loads.length === 0 && (
        <div className="cartao">
          <p>Nenhum load de FCOJ com esse número.</p>
        </div>
      )}
      {loads?.map((l) => <CartaoDoLoad key={l.id} load={l} aoMudar={setLoads} />)}
    </section>
  );
}

function CartaoDoLoad({ load, aoMudar }: { load: LoadRecebido; aoMudar: (l: LoadRecebido[]) => void }) {
  const [editando, setEditando] = useState(false);
  const [numero, setNumero] = useState(load.numero);
  const [item, setItem] = useState(load.item);
  const [fabrica, setFabrica] = useState(load.fabrica ?? "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    const corpo: Record<string, string> = { motivo };
    if (numero.trim() !== load.numero) corpo.numero = numero.trim();
    if (item.trim() !== load.item) corpo.item = item.trim();
    if (fabrica.trim().toUpperCase() !== (load.fabrica ?? "")) corpo.fabrica = fabrica.trim();
    try {
      aoMudar(await enviarJson<LoadRecebido[]>(`/recebimento-fcoj/loads/${load.id}`, corpo, "PUT"));
      setEditando(false);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível corrigir o load."));
    }
  }

  return (
    <div className="cartao" aria-label={`Load ${load.numero} item ${load.item}`}>
      <h2>
        Load {load.numero} · item {load.item}
        {load.fabrica && ` · ${load.fabrica}`}
      </h2>
      {!editando ? (
        <button type="button" className="link-botao" onClick={() => setEditando(true)}>
          Corrigir o load (vale para todos os lotes)
        </button>
      ) : (
        <form className="corrigir-horario" onSubmit={salvar} aria-label={`Corrigir o load ${load.numero}`}>
          <div className="linha-formulario">
            <label className="campo campo-hora">
              Número do load
              <input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </label>
            <label className="campo campo-hora">
              Item
              <input value={item} onChange={(e) => setItem(e.target.value)} />
            </label>
            <label className="campo campo-hora">
              Fábrica
              <input value={fabrica} placeholder="AQA, CON, COL..." onChange={(e) => setFabrica(e.target.value)} />
            </label>
          </div>
          <label className="campo">
            Motivo (opcional)
            <input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal">
              Salvar correção
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <ul className="lista-simples">
        {load.lotes.map((lote) => (
          <LinhaDoLote key={lote.id} lote={lote} aoMudar={aoMudar} />
        ))}
      </ul>
      {load.lotes.length === 0 && <p className="texto-secundario">Nenhum lote neste load.</p>}
    </div>
  );
}

function LinhaDoLote({ lote, aoMudar }: { lote: LoteRecebido; aoMudar: (l: LoadRecebido[]) => void }) {
  const [modo, setModo] = useState<"corrigir" | "excluir" | null>(null);
  const [numero, setNumero] = useState(String(lote.lote));
  const [data, setData] = useState(lote.data_recebimento);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      if (modo === "corrigir") {
        const corpo: Record<string, unknown> = { motivo };
        if (Number(numero) !== lote.lote) corpo.lote = Number(numero);
        if (data !== lote.data_recebimento) corpo.data_recebimento = data;
        aoMudar(await enviarJson<LoadRecebido[]>(`/recebimento-fcoj/lotes/${lote.id}`, corpo, "PUT"));
      } else {
        aoMudar(await enviarJson<LoadRecebido[]>(`/recebimento-fcoj/lotes/${lote.id}/excluir`, { motivo }));
      }
      setModo(null);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    }
  }

  return (
    <li>
      <div className="linha-turno">
        <span>
          <strong>Lote {lote.lote}</strong> · recebido em {dma(lote.data_recebimento)}
        </span>
        {!modo && (
          <span className="acoes-linha">
            <button type="button" className="link-botao" aria-label={`Corrigir o lote ${lote.lote}`} onClick={() => setModo("corrigir")}>
              Corrigir
            </button>
            <button type="button" className="link-botao" aria-label={`Excluir o lote ${lote.lote}`} onClick={() => setModo("excluir")}>
              Excluir
            </button>
          </span>
        )}
      </div>
      {modo && (
        <form className="corrigir-horario" onSubmit={enviar} aria-label={modo === "corrigir" ? `Corrigir o lote ${lote.lote}` : `Excluir o lote ${lote.lote}`}>
          {modo === "corrigir" ? (
            <div className="linha-formulario">
              <label className="campo campo-hora">
                Número do lote
                <input inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </label>
              <label className="campo campo-hora">
                Data do recebimento
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </label>
            </div>
          ) : (
            <p>Excluir arquiva o lote (sai das páginas; um Admin pode recuperar).</p>
          )}
          <label className="campo">
            Motivo (opcional)
            <input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal">
              {modo === "corrigir" ? "Salvar correção" : "Excluir"}
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setModo(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
