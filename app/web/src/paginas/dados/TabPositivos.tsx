import { useEffect, useMemo, useRef, useState } from "react";
import { BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip, type ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";

import { lerJson } from "../../api";
import { corDaFabrica, FABRICAS } from "./definicoes";
import { formatar } from "./formatos";

ChartJS.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * TAB e Coliformes positivos no ano (pedido de 26/10): colunas por mês, empilhadas por fábrica (cada uma com a sua cor).
 * Tocar na coluna lista os positivos do mês (load ou navio, data e fábrica). Filtro por ano e por fábrica.
 */

export interface TabPositivo {
  data: string;
  fabrica: string | null;
  origem: string;
  referencia: string;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_EXTENSO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEM_FABRICA = "Sem fábrica";

/** Os positivos do mês, um por load ou navio (o mesmo load com várias compostas positivas aparece uma vez, com o total). */
export function agruparPorReferencia(positivos: TabPositivo[]): (TabPositivo & { vezes: number; ultima: string })[] {
  const grupos = new Map<string, TabPositivo & { vezes: number; ultima: string }>();
  for (const p of positivos) {
    const chave = `${p.referencia}|${p.fabrica ?? ""}|${p.origem}`;
    const g = grupos.get(chave);
    if (g) {
      g.vezes += 1;
      if (p.data < g.data) g.data = p.data;
      if (p.data > g.ultima) g.ultima = p.data;
    } else grupos.set(chave, { ...p, vezes: 1, ultima: p.data });
  }
  return [...grupos.values()].sort((a, b) => b.vezes - a.vezes || a.data.localeCompare(b.data));
}

/** Quantos positivos por mês (0 a 11) e fábrica. */
export function contarPorMes(positivos: TabPositivo[]): Map<string, number[]> {
  const contagem = new Map<string, number[]>();
  for (const p of positivos) {
    const f = p.fabrica ?? SEM_FABRICA;
    const meses = contagem.get(f) ?? Array(12).fill(0);
    meses[+p.data.slice(5, 7) - 1] += 1;
    contagem.set(f, meses);
  }
  return contagem;
}

export default function TabPositivos({
  teste = "TAB",
  aoDesenhar,
}: {
  teste?: "TAB" | "Coliformes";
  aoDesenhar?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const esteAno = new Date().getFullYear();
  const [ano, setAno] = useState(esteAno);
  const [fabrica, setFabrica] = useState("");
  const [positivos, setPositivos] = useState<TabPositivo[] | null>(null);
  const [erro, setErro] = useState("");
  const [mes, setMes] = useState(new Date().getMonth());
  const grafico = useRef<ChartJS<"bar"> | null>(null);

  useEffect(() => {
    let vivo = true;
    setPositivos(null);
    lerJson<TabPositivo[]>(`/paginas/testes/positivos?teste=${teste}&ano=${ano}${fabrica ? `&fabrica=${fabrica}` : ""}`).then(
      (d) => {
        if (vivo) {
          setPositivos(d);
          setErro("");
        }
      },
      (e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível montar o gráfico."),
    );
    return () => {
      vivo = false;
    };
  }, [ano, fabrica, teste]);

  useEffect(() => {
    aoDesenhar?.(grafico.current?.canvas ?? null);
  });

  const contagem = useMemo(() => contarPorMes(positivos ?? []), [positivos]);
  const fabricas = [...FABRICAS, SEM_FABRICA].filter((f) => contagem.has(f));
  const doMes = (positivos ?? []).filter((p) => +p.data.slice(5, 7) - 1 === mes);
  const css = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const secundario = css?.getPropertyValue("--texto-secundario").trim() || "#4a5565";
  const texto = css?.getPropertyValue("--texto").trim() || "#1d2733";
  const borda = css?.getPropertyValue("--borda").trim() || "#e6eaf0";
  const cartao = css?.getPropertyValue("--cartao").trim() || "#ffffff";

  const opcoes: ChartOptions<"bar"> = {
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: secundario } },
      y: { stacked: true, beginAtZero: true, suggestedMax: 4, grid: { color: borda }, ticks: { color: secundario, stepSize: 1, precision: 0 } },
    },
    plugins: {
      legend: { position: "top", align: "start", labels: { color: texto, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10 } },
      tooltip: { mode: "index", intersect: false, filter: (i) => Number(i.raw) > 0 },
    },
    onClick: (evento, _elementos, chart) => {
      const x = chart.scales.x.getValueForPixel(evento.x ?? 0);
      if (x !== undefined && x >= 0 && x < 12) setMes(Math.round(x));
    },
  };

  return (
    <section className="cartao grafico-resultado" aria-label={`${teste} positivos no ano`}>
      <div className="dashboard-topo">
        <div>
          <h2>{teste} positivos no ano</h2>
          <span className="texto-secundario">
            {positivos ? `${positivos.length} ${positivos.length === 1 ? "positivo" : "positivos"} em ${ano}` : "..."} · toque numa coluna
          </span>
        </div>
      </div>
      <div className="dashboard-escolhas">
        <label className="campo campo-inline">
          Ano
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={esteAno - n}>
                {esteAno - n}
              </option>
            ))}
          </select>
        </label>
        <label className="campo campo-inline">
          Fábrica
          <select value={fabrica} onChange={(e) => setFabrica(e.target.value)}>
            <option value="">Todas</option>
            {FABRICAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erro ? (
        <p className="mensagem-erro">{erro}</p>
      ) : !positivos ? (
        <p className="carregando">Montando o gráfico...</p>
      ) : (
        <div className="tab-positivos">
          <div className="grafico-resultado-area">
            <Bar
              ref={grafico}
              data={{
                labels: MESES,
                datasets: fabricas.map((f) => ({
                  label: f,
                  data: contagem.get(f) ?? [],
                  backgroundColor: corDaFabrica(f),
                  borderColor: cartao,
                  borderWidth: { top: 2 },
                  borderSkipped: false,
                })),
              }}
              options={opcoes}
              aria-label={`${teste} positivos por mês em ${ano}: ${positivos.length}`}
              role="img"
            />
          </div>
          <div className="tab-positivos-lista" aria-live="polite">
            <div className="tab-positivos-meses">
              <label className="campo campo-inline">
                Mês
                <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                  {MESES_EXTENSO.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <h3>
              {MESES_EXTENSO[mes]} · {doMes.length} {doMes.length === 1 ? "positivo" : "positivos"}
            </h3>
            {doMes.length === 0 ? (
              <p className="texto-secundario">Nenhum {teste} positivo neste mês.</p>
            ) : (
              <ul>
                {agruparPorReferencia(doMes).map((p) => (
                  <li key={`${p.referencia}|${p.fabrica}|${p.origem}`}>
                    <i className="quadrado" style={{ background: corDaFabrica(p.fabrica) }} />
                    <span className="tab-positivo-texto">
                      <strong>{p.referencia}</strong>
                      <small>
                        {formatar(p.data, "data")}
                        {p.ultima !== p.data && ` a ${formatar(p.ultima, "data")}`} · {p.fabrica ?? SEM_FABRICA} · {p.origem}
                      </small>
                    </span>
                    {p.vezes > 1 && <span className="etiqueta etiqueta-nao-ok">{p.vezes}×</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
