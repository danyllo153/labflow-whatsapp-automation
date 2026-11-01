import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AbasDaPagina, CabecalhoDaPagina } from "../componentes/CabecalhoDaPagina";
import { enviarJson, lerJson } from "../api";
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
  ultima_amostra?: string | null; // caixa de navio (PB24): a última amostra do navio
  inicio_em?: string | null; // a data inicial: escolhida à mão ou a última amostra + 5 dias
  inicio_fixado?: boolean;
  da_planilha?: boolean; // veio da planilha (carga inicial): "Adicionar laudo" digita o que tem nela (01/11)
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
  ref_id?: number | null; // a linha digitada da caixa da planilha (item "planilha")
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
  const [familia, setFamilia] = useState(""); // na aba Navios, uma família de navio (01/11), como as fábricas

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
  const daAba = (aba === "vencidas" ? vencidas : (dados?.caixas.filter((c) => c.tipo === aba) ?? [])).filter(
    (c) => aba !== "navio" || !familia || c.familia === familia,
  );
  const familias = [...new Set((dados?.caixas ?? []).filter((c) => c.tipo === "navio" && c.familia).map((c) => c.familia as string))];
  // a busca (load ou navio) abre a caixa achada na aba dela
  const abrir = (tipo: Tipo, numero: number) => {
    const c = dados?.caixas.find((x) => x.tipo === tipo && x.numero === numero);
    if (!c) return;
    setAba(tipo);
    setFamilia("");
    setEscolhida(c);
  };
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
          <BuscaDeLoad aoAbrir={abrir} />
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
          {aba === "navio" && familias.length > 1 && (
            <div className="seletor-de-tabela pilulas-fabrica" role="group" aria-label="Família do navio">
              {["", ...familias].map((f) => (
                <button key={f || "todas"} type="button" aria-pressed={familia === f} onClick={() => setFamilia(f)}>
                  {f || "Todas"}
                </button>
              ))}
            </div>
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

  // o laudo de contra-amostra da caixa (navio e recebimento; o tanque não tem)
  const [folhas, setFolhas] = useState<FolhaDoLaudo[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setFolhas(null);
    if (caixa.tipo !== "tanque")
      lerJson<FolhaDoLaudo[]>(`/arquivo/${caixa.tipo}/${caixa.numero}/laudo`).then(
        (r) => vivo && setFolhas(r),
        () => vivo && setFolhas([]),
      );
    return () => {
      vivo = false;
    };
  }, [caixa]);

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
          ? `A caixa sai inteira quando tudo vence${caixa.descarte_em ? `: ${dataBr(caixa.descarte_em)}` : ""}. NFC vence 1 ano e FCOJ 2 anos depois da data inicial.`
          : caixa.tipo === "recebimento"
            ? "Cada load vence 7 dias depois de arquivado; descartar tira só o que venceu."
            : "Cada bag vence 1 ano depois da coleta; descartar tira só o que venceu."}
      </p>
      {caixa.tipo === "navio" && caixa.navio && <DataInicialDoNavio caixa={caixa} pode={pode} aoMudar={aoMudar} />}
      {caixa.tipo === "navio" && caixa.da_planilha && pode && <LaudoDaPlanilha caixa={caixa} aoMudar={aoMudar} />}
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
                {pode && itens.some((i) => i.item === "planilha") && <th aria-label="Ações" />}
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
                  {pode && itens.some((x) => x.item === "planilha") && (
                    <td>{i.item === "planilha" && i.ref_id != null && <TirarDaPlanilha id={i.ref_id} descricao={i.descricao} aoMudar={aoMudar} />}</td>
                  )}
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
        {/* 01/11: no lugar do Imprimir (que imprimia a tela), o laudo de contra-amostra onde a caixa está */}
        {folhas?.map((f, i) => (
          <a key={f.pagina_id} className="botao-secundario" href={`/laudos/${f.laudo}/${f.pagina_id}/pdf`} target="_blank" rel="noreferrer">
            <IconeAcao nome="pdf" /> {folhas.length > 1 ? `Laudo (folha ${i + 1})` : "Laudo"}
            {!f.finalizada && " · em preenchimento"}
          </a>
        ))}
        <button type="button" className="botao botao-simples" onClick={aoFechar}>
          Fechar
        </button>
      </div>
      <PreviaDaGravacao g={g} titulo="Descartar" />
    </article>
  );
}

/** A data inicial da caixa de navio (PB24, 01/11): a última amostra do navio + 5 dias, ou a escolhida à mão; dela contam o
 * 1 ano do pote e os 2 anos do FCOJ. Escolher ou voltar à automática mostra a prévia com o descarte e pede Confirmar. */
function DataInicialDoNavio({ caixa, pode, aoMudar }: { caixa: Caixa; pode: boolean; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState(caixa.inicio_em ?? "");
  const g = useGravacao("/arquivo/data-inicial", () => {
    setEditando(false);
    aoMudar();
  });
  const origem = caixa.inicio_fixado
    ? "escolhida à mão"
    : caixa.ultima_amostra
      ? `última amostra em ${dataBr(caixa.ultima_amostra)} + 5 dias`
      : "";
  return (
    <div className="data-inicial-navio">
      <p>
        <strong>Data inicial:</strong> {caixa.inicio_em ? dataBr(caixa.inicio_em) : "sem amostra registrada"}
        {origem && <span className="texto-secundario"> ({origem})</span>}
      </p>
      {pode && !editando && !g.previa && (
        <div className="botoes-lado">
          <button type="button" className="botao-secundario" onClick={() => setEditando(true)}>
            Data inicial
          </button>
          {caixa.inicio_fixado && (
            <button type="button" className="botao-secundario" disabled={g.enviando} onClick={() => void g.ver({ numero: caixa.numero, data: null })}>
              Voltar à automática
            </button>
          )}
        </div>
      )}
      {pode && editando && !g.previa && (
        <form
          className="linha-formulario"
          aria-label="Escolher a data inicial"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (data) void g.ver({ numero: caixa.numero, data });
          }}
        >
          <label className="campo">
            Data inicial
            <input type="date" value={data} required onChange={(e) => setData(e.target.value)} />
          </label>
          <button type="submit" className="botao botao-principal" disabled={g.enviando || !data}>
            Ver o descarte
          </button>
          <button type="button" className="botao botao-simples" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </form>
      )}
      <PreviaDaGravacao g={g} titulo="Data inicial" />
    </div>
  );
}

interface LinhaDaPlanilha {
  tipo: "fcoj" | "pote";
  loads: string;
  tanque: string;
  quantidade: string;
}

const LINHA_VAZIA: LinhaDaPlanilha = { tipo: "fcoj", loads: "", tanque: "", quantidade: "1" };

/** A caixa de navio que veio da planilha (01/11): só tinha a "carga inicial". "Adicionar laudo" digita o que tem nela (o
 * laudo de papel que já existe): FCOJ com os loads e as amostras, ou o pote de NFC com o tanque. Sai no laudo de
 * contra-amostra do embarque; o vencimento continua o da planilha. Prévia e um Confirmar para a lista toda. */
function LaudoDaPlanilha({ caixa, aoMudar }: { caixa: Caixa; aoMudar: () => void }) {
  const [abrindo, setAbrindo] = useState(false);
  const [linhas, setLinhas] = useState<LinhaDaPlanilha[]>([{ ...LINHA_VAZIA }]);
  const g = useGravacao(`/arquivo/navio/${caixa.numero}/planilha`, () => {
    setAbrindo(false);
    setLinhas([{ ...LINHA_VAZIA }]);
    aoMudar();
  });
  const muda = (n: number, k: keyof LinhaDaPlanilha) => (e: { target: { value: string } }) =>
    setLinhas((ls) => ls.map((l, i) => (i === n ? { ...l, [k]: e.target.value } : l)));

  if (!abrindo && !g.previa)
    return (
      <div className="botoes-lado">
        <button type="button" className="botao-secundario" onClick={() => setAbrindo(true)}>
          Adicionar laudo
        </button>
      </div>
    );
  return (
    <div className="laudo-da-planilha">
      {!g.previa && (
        <form
          aria-label="Adicionar o laudo da caixa"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void g.ver({
              linhas: linhas.map((l) => ({ tipo: l.tipo, loads: l.loads, tanque: l.tanque, quantidade: Number(l.quantidade) || 1 })),
            });
          }}
        >
          <p className="texto-secundario">
            O que tem na caixa {caixa.numero}, como no laudo de papel. Sai no laudo de contra-amostra; o vencimento continua o da planilha
            {caixa.descarte_em ? ` (${dataBr(caixa.descarte_em)})` : ""}.
          </p>
          {linhas.map((l, n) => (
            <div key={n} className="campos-linha">
              <label className="campo">
                Amostra
                <select value={l.tipo} onChange={muda(n, "tipo")} aria-label={`Amostra da linha ${n + 1}`}>
                  <option value="fcoj">FCOJ (loads)</option>
                  <option value="pote">Pote de NFC (tanque)</option>
                </select>
              </label>
              {l.tipo === "fcoj" ? (
                <>
                  <label className="campo">
                    Loads
                    <input required maxLength={200} placeholder="43783/43784" value={l.loads} onChange={muda(n, "loads")} aria-label={`Loads da linha ${n + 1}`} />
                  </label>
                  <label className="campo campo-hora">
                    Qtd.
                    <input inputMode="numeric" required value={l.quantidade} onChange={muda(n, "quantidade")} aria-label={`Quantidade da linha ${n + 1}`} />
                  </label>
                </>
              ) : (
                <label className="campo campo-hora">
                  Tanque
                  <input required maxLength={4} placeholder="2P" value={l.tanque} onChange={muda(n, "tanque")} aria-label={`Tanque da linha ${n + 1}`} />
                </label>
              )}
              {linhas.length > 1 && (
                <button type="button" className="botao botao-simples" onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== n))} aria-label={`Tirar a linha ${n + 1}`}>
                  Tirar
                </button>
              )}
            </div>
          ))}
          <div className="botoes-lado">
            <button type="button" className="botao-secundario" disabled={linhas.length >= 28} onClick={() => setLinhas((ls) => [...ls, { ...LINHA_VAZIA, tipo: ls[ls.length - 1].tipo }])}>
              + Linha
            </button>
            <button type="submit" className="botao botao-principal" disabled={g.enviando}>
              Ver o laudo
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setAbrindo(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <PreviaDaGravacao g={g} titulo="Adicionar laudo" />
    </div>
  );
}

/** Tira do laudo uma linha digitada da planilha (fica no banco, com quem e quando); pede confirmação. */
function TirarDaPlanilha({ id, descricao, aoMudar }: { id: number; descricao: string; aoMudar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  async function tirar() {
    try {
      await enviarJson(`/arquivo/planilha/${id}/apagar`);
      setConfirmando(false);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível tirar a linha.");
    }
  }
  return (
    <>
      {confirmando ? (
        <button type="button" className="botao botao-perigo" onClick={() => void tirar()} aria-label={`Confirmar: tirar ${descricao} do laudo`}>
          Confirmar
        </button>
      ) : (
        <button type="button" className="botao botao-simples" onClick={() => setConfirmando(true)} aria-label={`Tirar ${descricao} do laudo`}>
          Tirar
        </button>
      )}
      {erro && <span className="mensagem-erro">{erro}</span>}
    </>
  );
}

interface FolhaDoLaudo {
  laudo: string;
  pagina_id: number;
  finalizada: boolean;
}

interface Achado {
  tipo: Tipo;
  caixa: number;
  load: string;
  navio?: string | null;
  lotes: string | null;
  data_ref: string | null;
  data_descarte: string | null;
  situacao: string;
}

/** Em qual caixa está um load (26/10) ou um navio (01/11, "O.WAVE 223"): a caixa, os lotes e quando vence; tocar abre a caixa. */
function BuscaDeLoad({ aoAbrir }: { aoAbrir: (tipo: Tipo, numero: number) => void }) {
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
          Em qual caixa está o load ou o navio?
          <input maxLength={40} placeholder="Load ou navio (ex.: 43413 ou O.WAVE 223)" value={load} onChange={(e) => setLoad(e.target.value)} />
        </label>
        <button type="submit" className="botao botao-principal">
          Procurar
        </button>
      </div>
      {erro && <p className="mensagem-erro">{erro}</p>}
      {achados && achados.length === 0 && <p className="texto-secundario">Nenhuma caixa com {load.trim()} (ou já foi descartado).</p>}
      {achados && achados.length > 0 && (
        <ul className="lista-simples" aria-label="Caixas do load">
          {achados.map((a, i) => (
            <li key={i} className="linha-turno">
              <span>
                <strong>Caixa {a.caixa}</strong> ({NOME_DO_TIPO[a.tipo]}) · {a.navio ?? `load ${a.load}`}
                {a.lotes ? ` · lotes ${a.lotes}` : ""}
                {a.data_ref ? ` · arquivado ${dataBr(a.data_ref)}` : ""} · vence {dataBr(a.data_descarte)}
              </span>
              <button type="button" className="botao-secundario" onClick={() => aoAbrir(a.tipo, a.caixa)} aria-label={`Abrir a caixa ${a.caixa}`}>
                Abrir a caixa
              </button>
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
