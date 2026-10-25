import { useState } from "react";

import { useSessao } from "../../sessao";
import { classeDaSituacao } from "../dados/formatos";
import {
  AppDeAnalise,
  Busca,
  dm,
  Numeros,
  PerguntaDaAcao,
  PreviaDaGravacao,
  Resultados,
  useAcao,
  useGravacao,
  useLista,
  useMarcados,
} from "./comum";
import { ABAS_FINAIS } from "./Instrucao";

/** Drops D5, D10 e D15 e o desvio de drop em 7, 13 e 25 °C (Fase E, E5; funções da 044). */

interface Drop {
  drop_id: number;
  drop: string;
  origem: string;
  tanque: string;
  navio: string | null;
  data_coleta: string;
  prevista: string;
  situacao: string;
}

interface Desvio {
  desvio_id: number;
  drop: string;
  origem: string;
  tanque: string;
  navio: string | null;
  aberto_em: string;
  prazo: string | null;
  situacao: string;
}

export const ABAS_DROPS = [
  { aba: "concluir", rotulo: "Para concluir" },
  { aba: "desvios", rotulo: "Desvios de drop" },
  { aba: "resultados", rotulo: "Resultados" },
  ...ABAS_FINAIS,
];

const nomeDo = (d: { navio: string | null; tanque: string; drop: string }) => `${d.navio ? `${d.navio} ` : ""}tanque ${d.tanque} · ${d.drop}`;

export default function Drops() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [busca, setBusca] = useState("");
  const lista = useLista<{ pendentes: Drop[]; desvios: Desvio[] }>("/analises/drops", busca);
  const pendentes = lista.dados?.pendentes ?? [];
  const desvios = lista.dados?.desvios ?? [];
  const atrasados = pendentes.filter((d) => d.situacao === "Atrasado").length;

  return (
    <AppDeAnalise
      app="drops"
      sigla="D"
      cor="verde"
      titulo="Drops"
      descricao="D5, D10 e D15 de cada coleta e o desvio de drop (repetição em 7, 13 e 25 °C)."
      abas={ABAS_DROPS.map((a) =>
        a.aba === "concluir" ? { ...a, contador: atrasados } : a.aba === "desvios" ? { ...a, contador: desvios.length } : a,
      )}
    >
      {(aba) => (
        <>
          {aba !== "resultados" && (
            <>
              <Numeros
                itens={[
                  { rotulo: "Atrasados", valor: atrasados, tom: "atrasado" },
                  { rotulo: "Vencem hoje", valor: pendentes.length - atrasados, tom: "hoje" },
                  { rotulo: "Desvios abertos", valor: desvios.length, tom: "nao-ok" },
                ]}
              />
              <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar tanque ou navio" dica="Tanque ou navio" />
              {lista.erro && <p className="mensagem-erro">{lista.erro}</p>}
              {!lista.dados && !lista.erro && <p className="carregando">Carregando...</p>}
            </>
          )}
          {aba === "concluir" && lista.dados && <Pendentes drops={pendentes} pode={pode} aoGravar={lista.recarregar} />}
          {aba === "desvios" && lista.dados && <Desvios desvios={desvios} pode={pode} aoGravar={lista.recarregar} />}
          {aba === "resultados" && (
            <Resultados
              paginas={[
                { caminho: "/paginas/drops", titulo: "Drops", descricao: "todos os drops, com quem concluiu" },
                { caminho: "/paginas/desvios", titulo: "Desvios", descricao: "de drop e de tanque" },
              ]}
            />
          )}
        </>
      )}
    </AppDeAnalise>
  );
}

function Pendentes({ drops, pode, aoGravar }: { drops: Drop[]; pode: boolean; aoGravar: () => void }) {
  const m = useMarcados<number>();
  const g = useGravacao("/analises/drops/concluir", () => (m.limpar(), aoGravar()));
  const acao = useAcao(() => aoGravar());
  if (drops.length === 0) return <p className="texto-secundario">Nenhum drop atrasado nem para hoje.</p>;
  const marcados = drops.filter((d) => m.tem(d.drop_id));
  return (
    <div className="cartao">
      <h2>Drops para concluir</h2>
      <p className="texto-secundario">Marque os que estão ok e veja a prévia. Drop não ok: abra o desvio pelo botão da linha.</p>
      <ul className="lista-marcavel">
        {pode && (
          <li>
            <label>
              <input type="checkbox" onChange={() => (m.todos(drops.map((d) => d.drop_id)), g.voltar())} /> <strong>Todos</strong>
            </label>
          </li>
        )}
        {drops.map((d) => (
          <li key={d.drop_id}>
            <label>
              {pode && <input type="checkbox" checked={m.tem(d.drop_id)} onChange={() => (m.alternar(d.drop_id), g.voltar())} />}
              <span>{nomeDo(d)}</span>
              <span className="texto-secundario"> · coleta {dm(d.data_coleta)} · prevista {dm(d.prevista)}</span>{" "}
              <span className={classeDaSituacao(d.situacao)}>{d.situacao}</span>
            </label>
            {pode && (
              <button
                type="button"
                className="botao-link"
                onClick={() =>
                  acao.perguntar(
                    "/analises/drops/desvio",
                    `Abrir desvio de ${nomeDo(d)}: repetição do drop de arquivo em 7, 13 e 25 °C, leitura em até 5 dias. O drop conta como lido.`,
                    { drop_id: d.drop_id },
                  )
                }
              >
                Não ok: abrir desvio
              </button>
            )}
          </li>
        ))}
      </ul>
      {pode && !g.previa && (
        <button
          type="button"
          className="botao botao-principal"
          disabled={marcados.length === 0 || g.enviando}
          onClick={() => void g.ver({ ids: marcados.map((d) => d.drop_id) })}
        >
          Concluir ({marcados.length})
        </button>
      )}
      <PreviaDaGravacao g={g} titulo="O que vai ser concluído" />
      <PerguntaDaAcao a={acao} titulo="Abrir o desvio de drop" />
    </div>
  );
}

function Desvios({ desvios, pode, aoGravar }: { desvios: Desvio[]; pode: boolean; aoGravar: () => void }) {
  if (desvios.length === 0) return <p className="texto-secundario">Nenhum desvio de drop aberto.</p>;
  return (
    <>
      {desvios.map((d) => (
        <DesvioAberto key={d.desvio_id} d={d} pode={pode} aoGravar={aoGravar} />
      ))}
    </>
  );
}

function DesvioAberto({ d, pode, aoGravar }: { d: Desvio; pode: boolean; aoGravar: () => void }) {
  const [temperaturas, setTemperaturas] = useState<number[]>([]);
  const acao = useAcao(() => aoGravar());
  const alternar = (t: number) => setTemperaturas((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t].sort((a, b) => a - b)));
  return (
    <section className="cartao" aria-label={`Desvio de ${nomeDo(d)}`}>
      <h2>{nomeDo(d)}</h2>
      <p className="texto-secundario">
        Aberto em {dm(d.aberto_em)} · ler até {dm(d.prazo)} <span className={classeDaSituacao(d.situacao)}>{d.situacao}</span>
      </p>
      {pode && (
        <>
          <p>Em que temperatura confirmou? Sem nenhuma marcada, não confirmou.</p>
          <div className="botoes-lado">
            {[7, 13, 25].map((t) => (
              <button key={t} type="button" className="botao-tipo" aria-pressed={temperaturas.includes(t)} onClick={() => alternar(t)}>
                {t} °C
              </button>
            ))}
            <button
              type="button"
              className="botao botao-principal"
              onClick={() =>
                acao.perguntar(
                  `/analises/drops/desvio/${d.desvio_id}/fechar`,
                  `Fechar o desvio de ${nomeDo(d)}: ${temperaturas.length ? `confirmou em ${temperaturas.join(", ")} °C` : "não confirmou"}.`,
                  { temperaturas },
                )
              }
            >
              Fechar o desvio
            </button>
          </div>
        </>
      )}
      <PerguntaDaAcao a={acao} titulo="Fechar o desvio" />
    </section>
  );
}
