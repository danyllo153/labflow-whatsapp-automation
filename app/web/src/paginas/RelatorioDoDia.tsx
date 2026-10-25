import { useCallback, useEffect, useState, type ReactNode } from "react";

import { lerJson } from "../api";
import BlocosDePendencias, { type Pendencia } from "../componentes/BlocosDePendencias";
import SeletorDeDias, { dm } from "../componentes/SeletorDeDias";
import { useSessao } from "../sessao";
import { Numeros, PreviaDaGravacao, SoQuemGrava, useGravacao } from "./analises/comum";

/**
 * Leituras do dia (relatório do dia): o mesmo "relatório do dia" do bot (docs/comandos.md, seção 15), nos quatro blocos
 * (FCOJ Recebimento e Embarque, NFC Tank farm e Navio), de hoje ou de um dos 7 dias anteriores. "Só o lido" é o
 * "relatório do dia completo", com ok / não ok em cada linha. O texto sai igual ao do WhatsApp (Copiar e WhatsApp).
 * Embaixo, o que falta ler (atrasados e hoje) e o Finalizar o dia.
 */

interface Entrada {
  texto: string;
  alarme: boolean;
}

interface Linha {
  rotulo: string;
  entradas: Entrada[];
  lidos: number;
  total: number;
  situacao: string | null;
}

interface Bloco {
  titulo: string;
  secoes: { titulo: string; linhas: Linha[] }[];
  alertas: string[];
  lidos: number;
  total: number;
}

export interface Relatorio {
  dia: string;
  hoje: string;
  completo: boolean;
  blocos: Bloco[];
  lidos: number;
  total: number;
  alertas: number;
  finalizado_por: string | null;
  finalizado_as: string | null;
  texto: string;
}

interface Pendencias {
  itens: Pendencia[];
  vence_hoje: number;
  atrasados: number;
}

interface Desvios {
  dia_finalizado: boolean;
}

/** "42 ✅, 43 🚨 (30, 12, 8)" na tela sem emoji: ✅ vira a marca de lido e 🚨 a de fora do limite. */
function ComMarcas({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  texto.split(/(✅|🚨)/u).forEach((p, i) => {
    if (p === "✅") partes.push(<span key={i} className="marca-lido" title="lido" aria-label="lido">✓</span>);
    else if (p === "🚨") partes.push(<span key={i} className="marca-alarme" title="fora do limite" aria-label="fora do limite">!</span>);
    else if (p) partes.push(p);
  });
  return <>{partes}</>;
}

/** A cor de cada bloco, a mesma da família nas Análises (visual-novo.css, --fam-*). */
const COR_DO_BLOCO: Record<string, string> = {
  "FCOJ — Recebimento": "fcoj",
  "FCOJ — Embarque": "embarque",
  "NFC — Tank farm": "nfc",
  "NFC — Navio": "agua",
};

const semEmoji = (t: string) => t.replace(/^(🚨|⚠️)\s*/u, "");

export default function RelatorioDoDia() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [dia, setDia] = useState<string | null>(null);
  const [completo, setCompleto] = useState(false);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [pend, setPend] = useState<Pendencias | null>(null);
  const [finalizado, setFinalizado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dia) params.set("dia", dia);
      if (completo) params.set("completo", "true");
      const q = params.toString();
      const [r, p, d] = await Promise.all([
        lerJson<Relatorio>(`/relatorio-do-dia${q ? `?${q}` : ""}`),
        lerJson<Pendencias>("/pendencias-hoje"),
        lerJson<Desvios>("/analises/desvios"),
      ]);
      setRel(r);
      setPend(p);
      setFinalizado(d.dia_finalizado);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as leituras do dia.");
    }
  }, [dia, completo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const copiar = () => {
    if (!rel) return;
    void navigator.clipboard?.writeText(rel.texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };

  const ehHoje = !rel || rel.dia === rel.hoje;

  return (
    <section className="relatorio-do-dia">
      <h1>Leituras do dia</h1>
      <p className="texto-secundario">
        O relatório do dia, igual ao do bot: o que sai em cada análise, com lido e fora do limite. "Só o lido" é o relatório completo,
        com ok e não ok.
      </p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {rel && <SeletorDeDias hoje={rel.hoje} escolhido={rel.dia} preenchidos={[]} aoEscolher={setDia} />}
      <div className="dias-material" role="group" aria-label="O que mostrar">
        <button type="button" className="botao-secundario" aria-pressed={!completo} onClick={() => setCompleto(false)}>
          Tudo o que sai
        </button>
        <button type="button" className="botao-secundario" aria-pressed={completo} onClick={() => setCompleto(true)}>
          Só o lido (completo)
        </button>
      </div>
      {!rel && !erro && <p className="carregando">Carregando...</p>}
      {rel && (
        <>
          <Numeros
            itens={[
              { rotulo: "Lidas", valor: rel.lidos, tom: "hoje" },
              { rotulo: "Faltam", valor: rel.total - rel.lidos, tom: rel.total > rel.lidos ? "atrasado" : "hoje" },
              { rotulo: "Alertas", valor: rel.alertas, tom: rel.alertas ? "nao-ok" : "hoje" },
            ]}
          />
          <div className="acoes-relatorio">
            <button type="button" className="botao botao-principal" onClick={copiar} disabled={!rel.total}>
              {copiado ? "Copiado" : "Copiar o relatório"}
            </button>
            <a
              className="botao-secundario"
              href={`https://wa.me/?text=${encodeURIComponent(rel.texto)}`}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!rel.total}
            >
              Enviar no WhatsApp
            </a>
            <button type="button" className="botao-secundario" onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
          {rel.blocos.length === 0 && <p className="texto-secundario">Nenhuma leitura prevista em {dm(rel.dia)}.</p>}
          {rel.blocos.map((b) => (
            <article key={b.titulo} className={`cartao bloco-relatorio bloco-${COR_DO_BLOCO[b.titulo] ?? "geral"}`} aria-label={b.titulo}>
              <h2>
                {b.titulo}{" "}
                <span className={b.lidos === b.total ? "etiqueta etiqueta-ok" : "etiqueta etiqueta-neutra"}>
                  {b.lidos} de {b.total} lidas
                </span>
              </h2>
              {b.secoes.map((s) => (
                <div key={s.titulo || "linhas"} className="secao-relatorio">
                  {s.titulo && <h3>{s.titulo.charAt(0) + s.titulo.slice(1).toLowerCase()}</h3>}
                  <dl className="linhas-relatorio">
                    {s.linhas.map((l) => (
                      <div key={l.rotulo} className={l.entradas.some((e) => e.alarme) ? "linha-relatorio com-alarme" : "linha-relatorio"}>
                        <dt>{l.rotulo}</dt>
                        <dd>
                          {l.entradas.length === 0
                            ? "-"
                            : l.entradas.map((e, i) => (
                                <span key={i} className={e.alarme ? "entrada-relatorio entrada-alarme" : "entrada-relatorio"}>
                                  <ComMarcas texto={e.texto} />
                                </span>
                              ))}
                          {l.situacao && (
                            <span className={l.situacao === "ok" ? "etiqueta etiqueta-ok" : "etiqueta etiqueta-nao-ok"}>{l.situacao}</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {b.alertas.length > 0 && (
                <ul className="alertas-relatorio" aria-label={`Alertas de ${b.titulo}`}>
                  {b.alertas.map((a) => (
                    <li key={a}>{semEmoji(a)}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {rel.finalizado_por && (
            <p className="etiqueta etiqueta-ok">
              Leitura do dia finalizada por {rel.finalizado_por} às {rel.finalizado_as}.
            </p>
          )}
        </>
      )}
      {ehHoje && pend && (
        <details className="cartao" open={pend.atrasados > 0}>
          <summary>
            O que falta ler: {pend.vence_hoje} para hoje, {pend.atrasados} atrasado{pend.atrasados === 1 ? "" : "s"}
          </summary>
          <BlocosDePendencias itens={pend.itens} vazio={<p className="texto-secundario">Nada para ler hoje.</p>} />
        </details>
      )}
      {ehHoje && (
        <SoQuemGrava pode={pode}>
          <FinalizarODia finalizado={finalizado} aoGravar={() => void carregar()} />
        </SoQuemGrava>
      )}
    </section>
  );
}

function FinalizarODia({ finalizado, aoGravar }: { finalizado: boolean; aoGravar: () => void }) {
  const g = useGravacao("/analises/leitura-do-dia/finalizar", () => aoGravar());
  return (
    <div className="cartao" aria-label="Finalizar o dia">
      <h2>Finalizar o dia</h2>
      <p>
        Finalizar marca como lido tudo o que sai hoje: as placas que ninguém digitou nas leituras de tanque viram <code>&lt;1</code>, os
        drops de hoje são concluídos e o TAB e os Coliformes com leitura hoje ficam negativos. C.T/B.L do concentrado e o que está em
        confirmação não mudam.
      </p>
      {finalizado && <p className="etiqueta etiqueta-ok">O dia de hoje já foi finalizado.</p>}
      {!g.previa && (
        <button type="button" className="botao botao-principal" disabled={g.enviando} onClick={() => void g.ver({})}>
          Ver o que vai ser finalizado
        </button>
      )}
      <PreviaDaGravacao g={g} titulo="O que vai ser finalizado" />
    </div>
  );
}
