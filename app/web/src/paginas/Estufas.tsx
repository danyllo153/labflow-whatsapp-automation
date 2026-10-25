import { useCallback, useEffect, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../api";
import IconeOk from "../componentes/IconeOk";

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
  alertas?: AlertaEstufa[]; // Não ok que veio de um turno anterior e ninguém conferiu Ok depois
}

export interface AlertaEstufa {
  estufa: number;
  leitura: string;
  desde: string; // dd/mm HH:MM
  temperatura: string | null;
  observacao: string | null;
}

/** Aviso para o turno seguinte (24/10): estufa fora da faixa desde tal horário, até alguém conferir Ok. */
export function AlertasEstufas({ alertas }: { alertas: AlertaEstufa[] | undefined }) {
  if (!alertas || alertas.length === 0) return null;
  return (
    <div className="cartao alerta-estufas" role="alert" aria-label="Estufas fora da faixa">
      <h2>Estufas fora da faixa</h2>
      <ul className="lista-simples">
        {alertas.map((a) => (
          <li key={`${a.estufa}-${a.leitura}`}>
            <strong>{nomeDaEstufa(a.estufa)}</strong> · {a.leitura.toLowerCase()} Não ok desde {a.desde}
            {a.temperatura !== null && ` (última: ${graus(a.temperatura)})`}
            {a.observacao && ` · ${a.observacao}`}
          </li>
        ))}
      </ul>
      <p className="texto-secundario">Confira de novo neste turno: o aviso some quando a leitura ficar Ok.</p>
    </div>
  );
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

/**
 * A conferência das estufas do turno, compacta (25/10): uma linha por estufa, com Ok / Não ok das duas leituras, e
 * "Todas as pendentes Ok" com um Confirmar. Fica no Início e no Turno; `embutida` não mostra erro nem os alertas
 * (a tela já mostra), só some se a lista não carregar.
 */
export function ConferenciaEstufas({ embutida = false, aoMudar }: { embutida?: boolean; aoMudar?: (d: DadosEstufas) => void }) {
  const [dados, setDados] = useState<DadosEstufas | null>(null);
  const [erro, setErro] = useState("");

  const mudar = useCallback(
    (d: DadosEstufas) => {
      setDados(d);
      aoMudar?.(d);
    },
    [aoMudar],
  );

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
      {dados && !embutida && <AlertasEstufas alertas={dados.alertas} />}
      {dados && (
        <div className="conferencia-estufas">
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
          {dados.pode_registrar && <TodasOk dados={dados} aoMudar={mudar} />}
          <div className="lista-estufas">
            <div className="estufa-linha estufa-cabecalho" aria-hidden="true">
              <span className="estufa-nome">Estufa</span>
              <span>Supervisório</span>
              <span>Field chart</span>
            </div>
            {dados.estufas.map((e) => (
              <LinhaDaEstufa key={e.id} estufa={e} pode={dados.pode_registrar} aoMudar={mudar} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** As leituras ainda sem conferência, para o "Todas as pendentes Ok". */
function pendentes(dados: DadosEstufas): { estufa: number; leitura: NomeLeitura }[] {
  return dados.estufas.flatMap((e) => [
    ...(e.supervisorio ? [] : [{ estufa: e.id, leitura: "Supervisório" as NomeLeitura }]),
    ...(e.field_chart ? [] : [{ estufa: e.id, leitura: "Field chart" as NomeLeitura }]),
  ]);
}

function TodasOk({ dados, aoMudar }: { dados: DadosEstufas; aoMudar: (d: DadosEstufas) => void }) {
  const [vendo, setVendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const lista = pendentes(dados);
  if (lista.length === 0) return null;
  const estufas = [...new Set(lista.map((p) => p.estufa))];

  async function confirmar() {
    setEnviando(true);
    setErro("");
    try {
      let ultimo: DadosEstufas | null = null;
      for (const p of lista) {
        ultimo = await enviarJson<DadosEstufas>(`/estufas/${p.estufa}`, { leitura: p.leitura, ok: true }, "PUT");
      }
      if (ultimo) aoMudar(ultimo);
      setVendo(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="todas-ok">
      {!vendo ? (
        <button type="button" className="botao botao-principal" onClick={() => setVendo(true)}>
          Todas as pendentes Ok ({lista.length})
        </button>
      ) : (
        <div className="previa-estufas" role="group" aria-label="Confirmar todas Ok">
          <p>
            Grava <strong>Ok</strong> em {lista.length} leitura{lista.length === 1 ? "" : "s"}: {estufas.map(nomeDaEstufa).join(", ")}. O que já foi
            conferido não muda.
          </p>
          <div className="botoes-lado">
            <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void confirmar()}>
              Confirmar
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setVendo(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

function LinhaDaEstufa({ estufa: e, pode, aoMudar }: { estufa: EstufaDoTurno; pode: boolean; aoMudar: (d: DadosEstufas) => void }) {
  const faixa = e.auxiliar ? "auxiliar" : e.faixa ? `${graus(e.faixa.minimo)} a ${graus(e.faixa.maximo)}` : "sem faixa";
  return (
    <section className={`estufa-linha estufa-${e.status === "Ok" ? "ok" : e.status === "Não ok" ? "nao-ok" : "pendente"}`} aria-label={nomeDaEstufa(e.id)}>
      <div className="estufa-nome">
        <strong>{nomeDaEstufa(e.id)}</strong>
        <span className="texto-secundario">{faixa}</span>
      </div>
      <Leitura estufa={e} nome="Supervisório" leitura={e.supervisorio} pode={pode} aoMudar={aoMudar} />
      <Leitura estufa={e} nome="Field chart" leitura={e.field_chart} pode={pode} aoMudar={aoMudar} />
      {e.diferenca !== null && (
        <p className="texto-secundario estufa-diferenca">Diferença (field chart − supervisório): {Number(e.diferenca).toFixed(1).replace(".", ",")} °C</p>
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

  const quem = leitura ? `${leitura.quem} às ${leitura.quando}${leitura.observacao ? ` · ${leitura.observacao}` : ""}` : "";

  return (
    <div className="leitura-estufa" role="group" aria-label={`${nome} da ${nomeDaEstufa(estufa.id)}`} title={quem || undefined}>
      <span className="leitura-nome">{nome}</span>
      {props.pode ? (
        <span className="botoes-estufa">
          <button type="button" className="botao-icone-ok" aria-label="Ok" title="Ok" aria-pressed={leitura?.ok === true} disabled={enviando} onClick={() => void gravar({ ok: true })}>
            <IconeOk ok apagado={leitura?.ok !== true} />
          </button>
          <button type="button" className="botao-icone-ok" aria-label="Não ok" title="Não ok" aria-pressed={leitura?.ok === false || naoOk} disabled={enviando} onClick={() => setNaoOk(true)}>
            <IconeOk ok={false} apagado={!(leitura?.ok === false || naoOk)} />
          </button>
          {leitura && !leitura.ok && <span className="temperatura-estufa">{graus(leitura.temperatura)}</span>}
        </span>
      ) : leitura ? (
        <span className="botoes-estufa" aria-label={leitura.ok ? "Ok" : `Não ok, ${graus(leitura.temperatura)}`}>
          <IconeOk ok={leitura.ok} />
          {!leitura.ok && <span className="temperatura-estufa">{graus(leitura.temperatura)}</span>}
        </span>
      ) : (
        <span className="etiqueta etiqueta-pendente">Pendente</span>
      )}
      {leitura && !leitura.ok && leitura.observacao && <span className="texto-secundario leitura-obs">{leitura.observacao}</span>}
      {naoOk && (
        <form className="nao-ok-estufa" onSubmit={gravarNaoOk} aria-label={`Não ok: ${nome} da ${nomeDaEstufa(estufa.id)}`}>
          <label className="campo campo-hora">
            Temperatura (°C)
            <input inputMode="decimal" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} autoFocus />
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
