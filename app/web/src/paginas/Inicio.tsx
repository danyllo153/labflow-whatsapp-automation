import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { lerJson } from "../api";
import { useSessao } from "../sessao";
import type { EstadoDoTurno } from "./Turno";

/**
 * Início: pendências de hoje (07 §3; APP-014). Lê GET /pendencias-hoje, que conta pelas views do Power BI.
 * O cartão "Feito no turno" e o aviso para entrar no turno vêm de GET /turno (APP-022).
 */

export interface Pendencia {
  bloco: string;
  tipo: string;
  referencia: string;
  analise: string;
  prevista: string | null; // AAAA-MM-DD
  situacao: "Vence hoje" | "Atrasado";
}

interface Pendencias {
  vence_hoje: number;
  atrasados: number;
  desvios_abertos: number;
  itens: Pendencia[];
}

type Filtro = "todos" | "Vence hoje" | "Atrasado" | "Desvios";

const ATUALIZAR_A_CADA_MS = 60_000; // rumo, Fase C: as páginas se atualizam sozinhas a cada minuto
const ITENS_ANTES_DE_RECOLHER = 8;

function dia(data: string | null): string {
  if (!data) return "";
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

function hora(quando: Date): string {
  return quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function Inicio() {
  const { pessoa } = useSessao();
  const [dados, setDados] = useState<Pendencias | null>(null);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [turno, setTurno] = useState<EstadoDoTurno | null>(null);
  const navegar = useNavigate();

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<Pendencias>("/pendencias-hoje"));
      setAtualizadoEm(new Date());
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as pendências.");
    }
    // o turno é um extra: se falhar, o Início continua com as pendências
    lerJson<EstadoDoTurno>("/turno").then(setTurno, () => setTurno(null));
  }, []);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [carregar]);

  const nome = pessoa?.nome || pessoa?.usuario;
  const itens = (dados?.itens ?? []).filter((i) =>
    filtro === "todos" ? true : filtro === "Desvios" ? i.bloco === "Desvios" : i.situacao === filtro,
  );
  const blocos = itens.reduce<Record<string, Pendencia[]>>((grupos, item) => {
    (grupos[item.bloco] ??= []).push(item);
    return grupos;
  }, {});

  function escolher(f: Filtro) {
    setFiltro((atual) => (atual === f ? "todos" : f));
  }

  return (
    <section>
      <h1>Início</h1>
      <p className="texto-secundario saudacao">
        Olá, {nome}.{atualizadoEm && <> Atualizado às {hora(atualizadoEm)}.</>}
      </p>

      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
          <button type="button" className="botao botao-simples" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      )}

      {turno?.pode_entrar && !turno.no_turno && (
        <div className="cartao aviso-turno">
          <p>
            Você ainda não entrou no turno. <Link to="/turno">Entrar no turno</Link>
          </p>
        </div>
      )}

      {!dados && !erro && <p className="carregando">Carregando as pendências...</p>}

      {dados && (
        <>
          <div className="cartoes-numeros">
            <CartaoNumero rotulo="Para hoje" valor={dados.vence_hoje} ativo={filtro === "Vence hoje"} onClick={() => escolher("Vence hoje")} />
            <CartaoNumero rotulo="Atrasados" valor={dados.atrasados} ativo={filtro === "Atrasado"} alerta={dados.atrasados > 0} onClick={() => escolher("Atrasado")} />
            <CartaoNumero rotulo="Desvios abertos" valor={dados.desvios_abertos} ativo={filtro === "Desvios"} onClick={() => escolher("Desvios")} />
            {turno && (
              <CartaoNumero
                rotulo="Feito no turno"
                valor={turno.feito_no_turno.total}
                ativo={false}
                onClick={() => navegar("/turno")}
              />
            )}
          </div>

          {filtro !== "todos" && (
            <p className="filtro-ativo">
              Mostrando: <strong>{filtro === "Vence hoje" ? "para hoje" : filtro === "Atrasado" ? "atrasados" : "desvios"}</strong>{" "}
              <button type="button" className="link-botao" onClick={() => setFiltro("todos")}>
                Ver tudo
              </button>
            </p>
          )}

          {itens.length === 0 ? (
            <div className="cartao">
              <p>{dados.itens.length === 0 ? "Nada vencendo hoje e nada atrasado." : "Nada neste filtro."}</p>
              {pessoa?.cargo === "Coletor" && <p className="texto-secundario">O Coletor vê aqui só as pendências de coleta.</p>}
            </div>
          ) : (
            Object.entries(blocos).map(([bloco, lista]) => {
              const mostrarTudo = abertos[bloco] || lista.length <= ITENS_ANTES_DE_RECOLHER;
              const visiveis = mostrarTudo ? lista : lista.slice(0, ITENS_ANTES_DE_RECOLHER);
              return (
                <div className="cartao bloco-pendencias" key={bloco}>
                  <h2>
                    {bloco} <span className="contador">{lista.length}</span>
                  </h2>
                  <ul className="lista-pendencias">
                    {visiveis.map((item, n) => (
                      <li key={`${item.referencia}-${item.analise}-${n}`}>
                        <div className="pendencia-texto">
                          <span className="pendencia-ref">{item.referencia}</span>
                          <span className="texto-secundario">
                            {item.analise}
                            {item.analise !== item.tipo && ` · ${item.tipo}`}
                          </span>
                        </div>
                        <div className="pendencia-situacao">
                          <span className={item.situacao === "Atrasado" ? "etiqueta etiqueta-nao-ok" : "etiqueta etiqueta-pendente"}>
                            {item.situacao}
                          </span>
                          <span className="texto-secundario">{dia(item.prevista)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!mostrarTudo && (
                    <button type="button" className="link-botao" onClick={() => setAbertos({ ...abertos, [bloco]: true })}>
                      Mostrar todos ({lista.length})
                    </button>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </section>
  );
}

function CartaoNumero(props: { rotulo: string; valor: number; ativo: boolean; alerta?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`cartao-numero${props.ativo ? " ativo" : ""}${props.alerta ? " alerta" : ""}`}
      aria-pressed={props.ativo}
      onClick={props.onClick}
    >
      <span className="numero">{props.valor}</span>
      <span className="rotulo">{props.rotulo}</span>
    </button>
  );
}
