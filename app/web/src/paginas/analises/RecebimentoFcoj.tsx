import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";
import { dm } from "../../componentes/SeletorDeDias";
import { FABRICAS } from "../dados/definicoes";
import { classeDaSituacao } from "../dados/formatos";

/**
 * Recebimento FCOJ como um app (Fase E, E2; APP-057): Painel, Registrar, Resultados, Laudo, Instrução e Vídeo numa
 * página só. Registrar e lançar passam pelas funções do banco que o bot usa (040): primeiro a prévia, com o texto do
 * banco ("o que vai ser criado"), e só o Confirmar grava. O sinal "<" nunca é alarme; C.T ≥ 200 e B.L ≥ 50 são não ok.
 */

export const ATALHOS_DO_APP = [
  { aba: "painel", rotulo: "Painel" },
  { aba: "registrar", rotulo: "Registrar" },
  { aba: "resultados", rotulo: "Resultados" },
  { aba: "laudo", rotulo: "Laudo" },
  { aba: "instrucao", rotulo: "Instrução" },
  { aba: "video", rotulo: "Vídeo" },
];

interface GrupoDeHoje {
  analise: string;
  situacao: "Atrasado" | "Para hoje";
  n: number;
  loads: string;
}

interface Painel {
  atrasados: number;
  para_hoje: number;
  nao_ok_semana: number;
  hoje: GrupoDeHoje[];
  fabricas: { fabrica: string; nao_ok: number; lidos: number }[];
  pode_registrar: boolean;
}

interface Leitura {
  resultado: string | null;
  nao_ok: boolean;
  prevista: string;
}

interface Lote {
  id: number;
  load: string;
  item: string;
  fabrica: string | null;
  lote: number;
  recebido_em: string;
  ct: Leitura;
  bl72: Leitura;
  bl120: Leitura;
  situacao: string;
}

interface Resposta {
  ok: boolean;
  previa: boolean;
  texto: string;
  gravados: number;
  alarmes: number;
}

const ANALISES = [
  { cod: "CT", chave: "ct", rotulo: "C.T 48h" },
  { cod: "BL72", chave: "bl72", rotulo: "B.L 72h" },
  { cod: "BL120", chave: "bl120", rotulo: "B.L 120h" },
] as const;

type Analise = (typeof ANALISES)[number];

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function mensagem(e: unknown, padrao: string) {
  return e instanceof Error ? e.message : padrao;
}

export default function RecebimentoFcoj() {
  const [params, setParams] = useSearchParams();
  const aba = ATALHOS_DO_APP.some((a) => a.aba === params.get("aba")) ? (params.get("aba") as string) : "painel";
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState("");

  const carregarPainel = useCallback(async () => {
    try {
      setPainel(await lerJson<Painel>("/analises/recebimento-fcoj/painel"));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar o painel."));
    }
  }, []);

  useEffect(() => {
    void carregarPainel();
  }, [carregarPainel]);

  const irPara = (nova: string, extra: Record<string, string> = {}) => setParams({ aba: nova, ...extra });

  return (
    <section className="app-analise">
      <p className="voltar">
        <Link to="/paginas">← Páginas</Link>
      </p>
      <div className="app-analise-topo">
        <span className="app-icone app-cor-azul" aria-hidden="true">
          RF
        </span>
        <div>
          <h1>Recebimento FCOJ</h1>
          <p className="texto-secundario">C.T 48h, B.L 72h e B.L 120h dos lotes de cada load, do recebimento ao laudo.</p>
        </div>
      </div>
      <nav className="abas-app" aria-label="Partes do Recebimento FCOJ">
        {ATALHOS_DO_APP.map((a) => (
          <button key={a.aba} type="button" aria-current={aba === a.aba ? "page" : undefined} onClick={() => irPara(a.aba)}>
            {a.rotulo}
            {a.aba === "painel" && painel && painel.atrasados > 0 && <span className="abas-contador">{painel.atrasados}</span>}
          </button>
        ))}
      </nav>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {aba === "painel" && (painel ? <PainelDoRecebimento painel={painel} irPara={irPara} /> : !erro && <p className="carregando">Carregando...</p>)}
      {aba === "registrar" && (
        <Registrar pode={painel?.pode_registrar ?? false} aoGravar={() => void carregarPainel()} />
      )}
      {aba === "resultados" && (
        <Resultados
          pode={painel?.pode_registrar ?? false}
          buscaInicial={params.get("busca") ?? ""}
          analiseInicial={params.get("analise") ?? ""}
          pendentesInicial={params.get("pendentes") === "1" || !!params.get("analise")}
          aoGravar={() => void carregarPainel()}
        />
      )}
      {aba === "laudo" && (
        <div className="cartao">
          <h2>Laudo</h2>
          <p>
            A página do Recebimento FCOJ tem a tabela pronta para imprimir e exportar para o Excel, com o gráfico por fábrica.
          </p>
          <div className="botoes-lado">
            <Link className="botao botao-principal" to="/paginas/recebimento">
              Abrir a página para imprimir
            </Link>
            <Link className="botao botao-simples" to="/paginas/recebimento/corrigir">
              Corrigir ou excluir um lote
            </Link>
          </div>
        </div>
      )}
      {aba === "instrucao" && (
        <div className="cartao">
          <h2>Instrução</h2>
          <p className="texto-secundario">
            A instrução de trabalho do recebimento vai aparecer aqui, escrita pelo Admin no próprio app (nada de documento da
            empresa no repositório).
          </p>
        </div>
      )}
      {aba === "video" && (
        <div className="cartao">
          <h2>Vídeo</h2>
          <p className="texto-secundario">Em breve: um vídeo curto de como fazer a análise, para quem está aprendendo.</p>
        </div>
      )}
    </section>
  );
}

function PainelDoRecebimento({ painel, irPara }: { painel: Painel; irPara: (aba: string, extra?: Record<string, string>) => void }) {
  const maior = Math.max(1, ...painel.fabricas.map((f) => f.nao_ok));
  return (
    <>
      <div className="numeros-app">
        <button type="button" className="numero-app numero-atrasado" onClick={() => irPara("resultados", { pendentes: "1" })}>
          <strong>{painel.atrasados}</strong>
          <span>Atrasados</span>
        </button>
        <button type="button" className="numero-app numero-hoje" onClick={() => irPara("resultados", { pendentes: "1" })}>
          <strong>{painel.para_hoje}</strong>
          <span>Para hoje</span>
        </button>
        <div className="numero-app numero-nao-ok">
          <strong>{painel.nao_ok_semana}</strong>
          <span>Não ok na semana</span>
        </div>
      </div>
      <div className="painel-app-grade">
        <div className="cartao">
          <h2>Para fazer agora</h2>
          {painel.hoje.length === 0 ? (
            <p className="texto-secundario">Nada atrasado nem para hoje.</p>
          ) : (
            <ul className="lista-para-fazer">
              {painel.hoje.map((g) => (
                <li key={`${g.analise}-${g.situacao}`}>
                  <div>
                    <strong>{g.analise}</strong> <span className={classeDaSituacao(g.situacao)}>{g.situacao}</span>
                    <p className="texto-secundario">{g.loads}</p>
                  </div>
                  <span className="para-fazer-n">{g.n}</span>
                  {painel.pode_registrar && (
                    <button
                      type="button"
                      className="botao botao-simples"
                      onClick={() => irPara("resultados", { analise: ANALISES.find((a) => a.rotulo === g.analise)?.cod ?? "CT" })}
                    >
                      Lançar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao">
          <h2>Não ok por fábrica</h2>
          <p className="texto-secundario">Últimos 30 dias.</p>
          {painel.fabricas.length === 0 ? (
            <p className="texto-secundario">Nenhuma leitura no período.</p>
          ) : (
            <ul className="barras-fabrica">
              {painel.fabricas.map((f) => (
                <li key={f.fabrica}>
                  <span className="fabrica-rotulo">{f.fabrica}</span>
                  <span className="fabrica-trilho">
                    <span className="fabrica-valor" style={{ width: `${(f.nao_ok / maior) * 100}%` }} />
                  </span>
                  <span className="fabrica-numero">
                    {f.nao_ok} de {f.lidos}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Registrar({ pode, aoGravar }: { pode: boolean; aoGravar: () => void }) {
  const [campos, setCampos] = useState({ load: "", item: "", fabrica: "", lotes: "", data: hojeEmSaoPaulo() });
  const [previa, setPrevia] = useState<Resposta | null>(null);
  const [feito, setFeito] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!pode) return <p className="texto-secundario">Só Analista e Admin registram o recebimento.</p>;

  async function enviar(confirmar: boolean) {
    setEnviando(true);
    setErro("");
    try {
      const r = await enviarJson<Resposta>("/analises/recebimento-fcoj/registrar", { ...campos, previa: !confirmar });
      if (confirmar) {
        setFeito(r.texto);
        setPrevia(null);
        setCampos({ ...campos, load: "", lotes: "" });
        aoGravar();
      } else {
        setPrevia(r);
        setFeito("");
      }
    } catch (e) {
      setErro(mensagem(e, "Não foi possível registrar."));
    } finally {
      setEnviando(false);
    }
  }

  const mudar = (chave: keyof typeof campos) => (e: { target: { value: string } }) => {
    setCampos({ ...campos, [chave]: e.target.value });
    setPrevia(null);
  };

  return (
    <form
      className="cartao"
      aria-label="Registrar recebimento"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void enviar(false);
      }}
    >
      <h2>Registrar recebimento</h2>
      <div className="linha-formulario">
        <label className="campo">
          Load
          <input required maxLength={10} inputMode="numeric" value={campos.load} onChange={mudar("load")} placeholder="ex.: 43670" />
        </label>
        <label className="campo">
          Item
          <input required maxLength={10} inputMode="numeric" value={campos.item} onChange={mudar("item")} placeholder="ex.: 2549" />
        </label>
        <label className="campo">
          Fábrica
          <select required value={campos.fabrica} onChange={mudar("fabrica")}>
            <option value="">Escolha</option>
            {FABRICAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="linha-formulario">
        <label className="campo">
          Lotes
          <input required maxLength={200} value={campos.lotes} onChange={mudar("lotes")} placeholder="ex.: 1-14 ou 1-5, 7, 9-10" />
        </label>
        <label className="campo">
          Recebido em
          <input required type="date" max={hojeEmSaoPaulo()} value={campos.data} onChange={mudar("data")} />
        </label>
      </div>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {previa ? (
        <div className="previa-app" role="status">
          <strong>O que vai ser criado</strong>
          <p>{previa.texto}</p>
          <div className="botoes-lado">
            <button type="button" className="botao botao-principal" disabled={enviando || previa.texto.includes("nada novo")} onClick={() => void enviar(true)}>
              Confirmar
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setPrevia(null)}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <button type="submit" className="botao botao-principal" disabled={enviando}>
          Ver o que vai ser criado
        </button>
      )}
      {feito && (
        <p className="texto-secundario" role="status">
          Registrado. {feito}
        </p>
      )}
    </form>
  );
}

function Resultados({
  pode,
  buscaInicial,
  analiseInicial,
  pendentesInicial,
  aoGravar,
}: {
  pode: boolean;
  buscaInicial: string;
  analiseInicial: string;
  pendentesInicial: boolean;
  aoGravar: () => void;
}) {
  const [busca, setBusca] = useState(buscaInicial);
  const [filtros, setFiltros] = useState({ fabrica: "", so_pendentes: pendentesInicial, dias: "30" });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [erro, setErro] = useState("");
  const [analise, setAnalise] = useState<Analise>(ANALISES.find((a) => a.cod === analiseInicial) ?? ANALISES[0]);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [previa, setPrevia] = useState<Resposta | null>(null);
  const [feito, setFeito] = useState("");
  const [enviando, setEnviando] = useState(false);
  const hoje = hojeEmSaoPaulo();

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({ busca: busca.trim(), fabrica: filtros.fabrica, dias: filtros.dias });
    if (filtros.so_pendentes) q.set("so_pendentes", "true");
    try {
      setLotes((await lerJson<{ lotes: Lote[] }>(`/analises/recebimento-fcoj/resultados?${q}`)).lotes);
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar os resultados."));
    }
  }, [busca, filtros]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const lancaveis = (lotes ?? []).filter((l) => l[analise.chave].resultado === null && l[analise.chave].prevista <= hoje);
  const preenchidos = lancaveis.filter((l) => (valores[l.id] ?? "").trim());

  async function lancar(confirmar: boolean) {
    setEnviando(true);
    setErro("");
    try {
      const itens = preenchidos.map((l) => ({ recebimento_lote_id: l.id, resultado: valores[l.id].trim() }));
      const r = await enviarJson<Resposta>("/analises/recebimento-fcoj/lancar", { analise: analise.cod, itens, previa: !confirmar });
      if (confirmar) {
        setPrevia(null);
        setValores({});
        setFeito(`${r.gravados} resultado${r.gravados > 1 ? "s" : ""} de ${analise.rotulo} gravado${r.gravados > 1 ? "s" : ""}.`);
        aoGravar();
        await carregar();
      } else {
        setPrevia(r);
        setFeito("");
      }
    } catch (e) {
      setErro(mensagem(e, "Não foi possível lançar."));
    } finally {
      setEnviando(false);
    }
  }

  const filtrosAtivos = [filtros.fabrica, filtros.so_pendentes && "Só pendentes", filtros.dias !== "30" && `${filtros.dias} dias`].filter(Boolean);

  return (
    <div className="cartao">
      <div className="busca-com-filtro">
        <label className="busca-redonda">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" aria-label="Procurar load, fábrica ou item" placeholder="Load, fábrica ou item" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <button
          type="button"
          className="botao-filtro"
          aria-label="Filtros"
          aria-expanded={mostrarFiltros}
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {filtrosAtivos.length > 0 && <span className="abas-contador">{filtrosAtivos.length}</span>}
        </button>
      </div>
      {mostrarFiltros && (
        <div className="filtros-app" role="group" aria-label="Filtros dos resultados">
          <label className="campo">
            Fábrica
            <select value={filtros.fabrica} onChange={(e) => setFiltros({ ...filtros, fabrica: e.target.value })}>
              <option value="">Todas</option>
              {FABRICAS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            Período
            <select value={filtros.dias} onChange={(e) => setFiltros({ ...filtros, dias: e.target.value })}>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
            </select>
          </label>
          <label className="campo-marcar">
            <input type="checkbox" checked={filtros.so_pendentes} onChange={(e) => setFiltros({ ...filtros, so_pendentes: e.target.checked })} />
            Só atrasados, para hoje e não ok
          </label>
        </div>
      )}

      {pode && (
        <div className="lancar-app">
          <span>Lançar</span>
          {ANALISES.map((a) => (
            <button
              key={a.cod}
              type="button"
              className="botao-tipo"
              aria-pressed={analise.cod === a.cod}
              onClick={() => (setAnalise(a), setValores({}), setPrevia(null))}
            >
              {a.rotulo}
            </button>
          ))}
          {lancaveis.length > 0 && (
            <button
              type="button"
              className="botao botao-simples"
              onClick={() => (setValores(Object.fromEntries(lancaveis.map((l) => [l.id, valores[l.id]?.trim() || "<1"]))), setPrevia(null))}
            >
              &lt;1 em todos os vazios ({lancaveis.length})
            </button>
          )}
        </div>
      )}

      {lotes === null && !erro && <p className="carregando">Carregando...</p>}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {lotes && lotes.length === 0 && <p className="texto-secundario">Nenhum lote encontrado.</p>}
      {lotes && lotes.length > 0 && (
        <div className="tabela-rolavel">
          <table className="tabela-dados">
            <thead>
              <tr>
                <th>Load</th>
                <th>Lote</th>
                <th>Fábrica</th>
                <th>Recebido</th>
                {ANALISES.map((a) => (
                  <th key={a.cod}>{a.rotulo}</th>
                ))}
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.load} <span className="texto-secundario">· {l.item}</span>
                  </td>
                  <td>{l.lote}</td>
                  <td>{l.fabrica ?? "—"}</td>
                  <td>{dm(l.recebido_em)}</td>
                  {ANALISES.map((a) => {
                    const leitura = l[a.chave];
                    if (pode && a.cod === analise.cod && lancaveis.includes(l)) {
                      return (
                        <td key={a.cod}>
                          <input
                            className="entrada-resultado"
                            aria-label={`${a.rotulo} do load ${l.load} lote ${l.lote}`}
                            maxLength={12}
                            value={valores[l.id] ?? ""}
                            placeholder={leitura.prevista < hoje ? "atrasado" : "hoje"}
                            onChange={(e) => (setValores({ ...valores, [l.id]: e.target.value }), setPrevia(null))}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={a.cod} className={leitura.nao_ok ? "valor-nao-ok" : undefined}>
                        {leitura.resultado ?? <span className="texto-secundario">{dm(leitura.prevista)}</span>}
                      </td>
                    );
                  })}
                  <td>
                    <span className={classeDaSituacao(l.situacao === "Para hoje" ? "Vence hoje" : l.situacao)}>{l.situacao}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pode && preenchidos.length > 0 && !previa && (
        <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void lancar(false)}>
          Ver o que vai ser gravado ({preenchidos.length})
        </button>
      )}
      {previa && (
        <div className="previa-app" role="status">
          <strong>O que vai ser gravado</strong>
          <p className="previa-texto">{previa.texto}</p>
          <div className="botoes-lado">
            <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void lancar(true)}>
              Confirmar
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setPrevia(null)}>
              Voltar
            </button>
          </div>
        </div>
      )}
      {feito && (
        <p className="texto-secundario" role="status">
          {feito}
        </p>
      )}
    </div>
  );
}
