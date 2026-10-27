import { useState, type FormEvent } from "react";

import { useSessao } from "../../sessao";
import { FABRICAS } from "../dados/definicoes";
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
} from "./comum";
import LaudoEsterilizacao from "../LaudoEsterilizacao";
import { ABAS_FINAIS } from "./Instrucao";

/**
 * Recebimento de NFC (Fase E, E7; funções da 046): lotes fresh e past com a diluição, e o C.T/B.L lido na placa (o final é
 * o lido × 10 elevado à diluição). Sem alarme: o NFC recebido não usa os limites do concentrado (decisão de 14/10).
 */

interface Pendente {
  id: number;
  load: string;
  fabrica: string | null;
  lote: number;
  amostra: string;
  diluicao: number;
  recebido_em: string;
  analise: "CT" | "BL72" | "BL120";
  prevista: string;
  situacao: string;
}

interface LinhaDeLote {
  lote: string;
  amostra: "fresh" | "past";
  diluicao: string;
}

export const ABAS_NFC = [
  { aba: "registrar", rotulo: "Registrar" },
  { aba: "tabelas", rotulo: "Resultados" },
  { aba: "laudo", rotulo: "Laudo" },
  ...ABAS_FINAIS,
];

// O mesmo papel e o mesmo modelo do laudo do Recebimento FCOJ (decidido em 25/10), em folhas próprias do item 129.
const LAUDO = {
  base: "/laudos/recebimento-nfc",
  titulo: "Laudo do recebimento de NFC",
  rotulo: "Laudo do recebimento de NFC",
  explicacao:
    "O mesmo papel do recebimento de FCOJ (A4 deitado, 15 linhas), em folhas só do NFC: uma linha por lote e tipo, com o C.T/B.L como lido na placa e, na Observação, o tipo e a diluição (past 10¹, fresh 10³). Entra sozinho quando o lote é registrado. O modelo é o mesmo do FCOJ: enviar aqui atualiza os dois.",
  unidade: "linhas",
};

const ROTULO = { CT: "C.T 48h", BL72: "B.L 72h", BL120: "B.L 120h" };

/** A leitura do C.T/B.L dos lotes de NFC recebido: aqui e na aba Leituras (27/10). */
export function LeituraDoNfc() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [busca, setBusca] = useState("");
  const lista = useLista<Pendente[]>("/analises/recebimento-nfc/pendentes", busca);
  const atrasados = (lista.dados ?? []).filter((p) => p.situacao === "Atrasado").length;
  return (
    <>
      <Numeros
        itens={[
          { rotulo: "Atrasados", valor: atrasados, tom: "atrasado" },
          { rotulo: "Para hoje", valor: (lista.dados ?? []).length - atrasados, tom: "hoje" },
        ]}
      />
      <Busca valor={busca} aoMudar={setBusca} rotulo="Procurar load" dica="Número do load" />
      {lista.erro && <p className="mensagem-erro">{lista.erro}</p>}
      {!lista.dados && !lista.erro && <p className="carregando">Carregando...</p>}
      {lista.dados && <Lancar pendentes={lista.dados} pode={pode} aoGravar={lista.recarregar} />}
    </>
  );
}

export default function RecebimentoNfc() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  // a leitura (o C.T/B.L lido na placa) fica só na página Leituras (27/10)
  const lista = useLista<Pendente[]>("/analises/recebimento-nfc/pendentes", "");
  return (
    <AppDeAnalise
      app="recebimento-nfc"
      sigla="RN"
      cor="verde"
      titulo="Recebimento NFC"
      descricao="Lotes fresh e past do item 129, com a diluição, e o C.T/B.L lido na placa."
      abas={ABAS_NFC}
    >
      {(aba) => (
        <>
          {aba === "registrar" && (
            <SoQuemGrava pode={pode}>
              <Registrar aoGravar={lista.recarregar} />
            </SoQuemGrava>
          )}
          {aba === "laudo" && (
            <SoQuemGrava pode={pode}>
              <LaudoEsterilizacao versao={0} config={LAUDO} />
            </SoQuemGrava>
          )}
          {aba === "tabelas" && (
            <Resultados paginas={[{ caminho: "/paginas/recebimento-nfc", titulo: "Recebimento NFC", descricao: "lotes, diluição e resultados" }]} />
          )}
        </>
      )}
    </AppDeAnalise>
  );
}

function Registrar({ aoGravar }: { aoGravar: () => void }) {
  const vazia = (): LinhaDeLote => ({ lote: "", amostra: "fresh", diluicao: "0" });
  const [campos, setCampos] = useState({ load: "", fabrica: "", data: hojeEmSaoPaulo() });
  const [linhas, setLinhas] = useState<LinhaDeLote[]>([vazia()]);
  const g = useGravacao("/analises/recebimento-nfc/registrar", () => (setLinhas([vazia()]), aoGravar()));
  const mudarLinha = (i: number, c: Partial<LinhaDeLote>) => (setLinhas(linhas.map((l, j) => (j === i ? { ...l, ...c } : l))), g.voltar());
  const validas = linhas.filter((l) => l.lote.trim());
  return (
    <form
      className="cartao"
      aria-label="Registrar recebimento NFC"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void g.ver({ ...campos, lotes: validas.map((l) => ({ lote: Number(l.lote), amostra: l.amostra, diluicao: Number(l.diluicao) })) });
      }}
    >
      <h2>Registrar recebimento NFC</h2>
      <div className="linha-formulario">
        <label className="campo">
          Load
          <input required maxLength={10} inputMode="numeric" value={campos.load} onChange={(e) => (setCampos({ ...campos, load: e.target.value }), g.voltar())} />
        </label>
        <label className="campo">
          Fábrica
          <select required value={campos.fabrica} onChange={(e) => (setCampos({ ...campos, fabrica: e.target.value }), g.voltar())}>
            <option value="">Escolha</option>
            {FABRICAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          Recebido em
          <input required type="date" max={hojeEmSaoPaulo()} value={campos.data} onChange={(e) => (setCampos({ ...campos, data: e.target.value }), g.voltar())} />
        </label>
      </div>
      <p className="texto-secundario">Um lote por linha: o número, fresh ou past e a diluição (10 elevado a 0 até 9).</p>
      {linhas.map((l, i) => (
        <div key={i} className="linha-formulario linha-lote-nfc">
          <label className="campo campo-hora">
            Lote
            <input inputMode="numeric" maxLength={4} value={l.lote} aria-label={`Lote da linha ${i + 1}`} onChange={(e) => mudarLinha(i, { lote: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label className="campo campo-hora">
            Amostra
            <select value={l.amostra} aria-label={`Amostra da linha ${i + 1}`} onChange={(e) => mudarLinha(i, { amostra: e.target.value as LinhaDeLote["amostra"] })}>
              <option value="fresh">fresh</option>
              <option value="past">past</option>
            </select>
          </label>
          <label className="campo campo-hora">
            Diluição 10^
            <select value={l.diluicao} aria-label={`Diluição da linha ${i + 1}`} onChange={(e) => mudarLinha(i, { diluicao: e.target.value })}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {linhas.length > 1 && (
            <button type="button" className="botao-link" onClick={() => (setLinhas(linhas.filter((_, j) => j !== i)), g.voltar())}>
              Tirar
            </button>
          )}
        </div>
      ))}
      <div className="botoes-lado">
        <button type="button" className="botao botao-simples" onClick={() => setLinhas([...linhas, { ...linhas[linhas.length - 1], lote: "" }])}>
          + Lote
        </button>
        {!g.previa && (
          <button type="submit" className="botao botao-principal" disabled={g.enviando || validas.length === 0}>
            Ver o que vai ser criado ({validas.length})
          </button>
        )}
      </div>
      <PreviaDaGravacao g={g} />
    </form>
  );
}

function Lancar({ pendentes, pode, aoGravar }: { pendentes: Pendente[]; pode: boolean; aoGravar: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const g = useGravacao("/analises/recebimento-nfc/lancar", () => (setValores({}), aoGravar()));
  if (pendentes.length === 0) return <p className="texto-secundario">Nenhum resultado de NFC atrasado nem para hoje.</p>;
  const chave = (p: Pendente) => `${p.id}-${p.analise}`;
  const preenchidos = pendentes.filter((p) => (valores[chave(p)] ?? "").trim());
  return (
    <div className="cartao">
      <h2>Resultados para lançar</h2>
      <p className="texto-secundario">Digite o que leu na placa; o app multiplica pela diluição do lote.</p>
      {pode && (
        <button
          type="button"
          className="botao botao-simples"
          onClick={() => (setValores(Object.fromEntries(pendentes.map((p) => [chave(p), valores[chave(p)]?.trim() || "<1"]))), g.voltar())}
        >
          &lt;1 em todos os vazios ({pendentes.length})
        </button>
      )}
      <div className="tabela-rolavel">
        <table className="tabela-dados">
          <thead>
            <tr>
              <th>Load</th>
              <th>Lote</th>
              <th>Diluição</th>
              <th>Análise</th>
              <th>Prevista</th>
              <th>Situação</th>
              {pode && <th>Lido</th>}
            </tr>
          </thead>
          <tbody>
            {pendentes.map((p) => (
              <tr key={chave(p)}>
                <td>
                  {p.load} <span className="texto-secundario">· {p.fabrica ?? "—"}</span>
                </td>
                <td>
                  {p.lote} {p.amostra}
                </td>
                <td>10^{p.diluicao}</td>
                <td>{ROTULO[p.analise]}</td>
                <td>{dm(p.prevista)}</td>
                <td>
                  <span className={classeDaSituacao(p.situacao)}>{p.situacao}</span>
                </td>
                {pode && (
                  <td>
                    <input
                      className="entrada-resultado"
                      aria-label={`${ROTULO[p.analise]} do load ${p.load} lote ${p.lote} ${p.amostra}`}
                      maxLength={12}
                      value={valores[chave(p)] ?? ""}
                      onChange={(e) => (setValores({ ...valores, [chave(p)]: e.target.value }), g.voltar())}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pode && !g.previa && preenchidos.length > 0 && (
        <button
          type="button"
          className="botao botao-principal"
          disabled={g.enviando}
          onClick={() => void g.ver({ itens: preenchidos.map((p) => ({ id: p.id, analise: p.analise, resultado: valores[chave(p)].trim() })) })}
        >
          Ver o que vai ser gravado ({preenchidos.length})
        </button>
      )}
      <PreviaDaGravacao g={g} titulo="O que vai ser gravado" />
    </div>
  );
}
