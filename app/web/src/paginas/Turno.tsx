import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../api";
import BlocosDePendencias, { type Pendencia } from "../componentes/BlocosDePendencias";
import AtividadesDoTurno from "./AtividadesDoTurno";
import EquipeDoTurno from "./EquipeDoTurno";
import { AlertasEstufas, ConferenciaEstufas, type DadosEstufas } from "./Estufas";
import RegistrosDoTurnoCartao from "./RegistrosDoTurno";

/**
 * Turno (07 §2; 08 A2; APP-022 e APP-022b): escolher Manhã, Tarde ou Madrugada (o app sugere pelo horário) e marcar
 * a entrada, como um check-in: vale a hora do clique, e a saída também. Corrigir o próprio horário pede motivo.
 * Para Analista e Coletor o resto do app só abre depois da entrada (PortaoDoTurno). Horários de Brasília.
 */

/** Aviso para o portão do check-in conferir de novo o turno (depois de entrar ou sair). */
export const TURNO_MUDOU = "labflow:turno-mudou";

function avisarQueMudou() {
  window.dispatchEvent(new Event(TURNO_MUDOU));
}

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
  entrada_registrada: string; // a hora do clique
  saida_registrada: string | null;
  motivo_correcao: string | null;
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
  checkin_obrigatorio: boolean;
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

  const carregar = useCallback(async (mudou = false) => {
    if (mudou) avisarQueMudou();
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
      <p>
        <Link to="/turno/relatorio">Ver o relatório do turno</Link>
      </p>
      {estado?.checkin_obrigatorio && !estado.no_turno && (
        <p className="aviso-checkin">Marque a sua entrada no turno para abrir o resto do app.</p>
      )}
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
          <EquipeDoTurno aviso={estado.no_turno?.id ?? 0} />
          {!estado.pode_entrar ? (
            <div className="cartao">
              <p>O cargo Consultor acompanha o laboratório, mas não entra em turno.</p>
            </div>
          ) : estado.no_turno ? (
            <NoTurno entrada={estado.no_turno} aoMudar={() => carregar(true)} />
          ) : (
            <EntrarNoTurno estado={estado} aoEntrar={() => carregar(true)} />
          )}
          <FeitoNoTurnoCartao feito={estado.feito_no_turno} />
          {(!estado.checkin_obrigatorio || estado.no_turno) && <CentralDoTurno />}
          {estado.pode_entrar && estado.recentes.some((r) => r.saida) && (
            <div className="cartao">
              <h2>Meus últimos turnos</h2>
              <ul className="lista-turnos">
                {estado.recentes
                  .filter((r) => r.saida)
                  .map((r) => (
                    <LinhaDoTurno key={r.id} entrada={r} aoMudar={() => carregar()} />
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
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");


  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      await enviarJson("/turno/entrar", { turno_id: turnoId });
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
            <input type="radio" name="turno" value={t.id} checked={t.id === turnoId} onChange={() => setTurnoId(t.id)} />
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
      <p className="texto-secundario">A entrada fica registrada com a hora do toque no botão.</p>
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

/** Corrigir o próprio horário: sempre com motivo; o horário do clique continua guardado (APP-022b). */
function CorrigirHorario(props: { entrada: Entrada; titulo: string; aoTerminar: (salvou: boolean) => void }) {
  const { entrada } = props;
  const [horaEntrada, setHoraEntrada] = useState(entrada.entrada);
  const [horaSaida, setHoraSaida] = useState(entrada.saida ?? "");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (motivo.trim().length < 5) {
      setErro("Escreva o motivo da correção (por exemplo: esqueci de marcar na hora).");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const corpo = { entrada: horaEntrada, motivo: motivo.trim(), ...(entrada.saida ? { saida: horaSaida } : {}) };
      await enviarJson(`/turno/entradas/${entrada.id}`, corpo, "PUT");
      props.aoTerminar(true);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="corrigir-horario" onSubmit={salvar} aria-label={`Corrigir ${props.titulo}`}>
      <div className="linha-formulario">
        <label className="campo campo-hora">
          Entrada
          <input type="time" required value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} />
        </label>
        {entrada.saida && (
          <label className="campo campo-hora">
            Saída
            <input type="time" required value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} />
          </label>
        )}
      </div>
      <label className="campo">
        Motivo da correção
        <textarea rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <p className="texto-secundario">
        O horário marcado no app ({entrada.entrada_registrada}
        {entrada.saida_registrada && ` às ${entrada.saida_registrada}`}) continua guardado junto com a correção.
      </p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="botoes-lado">
        <button type="submit" className="botao botao-principal" disabled={enviando}>
          Salvar correção
        </button>
        <button type="button" className="botao botao-simples" onClick={() => props.aoTerminar(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Corrigido({ entrada }: { entrada: Entrada }) {
  if (!entrada.motivo_correcao) return null;
  const marcado = entrada.saida_registrada ? `${entrada.entrada_registrada} às ${entrada.saida_registrada}` : entrada.entrada_registrada;
  return (
    <span className="texto-secundario corrigido">
      Corrigido (marcado no app: {marcado}). Motivo: {entrada.motivo_correcao}
    </span>
  );
}

function NoTurno({ entrada, aoMudar }: { entrada: Entrada; aoMudar: () => Promise<void> }) {
  const [corrigindo, setCorrigindo] = useState(false);
  const [saindo, setSaindo] = useState<string | null>(null); // a hora mostrada na confirmação
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const titulo = `a entrada no turno ${entrada.turno}`;

  async function sair(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      await enviarJson("/turno/sair", {});
      setSaindo(null);
      await aoMudar();
    } catch (e) {
      setErro(mensagem(e, "Não foi possível registrar a saída."));
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
        {!corrigindo && !saindo && (
          <button type="button" className="link-botao" onClick={() => setCorrigindo(true)}>
            Corrigir a entrada
          </button>
        )}
      </p>
      <Corrigido entrada={entrada} />

      {corrigindo && (
        <CorrigirHorario
          entrada={entrada}
          titulo={titulo}
          aoTerminar={(salvou) => {
            setCorrigindo(false);
            if (salvou) void aoMudar();
          }}
        />
      )}

      {saindo ? (
        <form className="confirmacao" aria-label="Confirmar a saída" onSubmit={sair}>
          <p>
            Registrar a sua saída do turno {entrada.turno} agora, às <strong>{saindo}</strong>? A entrada foi às {entrada.entrada}.
          </p>
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal" disabled={enviando}>
              Confirmar saída
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setSaindo(null)}>
              Continuar no turno
            </button>
          </div>
        </form>
      ) : (
        !corrigindo && (
          <button type="button" className="botao botao-secundario" onClick={() => setSaindo(agoraHHMM())}>
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
  const [corrigindo, setCorrigindo] = useState(false);
  const titulo = `${entrada.turno} de ${diaMes(entrada.dia)}`;
  return (
    <li>
      <div className="linha-turno">
        <span>
          <strong>{titulo}</strong> · {entrada.entrada} às {entrada.saida}
        </span>
        {!corrigindo && (
          <button type="button" className="link-botao" aria-label={`Corrigir o horário de ${titulo}`} onClick={() => setCorrigindo(true)}>
            Corrigir
          </button>
        )}
      </div>
      <Corrigido entrada={entrada} />
      {corrigindo && (
        <CorrigirHorario
          entrada={entrada}
          titulo={titulo}
          aoTerminar={(salvou) => {
            setCorrigindo(false);
            if (salvou) void aoMudar();
          }}
        />
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

/** O que o turno tem para fazer e já fez: atividades, estufas, análises a fazer hoje e a linha do tempo (APP-033). */
function CentralDoTurno() {
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);
  const [estufas, setEstufas] = useState<DadosEstufas | null>(null);

  useEffect(() => {
    lerJson<DadosEstufas>("/estufas").then(setEstufas, () => setEstufas(null));
    lerJson<{ itens: Pendencia[] }>("/pendencias-hoje").then(
      (p) => setPendencias(p.itens),
      () => setPendencias(null),
    );
  }, []);

  return (
    <>
      <AlertasEstufas alertas={estufas?.alertas} />
      <AtividadesDoTurno />
      <RegistrosDoTurnoCartao />
      <details className="recolhivel">
        <summary>Estufas do turno (conferir)</summary>
        <ConferenciaEstufas embutida />
      </details>
      {pendencias && (
        <details className="recolhivel">
          <summary>Análises a fazer hoje ({pendencias.length})</summary>
          <BlocosDePendencias itens={pendencias} vazio={<p>Nada vencendo hoje e nada atrasado.</p>} />
        </details>
      )}
      <p>
        <Link to="/esterilizacao">Registrar esterilização</Link>
      </p>
    </>
  );
}
