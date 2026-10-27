import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { lerJson } from "../api";
import { type Pendencia } from "../componentes/BlocosDePendencias";
import { AbasDaPagina, useAba } from "../componentes/CabecalhoDaPagina";
import GraficoSemana from "../componentes/GraficoSemana";
import MediaPorTurno from "../componentes/MediaPorTurno";
import TabelaDePendencias, { tipoDa } from "../componentes/TabelaDePendencias";
import { useSessao } from "../sessao";
import { useAtividades } from "./AtividadesDoTurno";
import { IconeAcao } from "./LaudoEsterilizacao";
import type { EstadoDoTurno } from "./Turno";

/**
 * Início no modelo StarAdmin (26/10, pedido do Danyllo): só o que importa para o dia. Em cima os números (para analisar,
 * ler hoje, atrasados, do turno anterior, desvios e o feito no turno); depois o que é para ANALISAR, o que é para LER no
 * dia, as pendências do TURNO ANTERIOR (para marcar) e a MÉDIA de análises e esterilizações por turno. As estufas e as
 * atividades fixas ficam na tela do Turno. Lê GET /pendencias-hoje (views do Power BI), /turno, /turno/atividades,
 * /painel/semana e /painel/turnos; atualiza sozinho a cada minuto.
 */

export type { Pendencia };

interface Pendencias {
  vence_hoje: number;
  atrasados: number;
  desvios_abertos: number;
  itens: Pendencia[];
}

const ATUALIZAR_A_CADA_MS = 60_000; // rumo, Fase C: as páginas se atualizam sozinhas a cada minuto
const ABAS = [
  { aba: "dia", rotulo: "Visão do dia" },
  { aba: "analisar", rotulo: "Para analisar" },
  { aba: "ler", rotulo: "Ler hoje" },
  { aba: "atrasados", rotulo: "Atrasados" },
  { aba: "anterior", rotulo: "Turno anterior" },
];

function hora(quando: Date): string {
  return quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function Inicio() {
  const { pessoa } = useSessao();
  const [dados, setDados] = useState<Pendencias | null>(null);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [turno, setTurno] = useState<EstadoDoTurno | null>(null);
  const [aba, irPara] = useAba(ABAS);
  const atividades = useAtividades();

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

  const itens = dados?.itens ?? [];
  const analisar = itens.filter((i) => tipoDa(i) === "analisar");
  const ler = itens.filter((i) => tipoDa(i) === "ler");
  const herdadas = atividades.dados ? atividades.dados.herdadas.length + atividades.dados.recados.length : null;
  const coletor = pessoa?.cargo === "Coletor";

  return (
    <section className="inicio-star">
      <h1 className="so-leitor">Início</h1>

      {turno?.pode_entrar && !turno.no_turno && (
        <div className="aviso-turno-faixa">
          Você ainda não entrou no turno. <Link to="/turno">Entrar no turno</Link>
        </div>
      )}

      <div className="abas-com-acoes">
        <AbasDaPagina titulo="Início" abas={ABAS} aba={aba} irPara={irPara} />
        <div className="acoes-das-abas">
          {atualizadoEm && <span className="texto-secundario atualizado">Atualizado às {hora(atualizadoEm)}</span>}
          <button type="button" className="botao botao-simples botao-pequeno" onClick={() => window.print()}>
            <IconeAcao nome="imprimir" /> Imprimir
          </button>
          <Link className="botao botao-principal botao-pequeno" to="/turno">
            + Registrar
          </Link>
        </div>
      </div>

      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
          <button type="button" className="botao botao-simples" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      )}

      {!dados && !erro && <p className="carregando">Carregando as pendências...</p>}

      {dados && (
        <>
          <div className="estatisticas" role="list" aria-label="O dia em números">
            <Numero
              rotulo="Para analisar"
              valor={analisar.length}
              detalhe={`${analisar.filter((i) => i.situacao === "Vence hoje").length} para hoje`}
              tom="pendente"
              onClick={() => irPara("analisar")}
            />
            <Numero
              rotulo="Ler hoje"
              valor={ler.length}
              detalhe={`${ler.filter((i) => i.situacao === "Atrasado").length} atrasadas`}
              onClick={() => irPara("ler")}
            />
            <Numero
              rotulo="Atrasados"
              valor={dados.atrasados}
              detalhe="analisar e ler"
              tom={dados.atrasados > 0 ? "nao-ok" : undefined}
              onClick={() => irPara("atrasados")}
            />
            <Numero
              rotulo="Turno anterior"
              valor={herdadas ?? 0}
              detalhe={herdadas ? "não feitas" : "nada herdado"}
              tom={herdadas ? "pendente" : undefined}
              onClick={() => irPara("anterior")}
            />
            <Numero rotulo="Desvios abertos" valor={dados.desvios_abertos} detalhe="ver em Desvios" para="/analises/desvios?aba=abertos" />
            {turno && <Numero rotulo="Feito no turno" valor={turno.feito_no_turno.total} detalhe={turno.feito_no_turno.turno} tom="ok" para="/turno" />}
          </div>

          {coletor && <p className="texto-secundario">O Coletor vê aqui só as pendências de coleta.</p>}

          {aba === "dia" && (
            <>
              <div className="inicio-linha-star">
                <TabelaDePendencias
                  titulo="Para analisar agora"
                  subtitulo="O que precisa de mão: plaquear, espalhar, confirmar, drops"
                  itens={analisar}
                  limite={6}
                  verTudo={() => irPara("analisar")}
                  vazio="Nada para analisar hoje."
                />
                <GraficoSemana />
              </div>
              <div className="inicio-linha-star">
                <TabelaDePendencias
                  titulo="Ler hoje"
                  subtitulo="Placas que vencem hoje (e as atrasadas), por análise"
                  itens={ler}
                  limite={6}
                  verTudo={() => irPara("ler")}
                  vazio="Nenhuma placa para ler hoje."
                />
                <TurnoAnterior atividades={atividades} />
              </div>
              <MediaPorTurno />
            </>
          )}
          {aba === "analisar" && (
            <TabelaDePendencias titulo="Para analisar" subtitulo="Tudo o que vence hoje ou está atrasado" itens={analisar} vazio="Nada para analisar hoje." />
          )}
          {aba === "ler" && <TabelaDePendencias titulo="Ler hoje" subtitulo="Todas as placas de hoje e as atrasadas" itens={ler} vazio="Nenhuma placa para ler hoje." />}
          {aba === "atrasados" && (
            <TabelaDePendencias
              titulo="Atrasados"
              subtitulo="O que passou do dia: analisar e ler"
              itens={[...analisar, ...ler].filter((i) => i.situacao === "Atrasado")}
              vazio="Nada atrasado."
            />
          )}
          {aba === "anterior" && <TurnoAnterior atividades={atividades} />}
        </>
      )}
    </section>
  );
}

function Numero(props: {
  rotulo: string;
  valor: number;
  detalhe: string;
  tom?: "ok" | "nao-ok" | "pendente";
  onClick?: () => void;
  para?: string;
}) {
  const conteudo = (
    <>
      <span className="estatistica-titulo">{props.rotulo}</span>
      <strong className={`estatistica-numero${props.tom === "nao-ok" ? " tom-nao-ok" : ""}`}>{props.valor}</strong>
      <span className={`estatistica-detalhe${props.tom ? ` tom-${props.tom}` : ""}`}>{props.detalhe}</span>
    </>
  );
  const rotulo = `${props.valor} ${props.rotulo}`;
  if (props.para)
    return (
      <Link role="listitem" className="estatistica" to={props.para} aria-label={rotulo}>
        {conteudo}
      </Link>
    );
  if (props.onClick)
    return (
      <button role="listitem" type="button" className="estatistica" onClick={props.onClick} aria-label={rotulo}>
        {conteudo}
      </button>
    );
  return (
    <div role="listitem" className="estatistica" aria-label={rotulo}>
      {conteudo}
    </div>
  );
}

function diaMes(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

/** O que o turno anterior não fez (e os recados): uma lista de marcar, no jeito do "To do list" do modelo. */
function TurnoAnterior({ atividades }: { atividades: ReturnType<typeof useAtividades> }) {
  const { dados, erro, gravando, marcar, marcarRecado } = atividades;
  const total = dados ? dados.herdadas.length + dados.recados.length : 0;
  return (
    <section className="cartao turno-anterior" aria-label="Do turno anterior">
      <div className="cabeca-cartao">
        <div>
          <h2>
            Do turno anterior <span className="contador">{total}</span>
          </h2>
          <p className="texto-secundario">O que ficou sem fazer e os recados, para este turno</p>
        </div>
      </div>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && total === 0 && <p className="texto-secundario vazio-tabela">Nada herdado: o turno anterior fechou tudo.</p>}
      {dados && total > 0 && (
        <ul className="lista-tarefas">
          {dados.recados.map((r) => (
            <li key={`r-${r.texto}`}>
              <label>
                <input type="checkbox" checked={false} disabled={!dados.pode_marcar || gravando === -1} onChange={() => void marcarRecado(r.texto)} />
                <span>
                  {r.texto}
                  <small>
                    Recado do turno {r.turno} de {diaMes(r.dia)}
                    {r.por && ` · ${r.por}`} <span className="etiqueta etiqueta-no-prazo">recado</span>
                  </small>
                </span>
              </label>
            </li>
          ))}
          {dados.herdadas.map((h) => (
            <li key={h.atividade_id}>
              <label>
                <input
                  type="checkbox"
                  checked={false}
                  disabled={!dados.pode_marcar || gravando === h.atividade_id}
                  onChange={() => void marcar(h.atividade_id, true)}
                />
                <span>
                  {h.texto}
                  <small>
                    {h.turno} de {diaMes(h.dia)}
                    {h.quem && ` · ${h.quem}`} <span className="etiqueta etiqueta-pendente">pendente</span>
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
