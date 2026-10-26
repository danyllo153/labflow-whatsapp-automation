import { BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * Colunas empilhadas com as pontas arredondadas (visual de 26/10, modelo InApp), para os gráficos simples do Início.
 * Carregado sob demanda: o Chart.js só desce quando o gráfico aparece.
 */
export default function BarrasEmpilhadas({
  rotulos,
  series,
  descricao,
  altura = 220,
}: {
  rotulos: string[];
  series: { nome: string; cor: string; valores: number[] }[];
  descricao: string;
  altura?: number | string; // "100%": ocupa a altura que o cartão sobrar
}) {
  const css = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const secundario = css?.getPropertyValue("--texto-secundario").trim() || "#6c7293";
  const borda = css?.getPropertyValue("--borda").trim() || "#ebedf2";
  return (
    <div style={{ position: "relative", height: altura, minHeight: 180 }}>
      <Bar
        data={{
          labels: rotulos,
          datasets: series.map((s, i) => ({
            label: s.nome,
            data: s.valores,
            backgroundColor: s.cor,
            borderRadius: i === series.length - 1 ? 6 : 0,
            borderSkipped: false,
            maxBarThickness: 34,
          })),
        }}
        options={{
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: secundario, maxRotation: 0, autoSkip: false, font: { size: 11 } } },
            y: { stacked: true, beginAtZero: true, grid: { color: borda }, ticks: { color: secundario, precision: 0 } },
          },
          plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
        }}
        role="img"
        aria-label={descricao}
      />
    </div>
  );
}
