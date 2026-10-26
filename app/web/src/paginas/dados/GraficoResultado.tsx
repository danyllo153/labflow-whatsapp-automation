import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarController,
  BarElement,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  LogarithmicScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { Chart } from "react-chartjs-2";

import { lerJson } from "../../api";
import { formatar } from "./formatos";

ChartJS.register(LineController, BarController, LinearScale, LogarithmicScale, PointElement, LineElement, BarElement, Tooltip, Legend, annotationPlugin);

/**
 * Tendência do resultado (pedido de 26/10, no lugar do Dashboard de contagem): cada leitura com o valor já multiplicado
 * pela diluição, em escala logarítmica, uma série por análise com cor própria. Segue o filtro e a busca da página
 * (sem filtro de análise, todas juntas; tocar no nome da análise esconde ou mostra a série).
 * - Alerta (só no FCOJ: C.T 200, B.L 50): linha tracejada laranja; ponto acima fica laranja.
 * - Faixa normal: média dos últimos 30 dias de cada série ± 2 desvios, na escala log; ponto fora fica amarelo.
 * - "<10", "<1": ponto vazado no próprio valor, fora da média.
 * Só as páginas de resultado carregam o Chart.js (o módulo é carregado sob demanda); os gráficos simples seguem em SVG.
 */

export interface PontoResultado {
  data: string; // AAAA-MM-DD
  analise: string;
  valor: number;
  menor: boolean;
  acima: boolean;
  load: string | null;
  lote: string | null;
  navio: string | null;
  lido: string | null;
  diluicao: string | null;
}

interface Dados {
  alertas: Record<string, number>;
  pontos: PontoResultado[];
  cortado: boolean;
}

export type Estado = "acima" | "fora" | "menor" | "normal";

const DIA_MS = 86_400_000;
const CORES_ANALISE: [string, string][] = [
  ["C.T", "--g4-0"],
  ["B.L 72h", "--g4-3"],
  ["B.L 120h", "--g4-5"],
];
const LARANJA = "#e8590c";
const AMARELO = "#f5b301";
const AMARELO_BORDA = "#6b4e00";

export function diaDe(data: string): number {
  return Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10)) / DIA_MS;
}

function textoDoDia(dia: number): string {
  return formatar(new Date(dia * DIA_MS).toISOString().slice(0, 10), "data").slice(0, 5);
}

/** Faixa normal: média dos últimos 30 dias (até a última leitura da série) ± 2 desvios, em log; sem "<". */
export function faixaNormal(pontos: PontoResultado[]): { de: number; ate: number } | null {
  const medidos = pontos.filter((p) => !p.menor && p.valor > 0);
  if (medidos.length === 0) return null;
  const fim = Math.max(...medidos.map((p) => diaDe(p.data)));
  const logs = medidos.filter((p) => diaDe(p.data) > fim - 30).map((p) => Math.log10(p.valor));
  if (logs.length < 3) return null;
  const media = logs.reduce((a, b) => a + b, 0) / logs.length;
  const desvio = Math.sqrt(logs.reduce((a, b) => a + (b - media) ** 2, 0) / (logs.length - 1));
  return { de: 10 ** (media - 2 * desvio), ate: 10 ** (media + 2 * desvio) };
}

export function estadoDo(p: PontoResultado, faixa: { de: number; ate: number } | null): Estado {
  if (p.acima) return "acima";
  if (p.menor) return "menor";
  if (faixa && (p.valor < faixa.de || p.valor > faixa.ate)) return "fora";
  return "normal";
}

function token(nome: string, reserva: string): string {
  if (typeof window === "undefined") return reserva;
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || reserva;
}

function corDaAnalise(analise: string, i: number): string {
  const achada = CORES_ANALISE.find(([prefixo]) => analise.startsWith(prefixo));
  return token(achada?.[1] ?? `--g4-${i % 6}`, "#1f6fb5");
}

function transparente(cor: string, alfa: number): string {
  const h = cor.replace("#", "");
  if (h.length !== 6) return cor;
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alfa})`;
}

function rotuloLog(v: number): string {
  if (v >= 1_000_000) return `${v / 1_000_000} ${v === 1_000_000 ? "milhão" : "milhões"}`;
  if (v >= 1000) return `${v / 1000} mil`;
  return String(v);
}

const POTENCIAS = new Set([1, 10, 100, 1000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000]);

export default function GraficoResultado({
  api,
  consulta,
  rotuloData,
  aoDesenhar,
}: {
  api: string; // ex.: /paginas/recebimento-nfc
  consulta: string; // o filtro e a busca da página
  rotuloData: string; // ex.: "recebido em"
  aoDesenhar?: (canvas: HTMLCanvasElement | null) => void; // para a impressão levar o gráfico como imagem
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [forma, setForma] = useState<"line" | "bar">("line");
  const grafico = useRef<ChartJS<"line" | "bar"> | null>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    lerJson<Dados>(`${api}/resultados${consulta ? `?${consulta}` : ""}`).then(
      (d) => {
        if (vivo) {
          setDados(d);
          setErro("");
        }
      },
      (e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível montar o gráfico."),
    );
    return () => {
      vivo = false;
    };
  }, [api, consulta]);

  const series = useMemo(() => {
    if (!dados) return [];
    const nomes = [...new Set(dados.pontos.map((p) => p.analise))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return nomes.map((nome, i) => {
      const pontos = dados.pontos.filter((p) => p.analise === nome);
      const faixa = faixaNormal(pontos);
      return { nome, cor: corDaAnalise(nome, i), pontos, faixa, estados: pontos.map((p) => estadoDo(p, faixa)), alerta: dados.alertas[nome] };
    });
  }, [dados]);

  useEffect(() => {
    aoDesenhar?.(grafico.current?.canvas ?? null);
  });

  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!dados) return <p className="carregando">Montando o gráfico...</p>;

  const texto = token("--texto", "#1d2733");
  const secundario = token("--texto-secundario", "#4a5565");
  const borda = token("--borda", "#e6eaf0");
  const cartao = token("--cartao", "#ffffff");
  const fora = series.reduce((n, s) => n + s.estados.filter((e) => e === "fora").length, 0);
  const acima = series.reduce((n, s) => n + s.estados.filter((e) => e === "acima").length, 0);

  const data: ChartData<"line" | "bar", { x: number; y: number }[]> = {
    datasets: series.map((s) => {
      const cor = (i: number) => {
        const e = s.estados[i];
        return e === "acima" ? LARANJA : e === "fora" ? AMARELO : e === "menor" ? cartao : s.cor;
      };
      return {
        label: s.nome,
        data: s.pontos.map((p) => ({ x: diaDe(p.data), y: Math.max(p.valor, 1) })),
        borderColor: forma === "line" ? s.cor : cartao,
        backgroundColor: (c: { dataIndex: number }) => cor(c.dataIndex),
        pointBackgroundColor: (c: { dataIndex: number }) => cor(c.dataIndex),
        pointBorderColor: (c: { dataIndex: number }) => {
          const e = s.estados[c.dataIndex];
          return e === "fora" ? AMARELO_BORDA : e === "acima" ? cartao : s.cor;
        },
        pointBorderWidth: 2,
        pointRadius: (c: { dataIndex: number }) => (s.estados[c.dataIndex] === "normal" ? 3 : 6),
        pointHoverRadius: 8,
        borderWidth: forma === "line" ? 1.5 : 1,
        tension: 0,
        barThickness: 6,
        clip: 8, // o ponto no começo do eixo (ex.: <10) aparece inteiro
      };
    }),
  };

  const anotacoes: Record<string, object> = {};
  series.forEach((s, i) => {
    const visivel = (c: { chart: ChartJS }) => c.chart.isDatasetVisible(i);
    if (s.faixa)
      anotacoes[`faixa${i}`] = {
        type: "box", yMin: s.faixa.de, yMax: s.faixa.ate, backgroundColor: transparente(s.cor, 0.12), borderWidth: 0,
        drawTime: "beforeDatasetsDraw", display: visivel,
      };
  });
  // uma linha por valor de alerta (B.L 72h e B.L 120h dividem o 50), visível enquanto alguma das suas análises estiver
  const porAlerta = new Map<number, number[]>();
  series.forEach((s, i) => s.alerta && porAlerta.set(s.alerta, [...(porAlerta.get(s.alerta) ?? []), i]));
  porAlerta.forEach((indices, valor) => {
    const nomes = indices.map((i) => series[i].nome).join(", ");
    anotacoes[`alerta${valor}`] = {
      type: "line", yMin: valor, yMax: valor, borderColor: LARANJA, borderWidth: 2, borderDash: [6, 4],
      display: (c: { chart: ChartJS }) => indices.some((i) => c.chart.isDatasetVisible(i)),
      label: { display: true, content: `Alerta ${nomes} · ${valor}`, position: "start", backgroundColor: cartao, color: LARANJA, font: { size: 11, weight: "bold" }, padding: 3 },
    };
  });

  // o eixo começa na potência de 10 logo abaixo do menor valor (o "<1" fica no 1)
  const menor = Math.max(1, Math.min(...dados.pontos.map((p) => p.valor)));
  const inicioDoEixo = 10 ** Math.floor(Math.log10(menor));

  const opcoes: ChartOptions<"line" | "bar"> = {
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "nearest", intersect: true },
    scales: {
      x: { type: "linear", grid: { display: false }, ticks: { color: secundario, stepSize: 1, maxRotation: 0, autoSkipPadding: 16, callback: (v) => textoDoDia(Number(v)) } },
      y: {
        type: "logarithmic", min: inicioDoEixo, grid: { color: borda },
        title: { display: true, text: "UFC/mL (com diluição)", color: secundario },
        ticks: { color: secundario, callback: (v) => (POTENCIAS.has(Number(v)) ? rotuloLog(Number(v)) : "") },
      },
    },
    plugins: {
      legend: {
        position: "top",
        align: "start",
        labels: {
          color: texto,
          usePointStyle: true,
          boxWidth: 8,
          // a legenda leva a cor da análise (o primeiro ponto pode ser laranja, amarelo ou vazado)
          generateLabels: (chart) =>
            series.map((s, i) => ({
              text: s.nome, fillStyle: s.cor, strokeStyle: s.cor, fontColor: texto, pointStyle: "circle" as const,
              hidden: !chart.isDatasetVisible(i), datasetIndex: i,
            })),
        },
      },
      annotation: { annotations: anotacoes },
      tooltip: {
        callbacks: {
          title: (itens) => {
            const p = series[itens[0].datasetIndex].pontos[itens[0].dataIndex];
            return `${p.analise} · ${formatar(p.data, "data")} (${rotuloData})`;
          },
          label: (item) => {
            const s = series[item.datasetIndex];
            const p = s.pontos[item.dataIndex];
            const estado = { acima: "Acima do alerta", fora: "Fora da faixa normal", menor: "Abaixo do detectável", normal: "Normal" }[s.estados[item.dataIndex]];
            const valor = `${p.menor ? "<" : ""}${p.valor.toLocaleString("pt-BR")}`;
            return [
              `Com diluição: ${valor} · ${estado}`,
              [p.navio && `Navio ${p.navio}`, p.load && `Load ${p.load}`, p.lote && `lote ${p.lote}`].filter(Boolean).join(" · "),
              `Lido ${p.lido ?? "-"}${p.diluicao ? ` · diluição ${p.diluicao}` : ""}`,
            ];
          },
        },
      },
    },
  };

  return (
    <section className="cartao grafico-resultado" aria-label="Tendência do resultado">
      <div className="dashboard-topo">
        <div>
          <h2>Tendência do resultado</h2>
          <span className="texto-secundario">
            {dados.pontos.length} leituras com o filtro da tela
            {acima > 0 && ` · ${acima} acima do alerta`}
            {fora > 0 && ` · ${fora} fora da faixa normal`}
          </span>
        </div>
        <div role="group" aria-label="Forma do gráfico" className="seletor-segmentado">
          <button type="button" aria-pressed={forma === "line"} onClick={() => setForma("line")}>
            Linha
          </button>
          <button type="button" aria-pressed={forma === "bar"} onClick={() => setForma("bar")}>
            Colunas
          </button>
        </div>
      </div>
      {dados.pontos.length === 0 ? (
        <p className="texto-secundario">Nenhuma leitura com esse filtro.</p>
      ) : (
        <>
          <div className="grafico-resultado-area">
            <Chart
              ref={grafico}
              type={forma}
              data={data as ChartData<"line" | "bar">}
              options={opcoes}
              aria-label={`Tendência de ${series.map((s) => s.nome).join(", ")}: ${dados.pontos.length} leituras`}
              role="img"
            />
          </div>
          <ul className="legenda-resultado" aria-label="Como ler o gráfico">
            {series.some((s) => s.alerta) && (
              <li>
                <i className="bola" style={{ background: LARANJA }} /> Acima do alerta (linha tracejada)
              </li>
            )}
            <li>
              <i className="bola" style={{ background: AMARELO, borderColor: AMARELO_BORDA }} /> Fora da faixa normal
            </li>
            <li>
              <i className="bola vazada" /> Menor que (&lt;10, &lt;1), no próprio valor
            </li>
            <li>
              <i className="faixa" /> Faixa normal: média dos últimos 30 dias ± 2 desvios
            </li>
          </ul>
          {dados.cortado && <p className="texto-secundario">Mostrando as últimas leituras: filtre um período menor para ver tudo.</p>}
        </>
      )}
    </section>
  );
}
