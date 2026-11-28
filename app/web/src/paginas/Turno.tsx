import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../api";
import { useSessao } from "../sessao";
import BlocosDoDia from "../componentes/BlocosDoDia";
import ResumoEstufas from "../componentes/ResumoEstufas";
import AtividadesDoTurno from "./AtividadesDoTurno";
import { Corrigido, CorrigirHorario } from "./CorrigirHorario";
import EquipeDoTurno from "./EquipeDoTurno";
import { AlertasEstufas, type DadosEstufas } from "./Estufas";
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
      <div className="titulo-com-acao">
        <h1>Turno</h1>
        <Link to="/turno/relatorio" className="botao botao-simples">
          Ver o relatório do turno
        </Link>
      </div>
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
          <div className="turno-topo">
            <EquipeDoTurno
              aviso={estado.no_turno?.id ?? 0}
              contarRegistros={!estado.checkin_obrigatorio || !!estado.no_turno}
              entrada={estado.no_turno ?? undefined}
              aoMudar={() => carregar(true)}
            />
          </div>
          {!estado.pode_entrar ? (
            <div className="cartao">
              <p>O cargo Consultor acompanha o laboratório, mas não entra em turno.</p>
            </div>
          ) : estado.no_turno ? null : (
            <EntrarNoTurno estado={estado} aoEntrar={() => carregar(true)} />
          )}
          <FeitoNoTurnoCartao feito={estado.feito_no_turno} />
          {(!estado.checkin_obrigatorio || estado.no_turno) ? <CentralDoTurno estufas={<ResumoEstufas />} /> : <ResumoEstufas />}
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
      <p className="texto-secundario">A entrada fica registrada com a hora do clique no botão.</p>
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
  const { lite } = useSessao(); // na Lite não há WhatsApp
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
      <p className="texto-secundario">Conta o que foi registrado no horário do turno{lite ? "" : " (app ou WhatsApp)"}.</p>
    </div>
  );
}

/** O que o turno tem para fazer e já fez: atividades, estufas, as leituras e as análises pendentes (dois blocos, 27/10) e
 * a linha do tempo (APP-033). */
function CentralDoTurno({ estufas: cartaoDasEstufas }: { estufas: ReactNode }) {
  const [estufas, setEstufas] = useState<DadosEstufas | null>(null);

  useEffect(() => {
    lerJson<DadosEstufas>("/estufas").then(setEstufas, () => setEstufas(null));
  }, []);

  return (
    <>
      <AlertasEstufas alertas={estufas?.alertas} />
      <BlocosDoDia />
      <AtividadesDoTurno />
      <RegistrosDoTurnoCartao />
      {cartaoDasEstufas}
      <p className="links-do-turno">
        <Link to="/esterilizacao">Registrar esterilização</Link> · <Link to="/material-asseptico">Material asséptico do dia</Link> · <Link to="/paginas">Registros diários</Link>
      </p>
    </>
  );
}
