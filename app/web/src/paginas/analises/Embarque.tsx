import { useState, type FormEvent } from "react";

import { useSessao } from "../../sessao";
import {
  AppDeAnalise,
  Busca,
  dm,
  hojeEmSaoPaulo,
  PreviaDaGravacao,
  Resultados,
  SoQuemGrava,
  useGravacao,
  useLista,
} from "./comum";
import { ABAS_FINAIS } from "./Instrucao";
import { ABA_LAUDO, AbaLaudo } from "./LaudoDoApp";

/**
 * Embarque FCOJ (Fase E, E6): amostras A1, A2... do navio, linha e fase e as compostas (045), e o C.T/B.L de cada amostra
 * pela lancar_contagem (040), a mesma do recebimento. O Howard das compostas fica no app de TAB, Coliformes e Howard.
 */

interface Amostra {
  id: number;
  embarque: string;
  amostra: string;
  load: string | null;
  data: string;
  ct: string | null;
  bl72: string | null;
  bl120: string | null;
  composta: number | null;
}

export const ABAS_EMBARQUE = [
  { aba: "painel", rotulo: "Painel" },
  { aba: "registrar", rotulo: "Registrar" },
  { aba: "compostas", rotulo: "Compostas" },
  { aba: "resultados", rotulo: "C.T e B.L" },
  { aba: "tabelas", rotulo: "Resultados" },
  ABA_LAUDO,
  ...ABAS_FINAIS,
];

const ANALISES = [
  { cod: "CT", chave: "ct", rotulo: "C.T 48h" },
  { cod: "BL72", chave: "bl72", rotulo: "B.L 72h" },
  { cod: "BL120", chave: "bl120", rotulo: "B.L 120h" },
] as const;

/** A leitura do C.T/B.L das amostras do embarque: aqui e na aba Leituras (27/10). */
export function LeituraDoEmbarque() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [busca, setBusca] = useState("");
  const lista = useLista<Amostra[]>("/analises/embarque/amostras", busca);
  return (
    <>
      <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar navio ou load" dica="Navio ou load (ex.: O.SKY 189)" />
      {lista.erro && <p className="mensagem-erro">{lista.erro}</p>}
      {!lista.dados && !lista.erro && <p className="carregando">Carregando...</p>}
      {lista.dados && <Lancar amostras={lista.dados} pode={pode} aoGravar={lista.recarregar} />}
    </>
  );
}

export default function Embarque() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const lista = useLista<Amostra[]>("/analises/embarque/amostras", "");
  return (
    <AppDeAnalise
      app="embarque-fcoj"
      sigla="EF"
      cor="azul"
      titulo="Embarque FCOJ"
      descricao="Amostras de cada navio, linha e fase, as compostas e o C.T/B.L de cada amostra."
      abas={ABAS_EMBARQUE}
    >
      {(aba, irPara) => (
        <>
          {aba === "painel" && <PainelDoEmbarque irPara={irPara} />}
          {aba === "registrar" && (
            <SoQuemGrava pode={pode}>
              <Registrar aoGravar={lista.recarregar} />
            </SoQuemGrava>
          )}
          {aba === "compostas" && (
            <SoQuemGrava pode={pode}>
              <Compostas aoGravar={lista.recarregar} />
            </SoQuemGrava>
          )}
          {aba === "resultados" && <LeituraDoEmbarque />}
          {aba === "laudo" && <AbaLaudo laudo="embarque-fcoj" />}
          {aba === "tabelas" && (
            <Resultados
              paginas={[
                { caminho: "/paginas/embarque", titulo: "Embarque FCOJ", descricao: "amostras e resultados de cada navio" },
                { caminho: "/paginas/howard", titulo: "Howard", descricao: "das compostas do embarque" },
              ]}
            />
          )}
        </>
      )}
    </AppDeAnalise>
  );
}

interface Painel {
  atrasados: number;
  para_hoje: number;
  nao_ok_semana: number;
  navios: { navio: string; lidos: number; nao_ok: number }[];
}

/** O painel do Embarque, igual ao do Recebimento FCOJ (padronização de 26/10): os números e o Não ok por navio. */
function PainelDoEmbarque({ irPara }: { irPara: (aba: string) => void }) {
  const painel = useLista<Painel>("/analises/embarque/painel");
  if (painel.erro) return <p className="mensagem-erro">{painel.erro}</p>;
  if (!painel.dados) return <p className="carregando">Carregando...</p>;
  const p = painel.dados;
  const maior = Math.max(1, ...p.navios.map((n) => n.nao_ok));
  return (
    <>
      <div className="numeros-app">
        <button type="button" className={`numero-app numero-${p.atrasados ? "atrasado" : "neutro"}`} onClick={() => irPara("resultados")}>
          <strong>{p.atrasados}</strong>
          <span>Atrasados</span>
        </button>
        <button type="button" className={`numero-app numero-${p.para_hoje ? "hoje" : "neutro"}`} onClick={() => irPara("resultados")}>
          <strong>{p.para_hoje}</strong>
          <span>Para hoje</span>
        </button>
        <div className={`numero-app numero-${p.nao_ok_semana ? "nao-ok" : "neutro"}`}>
          <strong>{p.nao_ok_semana}</strong>
          <span>Não ok na semana</span>
        </div>
      </div>
      <div className="cartao">
        <h2>Não ok por navio</h2>
        <p className="texto-secundario">Últimos 30 dias.</p>
        {p.navios.length === 0 ? (
          <p className="texto-secundario">Nenhuma leitura no período.</p>
        ) : (
          <ul className="barras-fabrica">
            {p.navios.map((n) => (
              <li key={n.navio}>
                <span className="fabrica-rotulo">{n.navio}</span>
                <span className="fabrica-trilho">
                  <span className="fabrica-valor" style={{ width: `${(n.nao_ok / maior) * 100}%` }} />
                </span>
                <span className="fabrica-numero">
                  {n.nao_ok} de {n.lidos}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function CamposDoEmbarque({
  campos,
  mudar,
}: {
  campos: { navio: string; linha: string; fase: string };
  mudar: (c: Partial<{ navio: string; linha: string; fase: string }>) => void;
}) {
  return (
    <div className="linha-formulario">
      <label className="campo">
        Navio e viagem
        <input required maxLength={40} value={campos.navio} placeholder="ex.: O.SKY 189" onChange={(e) => mudar({ navio: e.target.value })} />
      </label>
      <label className="campo campo-hora">
        Linha
        <input required inputMode="numeric" maxLength={2} value={campos.linha} onChange={(e) => mudar({ linha: e.target.value.replace(/\D/g, "") })} />
      </label>
      <label className="campo campo-hora">
        Fase
        <input required inputMode="numeric" maxLength={2} value={campos.fase} onChange={(e) => mudar({ fase: e.target.value.replace(/\D/g, "") })} />
      </label>
    </div>
  );
}

function Registrar({ aoGravar }: { aoGravar: () => void }) {
  const [campos, setCampos] = useState({ navio: "", linha: "", fase: "", load: "", item: "", amostras: "", data: hojeEmSaoPaulo() });
  const g = useGravacao("/analises/embarque/registrar", () => (setCampos({ ...campos, amostras: "" }), aoGravar()));
  const mudar = (c: Partial<typeof campos>) => (setCampos({ ...campos, ...c }), g.voltar());
  return (
    <form
      className="cartao"
      aria-label="Registrar embarque"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void g.ver({ ...campos, linha: Number(campos.linha), fase: Number(campos.fase) });
      }}
    >
      <h2>Registrar amostras do embarque</h2>
      <CamposDoEmbarque campos={campos} mudar={mudar} />
      <div className="linha-formulario">
        <label className="campo">
          Load
          <input required maxLength={10} inputMode="numeric" value={campos.load} onChange={(e) => mudar({ load: e.target.value })} />
        </label>
        <label className="campo">
          Item
          <input required maxLength={10} inputMode="numeric" value={campos.item} onChange={(e) => mudar({ item: e.target.value })} />
        </label>
      </div>
      <div className="linha-formulario">
        <label className="campo">
          Amostras
          <input required maxLength={200} value={campos.amostras} placeholder="ex.: 1-5 (A1 a A5)" onChange={(e) => mudar({ amostras: e.target.value })} />
        </label>
        <label className="campo">
          Data
          <input required type="date" max={hojeEmSaoPaulo()} value={campos.data} onChange={(e) => mudar({ data: e.target.value })} />
        </label>
      </div>
      {!g.previa && (
        <button type="submit" className="botao botao-principal" disabled={g.enviando}>
          Ver o que vai ser criado
        </button>
      )}
      <PreviaDaGravacao g={g} />
    </form>
  );
}

function Compostas({ aoGravar }: { aoGravar: () => void }) {
  const [campos, setCampos] = useState({ navio: "", linha: "", fase: "", grupos: "" });
  const g = useGravacao("/analises/embarque/compostas", () => (setCampos({ ...campos, grupos: "" }), aoGravar()));
  const mudar = (c: Partial<typeof campos>) => (setCampos({ ...campos, ...c }), g.voltar());
  return (
    <form
      className="cartao"
      aria-label="Compostas do embarque"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void g.ver({ ...campos, linha: Number(campos.linha), fase: Number(campos.fase) });
      }}
    >
      <h2>Compostas do embarque</h2>
      <p className="texto-secundario">Uma composta por grupo de amostras, ex.: (1-3)(4-6) junta A1 a A3 e A4 a A6.</p>
      <CamposDoEmbarque campos={campos} mudar={mudar} />
      <label className="campo">
        Compostas
        <input required maxLength={300} value={campos.grupos} placeholder="ex.: (1-3)(4-6)" onChange={(e) => mudar({ grupos: e.target.value })} />
      </label>
      {!g.previa && (
        <button type="submit" className="botao botao-principal" disabled={g.enviando}>
          Ver o que vai ser criado
        </button>
      )}
      <PreviaDaGravacao g={g} />
    </form>
  );
}

function Lancar({ amostras, pode, aoGravar }: { amostras: Amostra[]; pode: boolean; aoGravar: () => void }) {
  const [analise, setAnalise] = useState<(typeof ANALISES)[number]>(ANALISES[0]);
  const [valores, setValores] = useState<Record<number, string>>({});
  const g = useGravacao("/analises/embarque/lancar", () => (setValores({}), aoGravar()));
  if (amostras.length === 0) return <p className="texto-secundario">Nenhuma amostra de embarque no período.</p>;
  const vazias = amostras.filter((a) => a[analise.chave] === null);
  const preenchidas = vazias.filter((a) => (valores[a.id] ?? "").trim());
  return (
    <div className="cartao">
      {pode && (
        <div className="lancar-app">
          <span>Lançar</span>
          {ANALISES.map((a) => (
            <button key={a.cod} type="button" className="botao-tipo" aria-pressed={analise.cod === a.cod} onClick={() => (setAnalise(a), setValores({}), g.voltar())}>
              {a.rotulo}
            </button>
          ))}
          {vazias.length > 0 && (
            <button
              type="button"
              className="botao botao-simples"
              onClick={() => (setValores(Object.fromEntries(vazias.map((a) => [a.id, valores[a.id]?.trim() || "<10"]))), g.voltar())}
            >
              &lt;10 em todos os vazios ({vazias.length})
            </button>
          )}
        </div>
      )}
      <div className="tabela-rolavel">
        <table className="tabela-dados">
          <thead>
            <tr>
              <th>Embarque</th>
              <th>Amostra</th>
              <th>Load</th>
              <th>Data</th>
              {ANALISES.map((a) => (
                <th key={a.cod}>{a.rotulo}</th>
              ))}
              <th>Composta</th>
            </tr>
          </thead>
          <tbody>
            {amostras.map((am) => (
              <tr key={am.id}>
                <td>{am.embarque}</td>
                <td>{am.amostra}</td>
                <td>{am.load ?? "—"}</td>
                <td>{dm(am.data)}</td>
                {ANALISES.map((a) =>
                  pode && a.cod === analise.cod && am[a.chave] === null ? (
                    <td key={a.cod}>
                      <input
                        className="entrada-resultado"
                        aria-label={`${a.rotulo} de ${am.embarque} ${am.amostra}`}
                        maxLength={12}
                        value={valores[am.id] ?? ""}
                        onChange={(e) => (setValores({ ...valores, [am.id]: e.target.value }), g.voltar())}
                      />
                    </td>
                  ) : (
                    <td key={a.cod}>{am[a.chave] ?? <span className="texto-secundario">—</span>}</td>
                  ),
                )}
                <td>{am.composta ? `#${am.composta}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pode && !g.previa && preenchidas.length > 0 && (
        <button
          type="button"
          className="botao botao-principal"
          disabled={g.enviando}
          onClick={() =>
            void g.ver({ analise: analise.cod, itens: preenchidas.map((a) => ({ embarque_amostra_id: a.id, resultado: valores[a.id].trim() })) })
          }
        >
          Ver o que vai ser gravado ({preenchidas.length})
        </button>
      )}
      <PreviaDaGravacao g={g} titulo="O que vai ser gravado" />
    </div>
  );
}
