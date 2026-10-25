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
  SoQuemGrava,
  useAcao,
  useGravacao,
  useLista,
} from "./comum";
import { ABAS_FINAIS } from "./Instrucao";

/**
 * Desvios de tanque e a leitura do dia (Fase E, E8; funções da 047). O app nunca abre desvio sozinho: lista as leituras
 * não ok e o analista abre (regra do bot). A repetição usa o frasco de arquivo e o desvio fecha com o resultado dela.
 */

interface NaoOk {
  analise_id: number;
  etapa: "pre" | "final";
  origem: string;
  tanque: string;
  navio: string | null;
  frasco: string;
  analise: string;
  resultado: string | null;
  lida_em: string | null;
}

interface Aberto {
  desvio_id: number;
  origem: string;
  tanque: string;
  navio: string | null;
  analise: string | null;
  frasco: string | null;
  aberto_em: string;
  prazo: string | null;
  repeticao_feita: boolean;
  situacao: string;
}

interface Dados {
  para_abrir: NaoOk[];
  abertos: Aberto[];
  dia_finalizado: boolean;
}

export const ABAS_DESVIOS = [
  { aba: "abrir", rotulo: "Não ok" },
  { aba: "abertos", rotulo: "Em repetição" },
  { aba: "dia", rotulo: "Leitura do dia" },
  { aba: "resultados", rotulo: "Resultados" },
  ...ABAS_FINAIS,
];

const nome = (d: { navio: string | null; tanque: string; frasco: string | null; analise: string | null }) =>
  `${d.navio ? `${d.navio} ` : ""}tanque ${d.tanque} · ${d.frasco ?? ""} · ${d.analise ?? ""}`;

export default function Desvios() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [busca, setBusca] = useState("");
  const lista = useLista<Dados>("/analises/desvios", busca);
  const d = lista.dados;
  return (
    <AppDeAnalise
      app="desvios"
      sigla="!"
      cor="vermelho"
      titulo="Desvios"
      descricao="Leitura de tanque não ok, a repetição com o frasco de arquivo e o fim da leitura do dia."
      abas={ABAS_DESVIOS.map((a) =>
        a.aba === "abrir" ? { ...a, contador: d?.para_abrir.length } : a.aba === "abertos" ? { ...a, contador: d?.abertos.length } : a,
      )}
    >
      {(aba) => (
        <>
          {(aba === "abrir" || aba === "abertos") && (
            <>
              <Numeros
                itens={[
                  { rotulo: "Não ok sem desvio", valor: d?.para_abrir.length ?? 0, tom: "nao-ok" },
                  { rotulo: "Em repetição", valor: d?.abertos.length ?? 0, tom: "hoje" },
                ]}
              />
              <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar tanque ou navio" dica="Tanque ou navio" />
              {lista.erro && <p className="mensagem-erro">{lista.erro}</p>}
              {!d && !lista.erro && <p className="carregando">Carregando...</p>}
            </>
          )}
          {aba === "abrir" && d && <ParaAbrir leituras={d.para_abrir} pode={pode} aoGravar={lista.recarregar} />}
          {aba === "abertos" && d && <Abertos desvios={d.abertos} pode={pode} aoGravar={lista.recarregar} />}
          {aba === "dia" && (
            <SoQuemGrava pode={pode}>
              <LeituraDoDia finalizado={!!d?.dia_finalizado} aoGravar={lista.recarregar} />
            </SoQuemGrava>
          )}
          {aba === "resultados" && (
            <Resultados
              paginas={[
                { caminho: "/paginas/desvios", titulo: "Desvios", descricao: "de tanque e de drop, com o resultado" },
                { caminho: "/paginas/tanques", titulo: "Leituras de tanques", descricao: "com as placas" },
              ]}
            />
          )}
        </>
      )}
    </AppDeAnalise>
  );
}

function ParaAbrir({ leituras, pode, aoGravar }: { leituras: NaoOk[]; pode: boolean; aoGravar: () => void }) {
  const acao = useAcao(() => aoGravar());
  if (leituras.length === 0) return <p className="texto-secundario">Nenhuma leitura não ok sem desvio nos últimos 30 dias.</p>;
  return (
    <div className="cartao">
      <h2>Leituras não ok sem desvio</h2>
      <p className="texto-secundario">O app não abre desvio sozinho: confira e abra. A repetição usa o frasco de arquivo.</p>
      <ul className="lista-marcavel">
        {leituras.map((l) => (
          <li key={`${l.analise_id}-${l.etapa}`}>
            <span>
              <strong>{nome(l)}</strong>
              <span className="texto-secundario">
                {l.etapa === "pre" ? " (pré)" : ""} · placas {l.resultado ?? "—"}
                {l.lida_em ? ` · lida ${dm(l.lida_em)}` : ""}
              </span>
            </span>
            {pode && (
              <button
                type="button"
                className="botao botao-simples"
                onClick={() =>
                  acao.perguntar(
                    "/analises/desvios/abrir",
                    `Abrir desvio de ${nome(l)}${l.etapa === "pre" ? " (pré)" : ""}: cria a repetição com o frasco de arquivo, com os prazos contados de hoje.`,
                    { analise_id: l.analise_id, etapa: l.etapa },
                  )
                }
              >
                Abrir desvio
              </button>
            )}
          </li>
        ))}
      </ul>
      <PerguntaDaAcao a={acao} titulo="Abrir o desvio" />
    </div>
  );
}

function Abertos({ desvios, pode, aoGravar }: { desvios: Aberto[]; pode: boolean; aoGravar: () => void }) {
  const acao = useAcao(() => aoGravar());
  if (desvios.length === 0) return <p className="texto-secundario">Nenhum desvio de tanque em repetição.</p>;
  return (
    <div className="cartao">
      <h2>Desvios em repetição</h2>
      <p className="texto-secundario">O desvio fecha sozinho com o resultado da repetição (lance as placas no app de Tanques).</p>
      <ul className="lista-marcavel">
        {desvios.map((d) => (
          <li key={d.desvio_id}>
            <span>
              <strong>{nome(d)}</strong>
              <span className="texto-secundario">
                {" "}
                · aberto {dm(d.aberto_em)} · prazo {dm(d.prazo)}
              </span>{" "}
              <span className={classeDaSituacao(d.situacao)}>{d.situacao}</span>{" "}
              {d.repeticao_feita && <span className="etiqueta etiqueta-ok">Repetição feita</span>}
            </span>
            {pode && !d.repeticao_feita && (
              <button
                type="button"
                className="botao botao-simples"
                onClick={() => acao.perguntar(`/analises/desvios/${d.desvio_id}/repeticao`, `Marcar que a repetição de ${nome(d)} foi feita.`)}
              >
                Repetição feita
              </button>
            )}
          </li>
        ))}
      </ul>
      <PerguntaDaAcao a={acao} titulo="Registrar a repetição" />
    </div>
  );
}

function LeituraDoDia({ finalizado, aoGravar }: { finalizado: boolean; aoGravar: () => void }) {
  const g = useGravacao("/analises/leitura-do-dia/finalizar", () => aoGravar());
  return (
    <div className="cartao">
      <h2>Leitura do dia</h2>
      <p>
        Finalizar marca como lido tudo o que sai hoje: as placas que ninguém digitou nas leituras de tanque viram <code>&lt;1</code>, os
        drops de hoje são concluídos e o TAB e os Coliformes com leitura hoje ficam negativos. C.T/B.L do concentrado e o que está em
        confirmação não mudam.
      </p>
      {finalizado && <p className="etiqueta etiqueta-ok">O dia de hoje já foi finalizado.</p>}
      {!g.previa && (
        <button type="button" className="botao botao-principal" disabled={g.enviando} onClick={() => void g.ver({})}>
          Ver o que vai ser finalizado
        </button>
      )}
      <PreviaDaGravacao g={g} titulo="O que vai ser finalizado" />
    </div>
  );
}
