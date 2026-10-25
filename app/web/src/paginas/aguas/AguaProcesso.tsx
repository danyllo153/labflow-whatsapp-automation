import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";
import LaudoEsterilizacao from "../LaudoEsterilizacao";
import { agoraSP, classeDaSituacao, dm, hojeSP, mensagem } from "./comum";

/**
 * Água do processo (07 §5.1; APP-037): coleta nos anéis de água estéril (Manifold e Câmaras 4, 5 e 6), C.T. (48 h) e
 * B.L. (120 h) de cada ponto. Ponto não coletado sai "-" no laudo. As leituras que faltam viram pendência no Início.
 */

const PONTOS = [
  { chave: "manifold", nome: "Manifold" },
  { chave: "camara4", nome: "Câmara 4" },
  { chave: "camara5", nome: "Câmara 5" },
  { chave: "camara6", nome: "Câmara 6" },
] as const;
type Ponto = (typeof PONTOS)[number]["chave"];

interface Leitura {
  coletado: boolean;
  ct: string | null;
  bl: string | null;
}

interface Coleta {
  id: number;
  dia: string;
  hora: string;
  pontos: Record<Ponto, Leitura>;
  observacao: string | null;
  quem: string;
  resultado_por: string | null;
  situacao: string;
}

export interface AguaDoProcesso {
  pode_coletar: boolean;
  pode_lancar: boolean;
  coletas: Coleta[];
}

const LAUDO = {
  base: "/laudos/agua-processo",
  titulo: "Laudo da água do processo",
  rotulo: "Laudo da água do processo",
  explicacao: "Uma coleta por linha, com o nome de quem coletou. RCA (visto e data) é à mão, na folha impressa.",
  unidade: "coletas",
};

export default function AguaProcesso() {
  const [dados, setDados] = useState<AguaDoProcesso | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<AguaDoProcesso>("/aguas/processo"));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar a água do processo."));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mudou(novo: AguaDoProcesso) {
    setDados(novo);
    setVersao((v) => v + 1);
  }

  return (
    <section>
      <p className="voltar">
        <Link to="/paginas">← Análises</Link>
      </p>
      <h1>Água do processo</h1>
      <p className="texto-secundario">Anéis de água estéril do Manifold e das linhas de carregamento das Câmaras 4, 5 e 6.</p>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados?.pode_coletar && <NovaColeta aoGravar={mudou} />}
      {dados && (
        <div className="cartao" aria-label="Coletas da água do processo">
          <h2>
            Coletas dos últimos 30 dias <span className="contador">{dados.coletas.length}</span>
          </h2>
          {dados.coletas.length === 0 ? (
            <p className="texto-secundario">Nenhuma coleta registrada.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">Coleta</th>
                    {PONTOS.map((p) => (
                      <th key={p.chave} scope="col">
                        {p.nome}
                        <br />
                        <span className="texto-secundario">C.T. / B.L.</span>
                      </th>
                    ))}
                    <th scope="col">Observação</th>
                    <th scope="col">Quem</th>
                    <th scope="col">Situação</th>
                    {dados.pode_lancar && <th scope="col">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {dados.coletas.map((c) => (
                    <LinhaDaColeta key={`${c.id}-${versao}`} coleta={c} pode={dados.pode_lancar} aoMudar={mudou} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {dados?.pode_lancar && <LaudoEsterilizacao versao={versao} config={LAUDO} />}
    </section>
  );
}

function NovaColeta({ aoGravar }: { aoGravar: (d: AguaDoProcesso) => void }) {
  const [dia, setDia] = useState(hojeSP());
  const [hora, setHora] = useState(agoraSP());
  const [pontos, setPontos] = useState<Ponto[]>(["manifold", "camara4", "camara5", "camara6"]);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function gravar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      aoGravar(await enviarJson<AguaDoProcesso>("/aguas/processo", { dia, hora, pontos, observacao }));
      setObservacao("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível registrar a coleta."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={gravar} aria-label="Nova coleta da água do processo">
      <h2>Nova coleta</h2>
      <div className="linha-formulario">
        <label className="campo campo-hora">
          Data
          <input type="date" max={hojeSP()} value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <label className="campo campo-hora">
          Hora
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
      </div>
      <p className="texto-secundario">Pontos coletados (toque para tirar o que não foi coletado):</p>
      <div className="botoes-tipo" role="group" aria-label="Pontos coletados">
        {PONTOS.map((p) => (
          <button
            key={p.chave}
            type="button"
            className="botao-secundario botao-tipo"
            aria-pressed={pontos.includes(p.chave)}
            onClick={() => setPontos((a) => (a.includes(p.chave) ? a.filter((x) => x !== p.chave) : [...a, p.chave]))}
          >
            {p.nome}
          </button>
        ))}
      </div>
      <label className="campo">
        Observação (opcional)
        <input maxLength={60} placeholder="Ex.: Esterilizando" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </label>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao botao-principal" disabled={enviando || pontos.length === 0}>
        Registrar coleta
      </button>
    </form>
  );
}

function LinhaDaColeta({ coleta, pode, aoMudar }: { coleta: Coleta; pode: boolean; aoMudar: (d: AguaDoProcesso) => void }) {
  const [modo, setModo] = useState<"editar" | "excluir" | null>(null);
  const [dia, setDia] = useState(coleta.dia);
  const [hora, setHora] = useState(coleta.hora);
  const [pontos, setPontos] = useState<Ponto[]>(PONTOS.filter((p) => coleta.pontos[p.chave].coletado).map((p) => p.chave));
  const [observacao, setObservacao] = useState(coleta.observacao ?? "");
  const [ct, setCt] = useState<Record<string, string>>(Object.fromEntries(PONTOS.map((p) => [p.chave, coleta.pontos[p.chave].ct ?? ""])));
  const [bl, setBl] = useState<Record<string, string>>(Object.fromEntries(PONTOS.map((p) => [p.chave, coleta.pontos[p.chave].bl ?? ""])));
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const quando = `${dm(coleta.dia)} ${coleta.hora}`;

  async function salvar() {
    setErro("");
    try {
      await enviarJson<AguaDoProcesso>(`/aguas/processo/${coleta.id}`, { dia, hora, pontos, observacao }, "PUT");
      const so = (v: Record<string, string>) => Object.fromEntries(pontos.map((p) => [p, v[p] ?? ""]));
      aoMudar(await enviarJson<AguaDoProcesso>(`/aguas/processo/${coleta.id}/resultados`, { ct: so(ct), bl: so(bl) }, "PUT"));
      setModo(null);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível salvar."));
    }
  }

  async function excluir() {
    setErro("");
    try {
      aoMudar(await enviarJson<AguaDoProcesso>(`/aguas/processo/${coleta.id}/excluir`, { motivo }));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível excluir."));
    }
  }

  function menorQue1(tipo: "ct" | "bl") {
    const todos = Object.fromEntries(pontos.map((p) => [p, "<1"]));
    if (tipo === "ct") setCt({ ...ct, ...todos });
    else setBl({ ...bl, ...todos });
  }

  const colunas = PONTOS.length + (pode ? 5 : 4);
  return (
    <>
      <tr>
        <th scope="row">{quando}</th>
        {PONTOS.map((p) => {
          const l = coleta.pontos[p.chave];
          return <td key={p.chave}>{l.coletado ? `${l.ct ?? "…"} / ${l.bl ?? "…"}` : "-"}</td>;
        })}
        <td>{coleta.observacao ?? ""}</td>
        <td>{coleta.quem}</td>
        <td>
          <span className={classeDaSituacao(coleta.situacao)}>{coleta.situacao}</span>
        </td>
        {pode && (
          <td className="acoes-celula">
            <button type="button" className="link-botao" aria-label={`Editar a coleta de ${quando}`} onClick={() => setModo("editar")}>
              Editar
            </button>
            <button type="button" className="link-botao" aria-label={`Excluir a coleta de ${quando}`} onClick={() => setModo("excluir")}>
              Excluir
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={colunas}>
            <div className="corrigir-horario" role="group" aria-label={modo === "editar" ? `Editar a coleta de ${quando}` : `Excluir a coleta de ${quando}`}>
              {modo === "editar" ? (
                <>
                  <div className="linha-formulario">
                    <label className="campo campo-hora">
                      Data
                      <input type="date" max={hojeSP()} value={dia} onChange={(e) => setDia(e.target.value)} />
                    </label>
                    <label className="campo campo-hora">
                      Hora
                      <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                    </label>
                    <label className="campo">
                      Observação
                      <input maxLength={60} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                    </label>
                  </div>
                  <div className="botoes-tipo" role="group" aria-label="Pontos coletados">
                    {PONTOS.map((p) => (
                      <button
                        key={p.chave}
                        type="button"
                        className="botao-secundario botao-tipo"
                        aria-pressed={pontos.includes(p.chave)}
                        onClick={() => setPontos((a) => (a.includes(p.chave) ? a.filter((x) => x !== p.chave) : [...a, p.chave]))}
                      >
                        {p.nome}
                      </button>
                    ))}
                  </div>
                  <p className="texto-secundario">C.T. em 48 h, B.L. em 120 h. Apague o número para tirar um resultado.</p>
                  {PONTOS.filter((p) => pontos.includes(p.chave)).map((p) => (
                    <div key={p.chave} className="linha-formulario">
                      <label className="campo campo-hora">
                        {p.nome} C.T.
                        <input maxLength={10} value={ct[p.chave]} onChange={(e) => setCt({ ...ct, [p.chave]: e.target.value })} />
                      </label>
                      <label className="campo campo-hora">
                        {p.nome} B.L.
                        <input maxLength={10} value={bl[p.chave]} onChange={(e) => setBl({ ...bl, [p.chave]: e.target.value })} />
                      </label>
                    </div>
                  ))}
                  <div className="botoes-lado">
                    <button type="button" className="botao botao-simples" onClick={() => menorQue1("ct")}>
                      C.T. &lt;1 em todos
                    </button>
                    <button type="button" className="botao botao-simples" onClick={() => menorQue1("bl")}>
                      B.L. &lt;1 em todos
                    </button>
                  </div>
                </>
              ) : (
                <label className="campo">
                  Motivo da exclusão (a coleta sai da lista e do laudo, mas fica guardada)
                  <input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </label>
              )}
              {erro && (
                <p className="mensagem-erro" role="alert">
                  {erro}
                </p>
              )}
              <div className="botoes-lado">
                {modo === "editar" ? (
                  <button type="button" className="botao botao-principal" disabled={pontos.length === 0} onClick={() => void salvar()}>
                    Salvar
                  </button>
                ) : (
                  <button type="button" className="botao botao-principal" onClick={() => void excluir()}>
                    Excluir a coleta
                  </button>
                )}
                <button type="button" className="botao botao-simples" onClick={() => setModo(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
