import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";
import { useSessao } from "../../sessao";
import IconeApp from "../../componentes/IconeApp";
import { dm } from "../../componentes/SeletorDeDias";
import { FABRICAS } from "../dados/definicoes";
import { classeDaSituacao } from "../dados/formatos";
import LaudoEsterilizacao from "../LaudoEsterilizacao";
import Instrucao from "./Instrucao";
import { Resultados as TabelasDoApp } from "./comum";

const GraficoResultado = lazy(() => import("../dados/GraficoResultado"));

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
  { aba: "instrucao", rotulo: "IT" },
  { aba: "video", rotulo: "Vídeo" },
];

const LAUDO = {
  base: "/laudos/recebimento-fcoj",
  titulo: "Laudo do recebimento de FCOJ",
  rotulo: "Laudo do recebimento de FCOJ",
  explicacao:
    "Como o papel: A4 deitado, um lote por linha, 15 por folha. O lote entra sozinho quando é registrado; os resultados aparecem conforme são lançados; na Observação, os lotes que faltam na sequência (*). O Analista Responsável é quem registrou; o Visto é à mão. Quando sair uma revisão nova do modelo, o Admin envia o PDF atualizado aqui.",
  unidade: "lotes",
};

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
  pulados: { load: string; item: string; fabrica: string | null; faltam: string }[];
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
  pulados?: number[];
  compostas?: string; // no registrar: as compostas que vão junto ("(1-5)(6-10)")
  texto_compostas?: string;
}

/** "3, 4" -> o aviso de amostra pulada (pedido de 24/10): chegou lote depois, mas estes ainda não. */
/** "1-10, 12" -> [1..10, 12] (o mesmo que a API aceita); o que não entender fica de fora. */
export function lotesDoTexto(texto: string): number[] {
  const lotes = new Set<number>();
  for (const parte of texto.split(/[,;\s]+/)) {
    const m = parte.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
    if (!m) continue;
    const ini = Number(m[1]);
    const fim = m[2] ? Number(m[2]) : ini;
    for (let n = ini; n <= fim && n - ini < 500; n++) lotes.add(n);
  }
  return [...lotes].sort((a, b) => a - b);
}

function faixas(numeros: number[]): string {
  const partes: string[] = [];
  for (let i = 0; i < numeros.length; i++) {
    let j = i;
    while (j + 1 < numeros.length && numeros[j + 1] === numeros[j] + 1) j++;
    partes.push(i === j ? `${numeros[i]}` : `${numeros[i]}-${numeros[j]}`);
    i = j;
  }
  return partes.join(", ");
}

/** As compostas recomendadas, como a API (recomendar_compostas): ~5 lotes por composta, até 6 vale; 7 vira 3+4, 8 vira 4+4. */
export function compostasRecomendadas(lotes: number[]): string {
  const n = lotes.length;
  if (n === 0) return "";
  const k = Math.max(Math.ceil(n / 6), Math.floor(n / 5 + 0.5), 1);
  const base = Math.floor(n / k);
  const sobra = n % k;
  const grupos: number[][] = [];
  let i = 0;
  for (let g = 0; g < k; g++) {
    const t = base + (g >= k - sobra ? 1 : 0);
    grupos.push(lotes.slice(i, i + t));
    i += t;
  }
  return grupos.map((g) => `(${faixas(g)})`).join("");
}

function avisoDePulo(lotes: number[]) {
  const n = lotes.length;
  const lista = n > 1 ? `${lotes.slice(0, -1).join(", ")} e ${lotes[n - 1]}` : String(lotes[0]);
  return `${n > 1 ? "Os lotes" : "O lote"} ${lista} ${n > 1 ? "ainda não chegaram" : "ainda não chegou"} e já vieram lotes depois: ${n > 1 ? "ficam" : "fica"} com * no laudo até chegar.`;
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
        <Link to="/paginas">← Análises</Link>
      </p>
      <div className="app-analise-topo">
        <span className="app-icone app-cor-fcoj" aria-hidden="true">
          <IconeApp nome="recebimento-fcoj" />
        </span>
        <div>
          <div className="titulo-com-sino">
            <h1>Recebimento FCOJ</h1>
            {painel && painel.pulados.length > 0 && <SinoEmObservacao painel={painel} aoAtualizar={setPainel} />}
          </div>
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
      {aba === "painel" && (painel ? <PainelDoRecebimento painel={painel} /> : !erro && <p className="carregando">Carregando...</p>)}
      {aba === "registrar" && (
        <>
          <Registrar pode={painel?.pode_registrar ?? false} aoGravar={() => void carregarPainel()} />
          <details className="cartao compostas-antigas">
            <summary>Loads já recebidos com lote fora de composta</summary>
            <Compostas pode={painel?.pode_registrar ?? false} buscaInicial={params.get("busca") ?? ""} />
          </details>
        </>
      )}
      {/* a tabela de todas as páginas, com os filtros completos e o gráfico (27/10); a leitura mora na aba Leituras */}
      {aba === "resultados" && (
        <TabelasDoApp paginas={[{ caminho: "/paginas/recebimento", titulo: "Recebimento FCOJ", descricao: "C.T e B.L por load e lote" }]} />
      )}
      {aba === "laudo" && painel?.pode_registrar && <LaudoEsterilizacao versao={0} config={LAUDO} />}
      {aba === "laudo" && (
        <div className="cartao">
          <h2>Correções</h2>
          <p className="texto-secundario">Lote com número, fábrica ou item errado: corrija ou exclua antes de imprimir a folha.</p>
          <Link className="botao botao-simples" to="/paginas/recebimento/corrigir">
            Corrigir ou excluir um lote
          </Link>
        </div>
      )}
      {(aba === "instrucao" || aba === "video") && <Instrucao app="recebimento-fcoj" parte={aba} />}
    </section>
  );
}

/** "Em observação" (25/10): no lugar do quadro laranja grande, um sininho ao lado do título com o número de avisos; tocar
 * abre a lista do que precisa de atenção (as amostras puladas, que o Admin/Analista pode dispensar com motivo). */
function SinoEmObservacao({ painel, aoAtualizar }: { painel: Painel; aoAtualizar: (p: Painel) => void }) {
  const [aberto, setAberto] = useState(false);
  const n = painel.pulados.length;
  return (
    <div className="sino-observacao">
      <button
        type="button"
        className="botao-icone sino"
        aria-label={`Em observação: ${n} ${n > 1 ? "avisos" : "aviso"}`}
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        <span className="sino-contador">{n}</span>
      </button>
      {aberto && (
        <div className="sino-painel aviso-pulo" role="status" aria-label="Amostras puladas">
          <h2>Em observação</h2>
          <p className="texto-secundario">
            Amostras puladas: chegaram lotes depois destes, mas eles ainda não vieram. O aviso sai quando chegarem.
          </p>
          <ul>
            {painel.pulados.map((p) => (
              <Pulo key={`${p.load}-${p.item}`} pulo={p} pode={painel.pode_registrar} aoDispensar={aoAtualizar} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PainelDoRecebimento({ painel }: { painel: Painel }) {
  // o que é para ler vai para a aba Leituras (27/10)
  const navegar = useNavigate();
  const ler = (analise = "") => navegar(`/leituras?aba=recebimento${analise ? `&analise=${analise}` : ""}`);
  const maior = Math.max(1, ...painel.fabricas.map((f) => f.nao_ok));
  return (
    <>
      <div className="numeros-app">
        <button type="button" className="numero-app numero-atrasado" onClick={() => ler()}>
          <strong>{painel.atrasados}</strong>
          <span>Atrasados</span>
        </button>
        <button type="button" className="numero-app numero-hoje" onClick={() => ler()}>
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
                      onClick={() => ler(ANALISES.find((a) => a.rotulo === g.analise)?.cod ?? "CT")}
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

/** Um load com amostra pulada; o Admin e o Analista podem dispensar o aviso, com o motivo se quiserem (pedido de 24/10). */
function Pulo({ pulo, pode, aoDispensar }: { pulo: Painel["pulados"][number]; pode: boolean; aoDispensar: (p: Painel) => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function dispensar() {
    setEnviando(true);
    setErro("");
    try {
      aoDispensar(
        await enviarJson<Painel>("/analises/recebimento-fcoj/pulados/dispensar", { load: pulo.load, item: pulo.item, lotes: pulo.faltam, motivo }),
      );
    } catch (e) {
      setErro(mensagem(e, "Não foi possível dispensar o aviso."));
      setEnviando(false);
    }
  }

  return (
    <li>
      <strong>L {pulo.load}</strong>{" "}
      <span className="texto-secundario">
        · {pulo.item}
        {pulo.fabrica ? ` · ${pulo.fabrica}` : ""}
      </span>
      : faltam <strong>{pulo.faltam}</strong>
      {pode && !abrindo && (
        <button type="button" className="botao-link" onClick={() => setAbrindo(true)}>
          Dispensar aviso
        </button>
      )}
      {abrindo && (
        <div className="dispensar-pulo">
          <label className="campo">
            Motivo (opcional)
            <input maxLength={200} value={motivo} placeholder="ex.: amostra perdida no transporte" onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <p className="texto-secundario">O aviso sai do app; no laudo, o lote continua com * (não chegou).</p>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="botoes-lado">
            <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void dispensar()}>
              Dispensar aviso do load {pulo.load}
            </button>
            <button type="button" className="botao botao-simples" onClick={() => (setAbrindo(false), setMotivo(""))}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Registrar o recebimento com as compostas juntas (25/10): a prévia já mostra as compostas recomendadas (~5 lotes por
 * composta) no campo ao lado; o analista olha, muda se quiser (ou apaga para não criar agora) e um Confirmar grava tudo. */
function Registrar({ pode, aoGravar }: { pode: boolean; aoGravar: () => void }) {
  const [campos, setCampos] = useState({ load: "", item: "", fabrica: "", lotes: "", data: hojeEmSaoPaulo() });
  const [compostas, setCompostas] = useState<string | null>(null); // null = as recomendadas
  const [previa, setPrevia] = useState<Resposta | null>(null);
  const [feito, setFeito] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!pode) return <p className="texto-secundario">Só Analista e Admin registram o recebimento.</p>;

  async function enviar(confirmar: boolean) {
    setEnviando(true);
    setErro("");
    try {
      const r = await enviarJson<Resposta>("/analises/recebimento-fcoj/registrar", { ...campos, compostas, previa: !confirmar });
      if (confirmar) {
        const texto = [r.texto, r.texto_compostas].filter(Boolean).join(" ");
        setFeito(r.pulados && r.pulados.length > 0 ? `${texto} ⚠️ ${avisoDePulo(r.pulados)}` : texto);
        setPrevia(null);
        setCampos({ ...campos, load: "", lotes: "" });
        setCompostas(null);
        aoGravar();
      } else {
        setPrevia(r);
        setCompostas(r.compostas ?? "");
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
    if (chave === "lotes" || chave === "load") setCompostas(null); // outros lotes: a recomendação se refaz
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
        <label className="campo">
          Compostas
          <input
            maxLength={300}
            value={compostas ?? compostasRecomendadas(lotesDoTexto(campos.lotes))}
            placeholder="automático (~5 lotes por composta)"
            onChange={(e) => (setCompostas(e.target.value), setPrevia(null))}
          />
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
          {previa.texto_compostas ? <p>{previa.texto_compostas}</p> : <p className="texto-secundario">Sem compostas agora.</p>}
          {previa.pulados && previa.pulados.length > 0 && <p className="aviso-pulo-texto">⚠️ {avisoDePulo(previa.pulados)}</p>}
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

/** A leitura do C.T/B.L dos lotes do recebimento: aqui e na aba Leituras (27/10), já com só os pendentes. */
export function LeituraDoRecebimento({ analiseInicial = "" }: { analiseInicial?: string }) {
  const { pessoa } = useSessao();
  return (
    <Resultados
      pode={!!pessoa?.pode.includes("registrar_analise")}
      buscaInicial=""
      analiseInicial={analiseInicial}
      pendentesInicial
      aoGravar={() => undefined}
      comGraficoInicial={false}
    />
  );
}

function Resultados({
  pode,
  buscaInicial,
  analiseInicial,
  pendentesInicial,
  aoGravar,
  comGraficoInicial = true,
}: {
  pode: boolean;
  buscaInicial: string;
  analiseInicial: string;
  pendentesInicial: boolean;
  aoGravar: () => void;
  comGraficoInicial?: boolean;
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

  const filtrosAtivos = [filtros.so_pendentes && "Só pendentes", filtros.dias !== "30" && `${filtros.dias} dias`].filter(Boolean);
  // o gráfico do resultado (26/10) acompanha a fábrica, o período e a busca da tabela
  const [comGrafico, setComGrafico] = useState(comGraficoInicial);
  const desde = new Date(`${hoje}T12:00:00`);
  desde.setDate(desde.getDate() - Number(filtros.dias));
  const consultaDoGrafico = new URLSearchParams({
    data_de: desde.toISOString().slice(0, 10),
    ...(filtros.fabrica ? { fabrica: filtros.fabrica } : {}),
    ...(busca.trim() ? { busca: busca.trim() } : {}),
  }).toString();

  return (
    <div className="cartao">
      <div className="barra-da-tabela">
        <div className="seletor-de-tabela pilulas-fabrica" role="group" aria-label="Fábrica">
          {["", ...FABRICAS].map((f) => (
            <button key={f || "todas"} type="button" aria-pressed={filtros.fabrica === f} onClick={() => setFiltros({ ...filtros, fabrica: f })}>
              {f || "Todas as fábricas"}
            </button>
          ))}
        </div>
        <div className="acoes-icone">
          <button type="button" className="botao-icone" aria-pressed={comGrafico} title="Gráfico do resultado" onClick={() => setComGrafico(!comGrafico)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
            Gráfico
          </button>
        </div>
      </div>
      {comGrafico && (
        <Suspense fallback={<p className="carregando">Montando o gráfico...</p>}>
          <GraficoResultado api="/paginas/recebimento" consulta={consultaDoGrafico} rotuloData="data da leitura" />
        </Suspense>
      )}
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
            Período
            <select value={filtros.dias} onChange={(e) => setFiltros({ ...filtros, dias: e.target.value })}>
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
              <option value="365">1 ano</option>
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
              onClick={() => (setValores(Object.fromEntries(lancaveis.map((l) => [l.id, valores[l.id]?.trim() || "<10"]))), setPrevia(null))}
            >
              &lt;10 em todos os vazios ({lancaveis.length})
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
      {lotes && lotes.length === 0 && (
        <p className="texto-secundario">
          Nenhum lote{filtros.fabrica && ` da ${filtros.fabrica}`} nos últimos {filtros.dias === "365" ? "12 meses" : `${filtros.dias} dias`}.{" "}
          {filtros.dias !== "365" && (
            <button type="button" className="link-botao" onClick={() => setFiltros({ ...filtros, dias: "365" })}>
              Ver o último ano
            </button>
          )}
        </p>
      )}
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

interface LoadSemComposta {
  load: string;
  item: string;
  fabrica: string | null;
  recebido_em: string;
  livres: string;
  n_livres: number;
  compostas: { id: number; lotes: string }[];
  recomendado: string;
}

/** Compostas dos lotes recebidos (pedido de 24/10): o app recomenda grupos de ~5 (até 6; 7 vira 3 + 4; 8 vira 4 + 4). */
function Compostas({ pode, buscaInicial }: { pode: boolean; buscaInicial: string }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [loads, setLoads] = useState<LoadSemComposta[] | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setLoads(await lerJson<LoadSemComposta[]>(`/analises/recebimento-fcoj/compostas?${new URLSearchParams({ busca: busca.trim() })}`));
        setErro("");
      } catch (e) {
        setErro(mensagem(e, "Não foi possível carregar os loads."));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, versao]);

  return (
    <div className="cartao">
      <h2>Compostas</h2>
      <p className="texto-secundario">
        Loads com lote ainda fora de composta. O recomendado junta uns 5 lotes por composta (até 6 vale; 7 vira 3 e 4; 8 vira 4 e 4).
      </p>
      <div className="busca-com-filtro">
        <label className="busca-redonda">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" aria-label="Procurar load" placeholder="Número do load" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </div>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {loads === null && !erro && <p className="carregando">Carregando...</p>}
      {loads && loads.length === 0 && (
        <p className="texto-secundario">{busca.trim() ? "Load não encontrado." : "Todos os lotes dos últimos 60 dias já estão em composta."}</p>
      )}
      {loads?.map((l) => (
        <CompostasDoLoad key={`${l.load}-${l.item}`} load={l} pode={pode} aoCriar={() => setVersao((v) => v + 1)} />
      ))}
    </div>
  );
}

function CompostasDoLoad({ load, pode, aoCriar }: { load: LoadSemComposta; pode: boolean; aoCriar: () => void }) {
  const [grupos, setGrupos] = useState("");
  const [previa, setPrevia] = useState<string | null>(null);
  const [feito, setFeito] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(confirmar: boolean) {
    setEnviando(true);
    setErro("");
    try {
      const r = await enviarJson<{ texto: string }>("/analises/recebimento-fcoj/compostas", {
        load: load.load, item: load.item, grupos, previa: !confirmar,
      });
      if (confirmar) {
        setFeito(r.texto);
        setPrevia(null);
        setGrupos("");
        aoCriar();
      } else {
        setPrevia(r.texto);
      }
    } catch (e) {
      setErro(mensagem(e, "Não foi possível criar as compostas."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="load-composta" aria-label={`Load ${load.load}`}>
      <div className="load-composta-topo">
        <strong>Load {load.load}</strong>
        <span className="texto-secundario">
          item {load.item} · {load.fabrica ?? "—"} · recebido {dm(load.recebido_em)}
        </span>
      </div>
      <p>
        {load.n_livres > 0 ? (
          <>
            Sem composta: <strong>{load.livres}</strong> ({load.n_livres} lote{load.n_livres > 1 ? "s" : ""})
          </>
        ) : (
          "Todos os lotes já estão em composta."
        )}
        {load.compostas.length > 0 && (
          <span className="texto-secundario"> · já criadas: {load.compostas.map((c) => `#${c.id} (${c.lotes})`).join(", ")}</span>
        )}
      </p>
      {pode && load.n_livres > 0 && (
        <>
          <div className="linha-composta">
            <label className="campo">
              Compostas
              <input
                value={grupos}
                maxLength={300}
                placeholder="ex.: (1-5)(6-10)"
                onChange={(e) => (setGrupos(e.target.value), setPrevia(null))}
              />
            </label>
            <button type="button" className="botao botao-simples" onClick={() => (setGrupos(load.recomendado), setPrevia(null))}>
              Usar o recomendado {load.recomendado}
            </button>
          </div>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          {previa ? (
            <div className="previa-app" role="status">
              <strong>O que vai ser criado</strong>
              <p>{previa}</p>
              <div className="botoes-lado">
                <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void enviar(true)}>
                  Confirmar
                </button>
                <button type="button" className="botao botao-simples" onClick={() => setPrevia(null)}>
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="botao botao-principal" disabled={enviando || !grupos.trim()} onClick={() => void enviar(false)}>
              Ver o que vai ser criado
            </button>
          )}
        </>
      )}
      {feito && (
        <p className="texto-secundario" role="status">
          Criado. {feito}
        </p>
      )}
    </section>
  );
}
