import { ArcElement, CategoryScale, Chart as ChartJS, DoughnutController, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";

ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, DoughnutController, ArcElement);

/**
 * Os dois gráficos do Início no jeito do StarAdmin (26/10), carregados sob demanda: a linha suave do cartão azul
 * "Concluído na semana" e o relógio de cada turno (meia-lua de 270°: anel de fora as análises, de dentro as
 * esterilizações, cheio na média mais alta dos turnos).
 */

export function LinhaDaSemana({ rotulos, valores, descricao }: { rotulos: string[]; valores: number[]; descricao: string }) {
  return (
    <div className="linha-da-semana">
      <Line
        data={{
          labels: rotulos,
          datasets: [{ data: valores, borderColor: "#52CDFF", borderWidth: 2, tension: 0.4, pointRadius: 3, pointBackgroundColor: "#52CDFF", fill: false }],
        }}
        options={{
          animation: false,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { displayColors: false } },
          scales: {
            x: { grid: { display: false }, border: { display: false }, ticks: { color: "rgba(255,255,255,0.7)", font: { size: 11 } } },
            y: { display: false, beginAtZero: true },
          },
        }}
        role="img"
        aria-label={descricao}
      />
    </div>
  );
}

export function RelogioDoTurno({
  analises,
  esterilizacoes,
  maxAnalises,
  maxEsterilizacoes,
  descricao,
}: {
  analises: number;
  esterilizacoes: number;
  maxAnalises: number;
  maxEsterilizacoes: number;
  descricao: string;
}) {
  const css = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const vazio = css?.getPropertyValue("--linha-suave").trim() || "#ececf2";
  const resto = (v: number, max: number) => Math.max(max - v, max === 0 ? 1 : 0);
  return (
    <Doughnut
      data={{
        datasets: [
          { data: [analises, resto(analises, maxAnalises)], backgroundColor: ["#1F3BB3", vazio], borderWidth: 0, borderRadius: 6, circumference: 270, rotation: 225 },
          { data: [esterilizacoes, resto(esterilizacoes, maxEsterilizacoes)], backgroundColor: ["#34B1AA", vazio], borderWidth: 0, borderRadius: 6, circumference: 270, rotation: 225, weight: 0.6 },
        ],
      }}
      options={{ animation: false, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { display: false }, tooltip: { enabled: false } } }}
      role="img"
      aria-label={descricao}
    />
  );
}
