import { useEffect, useMemo, useState } from "react";

import { lerJson } from "../../api";
import { formatar } from "./formatos";

/**
 * Gráfico G2 (07 §6; APP-020): C.T e B.L por load ao longo do tempo, com a linha do limite, na página Recebimento.
 * Um painel por análise (cada um com o seu eixo: nunca dois eixos no mesmo gráfico). A cor marca só a situação e
 * sempre vem com outra pista: Não ok é quadrado e diz "Não ok" no detalhe; "<" é círculo vazado.
 * Tocar num ponto filtra a tabela pelo load. Os números de cada ponto também estão na tabela logo abaixo.
 */

export interface PontoG2 {
  load: string;
  lote: number | null;
  analise: string;
  data: string; // AAAA-MM-DD
  valor: number;
  resultado: string;
  nao_ok: boolean;
}

interface DadosG2 {
  limites: Record<string, number>;
  pontos: PontoG2[];
  cortado: boolean;
}

const ANALISES = ["C.T 48h", "B.L 72h", "B.L 120h"];
const L = 320; // largura do desenho (o SVG estica para a largura do cartão)
const A = 170; // altura
const M = { esq: 38, dir: 10, cima: 10, baixo: 24 };

function dias(data: string): number {
  return Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10)) / 86_400_000;
}

function diaMes(data: string): string {
  return formatar(data, "data").slice(0, 5);
}

function Painel(props: {
  analise: string;
  limite: number;
  pontos: PontoG2[];
  inicio: number;
  fim: number;
  primeiraData: string;
  ultimaData: string;
  aoEscolher: (load: string) => void;
}) {
  const [foco, setFoco] = useState<PontoG2 | null>(null);
  const { pontos, limite, inicio, fim } = props;
  const maximo = Math.max(limite * 1.6, ...pontos.map((p) => p.valor * 1.1));
  const x = (d: string) => M.esq + ((dias(d) - inicio) / Math.max(1, fim - inicio)) * (L - M.esq - M.dir);
  const y = (v: number) => A - M.baixo - (v / maximo) * (A - M.cima - M.baixo);
  const marcas = [0, Math.round(maximo / 2), Math.round(maximo)];
  const naoOk = pontos.filter((p) => p.nao_ok).length;

  return (
    <figure className="painel-g2" aria-label={`${props.analise}: ${pontos.length} leituras, ${naoOk} Não ok, limite ${limite}`}>
      <figcaption>
        <strong>{props.analise}</strong>{" "}
        <span className="texto-secundario">
          · {pontos.length} leituras · {naoOk} Não ok
        </span>
      </figcaption>
      {pontos.length === 0 ? (
        <p className="texto-secundario sem-pontos">Nenhuma leitura com esses filtros.</p>
      ) : (
        <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-hidden="true" className="svg-g2">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={M.esq} x2={L - M.dir} y1={y(m)} y2={y(m)} className="g2-grade" />
              <text x={M.esq - 6} y={y(m) + 3} className="g2-eixo" textAnchor="end">
                {m}
              </text>
            </g>
          ))}
          <text x={M.esq} y={A - 6} className="g2-eixo">
            {diaMes(props.primeiraData)}
          </text>
          <text x={L - M.dir} y={A - 6} className="g2-eixo" textAnchor="end">
            {diaMes(props.ultimaData)}
          </text>
          <line x1={M.esq} x2={L - M.dir} y1={y(limite)} y2={y(limite)} className="g2-limite" />
          <text x={L - M.dir} y={y(limite) - 4} className="g2-limite-texto" textAnchor="end">
            Limite {limite}
          </text>
          {pontos.map((p, n) => {
            const cx = x(p.data);
            const cy = y(p.valor);
            const menor = p.resultado.startsWith("<");
            return (
              <g
                key={n}
                className="g2-ponto"
                onMouseEnter={() => setFoco(p)}
                onMouseLeave={() => setFoco(null)}
                onClick={() => props.aoEscolher(p.load)}
              >
                {p.nao_ok ? (
                  <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} rx={1.5} className="g2-nao-ok" />
                ) : (
                  <circle cx={cx} cy={cy} r={4} className={menor ? "g2-ok g2-menor" : "g2-ok"} />
                )}
                <circle cx={cx} cy={cy} r={11} className="g2-alvo" data-testid="ponto-g2" />
              </g>
            );
          })}
        </svg>
      )}
      <p className="g2-detalhe" aria-live="polite">
        {foco
          ? `Load ${foco.load}${foco.lote ? ` · lote ${foco.lote}` : ""} · ${foco.analise} = ${foco.resultado} · ${diaMes(foco.data)}${foco.nao_ok ? " · Não ok" : " · Ok"}`
          : " "}
      </p>
    </figure>
  );
}

export default function GraficoG2({ consulta, aoEscolherLoad }: { consulta: string; aoEscolherLoad: (load: string) => void }) {
  const [dados, setDados] = useState<DadosG2 | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    lerJson<DadosG2>(`/paginas/recebimento/grafico${consulta ? `?${consulta}` : ""}`)
      .then((d) => vivo && (setDados(d), setErro("")))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível carregar o gráfico."));
    return () => {
      vivo = false;
    };
  }, [consulta]);

  const limites = useMemo(() => {
    if (!dados || dados.pontos.length === 0) return null;
    const ds = dados.pontos.map((p) => p.data).sort();
    return { primeira: ds[0], ultima: ds[ds.length - 1], inicio: dias(ds[0]), fim: dias(ds[ds.length - 1]) };
  }, [dados]);

  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!dados) return null;

  return (
    <section className="cartao grafico-g2" aria-label="Gráfico C.T e B.L por load">
      <h2>C.T e B.L ao longo do tempo</h2>
      {dados.pontos.length === 0 || !limites ? (
        <p>Nenhuma leitura feita com esses filtros.</p>
      ) : (
        <>
          <div className="paineis-g2">
            {ANALISES.map((a) => (
              <Painel
                key={a}
                analise={a}
                limite={dados.limites[a]}
                pontos={dados.pontos.filter((p) => p.analise === a)}
                inicio={limites.inicio}
                fim={limites.fim}
                primeiraData={limites.primeira}
                ultimaData={limites.ultima}
                aoEscolher={aoEscolherLoad}
              />
            ))}
          </div>
          <p className="g2-chave texto-secundario">
            <span className="g2-chave-ok">●</span> Ok · <span className="g2-chave-nao-ok">■</span> Não ok ·{" "}
            <span className="g2-chave-ok">○</span> menor que (&lt;) · linha tracejada: limite. Toque num ponto para ver o load na
            tabela.
          </p>
          {dados.cortado && <p className="texto-secundario">Muitas leituras: o gráfico mostra as mais recentes. Use um filtro de período.</p>}
        </>
      )}
    </section>
  );
}
