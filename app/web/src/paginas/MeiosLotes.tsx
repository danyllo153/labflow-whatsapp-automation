import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarArquivo, enviarJson, lerJson } from "../api";
import LaudoEsterilizacao from "./LaudoEsterilizacao";

/**
 * Meios de cultura e lotes (07 §7.4; APP-036): o recebimento e a aceitação de cada lote de OSA, PDA, PCA e Wort, e o
 * lote EM USO de cada meio. O lote em uso não é sempre o mais novo e um antigo pode voltar a ser usado: basta tocar em
 * "Usar este". O laudo LAB/090 tem uma folha por meio. O Admin carrega o histórico em papel uma vez, por um CSV.
 */

interface Periodo {
  desde: string;
  ate: string | null;
}

interface Lote {
  id: number;
  lote: string;
  recebido_em: string;
  conservacao: string;
  ph: string;
  observacao: string | null;
  quem: string;
  em_uso: boolean;
  usos: Periodo[];
}

interface DoMeio {
  meio: string;
  em_uso: { lote_id: number; lote: string; desde: string; quem: string } | null;
  lotes: Lote[];
}

export interface MeiosELotes {
  pode_registrar: boolean;
  pode_importar: boolean;
  meios: DoMeio[];
}

const USO_DO_MEIO: Record<string, string> = {
  OSA: "C.T. de concentrado e NFC",
  PDA: "B.L. de concentrado, NFC e águas",
  PCA: "C.T. das águas (processo, baias, linhas)",
  Wort: "fungos psicrotróficos dos tanques de NFC",
};

function dma(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

export default function MeiosLotes() {
  const [dados, setDados] = useState<MeiosELotes | null>(null);
  const [meio, setMeio] = useState("OSA");
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<MeiosELotes>("/meios"));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar os meios."));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mudou(novo: MeiosELotes) {
    setDados(novo);
    setVersao((v) => v + 1);
  }

  const atual = dados?.meios.find((m) => m.meio === meio);
  return (
    <section>
      <p className="voltar">
        <Link to="/registros-diarios">← Registros diários</Link>
      </p>
      <h1>Meios de cultura (lotes)</h1>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && (
        <>
          <div className="cartoes-numeros" role="group" aria-label="Meio">
            {dados.meios.map((m) => (
              <button
                key={m.meio}
                type="button"
                className={`cartao-numero${m.meio === meio ? " ativo" : ""}`}
                aria-pressed={m.meio === meio}
                onClick={() => setMeio(m.meio)}
              >
                <span className="numero">{m.meio}</span>
                <span className="rotulo">{m.em_uso ? `Em uso: ${m.em_uso.lote}` : "Sem lote em uso"}</span>
              </button>
            ))}
          </div>
          {atual && (
            <>
              <section className="cartao" aria-label={`Lote em uso de ${atual.meio}`}>
                <h2>{atual.meio} · lote em uso</h2>
                <p className="texto-secundario">{USO_DO_MEIO[atual.meio]}</p>
                {atual.em_uso ? (
                  <p>
                    <strong>{atual.em_uso.lote}</strong> desde {atual.em_uso.desde} (marcado por {atual.em_uso.quem})
                  </p>
                ) : (
                  <p>Nenhum lote marcado em uso. Toque em "Usar este" num lote abaixo.</p>
                )}
              </section>
              {dados.pode_registrar && <NovoLote meio={atual.meio} aoGravar={mudou} />}
              <ListaDeLotes doMeio={atual} pode={dados.pode_registrar} aoMudar={mudou} />
              {dados.pode_registrar && (
                <LaudoEsterilizacao
                  versao={versao}
                  config={{
                    base: `/laudos/meios-${atual.meio}`,
                    titulo: `Laudo de meios de cultura · ${atual.meio}`,
                    rotulo: `Laudo de meios de cultura ${atual.meio}`,
                    explicacao: "Uma folha por meio, 33 lotes por folha. O bloco Analista / Responsável é assinado à mão.",
                    unidade: "lotes",
                  }}
                />
              )}
            </>
          )}
          {dados.pode_importar && <Importar aoImportar={() => void carregar()} />}
        </>
      )}
    </section>
  );
}

function NovoLote({ meio, aoGravar }: { meio: string; aoGravar: (d: MeiosELotes) => void }) {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [lote, setLote] = useState("");
  const [recebido, setRecebido] = useState(hoje);
  const [conservacao, setConservacao] = useState("OK");
  const [ph, setPh] = useState("OK");
  const [observacao, setObservacao] = useState("");
  const [usar, setUsar] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function gravar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      aoGravar(await enviarJson<MeiosELotes>("/meios", { meio, lote, recebido_em: recebido, conservacao, ph, observacao, usar }));
      setLote("");
      setObservacao("");
      setUsar(false);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível cadastrar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={gravar} aria-label={`Novo lote de ${meio}`}>
      <h2>Lote recebido · {meio}</h2>
      <div className="linha-formulario">
        <label className="campo">
          Número do lote
          <input maxLength={30} value={lote} onChange={(e) => setLote(e.target.value)} />
        </label>
        <label className="campo campo-hora">
          Recebido em
          <input type="date" max={hoje} value={recebido} onChange={(e) => setRecebido(e.target.value)} />
        </label>
        <label className="campo campo-hora">
          Estado de conservação
          <select value={conservacao} onChange={(e) => setConservacao(e.target.value)}>
            <option>OK</option>
            <option>Não ok</option>
          </select>
        </label>
        <label className="campo campo-hora">
          pH
          <select value={ph} onChange={(e) => setPh(e.target.value)}>
            <option>OK</option>
            <option>Não ok</option>
          </select>
        </label>
      </div>
      <label className="campo">
        Observação (opcional)
        <input maxLength={200} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </label>
      <label className="marcar-feito">
        <input type="checkbox" checked={usar} onChange={(e) => setUsar(e.target.checked)} /> Já passa a ser o lote em uso
      </label>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao botao-principal" disabled={enviando || !lote.trim()}>
        Cadastrar lote
      </button>
    </form>
  );
}

function ListaDeLotes({ doMeio, pode, aoMudar }: { doMeio: DoMeio; pode: boolean; aoMudar: (d: MeiosELotes) => void }) {
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  async function usar(id: number) {
    setErro("");
    try {
      aoMudar(await enviarJson<MeiosELotes>(`/meios/${id}/usar`, undefined));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível trocar o lote em uso."));
    }
  }

  async function excluir(id: number) {
    setErro("");
    try {
      aoMudar(await enviarJson<MeiosELotes>(`/meios/${id}/excluir`, { motivo }));
      setExcluindo(null);
      setMotivo("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível excluir."));
    }
  }

  return (
    <div className="cartao" aria-label={`Lotes de ${doMeio.meio}`}>
      <h2>
        Lotes de {doMeio.meio} <span className="contador">{doMeio.lotes.length}</span>
      </h2>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {doMeio.lotes.length === 0 ? (
        <p className="texto-secundario">Nenhum lote cadastrado.</p>
      ) : (
        <ul className="lista-simples">
          {doMeio.lotes.map((l) => (
            <li key={l.id}>
              <div className="linha-turno">
                <span>
                  <strong>{l.lote}</strong> · recebido em {dma(l.recebido_em)} · conservação {l.conservacao} · pH {l.ph}
                  {l.observacao && ` · ${l.observacao}`}
                  {l.em_uso && (
                    <>
                      {" "}
                      <span className="etiqueta etiqueta-ok">Em uso</span>
                    </>
                  )}
                </span>
                {pode && (
                  <span className="acoes-linha">
                    {!l.em_uso && (
                      <button type="button" className="link-botao" aria-label={`Usar o lote ${l.lote}`} onClick={() => void usar(l.id)}>
                        Usar este
                      </button>
                    )}
                    {l.usos.length === 0 && (
                      <button type="button" className="link-botao" aria-label={`Excluir o lote ${l.lote}`} onClick={() => setExcluindo(l.id)}>
                        Excluir
                      </button>
                    )}
                  </span>
                )}
              </div>
              {l.usos.length > 0 && (
                <span className="texto-secundario">
                  Usado: {l.usos.map((u) => (u.ate ? `${u.desde} a ${u.ate}` : `desde ${u.desde}`)).join("; ")}
                </span>
              )}
              {excluindo === l.id && (
                <div className="linha-registro">
                  <label className="campo">
                    Motivo da exclusão
                    <input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </label>
                  <button type="button" className="botao" onClick={() => void excluir(l.id)}>
                    Excluir
                  </button>
                  <button type="button" className="botao botao-simples" onClick={() => setExcluindo(null)}>
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Importar({ aoImportar }: { aoImportar: () => void }) {
  const [resultado, setResultado] = useState("");
  const [erro, setErro] = useState("");

  async function enviar(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setErro("");
    setResultado("");
    try {
      const r = await enviarArquivo<{ importados: number; ja_existiam: number; erros: string[] }>(
        "/meios/importar",
        new Blob([await arquivo.text()], { type: "text/csv" }),
      );
      if (r.erros.length) setErro(`Nada foi gravado: ${r.erros.join("; ")}`);
      else setResultado(`${r.importados} lote(s) importado(s), ${r.ja_existiam} já estavam cadastrados.`);
      aoImportar();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível importar."));
    } finally {
      evento.target.value = "";
    }
  }

  return (
    <div className="cartao modelo-laudo" aria-label="Importar histórico">
      <h2>Histórico em papel (Admin)</h2>
      <p className="texto-secundario">
        Uma vez só: um CSV com <code>meio;lote;recebido_em;conservacao;ph;observacao;em_uso</code>. Lotes já cadastrados não se repetem.
      </p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {resultado && <p role="status">{resultado}</p>}
      <label className="botao-secundario botao-arquivo">
        Importar CSV
        <input type="file" accept=".csv,text/csv" className="so-leitor" aria-label="Arquivo CSV do histórico de lotes" onChange={enviar} />
      </label>
    </div>
  );
}
