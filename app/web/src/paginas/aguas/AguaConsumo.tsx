import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";
import { AbasDaPagina, CabecalhoDaPagina, useAba } from "../../componentes/CabecalhoDaPagina";
import LaudoEsterilizacao from "../LaudoEsterilizacao";
import { agoraSP, classeDaSituacao, dm, hojeSP, mensagem } from "./comum";

/**
 * Água de consumo (pedido de 27/10, migration 079): Santos e TMG (Guarujá), cada um com o mensal e o semanal, e a água
 * dos navios (TEC e COZ). Coleta aqui; o resultado é lançado na aba Leituras (o bag de Coliformes e E.coli em 24 h, o
 * C.T em 48 h, o B.L em 120 h; pH e cloro do semanal na hora). Os pontos e os limites o Admin edita aqui.
 */

type Unidade = "Santos" | "TMG";
type Escolha = Unidade | "Navio";
type Tipo = "mensal" | "semanal";

interface Ponto {
  id: number;
  nome: string;
  ordem: number;
  ativo: boolean;
}

interface Resultado {
  ordem: number;
  ponto: string;
  ct: string | null;
  bl: string | null;
  coliformes: "P" | "A" | null;
  ecoli: "P" | "A" | null;
  ph: number | null;
  cloro: number | null;
  observacao: string | null;
  fora: string[];
}

interface Coleta {
  id: number;
  unidade: Escolha;
  tipo: Tipo;
  navio: string | null;
  dia: string;
  hora: string;
  quem: string;
  analisada_em: string | null;
  analisada_por: string | null;
  resultados: Resultado[];
  faltas: string[];
  situacao: string;
  nao_ok: number;
}

interface Limites {
  ct: number;
  bl: number;
  ph_min: number;
  ph_max: number;
  cloro_min: number;
  cloro_max: number;
}

export interface AguaDeConsumo {
  pode_coletar: boolean;
  pode_lancar: boolean;
  pode_configurar: boolean;
  pontos: Record<Unidade, Record<Tipo, Ponto[]>>;
  pontos_do_navio: Record<string, string>;
  limites: Limites;
  coletas: Coleta[];
  navios: string[];
}

const NOME: Record<Escolha, string> = { Santos: "Santos", TMG: "TMG (Guarujá)", Navio: "Navios" };

function laudosDe(escolha: Escolha, tipo: Tipo) {
  if (escolha === "Navio")
    return [{ base: "/laudos/agua-consumo-navio", titulo: "Água de consumo dos navios", rotulo: "Laudo da água dos navios", unidade: "linhas",
      explicacao: "Uma folha por navio (cheia, abre outra), no mesmo modelo do mensal: TEC e COZ com o navio e a viagem. Imprima quando quiser." }];
  if (tipo === "mensal")
    return [{ base: `/laudos/agua-consumo-mensal-${escolha}`, titulo: `Água de consumo · ${NOME[escolha]} · mensal`, rotulo: `Laudo mensal ${escolha}`,
      unidade: "linhas", explicacao: "Uma linha por ponto; a data sai só na primeira linha de cada coleta. O mesmo modelo para Santos e TMG." }];
  return [
    { base: `/laudos/agua-consumo-fq-${escolha}`, titulo: `Físico-química · ${NOME[escolha]}`, rotulo: `Laudo físico-químico ${escolha}`, unidade: "coletas",
      explicacao: "Duas coletas por folha: data e hora da coleta e da análise, quem coletou e quem analisou, pH, cloro livre e observação." },
    { base: `/laudos/agua-consumo-micro-${escolha}`, titulo: `Microbiológica · ${NOME[escolha]}`, rotulo: `Laudo microbiológico ${escolha}`, unidade: "coletas",
      explicacao: "Uma coleta por folha: Coliformes totais e E.coli (P = presente, A = ausente)." },
  ];
}

export default function AguaConsumo() {
  const [params, setParams] = useSearchParams();
  const escolha = (["Santos", "TMG", "Navio"].includes(params.get("unidade") ?? "") ? params.get("unidade") : "TMG") as Escolha;
  const tipo: Tipo = escolha === "Navio" ? "mensal" : params.get("tipo") === "semanal" ? "semanal" : "mensal";
  const [dados, setDados] = useState<AguaDeConsumo | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<AguaDeConsumo>("/aguas/consumo"));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar a água de consumo."));
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  const mudou = (d: AguaDeConsumo) => (setDados(d), setVersao((v) => v + 1));

  const abas = [
    { aba: "coletar", rotulo: escolha === "Navio" ? "Registrar e histórico" : "Coletar" },
    { aba: "coletas", rotulo: "Coletas" },
    ...(dados?.pode_lancar ? [{ aba: "laudo", rotulo: "Laudo" }] : []),
    ...(dados?.pode_configurar ? [{ aba: "pontos", rotulo: "Pontos e limites" }] : []),
  ];
  const [aba, irPara] = useAba(abas);
  const escolher = (u: Escolha, t: Tipo = "mensal") => setParams({ unidade: u, tipo: t, aba: params.get("aba") ?? "coletar" });
  const daEscolha = (dados?.coletas ?? []).filter((c) => c.unidade === escolha && c.tipo === tipo);
  const pendentes = (u: Escolha, t: Tipo) => (dados?.coletas ?? []).filter((c) => c.unidade === u && c.tipo === t && c.situacao !== "Concluída").length;

  return (
    <section>
      <CabecalhoDaPagina
        icone="agua"
        cor="agua"
        titulo="Água de consumo"
        descricao="Santos e TMG (Guarujá), mensal e semanal, e a água dos navios. O resultado é lançado na aba Leituras."
      />
      <div className="cartoes-agua" role="group" aria-label="Unidade e frequência">
        {(["Santos", "TMG"] as const).map((u) => (
          <div key={u} className={`cartao cartao-agua${escolha === u ? " escolhido" : ""}`}>
            <h2>{NOME[u]}</h2>
            <div className="botoes-lado">
              {(["mensal", "semanal"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="botao botao-simples"
                  aria-pressed={escolha === u && tipo === t}
                  aria-label={`${NOME[u]} ${t}`}
                  onClick={() => escolher(u, t)}
                >
                  {t === "mensal" ? "Mensal" : "Semanal"}
                  {pendentes(u, t) > 0 && <span className="abas-contador">{pendentes(u, t)}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className={`cartao cartao-agua${escolha === "Navio" ? " escolhido" : ""}`}>
          <h2>Água do navio</h2>
          <button type="button" className="botao botao-simples" aria-pressed={escolha === "Navio"} onClick={() => escolher("Navio")}>
            Registrar água do navio
          </button>
        </div>
      </div>
      <h2 className="titulo-da-escolha">
        {NOME[escolha]}
        {escolha !== "Navio" && ` · ${tipo === "mensal" ? "mensal" : "semanal"}`}
      </h2>
      <AbasDaPagina titulo="Água de consumo" abas={abas} aba={aba} irPara={irPara} />
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && aba === "coletar" && (
        <>
          {dados.pode_coletar ? (
            <NovaColeta key={`${escolha}-${tipo}`} dados={dados} escolha={escolha} tipo={tipo} aoGravar={mudou} />
          ) : (
            <p className="texto-secundario">Só quem coleta registra aqui.</p>
          )}
          {escolha === "Navio" && <HistoricoDosNavios dados={dados} versao={versao} />}
        </>
      )}
      {dados && aba === "coletas" && <ListaDeColetas coletas={daEscolha} pode={dados.pode_lancar} aoMudar={mudou} />}
      {dados?.pode_lancar && aba === "laudo" && laudosDe(escolha, tipo).map((l) => <LaudoEsterilizacao key={l.base} versao={versao} config={l} />)}
      {dados?.pode_configurar && aba === "pontos" && (
        <>
          {escolha !== "Navio" && <Pontos key={`${escolha}-${tipo}`} unidade={escolha} tipo={tipo} pontos={dados.pontos[escolha][tipo]} aoMudar={mudou} />}
          <LimitesDaAgua limites={dados.limites} aoMudar={mudou} />
        </>
      )}
    </section>
  );
}

function NovaColeta({ dados, escolha, tipo, aoGravar }: { dados: AguaDeConsumo; escolha: Escolha; tipo: Tipo; aoGravar: (d: AguaDeConsumo) => void }) {
  const opcoes =
    escolha === "Navio"
      ? Object.entries(dados.pontos_do_navio).map(([cod, nome], i) => ({ id: i + 1, nome: `${cod} · ${nome}` }))
      : dados.pontos[escolha][tipo].filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }));
  const [dia, setDia] = useState(hojeSP());
  const [hora, setHora] = useState(agoraSP());
  const [navio, setNavio] = useState("");
  const [coletadoPor, setColetadoPor] = useState("");
  const [fora, setFora] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");
  const [enviando, setEnviando] = useState(false);
  const marcados = opcoes.filter((p) => !fora.has(p.id));

  async function gravar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    setFeito("");
    try {
      aoGravar(
        await enviarJson<AguaDeConsumo>("/aguas/consumo/coletas", {
          unidade: escolha, tipo, navio, dia, hora, coletado_por: coletadoPor, pontos: marcados.map((p) => p.id),
        }),
      );
      setFeito(`Coleta registrada: ${marcados.length} ${marcados.length === 1 ? "ponto" : "pontos"}. O resultado é lançado na aba Leituras.`);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível registrar a coleta."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={gravar} aria-label="Nova coleta da água de consumo">
      <h2>{escolha === "Navio" ? "Água do navio" : "Nova coleta"}</h2>
      <div className="linha-formulario">
        {escolha === "Navio" && (
          <label className="campo">
            Navio e viagem
            <input required maxLength={40} placeholder="ex.: O.BLOSSOM II - 123" value={navio} onChange={(e) => setNavio(e.target.value)} />
          </label>
        )}
        <label className="campo campo-hora">
          Data
          <input type="date" max={hojeSP()} value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <label className="campo campo-hora">
          Hora
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
        <label className="campo">
          Coletado por (se não foi você)
          <input maxLength={60} placeholder="opcional" value={coletadoPor} onChange={(e) => setColetadoPor(e.target.value)} />
        </label>
      </div>
      <p className="texto-secundario">Pontos coletados (toque para tirar o que não foi coletado):</p>
      <div className="botoes-tipo" role="group" aria-label="Pontos coletados">
        {opcoes.map((p) => (
          <button
            key={p.id}
            type="button"
            className="botao-secundario botao-tipo"
            aria-pressed={!fora.has(p.id)}
            onClick={() =>
              setFora((s) => {
                const novo = new Set(s);
                if (novo.has(p.id)) novo.delete(p.id);
                else novo.add(p.id);
                return novo;
              })
            }
          >
            {p.nome}
          </button>
        ))}
      </div>
      {opcoes.length === 0 && <p className="texto-secundario">Nenhum ponto ativo: o Admin cadastra em "Pontos e limites".</p>}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {feito && (
        <p className="texto-secundario" role="status">
          {feito}
        </p>
      )}
      <button type="submit" className="botao botao-principal" disabled={enviando || marcados.length === 0}>
        Registrar coleta ({marcados.length})
      </button>
    </form>
  );
}

function resumo(r: Resultado, tipo: Tipo): string {
  const pa = (v: string | null) => v ?? "…";
  if (tipo === "semanal")
    return `pH ${r.ph?.toLocaleString("pt-BR") ?? "…"} · cloro ${r.cloro?.toLocaleString("pt-BR") ?? "…"} · Colif. ${pa(r.coliformes)} · E.coli ${pa(r.ecoli)}`;
  return `C.T ${r.ct ?? "…"} · B.L ${r.bl ?? "…"} · Colif. ${pa(r.coliformes)} · E.coli ${pa(r.ecoli)}`;
}

function ListaDeColetas({ coletas, pode, aoMudar }: { coletas: Coleta[]; pode: boolean; aoMudar: (d: AguaDeConsumo) => void }) {
  return (
    <div className="cartao" aria-label="Coletas da água de consumo">
      <h2>
        Coletas dos últimos 60 dias <span className="contador">{coletas.length}</span>
      </h2>
      {coletas.length === 0 ? <p className="texto-secundario">Nenhuma coleta registrada.</p> : coletas.map((c) => <CartaoDaColeta key={c.id} coleta={c} pode={pode} aoMudar={aoMudar} />)}
    </div>
  );
}

function CartaoDaColeta({ coleta, pode, aoMudar }: { coleta: Coleta; pode: boolean; aoMudar: (d: AguaDeConsumo) => void }) {
  const [excluindo, setExcluindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const quando = `${dm(coleta.dia)} ${coleta.hora}`;
  async function excluir() {
    setErro("");
    try {
      aoMudar(await enviarJson<AguaDeConsumo>(`/aguas/consumo/coletas/${coleta.id}/excluir`, { motivo }));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível excluir."));
    }
  }
  return (
    <details className="coleta-agua">
      <summary>
        <strong>{coleta.navio ? `${coleta.navio} · ` : ""}{quando}</strong> · {coleta.resultados.length} pontos · {coleta.quem}{" "}
        <span className={classeDaSituacao(coleta.situacao)}>{coleta.situacao}</span>
        {coleta.nao_ok > 0 && <span className="etiqueta etiqueta-nao-ok"> {coleta.nao_ok} fora do limite</span>}
      </summary>
      <ul className="resultados-agua">
        {coleta.resultados.map((r) => (
          <li key={r.ordem}>
            <strong>{r.ponto}</strong> <span className="texto-secundario">{resumo(r, coleta.tipo)}</span>
            {r.fora.length > 0 && <span className="etiqueta etiqueta-nao-ok"> {r.fora.join(", ")}</span>}
          </li>
        ))}
      </ul>
      {pode &&
        (excluindo ? (
          <div className="corrigir-horario" role="group" aria-label={`Excluir a coleta de ${quando}`}>
            <label className="campo">
              Motivo da exclusão (a coleta sai da lista e do laudo, mas fica guardada)
              <input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            {erro && <p className="mensagem-erro">{erro}</p>}
            <div className="botoes-lado">
              <button type="button" className="botao botao-principal" onClick={() => void excluir()}>
                Excluir a coleta
              </button>
              <button type="button" className="botao botao-simples" onClick={() => setExcluindo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link-botao" aria-label={`Excluir a coleta de ${quando}`} onClick={() => setExcluindo(true)}>
            Excluir
          </button>
        ))}
    </details>
  );
}

/** Histórico da água dos navios (embaixo do registro): as coletas de cada navio e o laudo, uma folha por navio. */
function HistoricoDosNavios({ dados, versao }: { dados: AguaDeConsumo; versao: number }) {
  const doNavio = (n: string) => dados.coletas.filter((c) => c.navio === n);
  return (
    <>
      <div className="cartao" aria-label="Histórico da água dos navios">
        <h2>
          Histórico dos navios <span className="contador">{dados.navios.length}</span>
        </h2>
        {dados.navios.length === 0 ? (
          <p className="texto-secundario">Nenhum navio registrado.</p>
        ) : (
          <ul className="lista-navios">
            {dados.navios.map((n) => {
              const coletas = doNavio(n);
              const pendentes = coletas.filter((c) => c.situacao !== "Concluída").length;
              const fora = coletas.reduce((s, c) => s + c.nao_ok, 0);
              return (
                <li key={n}>
                  <span>
                    <strong>{n}</strong>
                    <span className="texto-secundario">
                      {" "}
                      · {coletas.length} {coletas.length === 1 ? "coleta" : "coletas"}
                      {coletas[0] && ` · última ${dm(coletas[0].dia)}`}
                    </span>
                  </span>
                  <span className={fora ? "etiqueta etiqueta-nao-ok" : pendentes ? "etiqueta etiqueta-pendente" : "etiqueta etiqueta-ok"}>
                    {fora ? `${fora} fora do limite` : pendentes ? "A ler" : "Concluído"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {dados.pode_lancar && <LaudoEsterilizacao versao={versao} config={laudosDe("Navio", "mensal")[0]} />}
    </>
  );
}

function Pontos({ unidade, tipo, pontos, aoMudar }: { unidade: Unidade; tipo: Tipo; pontos: Ponto[]; aoMudar: (d: AguaDeConsumo) => void }) {
  const [novo, setNovo] = useState("");
  const [nomes, setNomes] = useState<Record<number, string>>(Object.fromEntries(pontos.map((p) => [p.id, p.nome])));
  const [erro, setErro] = useState("");
  async function enviar(fazer: () => Promise<AguaDeConsumo>) {
    setErro("");
    try {
      aoMudar(await fazer());
    } catch (e) {
      setErro(mensagem(e, "Não foi possível salvar."));
    }
  }
  return (
    <div className="cartao" aria-label="Pontos de coleta">
      <h2>
        Pontos · {NOME[unidade]} · {tipo} <span className="contador">{pontos.filter((p) => p.ativo).length}</span>
      </h2>
      <p className="texto-secundario">
        Renomear não muda o que já foi coletado (a coleta guarda o nome do dia). {tipo === "semanal" ? "Os mesmos pontos na físico-química e na microbiológica." : ""}
      </p>
      <ul className="lista-pontos">
        {pontos.map((p) => (
          <li key={p.id}>
            <span className="texto-secundario">{p.ordem}.</span>
            <input aria-label={`Nome do ponto ${p.ordem}`} maxLength={50} value={nomes[p.id] ?? p.nome} onChange={(e) => setNomes({ ...nomes, [p.id]: e.target.value })} />
            {nomes[p.id] !== undefined && nomes[p.id] !== p.nome && (
              <button type="button" className="botao botao-simples botao-pequeno" onClick={() => void enviar(() => enviarJson(`/aguas/consumo/pontos/${p.id}`, { nome: nomes[p.id] }, "PUT"))}>
                Salvar
              </button>
            )}
            <button
              type="button"
              className="link-botao"
              aria-label={`${p.ativo ? "Desativar" : "Ativar"} ${p.nome}`}
              onClick={() => void enviar(() => enviarJson(`/aguas/consumo/pontos/${p.id}`, { ativo: !p.ativo }, "PUT"))}
            >
              {p.ativo ? "Desativar" : "Ativar"}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="linha-formulario"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(() => enviarJson(`/aguas/consumo/pontos`, { unidade, tipo, nome: novo })).then(() => setNovo(""));
        }}
      >
        <label className="campo">
          Novo ponto
          <input maxLength={50} value={novo} onChange={(e) => setNovo(e.target.value)} />
        </label>
        <button type="submit" className="botao botao-principal" disabled={!novo.trim()}>
          Acrescentar
        </button>
      </form>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

const CAMPOS_DO_LIMITE: [keyof Limites, string][] = [
  ["ct", "C.T máximo (UFC/mL)"],
  ["bl", "B.L máximo (UFC/mL)"],
  ["ph_min", "pH mínimo"],
  ["ph_max", "pH máximo"],
  ["cloro_min", "Cloro livre mínimo"],
  ["cloro_max", "Cloro livre máximo"],
];

function LimitesDaAgua({ limites, aoMudar }: { limites: Limites; aoMudar: (d: AguaDeConsumo) => void }) {
  const [valores, setValores] = useState<Record<string, string>>(Object.fromEntries(CAMPOS_DO_LIMITE.map(([k]) => [k, String(limites[k]).replace(".", ",")])));
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setFeito(false);
    try {
      const corpo = Object.fromEntries(CAMPOS_DO_LIMITE.map(([k]) => [k, Number(valores[k].replace(",", "."))]));
      aoMudar(await enviarJson<AguaDeConsumo>("/aguas/consumo/limites", corpo, "PUT"));
      setFeito(true);
    } catch (er) {
      setErro(mensagem(er, "Não foi possível salvar os limites."));
    }
  }
  return (
    <form className="cartao" onSubmit={salvar} aria-label="Limites da água de consumo">
      <h2>Limites</h2>
      <p className="texto-secundario">Valem para Santos, TMG e os navios. Coliformes e E.coli: presente é sempre fora do limite.</p>
      <div className="grade-filtros">
        {CAMPOS_DO_LIMITE.map(([k, rotulo]) => (
          <label key={k} className="campo">
            {rotulo}
            <input inputMode="decimal" value={valores[k]} onChange={(e) => setValores({ ...valores, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {feito && <p role="status" className="texto-secundario">Limites salvos.</p>}
      <button type="submit" className="botao botao-principal">
        Salvar os limites
      </button>
    </form>
  );
}

// --- a leitura (aba Leituras) -------------------------------------------------------------------------------------------

type Campo = "ct" | "bl" | "coliformes" | "ecoli" | "ph" | "cloro" | "observacao";
const CAMPOS: Record<Tipo, [Campo, string][]> = {
  mensal: [["coliformes", "Coliformes (P/A)"], ["ecoli", "E.coli (P/A)"], ["ct", "C.T 48h"], ["bl", "B.L 120h"]],
  semanal: [["ph", "pH"], ["cloro", "Cloro livre"], ["observacao", "Observação"], ["coliformes", "Coliformes (P/A)"], ["ecoli", "E.coli (P/A)"]],
};

function valorInicial(r: Resultado, c: Campo): string {
  const v = r[c];
  if (v === null || v === undefined) return "";
  return typeof v === "number" ? v.toLocaleString("pt-BR") : String(v);
}

/** As coletas com resultado por lançar, uma por cartão; aqui e na página da água de consumo. */
export function LeituraDaAguaDeConsumo() {
  const [dados, setDados] = useState<AguaDeConsumo | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    lerJson<AguaDeConsumo>("/aguas/consumo").then(setDados, (e) => setErro(mensagem(e, "Não foi possível carregar a água de consumo.")));
  }, []);
  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!dados) return <p className="carregando">Carregando...</p>;
  const abertas = dados.coletas.filter((c) => c.situacao !== "Concluída").sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  return (
    <div aria-label="Leituras da água de consumo">
      <h2>
        Água de consumo: resultados por lançar <span className="contador">{abertas.length}</span>
      </h2>
      {abertas.length === 0 && <p className="texto-secundario">Nenhuma leitura pendente.</p>}
      {abertas.map((c) => (
        <LeituraDaColeta key={`${c.id}-${versao}`} coleta={c} pode={dados.pode_lancar} aoGravar={(d) => (setDados(d), setVersao((v) => v + 1))} />
      ))}
    </div>
  );
}

function LeituraDaColeta({ coleta, pode, aoGravar }: { coleta: Coleta; pode: boolean; aoGravar: (d: AguaDeConsumo) => void }) {
  const campos = CAMPOS[coleta.tipo];
  const inicial = () => Object.fromEntries(coleta.resultados.map((r) => [r.ordem, Object.fromEntries(campos.map(([c]) => [c, valorInicial(r, c)]))]));
  const [valores, setValores] = useState<Record<number, Record<string, string>>>(inicial);
  const [previa, setPrevia] = useState<{ texto: string; fora: string[] } | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const titulo = `${coleta.navio ?? NOME[coleta.unidade]}${coleta.navio ? "" : ` ${coleta.tipo}`} · coleta ${dm(coleta.dia)} ${coleta.hora}`;

  const itens = () =>
    coleta.resultados
      .map((r) => {
        const mudou = Object.fromEntries(campos.filter(([c]) => (valores[r.ordem]?.[c] ?? "") !== valorInicial(r, c)).map(([c]) => [c, valores[r.ordem][c]]));
        return Object.keys(mudou).length ? { ordem: r.ordem, ...mudou } : null;
      })
      .filter(Boolean);

  function emTodos(c: Campo, valor: string) {
    setPrevia(null);
    setValores((v) => Object.fromEntries(Object.entries(v).map(([o, linha]) => [o, linha[c] ? linha : { ...linha, [c]: valor }])));
  }

  async function enviar(confirmar: boolean) {
    setEnviando(true);
    setErro("");
    try {
      const r = await enviarJson<{ previa: boolean; texto: string; fora: string[]; agua: AguaDeConsumo | null }>(
        `/aguas/consumo/coletas/${coleta.id}/resultados`,
        { itens: itens(), previa: !confirmar },
        "PUT",
      );
      if (confirmar && r.agua) aoGravar(r.agua);
      else setPrevia({ texto: r.texto, fora: r.fora });
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cartao" aria-label={titulo}>
      <h3>
        {titulo} <span className={classeDaSituacao(coleta.situacao)}>{coleta.situacao}</span>
      </h3>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th scope="col">Ponto</th>
              {campos.map(([c, rotulo]) => (
                <th key={c} scope="col">
                  {rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coleta.resultados.map((r) => (
              <tr key={r.ordem}>
                <th scope="row">{r.ponto}</th>
                {campos.map(([c, rotulo]) => (
                  <td key={c}>
                    <input
                      className="campo-curto"
                      aria-label={`${rotulo} de ${r.ponto}`}
                      disabled={!pode}
                      maxLength={c === "observacao" ? 40 : 10}
                      value={valores[r.ordem]?.[c] ?? ""}
                      onChange={(e) => {
                        setPrevia(null);
                        setValores({ ...valores, [r.ordem]: { ...valores[r.ordem], [c]: e.target.value } });
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pode && (
        <>
          <div className="botoes-lado">
            <button type="button" className="botao botao-simples" onClick={() => (emTodos("coliformes", "A"), emTodos("ecoli", "A"))}>
              Ausente em todos (Coliformes e E.coli)
            </button>
            {coleta.tipo === "mensal" && (
              <button type="button" className="botao botao-simples" onClick={() => (emTodos("ct", "<1"), emTodos("bl", "<1"))}>
                &lt;1 nos vazios (C.T e B.L)
              </button>
            )}
          </div>
          {!previa && (
            <button type="button" className="botao botao-principal" disabled={enviando || itens().length === 0} onClick={() => void enviar(false)}>
              Ver o que vai ser gravado ({itens().length})
            </button>
          )}
          {previa && (
            <div className="previa-app" role="status" aria-label="O que vai ser gravado">
              <pre className="texto-previa">{previa.texto}</pre>
              {previa.fora.length > 0 && (
                <ul className="mensagem-erro">
                  {previa.fora.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <div className="botoes-lado">
                <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void enviar(true)}>
                  Confirmar
                </button>
                <button type="button" className="botao botao-simples" onClick={() => setPrevia(null)}>
                  Voltar
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
