import { useCallback, useEffect, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../api";

/**
 * Turno (07 §2; 08 A2; APP-022): escolher Manhã, Tarde ou Madrugada (o app sugere pelo horário), ajustar o próprio
 * horário e "Sair do turno". Os horários são sempre de Brasília; a Madrugada conta no dia em que começa.
 */

export interface TurnoPadrao {
  id: number;
  nome: string;
  inicio: string;
  fim: string;
}

export interface Entrada {
  id: number;
  turno_id: number;
  turno: string;
  dia: string; // AAAA-MM-DD
  entrada: string; // HH:MM
  saida: string | null;
}

export interface FeitoNoTurno {
  turno: string;
  dia: string;
  total: number;
  coletas: number;
  leituras: number;
  drops: number;
  atividades: number;
}

export interface EstadoDoTurno {
  turnos: TurnoPadrao[];
  sugestao: { turno_id: number; dia: string };
  pode_entrar: boolean;
  no_turno: Entrada | null;
  recentes: Entrada[];
  feito_no_turno: FeitoNoTurno;
}

export function diaMes(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

export default function Turno() {
  const [estado, setEstado] = useState<EstadoDoTurno | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setEstado(await lerJson<EstadoDoTurno>("/turno"));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar o turno."));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section className="pagina-turno">
      <h1>Turno</h1>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
          <button type="button" className="botao botao-simples" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      )}
      {!estado && !erro && <p className="carregando">Carregando...</p>}
      {estado && (
        <>
          {!estado.pode_entrar ? (
            <div className="cartao">
              <p>O cargo Consultor acompanha o laboratório, mas não entra em turno.</p>
            </div>
          ) : estado.no_turno ? (
            <NoTurno entrada={estado.no_turno} aoMudar={carregar} />
          ) : (
            <EntrarNoTurno estado={estado} aoEntrar={carregar} />
          )}
          <FeitoNoTurnoCartao feito={estado.feito_no_turno} />
          {estado.pode_entrar && estado.recentes.some((r) => r.saida) && (
            <div className="cartao">
              <h2>Meus últimos turnos</h2>
              <ul className="lista-turnos">
                {estado.recentes
                  .filter((r) => r.saida)
                  .map((r) => (
                    <LinhaDoTurno key={r.id} entrada={r} aoMudar={carregar} />
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EntrarNoTurno({ estado, aoEntrar }: { estado: EstadoDoTurno; aoEntrar: () => Promise<void> }) {
  const [turnoId, setTurnoId] = useState(estado.sugestao.turno_id);
  const escolhido = estado.turnos.find((t) => t.id === turnoId) ?? estado.turnos[0];
  const [entrada, setEntrada] = useState(escolhido.inicio);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  function escolher(t: TurnoPadrao) {
    setTurnoId(t.id);
    setEntrada(t.inicio);
  }

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      await enviarJson("/turno/entrar", { turno_id: turnoId, entrada });
      await aoEntrar();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível entrar no turno."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={entrar} aria-label="Entrar no turno">
      <h2>Entrar no turno</h2>
      <fieldset className="escolha-turno">
        <legend>Qual turno?</legend>
        {estado.turnos.map((t) => (
          <label key={t.id} className={t.id === turnoId ? "opcao-turno escolhida" : "opcao-turno"}>
            <input type="radio" name="turno" value={t.id} checked={t.id === turnoId} onChange={() => escolher(t)} />
            <span>
              <strong>{t.nome}</strong>{" "}
              <span className="texto-secundario">
                {t.inicio} às {t.fim}
                {t.id === estado.sugestao.turno_id && " · sugerido pelo horário"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="campo campo-hora">
        Sua entrada
        <input type="time" required value={entrada} onChange={(e) => setEntrada(e.target.value)} />
      </label>
      <p className="texto-secundario">Mude se chegou em outro horário (atraso, escala diferente).</p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao botao-principal" disabled={enviando}>
        {enviando ? "Entrando..." : `Entrar no turno ${escolhido.nome}`}
      </button>
    </form>
  );
}

function agoraHHMM(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function NoTurno({ entrada, aoMudar }: { entrada: Entrada; aoMudar: () => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [horaEntrada, setHoraEntrada] = useState(entrada.entrada);
  const [saindo, setSaindo] = useState(false);
  const [horaSaida, setHoraSaida] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(acao: () => Promise<unknown>) {
    setEnviando(true);
    setErro("");
    try {
      await acao();
      await aoMudar();
      setEditando(false);
      setSaindo(false);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="cartao no-turno" aria-label="Seu turno">
      <h2>
        Você está no turno {entrada.turno} de {diaMes(entrada.dia)}
      </h2>
      <p>
        Entrada às <strong>{entrada.entrada}</strong>.{" "}
        {!editando && !saindo && (
          <button type="button" className="link-botao" onClick={() => setEditando(true)}>
            Corrigir a entrada
          </button>
        )}
      </p>

      {editando && (
        <form
          className="linha-formulario"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(() => enviarJson(`/turno/entradas/${entrada.id}`, { entrada: horaEntrada }, "PUT"));
          }}
        >
          <label className="campo campo-hora">
            Entrada
            <input type="time" required value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} />
          </label>
          <button type="submit" className="botao botao-principal" disabled={enviando}>
            Salvar
          </button>
          <button type="button" className="botao botao-simples" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </form>
      )}

      {saindo ? (
        <form
          className="confirmacao"
          aria-label="Confirmar a saída"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(() => enviarJson("/turno/sair", { saida: horaSaida }));
          }}
        >
          <p>
            Registrar a sua saída do turno {entrada.turno}? A entrada foi às {entrada.entrada}.
          </p>
          <label className="campo campo-hora">
            Saída
            <input type="time" required value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} />
          </label>
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal" disabled={enviando}>
              Confirmar saída
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setSaindo(false)}>
              Continuar no turno
            </button>
          </div>
        </form>
      ) : (
        !editando && (
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => {
              setHoraSaida(agoraHHMM());
              setSaindo(true);
            }}
          >
            Sair do turno
          </button>
        )
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

function LinhaDoTurno({ entrada, aoMudar }: { entrada: Entrada; aoMudar: () => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [horaEntrada, setHoraEntrada] = useState(entrada.entrada);
  const [horaSaida, setHoraSaida] = useState(entrada.saida ?? "");
  const [erro, setErro] = useState("");

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      await enviarJson(`/turno/entradas/${entrada.id}`, { entrada: horaEntrada, saida: horaSaida }, "PUT");
      setEditando(false);
      await aoMudar();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    }
  }

  const titulo = `${entrada.turno} de ${diaMes(entrada.dia)}`;
  return (
    <li>
      {editando ? (
        <form className="linha-formulario" onSubmit={salvar} aria-label={`Corrigir ${titulo}`}>
          <strong>{titulo}</strong>
          <label className="campo campo-hora">
            Entrada
            <input type="time" required value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} />
          </label>
          <label className="campo campo-hora">
            Saída
            <input type="time" required value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} />
          </label>
          <button type="submit" className="botao botao-principal">
            Salvar
          </button>
          <button type="button" className="botao botao-simples" onClick={() => setEditando(false)}>
            Cancelar
          </button>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
        </form>
      ) : (
        <>
          <span>
            <strong>{titulo}</strong> · {entrada.entrada} às {entrada.saida}
          </span>
          <button type="button" className="link-botao" aria-label={`Corrigir o horário de ${titulo}`} onClick={() => setEditando(true)}>
            Corrigir
          </button>
        </>
      )}
    </li>
  );
}

function FeitoNoTurnoCartao({ feito }: { feito: FeitoNoTurno }) {
  const partes: [string, number][] = [
    ["coletas", feito.coletas],
    ["leituras de NFC", feito.leituras],
    ["drops concluídos", feito.drops],
    ["atividades do turno", feito.atividades],
  ];
  return (
    <div className="cartao" aria-label="Feito no turno">
      <h2>
        Feito no turno {feito.turno} de {diaMes(feito.dia)} <span className="contador">{feito.total}</span>
      </h2>
      <ul className="lista-feito">
        {partes.map(([rotulo, n]) => (
          <li key={rotulo}>
            <strong>{n}</strong> {rotulo}
          </li>
        ))}
      </ul>
      <p className="texto-secundario">Conta o que foi registrado no horário do turno (app ou WhatsApp).</p>
    </div>
  );
}
