import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AbasDaPagina, CabecalhoDaPagina } from "../componentes/CabecalhoDaPagina";
import { lerJson } from "../api";
import { useSessao } from "../sessao";
import { dm } from "../componentes/SeletorDeDias";
import { hojeEmSaoPaulo, Numeros, PreviaDaGravacao, SoQuemGrava, useGravacao } from "./analises/comum";
import LaudoEsterilizacao, { IconeAcao } from "./LaudoEsterilizacao";

// Os laudos da contra-amostra (26/10), como o papel: a folha impressa fecha com o traço nas linhas vazias.
const LAUDO_CONTRA_EMBARQUE = {
  base: "/laudos/contra-embarque",
  titulo: "Laudo da contra-amostra do embarque",
  rotulo: "Laudo da contra-amostra do embarque",
  explicacao: "Uma folha por caixa de navio: os loads de FCOJ (com a quantidade de amostras) e os potes de NFC dos tanques, com a data de descarte; o navio vai em letra grande na Observação.",
  unidade: "linhas",
};
const LAUDO_CONTRA_RECEBIMENTO = {
  base: "/laudos/contra-recebimento",
  titulo: "Laudo da contra-amostra do recebimento",
  rotulo: "Laudo da contra-amostra do recebimento",
  explicacao: "Uma folha corrida, na ordem em que os loads foram arquivados: caixa, load, lotes e a data de descarte.",
  unidade: "loads",
};

/**
 * Arquivo de contra-amostras (PB21, migration 105 do bot; spec 11): as caixas de navio, do recebimento (121 a 153) e dos
 * tanques de terra (caixa = número do tanque), o que tem em cada uma e quando vence. O vencido fica em vermelho (ninguém é
 * avisado). Arquivar o recebimento e descartar usam as mesmas funções do bot, com a prévia e um Confirmar.
 */

type Tipo = "navio" | "recebimento" | "tanque";

export interface Caixa {
  tipo: Tipo;
  numero: number;
  familia: string | null;
  navio: string | null;
  viagem: string | null;
  itens: number;
  amostras: number;
  descarte_em: string | null;
  situacao: "Disponível" | "Em uso" | "Vencida";
  itens_vencidos: number;
}

interface Arquivo {
  caixas: Caixa[];
  sugerida_recebimento: number | null;
  pode_gravar: boolean;
}

interface Item {
  item: string;
  descricao: string;
  navio: string | null;
  viagem: string | null;
  tanque: string | null;
  load: string | null;
  lotes: string | null;
  quantidade: number | null;
  data_ref: string | null;
  data_descarte: string | null;
  situacao: "Arquivado" | "Vencido" | "Descartado";
  descartado_em: string | null;
}

type Aba = "vencidas" | Tipo | "laudo";

const ABAS: { aba: Aba; rotulo: string }[] = [
  { aba: "vencidas", rotulo: "Para descartar" },
  { aba: "navio", rotulo: "Navios" },
  { aba: "recebimento", rotulo: "Recebimento" },
  { aba: "tanque", rotulo: "Tanques terra" },
  { aba: "laudo", rotulo: "Laudo" },
];

const NOME_DO_TIPO: Record<Tipo, string> = { navio: "Navio", recebimento: "Recebimento", tanque: "Tanque terra" };

const dataBr = (d: string | null) => (d ? `${dm(d)}/${d.slice(0, 4)}` : "-");

function legenda(c: Caixa): string {
  if (c.tipo === "navio") return c.navio ? `${c.navio} ${c.viagem ?? ""}`.trim() : c.familia ?? "livre";
  if (c.situacao === "Disponível") return "livre";
  return `${c.itens} ${c.tipo === "tanque" ? (c.itens === 1 ? "bag" : "bags") : c.itens === 1 ? "load" : "loads"}`;
}

export default function ArquivoDeContraAmostras() {
  const { pessoa } = useSessao();
  const [dados, setDados] = useState<Arquivo | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<Aba>("vencidas");
  const [escolhida, setEscolhida] = useState<Caixa | null>(null);

  const carregar = useCallback(async () => {
    try {
      const novo = await lerJson<Arquivo>("/arquivo");
      setDados(novo);
      setEscolhida((e) => (e ? novo.caixas.find((c) => c.tipo === e.tipo && c.numero === e.numero) ?? null : null));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o arquivo.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const vencidas = dados?.caixas.filter((c) => c.situacao === "Vencida") ?? [];
  const daAba = aba === "vencidas" ? vencidas : (dados?.caixas.filter((c) => c.tipo === aba) ?? []);
  const pode = !!dados?.pode_gravar && !!pessoa?.pode.includes("registrar_analise");

  return (
    <section className="pagina-arquivo">
      <CabecalhoDaPagina
        icone="arquivo"
        cor="rotina"
        titulo="Arquivo de contra-amostras"
        descricao="As caixas de navio, do recebimento e dos tanques de terra, o que tem em cada uma e quando vence. O que venceu fica em vermelho."
      />
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && (
        <>
          <Numeros
            itens={[
              { rotulo: "Para descartar", valor: vencidas.length, tom: vencidas.length ? "nao-ok" : "hoje" },
              { rotulo: "Em uso", valor: dados.caixas.filter((c) => c.situacao === "Em uso").length, tom: "neutro" },
              { rotulo: "Livres", valor: dados.caixas.filter((c) => c.situacao === "Disponível").length, tom: "ok" },
            ]}
          />
          <BuscaDeLoad />
          <AbasDaPagina
            titulo="Arquivo"
            abas={ABAS.filter((a) => a.aba !== "laudo" || pode).map((a) => ({ ...a, contador: a.aba === "vencidas" ? vencidas.length : undefined }))}
            aba={aba}
            irPara={(a) => {
              setAba(a as Aba);
              setEscolhida(null);
            }}
          />
          {aba === "recebimento" && (
            <SoQuemGrava pode={pode}>
              <ArquivarRecebimento sugerida={dados.sugerida_recebimento} aoGravar={() => void carregar()} />
            </SoQuemGrava>
          )}
          {aba === "laudo" && pode && (
            <>
              <LaudoEsterilizacao versao={0} config={LAUDO_CONTRA_RECEBIMENTO} />
              <LaudoEsterilizacao versao={0} config={LAUDO_CONTRA_EMBARQUE} />
            </>
          )}
          {escolhida && <ConteudoDaCaixa caixa={escolhida} pode={pode} aoFechar={() => setEscolhida(null)} aoMudar={() => void carregar()} />}
          {aba === "laudo" ? null : daAba.length === 0 ? (
            <p className="texto-secundario">{aba === "vencidas" ? "Nada vencido: nenhuma caixa para descartar." : "Nenhuma caixa cadastrada."}</p>
          ) : (
            <ul className="grade-caixas" aria-label="Caixas">
              {daAba.map((c) => (
                <li key={`${c.tipo}-${c.numero}`}>
                  <button
                    type="button"
                    className={`caixa-arquivo caixa-${c.situacao === "Vencida" ? "vencida" : c.situacao === "Em uso" ? "em-uso" : "livre"}`}
                    aria-pressed={escolhida?.tipo === c.tipo && escolhida.numero === c.numero}
                    aria-label={`Caixa ${c.numero}, ${NOME_DO_TIPO[c.tipo]}, ${c.situacao}`}
                    onClick={() => setEscolhida(c)}
                  >
                    <strong>{c.numero}</strong>
                    <span className="caixa-legenda">{legenda(c)}</span>
                    <span className="caixa-data">
                      {c.situacao === "Vencida" ? "venceu" : c.descarte_em ? `até ${dm(c.descarte_em)}` : aba === "vencidas" ? NOME_DO_TIPO[c.tipo] : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ConteudoDaCaixa({ caixa, pode, aoFechar, aoMudar }: { caixa: Caixa; pode: boolean; aoFechar: () => void; aoMudar: () => void }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [historico, setHistorico] = useState(false);
  const [erro, setErro] = useState("");
  const g = useGravacao("/arquivo/descartar", () => aoMudar());

  useEffect(() => {
    let vivo = true;
    setItens(null);
    lerJson<{ itens: Item[] }>(`/arquivo/${caixa.tipo}/${caixa.numero}${historico ? "?descartados=true" : ""}`).then(
      (r) => vivo && setItens(r.itens),
      (e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível abrir a caixa."),
    );
    return () => {
      vivo = false;
    };
  }, [caixa, historico]);

  const titulo = `Caixa ${caixa.numero} · ${NOME_DO_TIPO[caixa.tipo]}${caixa.navio ? ` · ${caixa.navio} ${caixa.viagem ?? ""}` : ""}`;
  return (
    <article className="cartao conteudo-caixa" aria-label={titulo}>
      <h2>
        {titulo}{" "}
        <span className={caixa.situacao === "Vencida" ? "etiqueta etiqueta-nao-ok" : caixa.situacao === "Em uso" ? "etiqueta etiqueta-pendente" : "etiqueta etiqueta-ok"}>
          {caixa.situacao === "Disponível" ? "Livre" : caixa.situacao}
        </span>
      </h2>
      <p className="texto-secundario">
        {caixa.tipo === "navio"
          ? `A caixa sai inteira quando tudo vence${caixa.descarte_em ? `: ${dataBr(caixa.descarte_em)}` : ""}. NFC vence em 1 ano; FCOJ em 2.`
          : caixa.tipo === "recebimento"
            ? "Cada load vence 7 dias depois de arquivado; descartar tira só o que venceu."
            : "Cada bag vence 1 ano depois da coleta; descartar tira só o que venceu."}
      </p>
      {erro && <p className="mensagem-erro">{erro}</p>}
      {!itens && !erro && <p className="carregando">Carregando...</p>}
      {itens && itens.length === 0 && <p className="texto-secundario">Caixa vazia.</p>}
      {itens && itens.length > 0 && (
        <div className="tabela-rolavel">
          <table className="tabela-arquivo">
            <thead>
              <tr>
                <th>O quê</th>
                <th>Load / lotes</th>
                <th>Qtd.</th>
                <th>{caixa.tipo === "recebimento" ? "Arquivado" : "Coleta / embarque"}</th>
                <th>Descarte</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, n) => (
                <tr key={n} className={i.situacao === "Vencido" ? "linha-vencida" : i.situacao === "Descartado" ? "linha-descartada" : undefined}>
                  <td>{i.descricao}</td>
                  <td>{[i.load, i.lotes && `lotes ${i.lotes}`].filter(Boolean).join(" · ") || "-"}</td>
                  <td>{i.quantidade ?? "-"}</td>
                  <td>{dataBr(i.data_ref)}</td>
                  <td>{dataBr(i.data_descarte)}</td>
                  <td>{i.situacao === "Descartado" && i.descartado_em ? `Descartado em ${i.descartado_em}` : i.situacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="botoes-lado acoes-caixa">
        {pode && caixa.situacao === "Vencida" && !g.previa && (
          <button type="button" className="botao botao-principal" disabled={g.enviando} onClick={() => void g.ver({ tipo: caixa.tipo, numero: caixa.numero })}>
            Descartar o que venceu
          </button>
        )}
        <button type="button" className="botao-secundario" onClick={() => setHistorico((h) => !h)} aria-pressed={historico}>
          {historico ? "Esconder descartados" : "Ver descartados"}
        </button>
        <button type="button" className="botao-secundario" onClick={() => window.print()}>
          <IconeAcao nome="imprimir" /> Imprimir
        </button>
        <button type="button" className="botao botao-simples" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      <PreviaDaGravacao g={g} titulo="Descartar" />
    </article>
  );
}

interface Achado {
  tipo: Tipo;
  caixa: number;
  load: string;
  lotes: string | null;
  data_ref: string | null;
  data_descarte: string | null;
  situacao: string;
}

/** Em qual caixa está um load (26/10): digita o número e vê a caixa, os lotes e quando vence. */
function BuscaDeLoad() {
  const [load, setLoad] = useState("");
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [erro, setErro] = useState("");

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    if (!load.trim()) return;
    try {
      setAchados(await lerJson<Achado[]>(`/arquivo/busca?load=${encodeURIComponent(load.trim())}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível procurar.");
    }
  }

  return (
    <form className="cartao busca-arquivo" onSubmit={buscar} role="search" aria-label="Procurar load no arquivo">
      <div className="campos-linha">
        <label className="campo">
          Em qual caixa está o load?
          <input inputMode="numeric" maxLength={20} placeholder="Número do load" value={load} onChange={(e) => setLoad(e.target.value)} />
        </label>
        <button type="submit" className="botao botao-principal">
          Procurar
        </button>
      </div>
      {erro && <p className="mensagem-erro">{erro}</p>}
      {achados && achados.length === 0 && <p className="texto-secundario">Nenhuma caixa com o load {load.trim()} (ou já foi descartado).</p>}
      {achados && achados.length > 0 && (
        <ul className="lista-simples" aria-label="Caixas do load">
          {achados.map((a, i) => (
            <li key={i}>
              <strong>Caixa {a.caixa}</strong> ({NOME_DO_TIPO[a.tipo]}) · load {a.load}
              {a.lotes ? ` · lotes ${a.lotes}` : ""} · arquivado {dataBr(a.data_ref)} · vence {dataBr(a.data_descarte)}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function ArquivarRecebimento({ sugerida, aoGravar }: { sugerida: number | null; aoGravar: () => void }) {
  const [campos, setCampos] = useState({ load: "", lotes: "", caixa: sugerida ? String(sugerida) : "", data: hojeEmSaoPaulo() });
  const g = useGravacao("/arquivo/arquivar", () => {
    setCampos((c) => ({ ...c, load: "", lotes: "" }));
    aoGravar();
  });
  const muda = (k: keyof typeof campos) => (e: { target: { value: string } }) => setCampos((c) => ({ ...c, [k]: e.target.value }));

  function ver(evento: FormEvent) {
    evento.preventDefault();
    void g.ver({ ...campos, caixa: Number(campos.caixa) });
  }

  return (
    <form className="cartao arquivar-recebimento" onSubmit={ver} aria-label="Arquivar recebimento">
      <h2>Arquivar recebimento</h2>
      <p className="texto-secundario">
        Load e lotes na caixa (a sugerida é a {sugerida ?? "-"}). A caixa fica para descarte quando todos os loads dela vencem (7 dias depois de arquivados).
      </p>
      <div className="campos-linha">
        <label className="campo">
          Load
          <input inputMode="numeric" required maxLength={20} value={campos.load} onChange={muda("load")} />
        </label>
        <label className="campo">
          Lotes
          <input required maxLength={200} placeholder="1-12, 14" value={campos.lotes} onChange={muda("lotes")} />
        </label>
        <label className="campo campo-hora">
          Caixa
          <input inputMode="numeric" required value={campos.caixa} onChange={muda("caixa")} />
        </label>
        <label className="campo campo-hora">
          Data
          <input type="date" required value={campos.data} onChange={muda("data")} />
        </label>
      </div>
      {!g.previa && (
        <button type="submit" className="botao botao-principal" disabled={g.enviando}>
          Ver o que vai ser arquivado
        </button>
      )}
      <PreviaDaGravacao g={g} titulo="Arquivar" />
    </form>
  );
}
