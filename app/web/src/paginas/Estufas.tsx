import { useCallback, useEffect, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../api";

/**
 * Temperatura das estufas (07 §7.1; APP-027): uma conferência por estufa no início de cada turno, com duas leituras
 * (Supervisório e Field chart). Cada uma é Ok ou Não ok; o Não ok pede a temperatura (°C) e aceita uma observação.
 * A faixa de trabalho vem do banco (cadastrada pelo Admin); a estufa 06 é auxiliar e não tem faixa.
 */

export interface LeituraDaEstufa {
  ok: boolean;
  temperatura: string | null;
  observacao: string | null;
  quem: string;
  quando: string;
}

export interface EstufaDoTurno {
  id: number;
  auxiliar: boolean;
  faixa: { minimo: string; maximo: string } | null;
  supervisorio: LeituraDaEstufa | null;
  field_chart: LeituraDaEstufa | null;
  status: "Ok" | "Não ok" | "Pendente";
  diferenca: string | null;
}

export interface DadosEstufas {
  turno_id: number;
  turno: string;
  dia: string;
  pode_registrar: boolean;
  resumo: { total: number; conferidas: number; nao_ok: number; pendentes: number };
  estufas: EstufaDoTurno[];
}

type NomeLeitura = "Supervisório" | "Field chart";

function dm(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

function graus(valor: string | null): string {
  return valor === null ? "" : `${Number(valor).toFixed(1).replace(".", ",")} °C`;
}

function nomeDaEstufa(id: number): string {
  return `Estufa ${String(id).padStart(2, "0")}`;
}

function classe(status: EstufaDoTurno["status"]): string {
  return status === "Ok" ? "etiqueta etiqueta-ok" : status === "Não ok" ? "etiqueta etiqueta-nao-ok" : "etiqueta etiqueta-pendente";
}

export default function Estufas() {
  return (
    <section className="pagina-estufas">
      <h1>Estufas</h1>
      <ConferenciaEstufas />
    </section>
  );
}

/** A conferência das estufas do turno; `embutida` (tela Turno) não mostra erro, só some se a lista não carregar. */
export function ConferenciaEstufas({ embutida = false }: { embutida?: boolean }) {
  const [dados, setDados] = useState<DadosEstufas | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<DadosEstufas>("/estufas"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as estufas.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (embutida && erro) return null;

  return (
    <>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
          <button type="button" className="botao botao-simples" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && (
        <>
          <p className="texto-secundario">
            Turno {dados.turno} de {dm(dados.dia)}: <strong>{dados.resumo.conferidas}</strong> de {dados.resumo.total} conferidas
            {dados.resumo.nao_ok > 0 && (
              <>
                {" "}
                · <strong>{dados.resumo.nao_ok}</strong> Não ok
              </>
            )}
            .
          </p>
          {!dados.pode_registrar && <p className="texto-secundario">O seu cargo vê as estufas, mas não confere.</p>}
          {dados.estufas.map((e) => (
            <CartaoDaEstufa key={e.id} estufa={e} pode={dados.pode_registrar} aoMudar={setDados} />
          ))}
        </>
      )}
    </>
  );
}

function CartaoDaEstufa({ estufa: e, pode, aoMudar }: { estufa: EstufaDoTurno; pode: boolean; aoMudar: (d: DadosEstufas) => void }) {
  return (
    <section className="cartao estufa" aria-label={nomeDaEstufa(e.id)}>
      <h2>
        {nomeDaEstufa(e.id)} <span className={classe(e.status)}>{e.status}</span>
      </h2>
      <p className="texto-secundario">
        {e.auxiliar ? "Estufa auxiliar (sem faixa de trabalho)" : e.faixa ? `Faixa de trabalho: ${graus(e.faixa.minimo)} a ${graus(e.faixa.maximo)}` : "Faixa de trabalho não cadastrada"}
      </p>
      <Leitura estufa={e} nome="Supervisório" leitura={e.supervisorio} pode={pode} aoMudar={aoMudar} />
      <Leitura estufa={e} nome="Field chart" leitura={e.field_chart} pode={pode} aoMudar={aoMudar} />
      {e.diferenca !== null && (
        <p className="texto-secundario">
          Diferença (field chart − supervisório): {Number(e.diferenca).toFixed(1).replace(".", ",")} °C
        </p>
      )}
    </section>
  );
}

function Leitura(props: {
  estufa: EstufaDoTurno;
  nome: NomeLeitura;
  leitura: LeituraDaEstufa | null;
  pode: boolean;
  aoMudar: (d: DadosEstufas) => void;
}) {
  const { estufa, nome, leitura } = props;
  const [naoOk, setNaoOk] = useState(false);
  const [temperatura, setTemperatura] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function gravar(corpo: { ok: boolean; temperatura?: number; observacao?: string }) {
    setEnviando(true);
    setErro("");
    try {
      props.aoMudar(await enviarJson<DadosEstufas>(`/estufas/${estufa.id}`, { leitura: nome, ...corpo }, "PUT"));
      setNaoOk(false);
      setTemperatura("");
      setObservacao("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setEnviando(false);
    }
  }

  function gravarNaoOk(evento: FormEvent) {
    evento.preventDefault();
    const numero = Number(temperatura.replace(",", "."));
    if (!temperatura.trim() || Number.isNaN(numero)) {
      setErro("Digite a temperatura que a leitura está marcando.");
      return;
    }
    void gravar({ ok: false, temperatura: numero, observacao });
  }

  return (
    <div className="leitura-estufa" role="group" aria-label={`${nome} da ${nomeDaEstufa(estufa.id)}`}>
      <div className="leitura-linha">
        <strong>{nome}</strong>
        {leitura ? (
          <span className={leitura.ok ? "etiqueta etiqueta-ok" : "etiqueta etiqueta-nao-ok"}>
            {leitura.ok ? "Ok" : `Não ok · ${graus(leitura.temperatura)}`}
          </span>
        ) : (
          <span className="etiqueta etiqueta-pendente">Pendente</span>
        )}
      </div>
      {leitura && (
        <p className="texto-secundario">
          {leitura.quem} às {leitura.quando}
          {leitura.observacao && ` · ${leitura.observacao}`}
        </p>
      )}
      {props.pode && !naoOk && (
        <div className="atividade-botoes">
          <button type="button" className="botao-secundario" aria-pressed={leitura?.ok === true} disabled={enviando} onClick={() => void gravar({ ok: true })}>
            Ok
          </button>
          <button type="button" className="botao-secundario" aria-pressed={leitura?.ok === false} disabled={enviando} onClick={() => setNaoOk(true)}>
            Não ok
          </button>
        </div>
      )}
      {naoOk && (
        <form className="corrigir-horario" onSubmit={gravarNaoOk} aria-label={`Não ok: ${nome} da ${nomeDaEstufa(estufa.id)}`}>
          <label className="campo campo-hora">
            Temperatura (°C)
            <input inputMode="decimal" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} />
          </label>
          <label className="campo">
            Observação (opcional)
            <input maxLength={200} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal" disabled={enviando}>
              Gravar Não ok
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setNaoOk(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
