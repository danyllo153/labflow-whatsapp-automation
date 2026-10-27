import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { useSessao } from "../../sessao";
import { classeDaSituacao } from "../dados/formatos";
import {
  AppDeAnalise,
  Busca,
  dm,
  hojeEmSaoPaulo,
  Numeros,
  PreviaDaGravacao,
  Resultados,
  SoQuemGrava,
  useGravacao,
  useLista,
  useMarcados,
} from "./comum";
import { ABAS_FINAIS } from "./Instrucao";
import { ABA_LAUDO, AbaLaudo } from "./LaudoDoApp";

/** Tanques de terra e de navio (Fase E, E3; funções da 042): leituras do dia, coleta e análise, como o bot. */

interface Leitura {
  analise_id: number;
  etapa: "pre" | "final";
  origem: string;
  tanque: string;
  navio: string | null;
  frasco: string;
  analise: string;
  prevista: string;
  situacao: string;
}

export const ABAS_TANQUES = [
  { aba: "leituras", rotulo: "Leituras" },
  { aba: "coleta", rotulo: "Coleta" },
  { aba: "analise", rotulo: "Análise" },
  { aba: "resultados", rotulo: "Resultados" },
  ABA_LAUDO,
  ...ABAS_FINAIS,
];


/** As leituras dos tanques (pré-leitura e leitura final): aqui e na aba Leituras (27/10), de terra, de navio ou de um navio. */
export function LeituraDosTanques({ origem, navio, buscaInicial = "" }: { origem?: "terra" | "navio"; navio?: string; buscaInicial?: string }) {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [busca, setBusca] = useState(buscaInicial || navio || "");
  const lista = useLista<Leitura[]>("/analises/tanques/leituras", busca);
  const dados = lista.dados?.filter((l) => !origem || (origem === "navio" ? !!l.navio : !l.navio)) ?? null;
  const atrasadas = (dados ?? []).filter((l) => l.situacao === "Atrasado").length;
  return (
    <>
      <Numeros
        itens={[
          { rotulo: "Atrasadas", valor: atrasadas, tom: "atrasado" },
          { rotulo: "Vencem hoje", valor: (dados ?? []).length - atrasadas, tom: "hoje" },
        ]}
      />
      <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar tanque ou navio" dica="Tanque ou navio (ex.: 44, O.SKY)" />
      <Leituras leituras={dados} erro={lista.erro} pode={pode} aoGravar={lista.recarregar} />
    </>
  );
}

export default function Tanques() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const podeColetar = !!pessoa?.pode.includes("registrar_coleta");
  const lista = useLista<Leitura[]>("/analises/tanques/leituras", "");
  const atrasadas = (lista.dados ?? []).filter((l) => l.situacao === "Atrasado").length;

  return (
    <AppDeAnalise
      app="tanques"
      sigla="TQ"
      cor="verde"
      titulo="Análise de tanques"
      descricao="Tanques de terra e de navio (pesquise pelo navio): coleta, análise normal e stress, pré-leitura e leitura final."
      abas={ABAS_TANQUES.map((a) => (a.aba === "leituras" ? { ...a, contador: atrasadas } : a))}
    >
      {(aba) => (
        <>
          {aba === "leituras" && <LeituraDosTanques />}
          {aba === "coleta" && (
            <SoQuemGrava pode={podeColetar}>
              <Coleta aoGravar={lista.recarregar} coletor={pessoa?.cargo === "Coletor"} />
            </SoQuemGrava>
          )}
          {aba === "analise" && (
            <SoQuemGrava pode={pode}>
              <Analise aoGravar={lista.recarregar} />
            </SoQuemGrava>
          )}
          {aba === "laudo" && <AbaLaudo laudo="nfc-tanques" />}
          {aba === "resultados" && (
            <Resultados
              paginas={[
                { caminho: "/paginas/tanques-terra", titulo: "Tanques terra", descricao: "um tanque por linha, com as análises" },
                { caminho: "/paginas/navios", titulo: "Navios", descricao: "cada navio com os tanques e o FCOJ" },
                { caminho: "/paginas/tanques", titulo: "Leituras de tanques", descricao: "todas as leituras, com as placas" },
              ]}
            />
          )}
        </>
      )}
    </AppDeAnalise>
  );
}

/** Uma linha da tela: as análises do mesmo tanque, frasco, análise e etapa que vencem no mesmo dia. O Wort (Psicrotróficos)
 * tem duas análises por frasco (profundidade e superfície) e aparece numa linha só (pedido de 25/10). */
interface Linha {
  chave: string;
  tanque: string;
  navio: string | null;
  frasco: string;
  rotulo: string; // "Wort 240h", "C.T 48h"...
  etapa: "pre" | "final";
  prevista: string;
  situacao: string;
  itens: Leitura[];
}

const ROTULO_DA_ANALISE = (analise: string) => (/psicrotr|wort/i.test(analise) ? `Wort ${analise.match(/\d+\s*h/i)?.[0] ?? "240h"}` : analise);

export function linhasDeLeitura(leituras: Leitura[]): Linha[] {
  const grupos = new Map<string, Linha>();
  for (const l of leituras) {
    const rotulo = ROTULO_DA_ANALISE(l.analise);
    const k = [l.navio ?? "", l.tanque, l.frasco, rotulo, l.etapa, l.prevista].join("|");
    const g = grupos.get(k) ?? { chave: k, tanque: l.tanque, navio: l.navio, frasco: l.frasco, rotulo, etapa: l.etapa, prevista: l.prevista, situacao: l.situacao, itens: [] };
    g.itens.push(l);
    if (l.situacao === "Atrasado") g.situacao = "Atrasado";
    grupos.set(k, g);
  }
  return [...grupos.values()];
}

const MENOR_QUE_1 = "<1, <1, <1";

function Leituras({ leituras, erro, pode, aoGravar }: { leituras: Leitura[] | null; erro: string; pode: boolean; aoGravar: () => void }) {
  const m = useMarcados<string>();
  const [placas, setPlacas] = useState<Record<string, string>>({});
  const gravacao = useGravacao("/analises/tanques/placas", () => (setPlacas({}), aoGravar()));
  const linhas = linhasDeLeitura(leituras ?? []);
  const chaves = linhas.map((l) => l.chave);
  // a lista vem toda marcada (decisão de 24/10), como no "Lançar leituras" do Início; o analista desmarca o que não fez
  useEffect(() => m.todos(chaves.filter((k) => !m.tem(k))), [chaves.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!leituras) return <p className="carregando">Carregando...</p>;
  if (leituras.length === 0) return <p className="texto-secundario">Nenhuma leitura atrasada nem para hoje.</p>;

  const marcadas = linhas.filter((l) => m.tem(l.chave));
  // por navio (ou terra) e dia previsto, como o relatório do bot: o atrasado já aparece no título do grupo
  const grupos = [...linhas.reduce((g, l) => {
    const k = `${l.navio ?? "Terra"} · ${dm(l.prevista)}${l.situacao === "Atrasado" ? " · atrasado" : ""}`;
    return g.set(k, [...(g.get(k) ?? []), l]);
  }, new Map<string, Linha[]>())];
  const comPlacas = linhas.filter((l) => (placas[l.chave] ?? "").trim());
  const itensDe = (lista: Linha[], valor: (l: Linha) => string) =>
    lista.flatMap((l) => l.itens.map((i) => ({ analise_id: i.analise_id, etapa: i.etapa, placas: valor(l) })));

  function menorQue1EmTodas() {
    setPlacas({ ...placas, ...Object.fromEntries(marcadas.map((l) => [l.chave, MENOR_QUE_1])) });
    void gravacao.ver({ itens: itensDe(marcadas, () => MENOR_QUE_1) });
  }

  return (
    <div className="cartao">
      <h2>Leituras para fazer</h2>
      <p className="texto-secundario">
        Marque as leituras e use <strong>&lt;1 em todas</strong>, ou digite as 3 placas (ex.: <code>&lt;1, &lt;1, 2</code>) e toque em{" "}
        <strong>Ler as placas</strong>. Nada é gravado antes do Confirmar.
      </p>
      {grupos.map(([grupo, itens]) => (
        <section key={grupo} className="grupo-leituras" aria-label={grupo}>
          <h3>
            {pode && (
              <input
                type="checkbox"
                aria-label={`Marcar todas de ${grupo}`}
                checked={itens.every((l) => m.tem(l.chave))}
                onChange={() => m.todos(itens.map((l) => l.chave))}
              />
            )}
            {grupo} <span className="contador">{itens.length}</span>
          </h3>
          <ul className="lista-marcavel">
            {itens.map((l) => (
              <li key={l.chave}>
                <label>
                  {pode && (
                    <input type="checkbox" aria-label={`Marcar ${l.tanque} ${l.frasco} ${l.rotulo}`} checked={m.tem(l.chave)} onChange={() => m.alternar(l.chave)} />
                  )}
                  <strong>{l.tanque}</strong>
                  <span>
                    {l.frasco} ({l.rotulo}) · {l.etapa === "pre" ? "pré-leitura" : "leitura final"}
                  </span>
                  {l.situacao !== "Atrasado" && <span className={classeDaSituacao(l.situacao)}>{l.situacao}</span>}
                </label>
                {pode && (
                  <input
                    className="entrada-resultado entrada-placas"
                    aria-label={`Placas de ${l.tanque} ${l.frasco} ${l.rotulo}`}
                    placeholder={MENOR_QUE_1}
                    value={placas[l.chave] ?? ""}
                    onChange={(e) => setPlacas({ ...placas, [l.chave]: e.target.value })}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {pode && (
        <div className="botoes-lado barra-acoes-fixa">
          <button type="button" className="botao botao-simples" disabled={marcadas.length === 0 || gravacao.enviando} onClick={menorQue1EmTodas}>
            &lt;1 em todas as leituras ({marcadas.length})
          </button>
          <button
            type="button"
            className="botao botao-principal"
            disabled={comPlacas.length === 0 || gravacao.enviando}
            onClick={() => void gravacao.ver({ itens: itensDe(comPlacas, (l) => placas[l.chave]) })}
          >
            Ler as placas ({comPlacas.length})
          </button>
        </div>
      )}
      <PreviaDaGravacao g={gravacao} titulo="O que vai ser gravado" />
    </div>
  );
}

function CamposDeTanque({
  campos,
  mudar,
  extra,
}: {
  campos: { origem: string; navio: string; tanques: string; data: string };
  mudar: (c: Partial<typeof campos>) => void;
  extra?: ReactNode;
}) {
  return (
    <>
      <div className="linha-formulario">
        <label className="campo">
          Origem
          <select value={campos.origem} onChange={(e) => mudar({ origem: e.target.value })}>
            <option value="terra">Terra</option>
            <option value="navio">Navio</option>
          </select>
        </label>
        {campos.origem === "navio" && (
          <label className="campo">
            Navio e viagem
            <input required maxLength={40} value={campos.navio} placeholder="ex.: O.SKY 189" onChange={(e) => mudar({ navio: e.target.value })} />
          </label>
        )}
        {extra}
      </div>
      <div className="linha-formulario">
        <label className="campo">
          Tanques
          <input
            required
            maxLength={200}
            value={campos.tanques}
            placeholder={campos.origem === "navio" ? "ex.: 1C, 2P, 2S (até 16)" : "ex.: 44, 45 (até 8)"}
            onChange={(e) => mudar({ tanques: e.target.value })}
          />
        </label>
        <label className="campo">
          Data
          <input required type="date" max={hojeEmSaoPaulo()} value={campos.data} onChange={(e) => mudar({ data: e.target.value })} />
        </label>
      </div>
    </>
  );
}

function Coleta({ aoGravar, coletor }: { aoGravar: () => void; coletor: boolean }) {
  const [campos, setCampos] = useState({ origem: "terra", navio: "", tanques: "", data: hojeEmSaoPaulo(), coletado_por: "" });
  const g = useGravacao("/analises/tanques/coleta", () => (setCampos({ ...campos, tanques: "" }), aoGravar()));
  const mudar = (c: Partial<typeof campos>) => (setCampos({ ...campos, ...c }), g.voltar());
  return (
    <form
      className="cartao"
      aria-label="Registrar coleta"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void g.ver(campos);
      }}
    >
      <h2>Registrar coleta</h2>
      <p className="texto-secundario">Cria os drops D5, D10 e D15 e a amostra de arquivo (bag na terra, pote no navio).</p>
      <CamposDeTanque campos={campos} mudar={mudar} />
      {!coletor && (
        <label className="campo">
          Coletado por (se não foi você)
          <input maxLength={60} value={campos.coletado_por} placeholder="opcional" onChange={(e) => mudar({ coletado_por: e.target.value })} />
        </label>
      )}
      {!g.previa && (
        <button type="submit" className="botao botao-principal" disabled={g.enviando}>
          Ver o que vai ser criado
        </button>
      )}
      <PreviaDaGravacao g={g} />
    </form>
  );
}

function Analise({ aoGravar }: { aoGravar: () => void }) {
  const [campos, setCampos] = useState({ origem: "terra", navio: "", tanques: "", data: hojeEmSaoPaulo(), frasco: "Normal" });
  const g = useGravacao("/analises/tanques/analise", () => (setCampos({ ...campos, tanques: "" }), aoGravar()));
  const mudar = (c: Partial<typeof campos>) => (setCampos({ ...campos, ...c }), g.voltar());
  return (
    <form
      className="cartao"
      aria-label="Registrar análise"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void g.ver(campos);
      }}
    >
      <h2>Registrar análise</h2>
      <p className="texto-secundario">
        4 leituras por tanque: C.T Prof. 48 h; B.L Prof. pré 3 e final 5 dias; WORT Prof. e Sup. pré 5 e final 10 dias.
      </p>
      <CamposDeTanque
        campos={campos}
        mudar={mudar}
        extra={
          <label className="campo">
            Frasco
            <select value={campos.frasco} onChange={(e) => mudar({ frasco: e.target.value })}>
              <option>Normal</option>
              <option>Stress</option>
            </select>
          </label>
        }
      />
      {!g.previa && (
        <button type="submit" className="botao botao-principal" disabled={g.enviando}>
          Ver o que vai ser criado
        </button>
      )}
      <PreviaDaGravacao g={g} />
    </form>
  );
}
