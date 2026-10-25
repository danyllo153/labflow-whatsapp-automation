import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarJson } from "../api";
import type { DadosEstufas } from "../paginas/Estufas";
import type { EstadoDoTurno } from "../paginas/Turno";
import type { Pendencia } from "./BlocosDePendencias";
import IconeApp from "./IconeApp";

/**
 * Cartão "Agora" no topo do Início (layout do canvas, APP-056): o relógio do turno com quanto falta, o registro livre
 * ("O que você está fazendo?", vai para a linha do tempo do turno) e os destaques do dia em blocos coloridos. O botão
 * de cada bloco abre o app da análise (Fase E) na aba certa, onde a lista já vem toda marcada e só grava com o
 * "Confirmar" (decidido em 24/10): "Espalhei todos" ou "Lançar leituras" no Início nunca gravam sozinhos.
 */

const FUSO_SP = "-03:00"; // São Paulo sem horário de verão desde 2019

function hhmm(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Fim do turno (o de agora, ou o da entrada aberta) e o texto "faltam 3 h 18". */
export function situacaoDoTurno(estado: EstadoDoTurno, agora: Date): { texto: string; faltam: string | null } | null {
  const id = estado.no_turno?.turno_id ?? estado.sugestao.turno_id;
  const dia = estado.no_turno?.dia ?? estado.sugestao.dia;
  const turno = estado.turnos.find((t) => t.id === id);
  if (!turno) return null;
  const comeco = new Date(`${dia}T${turno.inicio}:00${FUSO_SP}`);
  const fim = new Date(`${dia}T${turno.fim}:00${FUSO_SP}`);
  if (fim <= comeco) fim.setDate(fim.getDate() + 1);
  const minutos = Math.round((fim.getTime() - agora.getTime()) / 60000);
  const faltam = minutos > 0 && agora >= comeco ? `faltam ${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")}` : null;
  return { texto: `${turno.nome} · ${turno.inicio} às ${turno.fim}`, faltam };
}

interface Destaque {
  nome: string;
  n: number;
  atrasados: number;
  caminho: string;
  acao: string | null; // o texto do botão ("Espalhei todos"); sem ele, "Ver os N"
  cor: string; // família (app-cor-<cor>): o mesmo ícone e cor do app em Análises
  icone: string;
}

const COD_DA_ANALISE: Record<string, string> = { "C.T 48h": "CT", "B.L 72h": "BL72", "B.L 120h": "BL120" };

/** O app da análise (Fase E) na aba do que falta fazer, e o botão com a ação; águas e superfícies seguem nas páginas. */
export function destinoDe(p: Pendencia): { caminho: string; acao: string | null } {
  const texto = `${p.tipo} ${p.analise} ${p.grupo ?? ""}`;
  if (/howard/i.test(texto)) return { caminho: "/analises/howard", acao: null };
  if (/coliforme|\bTAB\b/i.test(texto)) {
    const espalhar = /para espalhar/.test(p.grupo ?? "");
    const coli = /coliforme/i.test(texto);
    return { caminho: coli ? "/analises/coliformes" : "/analises/tab", acao: espalhar ? (coli ? "Estriei todos" : "Espalhei todos") : null };
  }
  if (p.tipo === "Drop") return { caminho: "/analises/drops", acao: "Concluir drops" };
  if (p.tipo === "Leitura de NFC") return { caminho: "/analises/tanques?aba=leituras", acao: "Ler as placas" };
  if (p.bloco === "FCOJ Recebimento") {
    const cod = COD_DA_ANALISE[p.analise];
    return { caminho: `/analises/recebimento-fcoj?aba=resultados${cod ? `&analise=${cod}` : ""}`, acao: "Lançar resultados" };
  }
  if (p.bloco === "FCOJ Embarque") return { caminho: "/analises/embarque-fcoj?aba=resultados", acao: "Lançar resultados" };
  if (p.bloco === "Recebimento NFC") return { caminho: "/analises/recebimento-nfc?aba=resultados", acao: "Lançar resultados" };
  if (p.bloco === "Desvios") return { caminho: "/analises/desvios?aba=abertos", acao: null };
  if (p.bloco === "Águas e superfícies")
    return { caminho: /baia/i.test(texto) ? "/paginas/baias" : /linha/i.test(texto) ? "/paginas/linhas" : "/paginas/agua-processo", acao: null };
  return { caminho: "/paginas", acao: null };
}

/** A família da pendência (visual novo, APP-065): cada análise com a sua cor e o seu ícone, iguais aos de Análises. */
export function familiaDe(p: Pendencia): Pick<Destaque, "cor" | "icone"> {
  const texto = `${p.tipo} ${p.analise} ${p.grupo ?? ""}`;
  if (/howard/i.test(texto)) return { cor: "howard", icone: "howard" };
  if (/coliforme/i.test(texto)) return { cor: "coli", icone: "coliformes" };
  if (/\bTAB\b/.test(texto)) return { cor: "tab", icone: "tab" };
  if (p.tipo === "Drop") return { cor: "drops", icone: "drops" };
  if (p.bloco === "Desvios") return { cor: "desvios", icone: "desvios" };
  if (p.bloco === "Recebimento NFC") return { cor: "nfc-receb", icone: "recebimento-nfc" };
  if (p.bloco.startsWith("NFC")) return { cor: "nfc", icone: "tanques" };
  if (p.bloco === "FCOJ Recebimento") return { cor: "fcoj", icone: "recebimento-fcoj" };
  if (p.bloco === "FCOJ Embarque") return { cor: "embarque", icone: "embarque-fcoj" };
  if (p.bloco === "Águas e superfícies")
    return /baia/i.test(texto) ? { cor: "baias", icone: "baias" } : /linha/i.test(texto) ? { cor: "linhas", icone: "linhas" } : { cor: "agua", icone: "agua" };
  return { cor: "geral", icone: "visao-geral" };
}

/** Os 3 grupos com mais coisa para hoje (atrasados primeiro), com o bloco na frente quando o grupo sozinho é vago. */
export function destaquesDoDia(itens: Pendencia[]): Destaque[] {
  const grupos = new Map<string, Destaque>();
  for (const p of itens) {
    const grupo = p.grupo ?? p.analise ?? p.tipo;
    const nome = p.bloco.startsWith("FCOJ") ? `${p.bloco.replace("FCOJ ", "")} · ${grupo}` : grupo;
    const d = grupos.get(nome) ?? { nome, n: 0, atrasados: 0, ...destinoDe(p), ...familiaDe(p) };
    d.n += 1;
    if (p.situacao === "Atrasado") d.atrasados += 1;
    grupos.set(nome, d);
  }
  return [...grupos.values()].sort((a, b) => b.atrasados - a.atrasados || b.n - a.n).slice(0, 3);
}

export default function CartaoAgora(props: { turno: EstadoDoTurno | null; estufas: DadosEstufas | null; itens: Pendencia[] }) {
  const [agora, setAgora] = useState(() => new Date());
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const relogio = window.setInterval(() => setAgora(new Date()), 30_000);
    return () => window.clearInterval(relogio);
  }, []);

  async function registrar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setAviso("");
    try {
      await enviarJson("/turno/registros", { texto });
      setTexto("");
      setAviso("Registrado na linha do tempo do turno.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar.");
    }
  }

  const turno = props.turno ? situacaoDoTurno(props.turno, agora) : null;
  const resumo = props.estufas?.resumo;
  const destaques = destaquesDoDia(props.itens);

  return (
    <section className="cartao cartao-agora" aria-label="Agora no turno">
      <div className="agora-topo">
        <div className="agora-relogio">
          <span className="agora-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 8v4l2.5 1.5" />
            </svg>
          </span>
          <div>
            <div className="agora-hora">{hhmm(agora)}</div>
            {turno && (
              <div className="texto-secundario">
                {turno.texto}
                {turno.faltam && ` · ${turno.faltam}`}
              </div>
            )}
          </div>
          {resumo && resumo.total > 0 && (
            <a href="#estufas" className={`etiqueta ${resumo.nao_ok > 0 ? "etiqueta-nao-ok" : resumo.pendentes > 0 ? "etiqueta-pendente" : "etiqueta-ok"} agora-estufas`}>
              {resumo.nao_ok > 0 ? `${resumo.nao_ok} estufa${resumo.nao_ok > 1 ? "s" : ""} não ok` : resumo.pendentes > 0 ? `${resumo.pendentes} estufas para conferir` : "Estufas OK"}
            </a>
          )}
        </div>
        <form className="registro-livre" onSubmit={registrar} aria-label="Registro livre">
          <span className="registro-livre-rotulo" aria-hidden="true">
            Registro livre
          </span>
          <label className="sr-only" htmlFor="registro-livre">
            O que você está fazendo?
          </label>
          <input
            id="registro-livre"
            maxLength={200}
            placeholder="O que você está fazendo? Ex.: troquei o filtro da capela"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="botao botao-principal" disabled={!texto.trim()}>
            Registrar
          </button>
        </form>
        {(aviso || erro) && (
          <p className={erro ? "mensagem-erro" : "texto-secundario"} role={erro ? "alert" : "status"}>
            {erro || aviso}
          </p>
        )}
      </div>
      {destaques.length > 0 && (
        <div className="agora-destaques">
          {destaques.map((d) => (
            <div key={d.nome} className={`destaque familia-${d.cor}`}>
              <div className="destaque-topo">
                <span className={`app-icone app-cor-${d.cor}`} aria-hidden="true">
                  <IconeApp nome={d.icone} tamanho={20} />
                </span>
                <span className="destaque-nome">{d.nome}</span>
                <span className="destaque-numero">{d.n}</span>
              </div>
              <div className="destaque-acoes">
                <Link to={d.caminho} className="pilula-acao">
                  {d.acao ?? `Ver ${d.n > 1 ? `os ${d.n}` : "o 1"}`}
                </Link>
                {d.atrasados > 0 && <span className="pilula-info">{d.atrasados} atrasado{d.atrasados > 1 ? "s" : ""}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
