import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { lerJson } from "../api";
import GraficoSemana from "../componentes/GraficoSemana";
import { useSessao } from "../sessao";
import BlocosDePendencias, { type Pendencia } from "../componentes/BlocosDePendencias";
import CartaoAgora from "../componentes/CartaoAgora";
import AtividadesDoTurno from "./AtividadesDoTurno";
import { AlertasEstufas, ConferenciaEstufas, type DadosEstufas } from "./Estufas";
import type { EstadoDoTurno } from "./Turno";

/**
 * Início: pendências de hoje (07 §3; APP-014). Lê GET /pendencias-hoje, que conta pelas views do Power BI.
 * O cartão "Feito no turno" e o aviso para entrar no turno vêm de GET /turno (APP-022). Layout do canvas (APP-056): o
 * cartão "Agora" no topo (relógio do turno, registro livre e os destaques do dia), os números, o gráfico e a lista.
 */

export type { Pendencia };

interface Pendencias {
  vence_hoje: number;
  atrasados: number;
  desvios_abertos: number;
  itens: Pendencia[];
}

type Filtro = "todos" | "Vence hoje" | "Atrasado" | "Desvios";

const ATUALIZAR_A_CADA_MS = 60_000; // rumo, Fase C: as páginas se atualizam sozinhas a cada minuto

function hora(quando: Date): string {
  return quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function Inicio() {
  const { pessoa } = useSessao();
  const [dados, setDados] = useState<Pendencias | null>(null);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [turno, setTurno] = useState<EstadoDoTurno | null>(null);
  const [estufas, setEstufas] = useState<DadosEstufas | null>(null);
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
    lerJson<DadosEstufas>("/estufas").then(setEstufas, () => setEstufas(null));
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
            <CartaoNumero cor="azul" icone="hoje" rotulo="Para hoje" valor={dados.vence_hoje} ativo={filtro === "Vence hoje"} onClick={() => escolher("Vence hoje")} />
            <CartaoNumero cor="laranja" icone="atrasado" rotulo="Atrasados" valor={dados.atrasados} ativo={filtro === "Atrasado"} alerta={dados.atrasados > 0} onClick={() => escolher("Atrasado")} />
            <CartaoNumero cor="roxo" icone="desvio" rotulo="Desvios abertos" valor={dados.desvios_abertos} ativo={filtro === "Desvios"} onClick={() => escolher("Desvios")} />
            {turno && (
              <CartaoNumero
                cor="verde"
                icone="feito"
                rotulo="Feito no turno"
                valor={turno.feito_no_turno.total}
                ativo={false}
                onClick={() => navegar("/turno")}
              />
            )}
          </div>

          {/* duas colunas no computador (26/10): o dia à esquerda; estufas, semana e atividades à direita */}
          <div className="inicio-grade">
            <div className="inicio-principal">
              <CartaoAgora turno={turno} estufas={estufas} itens={dados.itens} />
              {estufas && <AlertasEstufas alertas={estufas.alertas} />}

              {filtro !== "todos" && (
                <p className="filtro-ativo">
                  Mostrando: <strong>{filtro === "Vence hoje" ? "para hoje" : filtro === "Atrasado" ? "atrasados" : "desvios"}</strong>{" "}
                  <button type="button" className="link-botao" onClick={() => setFiltro("todos")}>
                    Ver tudo
                  </button>
                </p>
              )}

              <BlocosDePendencias
                itens={itens}
                vazio={
                  <>
                    <p>{dados.itens.length === 0 ? "Nada vencendo hoje e nada atrasado." : "Nada neste filtro."}</p>
                    {pessoa?.cargo === "Coletor" && <p className="texto-secundario">O Coletor vê aqui só as pendências de coleta.</p>}
                  </>
                }
              />
            </div>

            <div className="inicio-lado">
              {estufas && (
                <div className="cartao" aria-label="Estufas do turno" id="estufas">
                  <h2>
                    Estufas do turno{" "}
                    <span className="contador">
                      {estufas.resumo.conferidas} de {estufas.resumo.total}
                    </span>
                  </h2>
                  <ConferenciaEstufas embutida aoMudar={setEstufas} />
                </div>
              )}
              <GraficoSemana />
              {turno && <AtividadesDoTurno />}
            </div>
          </div>
        </>
      )}

    </section>
  );
}

const ICONES_DO_NUMERO = {
  hoje: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16",
  atrasado: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  desvio: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  feito: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6",
};

// cor: cartões em tom pastel com o ícone num quadrado (visual de 26/10, modelo InApp)
function CartaoNumero(props: {
  rotulo: string;
  valor: number;
  ativo: boolean;
  alerta?: boolean;
  cor?: "azul" | "laranja" | "verde" | "roxo";
  icone: keyof typeof ICONES_DO_NUMERO;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`cartao-numero${props.cor ? ` bloco-${props.cor}` : ""}${props.ativo ? " ativo" : ""}${props.alerta ? " alerta" : ""}`}
      aria-pressed={props.ativo}
      aria-label={`${props.valor} ${props.rotulo}`}
      onClick={props.onClick}
    >
      <span className="cartao-numero-icone" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONES_DO_NUMERO[props.icone]} />
        </svg>
      </span>
      <span className="rotulo">{props.rotulo}</span>
      <span className="numero">{props.valor}</span>
    </button>
  );
}
