import { useEffect, useState, type FormEvent, type ReactNode } from "react";

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
  ...ABAS_FINAIS,
];

const chave = (l: Leitura) => `${l.analise_id}-${l.etapa}`;

export default function Tanques() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const podeColetar = !!pessoa?.pode.includes("registrar_coleta");
  const [busca, setBusca] = useState("");
  const lista = useLista<Leitura[]>("/analises/tanques/leituras", busca);
  const atrasadas = (lista.dados ?? []).filter((l) => l.situacao === "Atrasado").length;

  return (
    <AppDeAnalise
      app="tanques"
      sigla="TQ"
      cor="verde"
      titulo="Tanques"
      descricao="Tanques de terra e de navio: coleta, análise normal e stress, pré-leitura e leitura final com as placas."
      abas={ABAS_TANQUES.map((a) => (a.aba === "leituras" ? { ...a, contador: atrasadas } : a))}
    >
      {(aba) => (
        <>
          {aba === "leituras" && (
            <>
              <Numeros
                itens={[
                  { rotulo: "Atrasadas", valor: atrasadas, tom: "atrasado" },
                  { rotulo: "Vencem hoje", valor: (lista.dados ?? []).length - atrasadas, tom: "hoje" },
                ]}
              />
              <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar tanque ou navio" dica="Tanque ou navio (ex.: 44, O.SKY)" />
              <Leituras leituras={lista.dados} erro={lista.erro} pode={pode} aoGravar={lista.recarregar} />
            </>
          )}
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

function Leituras({ leituras, erro, pode, aoGravar }: { leituras: Leitura[] | null; erro: string; pode: boolean; aoGravar: () => void }) {
  const m = useMarcados<string>();
  const [placas, setPlacas] = useState<Record<string, string>>({});
  const acao = useAcao(() => (m.limpar(), aoGravar()));
  const gravacao = useGravacao("/analises/tanques/placas", () => (setPlacas({}), aoGravar()));
  const chaves = (leituras ?? []).map(chave);
  // a lista vem toda marcada (decisão de 24/10), como no "Lançar leituras" do Início; o analista desmarca o que não fez
  useEffect(() => m.todos(chaves.filter((k) => !m.tem(k))), [chaves.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!leituras) return <p className="carregando">Carregando...</p>;
  if (leituras.length === 0) return <p className="texto-secundario">Nenhuma leitura atrasada nem para hoje.</p>;

  const marcadas = leituras.filter((l) => m.tem(chave(l)));
  // por navio (ou terra) e dia previsto, como o relatório do bot: o atrasado já aparece no título do grupo
  const grupos = [...leituras.reduce((g, l) => {
    const k = `${l.navio ?? "Terra"} · ${dm(l.prevista)}${l.situacao === "Atrasado" ? " · atrasado" : ""}`;
    return g.set(k, [...(g.get(k) ?? []), l]);
  }, new Map<string, Leitura[]>())];
  const comPlacas = leituras.filter((l) => (placas[chave(l)] ?? "").trim());

  function concluir() {
    acao.perguntar(
      "/analises/tanques/leituras/concluir",
      `Marcar como feitas, sem digitar as placas (${marcadas.length}):\n` +
        marcadas.map((l) => `${l.navio ? `${l.navio} ` : ""}tanque ${l.tanque} · ${l.frasco} · ${l.analise}`).join("\n"),
      { itens: marcadas.map((l) => ({ analise_id: l.analise_id, etapa: l.etapa })) },
    );
  }

  return (
    <div className="cartao">
      <h2>Leituras para fazer</h2>
      <p className="texto-secundario">
        Marque as que foram feitas sem crescimento, ou digite as 3 placas (ex.: <code>&lt;1, &lt;1, 2</code>) e veja a prévia.
      </p>
      {grupos.map(([grupo, itens]) => (
        <section key={grupo} className="grupo-leituras" aria-label={grupo}>
          <h3>
            {pode && (
              <input type="checkbox" aria-label={`Marcar todas de ${grupo}`} onChange={() => m.todos(itens.map(chave))} />
            )}
            {grupo} <span className="contador">{itens.length}</span>
          </h3>
          <ul className="lista-marcavel">
            {itens.map((l) => (
              <li key={chave(l)}>
                <label>
                  {pode && (
                    <input type="checkbox" aria-label={`Marcar ${l.tanque} ${l.analise}`} checked={m.tem(chave(l))} onChange={() => m.alternar(chave(l))} />
                  )}
                  <strong>{l.tanque}</strong>
                  <span>
                    {l.frasco} · {l.analise}
                  </span>
                  {l.situacao !== "Atrasado" && <span className={classeDaSituacao(l.situacao)}>{l.situacao}</span>}
                </label>
                {pode && (
                  <input
                    className="entrada-resultado entrada-placas"
                    aria-label={`Placas de ${l.tanque} ${l.analise}`}
                    placeholder="<1, <1, <1"
                    value={placas[chave(l)] ?? ""}
                    onChange={(e) => setPlacas({ ...placas, [chave(l)]: e.target.value })}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {pode && (
        <div className="botoes-lado">
          <button type="button" className="botao botao-simples" disabled={marcadas.length === 0} onClick={concluir}>
            Feitas sem placas ({marcadas.length})
          </button>
          <button
            type="button"
            className="botao botao-principal"
            disabled={comPlacas.length === 0 || gravacao.enviando}
            onClick={() =>
              void gravacao.ver({ itens: comPlacas.map((l) => ({ analise_id: l.analise_id, etapa: l.etapa, placas: placas[chave(l)] })) })
            }
          >
            Ver as placas ({comPlacas.length})
          </button>
        </div>
      )}
      <PerguntaDaAcao a={acao} titulo="Marcar como feitas" />
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
