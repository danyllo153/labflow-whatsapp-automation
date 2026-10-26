import { useEffect, useMemo, useState } from "react";

import { useSessao } from "../../sessao";
import { classeDaSituacao } from "../dados/formatos";
import {
  AppDeAnalise,
  Busca,
  dm,
  hojeEmSaoPaulo,
  Numeros,
  PerguntaDaAcao,
  PreviaDaGravacao,
  Resultados,
  SoQuemGrava,
  useAcao,
  useGravacao,
  useLista,
  useMarcados,
} from "./comum";
import { ABAS_FINAIS } from "./Instrucao";
import { ABA_LAUDO, AbaLaudo } from "./LaudoDoApp";

/**
 * TAB, Coliformes e Howard (Fase E, E4; funções da 043), desde 25/10 (APP-066) em três apps, um para cada (pedido do
 * Danyllo): /analises/tab, /analises/coliformes e /analises/howard. Cada etapa é em lote, como o "sim" do bot: a lista
 * vem toda marcada, o analista tira o que não fez e confirma (decisão de 24/10); os botões ficam presos embaixo da tela,
 * sem rolar a lista inteira. TAB e Coliformes são masculinos nos textos.
 */

interface Teste {
  teste_id: number;
  teste: string; // "Tab" | "Coliformes"
  alvo: string;
  status: string;
  proxima: string;
  prevista: string | null;
  situacao: string;
  lote_aberto: boolean;
}

interface Composta {
  composta_id: number;
  alvo: string;
  criada_em: string;
}

export type QualTeste = "TAB" | "COLIFORMES" | "HOWARD";

export const ABAS_TESTES = [
  { aba: "para-fazer", rotulo: "Para fazer" },
  { aba: "caldo", rotulo: "Caldo" },
  { aba: "resultados", rotulo: "Resultados" },
  ABA_LAUDO,
  ...ABAS_FINAIS,
];

export const ABAS_HOWARD = [
  { aba: "howard", rotulo: "Lançar" },
  { aba: "resultados", rotulo: "Resultados" },
  ABA_LAUDO,
  ...ABAS_FINAIS,
];

const APP_DO_TESTE: Record<QualTeste, { titulo: string; descricao: string; icone: string; cor: string; pagina: { caminho: string; titulo: string; descricao: string } }> = {
  TAB: {
    titulo: "TAB",
    descricao: "Compostas no caldo, espalhar, ler e confirmar no PCA, tudo em lote.",
    icone: "tab",
    cor: "tab",
    pagina: { caminho: "/paginas/tab", titulo: "TAB", descricao: "do recebimento, do embarque e dos tanques" },
  },
  COLIFORMES: {
    titulo: "Coliformes",
    descricao: "Compostas no caldo, estriar, ler e o resultado de cada lote, tudo em lote.",
    icone: "coliformes",
    cor: "coli",
    pagina: { caminho: "/paginas/coliformes", titulo: "Coliformes", descricao: "com os lotes abertos" },
  },
  HOWARD: {
    titulo: "Howard",
    descricao: "Campos positivos das compostas do embarque de FCOJ (cada campo vale 2%).",
    icone: "howard",
    cor: "howard",
    pagina: { caminho: "/paginas/howard", titulo: "Howard", descricao: "das compostas do embarque" },
  },
};

type Botao = { rotulo: string; acao: string; resultado?: "Positivo" | "Negativo"; principal?: boolean };

/** O que se faz com cada grupo (a mesma regra da teste_acao). */
function botoesDo(tipo: "TAB" | "COLIFORMES", proxima: string): Botao[] {
  if (tipo === "TAB") {
    if (proxima === "espalhar") return [{ rotulo: "Espalhei", acao: "espalhar", principal: true }];
    if (proxima === "ler") return [{ rotulo: "Todos negativos", acao: "negativos", principal: true }, { rotulo: "Positivo: confirmar no PCA", acao: "confirmar" }];
    if (proxima === "confirmar")
      return [{ rotulo: "Negativo", acao: "resultado", resultado: "Negativo", principal: true }, { rotulo: "Positivo", acao: "resultado", resultado: "Positivo" }];
  } else {
    if (proxima === "espalhar") return [{ rotulo: "Estriei", acao: "espalhar", principal: true }, { rotulo: "Abrir por lote", acao: "abrir" }];
    if (proxima === "ler") return [{ rotulo: "Todos negativos", acao: "negativos", principal: true }, { rotulo: "Positivo: abrir por lote", acao: "abrir" }];
    if (proxima === "resultado do lote")
      return [{ rotulo: "Negativo", acao: "resultado", resultado: "Negativo", principal: true }, { rotulo: "Positivo", acao: "resultado", resultado: "Positivo" }];
  }
  return [];
}

const NOME_DA_ETAPA: Record<string, string> = {
  espalhar: "para espalhar",
  ler: "para ler",
  confirmar: "em confirmação (ler o PCA)",
  "resultado do lote": "aberto por lote (resultado de cada lote)",
};

export default function Testes({ qual }: { qual: QualTeste }) {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [busca, setBusca] = useState("");
  const howard = qual === "HOWARD";
  const lista = useLista<Teste[]>("/analises/testes/pendentes", busca);
  const doTeste = (lista.dados ?? []).filter((t) => (qual === "TAB" ? t.teste === "Tab" : t.teste !== "Tab"));
  const atrasados = doTeste.filter((t) => t.situacao === "Atrasado").length;
  const app = APP_DO_TESTE[qual];

  return (
    <AppDeAnalise
      app="testes"
      icone={app.icone}
      sigla={app.titulo.slice(0, 3)}
      cor={app.cor}
      titulo={app.titulo}
      descricao={app.descricao}
      abas={howard ? ABAS_HOWARD : ABAS_TESTES.map((a) => (a.aba === "para-fazer" ? { ...a, contador: atrasados } : a))}
    >
      {(aba) => (
        <>
          {aba === "para-fazer" && !howard && (
            <>
              <Numeros
                itens={[
                  { rotulo: "Atrasados", valor: atrasados, tom: "atrasado" },
                  { rotulo: "Em andamento", valor: doTeste.length - atrasados, tom: "hoje" },
                ]}
              />
              <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar load, tanque ou composta" dica="Load, tanque ou nº da composta" />
              {lista.erro && <p className="mensagem-erro">{lista.erro}</p>}
              {!lista.dados && !lista.erro && <p className="carregando">Carregando...</p>}
              {lista.dados && doTeste.length === 0 && <p className="texto-secundario">Nenhum {app.titulo} em andamento.</p>}
              {lista.dados && <Grupos testes={doTeste} pode={pode} aoGravar={lista.recarregar} />}
            </>
          )}
          {aba === "caldo" && !howard && (
            <SoQuemGrava pode={pode}>
              <Caldo tipo={qual as "TAB" | "COLIFORMES"} aoGravar={lista.recarregar} />
            </SoQuemGrava>
          )}
          {aba === "howard" && howard && (
            <SoQuemGrava pode={pode}>
              <Howard />
            </SoQuemGrava>
          )}
          {aba === "resultados" && <Resultados paginas={[app.pagina]} />}
          {aba === "laudo" && <AbaLaudo laudo={howard ? "howard" : qual === "TAB" ? "tab" : "coliformes"} />}
        </>
      )}
    </AppDeAnalise>
  );
}

function Grupos({ testes, pode, aoGravar }: { testes: Teste[]; pode: boolean; aoGravar: () => void }) {
  const grupos = useMemo(() => {
    const g = new Map<string, Teste[]>();
    for (const t of testes) {
      const k = `${t.teste}|${t.proxima}`;
      g.set(k, [...(g.get(k) ?? []), t]);
    }
    return [...g.entries()];
  }, [testes]);
  return (
    <>
      {grupos.map(([k, itens]) => (
        <Grupo key={k} itens={itens} pode={pode} aoGravar={aoGravar} />
      ))}
    </>
  );
}

function Grupo({ itens, pode, aoGravar }: { itens: Teste[]; pode: boolean; aoGravar: () => void }) {
  const tipo = itens[0].teste === "Tab" ? "TAB" : "COLIFORMES";
  const nome = tipo === "TAB" ? "TAB" : "Coliformes";
  const m = useMarcados<number>();
  const acao = useAcao(() => aoGravar());
  const ids = itens.map((t) => t.teste_id);
  // a lista vem toda marcada (decisão de 24/10); o analista desmarca o que não fez
  useEffect(() => m.todos(ids.filter((i) => !m.tem(i))), [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const marcados = itens.filter((t) => m.tem(t.teste_id));
  const botoes = botoesDo(tipo, itens[0].proxima);

  function perguntar(b: Botao) {
    acao.perguntar(
      "/analises/testes/acao",
      `${nome} · ${b.rotulo} (${marcados.length}):\n` + marcados.map((t) => t.alvo).join("\n"),
      { acao: b.acao, tipo, ids: marcados.map((t) => t.teste_id), resultado: b.resultado ?? null },
    );
  }

  return (
    <section className="cartao" aria-label={`${nome} ${NOME_DA_ETAPA[itens[0].proxima] ?? itens[0].proxima}`}>
      <h2>
        {nome} {NOME_DA_ETAPA[itens[0].proxima] ?? itens[0].proxima} <span className="contador">{itens.length}</span>
      </h2>
      <ul className="lista-marcavel">
        {itens.map((t) => (
          <li key={t.teste_id}>
            <label>
              {pode && <input type="checkbox" checked={m.tem(t.teste_id)} onChange={() => m.alternar(t.teste_id)} />}
              <span>{t.alvo}</span>
              <span className="texto-secundario">{t.prevista ? ` · ${dm(t.prevista)}` : ""}</span>{" "}
              <span className={classeDaSituacao(t.situacao)}>{t.situacao}</span>
            </label>
          </li>
        ))}
      </ul>
      {pode && (
        <div className="botoes-lado barra-acoes-fixa">
          {botoes.map((b) => (
            <button
              key={b.rotulo}
              type="button"
              className={b.principal ? "botao botao-principal" : "botao botao-simples"}
              disabled={marcados.length === 0}
              onClick={() => perguntar(b)}
            >
              {b.rotulo} ({marcados.length})
            </button>
          ))}
        </div>
      )}
      <PerguntaDaAcao a={acao} />
    </section>
  );
}

function Caldo({ tipo, aoGravar }: { tipo: "TAB" | "COLIFORMES"; aoGravar: () => void }) {
  const [data, setData] = useState(hojeEmSaoPaulo());
  const lista = useLista<Composta[]>(`/analises/testes/compostas?tipo=${tipo}`);
  const m = useMarcados<number>();
  const g = useGravacao("/analises/testes/feito", () => (m.limpar(), lista.recarregar(), aoGravar()));
  const marcadas = (lista.dados ?? []).filter((c) => m.tem(c.composta_id));
  return (
    <div className="cartao">
      <h2>Compostas no caldo</h2>
      <p className="texto-secundario">
        Marque as compostas que entraram no caldo.{" "}
        {tipo === "TAB" ? "O TAB é espalhado em 5 dias." : "Os Coliformes são estriados no dia seguinte."}
      </p>
      <div className="linha-formulario">
        <label className="campo">
          Data
          <input type="date" max={hojeEmSaoPaulo()} value={data} onChange={(e) => (setData(e.target.value), g.voltar())} />
        </label>
      </div>
      {lista.dados && lista.dados.length === 0 && <p className="texto-secundario">Todas as compostas dos últimos 60 dias já têm esse teste.</p>}
      {lista.dados && lista.dados.length > 0 && (
        <ul className="lista-marcavel">
          <li>
            <label>
              <input type="checkbox" onChange={() => m.todos(lista.dados!.map((c) => c.composta_id))} /> <strong>Todas</strong>
            </label>
          </li>
          {lista.dados.map((c) => (
            <li key={c.composta_id}>
              <label>
                <input type="checkbox" checked={m.tem(c.composta_id)} onChange={() => (m.alternar(c.composta_id), g.voltar())} /> {c.alvo}
                <span className="texto-secundario"> · criada {dm(c.criada_em)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {!g.previa && (
        <button
          type="button"
          className="botao botao-principal"
          disabled={marcadas.length === 0 || g.enviando}
          onClick={() => void g.ver({ tipo, composta_ids: marcadas.map((c) => c.composta_id), data })}
        >
          Ver o que vai ser criado ({marcadas.length})
        </button>
      )}
      <PreviaDaGravacao g={g} />
    </div>
  );
}

function Howard() {
  const lista = useLista<Composta[]>("/analises/testes/compostas?tipo=HOWARD");
  const [composta, setComposta] = useState<number | null>(null);
  const [campos, setCampos] = useState("");
  const acao = useAcao(() => (setComposta(null), setCampos(""), lista.recarregar()));
  const n = Number(campos);
  const valido = campos.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 50;
  const escolhida = lista.dados?.find((c) => c.composta_id === composta);
  return (
    <div className="cartao">
      <h2>Howard</h2>
      <p className="texto-secundario">Compostas do embarque sem Howard. Diga quantos campos deram positivo dos 50 (cada um vale 2%).</p>
      {lista.dados && lista.dados.length === 0 && <p className="texto-secundario">Nenhuma composta do embarque esperando o Howard.</p>}
      {lista.dados && lista.dados.length > 0 && (
        <div className="linha-formulario">
          <label className="campo">
            Composta
            <select value={composta ?? ""} onChange={(e) => setComposta(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Escolha</option>
              {lista.dados.map((c) => (
                <option key={c.composta_id} value={c.composta_id}>
                  {c.alvo}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            Campos positivos (de 50)
            <input inputMode="numeric" maxLength={2} value={campos} onChange={(e) => setCampos(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
      )}
      <button
        type="button"
        className="botao botao-principal"
        disabled={!escolhida || !valido}
        onClick={() =>
          acao.perguntar("/analises/testes/howard", `Howard de ${escolhida?.alvo}: ${n} campos positivos de 50 = ${n * 2}%.`, {
            composta_id: composta,
            percentual: n * 2,
          })
        }
      >
        Gravar o Howard
      </button>
      <PerguntaDaAcao a={acao} titulo="O que vai ser gravado" />
    </div>
  );
}
