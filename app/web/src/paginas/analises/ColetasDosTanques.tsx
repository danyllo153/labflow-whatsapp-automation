import { useEffect, useMemo, useState } from "react";
import { BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";

import { lerJson } from "../../api";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/**
 * Painel dos tanques (pedido de 27/10): quantas coletas por semana, por mês ou por pessoa, e cada coluna empilhada por
 * tanque (terra) ou navio, uma cor clara para cada (o 43 coletado 4 vezes na semana sobe 4). Os 10 que mais aparecem têm
 * cor própria; o resto vai para "Outros". Lê GET /analises/tanques/coletas.
 */

interface ColetasDoDia {
  data: string; // AAAA-MM-DD
  pessoa: string;
  alvo?: string; // o tanque ou o navio
  n: number;
}

type Forma = "semana" | "mes" | "pessoa";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// tons claros (pedido de 27/10: nada de marrom; começa no verde claro), legíveis no claro e no escuro
export const CORES_CLARAS = ["#7fd3a8", "#8cc8f2", "#f6c97f", "#b9a8ef", "#f3a6b8", "#86d4d6", "#bfe08a", "#f4b993", "#a8bff2", "#dcb1e6"];
const COR_DOS_OUTROS = "#c8d0da";
const MAX_SERIES = 10;

const mesDe = (data: string) => data.slice(0, 7); // AAAA-MM
const rotuloDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/** Segunda-feira da semana da data (AAAA-MM-DD). */
export function inicioDaSemana(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** As colunas (semana, mês ou pessoa) e uma série por tanque ou navio, empilhadas. */
export interface Grupos {
  rotulos: string[];
  series: { nome: string; cor: string; valores: number[] }[];
}

export function agrupar(coletas: ColetasDoDia[], forma: Forma): Grupos {
  let chaves: string[];
  let chave: (c: ColetasDoDia) => string;
  let rotulo: (k: string) => string;
  let dados = coletas;
  if (forma === "pessoa") {
    const meses = [...new Set(coletas.map((c) => mesDe(c.data)))].sort().slice(-6);
    dados = coletas.filter((c) => meses.includes(mesDe(c.data)));
    const total = new Map<string, number>();
    dados.forEach((c) => total.set(c.pessoa, (total.get(c.pessoa) ?? 0) + c.n));
    chaves = [...total.keys()].sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0) || a.localeCompare(b, "pt-BR"));
    chave = (c) => c.pessoa;
    rotulo = (k) => k;
  } else {
    chave = forma === "semana" ? (c) => inicioDaSemana(c.data) : (c) => mesDe(c.data);
    chaves = [...new Set(coletas.map(chave))].sort().slice(-12);
    dados = coletas.filter((c) => chaves.includes(chave(c)));
    rotulo = forma === "semana" ? (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}` : rotuloDoMes;
  }
  const porAlvo = new Map<string, number>();
  dados.forEach((c) => porAlvo.set(c.alvo || "-", (porAlvo.get(c.alvo || "-") ?? 0) + c.n));
  const alvos = [...porAlvo.keys()].sort(
    (a, b) => (porAlvo.get(b) ?? 0) - (porAlvo.get(a) ?? 0) || a.localeCompare(b, "pt-BR", { numeric: true }),
  );
  const proprios = alvos.slice(0, MAX_SERIES);
  const somar = (filtro: (c: ColetasDoDia) => boolean) =>
    chaves.map((k) => dados.filter((c) => chave(c) === k && filtro(c)).reduce((s, c) => s + c.n, 0));
  const series = proprios.map((a, i) => ({ nome: a, cor: CORES_CLARAS[i % CORES_CLARAS.length], valores: somar((c) => (c.alvo || "-") === a) }));
  if (alvos.length > MAX_SERIES) series.push({ nome: "Outros", cor: COR_DOS_OUTROS, valores: somar((c) => !proprios.includes(c.alvo || "-")) });
  return { rotulos: chaves.map(rotulo), series };
}

function token(nome: string, reserva: string): string {
  if (typeof window === "undefined") return reserva;
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || reserva;
}

export default function ColetasDosTanques({ origem }: { origem: "terra" | "navio" }) {
  const [coletas, setColetas] = useState<ColetasDoDia[] | null>(null);
  const [erro, setErro] = useState("");
  const [forma, setForma] = useState<Forma>("semana");

  useEffect(() => {
    let vivo = true;
    lerJson<ColetasDoDia[]>(`/analises/tanques/coletas?origem=${origem}`).then(
      (c) => vivo && setColetas(c),
      (e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível montar o gráfico."),
    );
    return () => {
      vivo = false;
    };
  }, [origem]);

  const grupos = useMemo(() => (coletas ? agrupar(coletas, forma) : null), [coletas, forma]);

  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!coletas || !grupos) return <p className="carregando">Carregando...</p>;

  const secundario = token("--texto-secundario", "#4a5565");
  const borda = token("--borda", "#e6eaf0");
  const texto = token("--texto", "#1d2733");
  const total = coletas.reduce((s, c) => s + c.n, 0);
  const datasets = grupos.series.map((s) => ({ label: s.nome, data: s.valores, backgroundColor: s.cor, borderRadius: 3, stack: "alvos", maxBarThickness: 44 }));
  const quem = origem === "terra" ? "tanque" : "navio";

  return (
    <section className="cartao grafico-resultado grafico-compacto" aria-label="Coletas dos tanques">
      <div className="dashboard-topo">
        <div>
          <h2>Coletas de tanques {origem === "terra" ? "terra" : "de navio"}</h2>
          <span className="texto-secundario">
            {total} {total === 1 ? "coleta" : "coletas"} no último ano ·{" "}
            {forma === "semana" ? "últimas 12 semanas" : forma === "mes" ? "últimos 12 meses" : "últimos 6 meses, por quem coletou"} · uma cor por {quem}
          </span>
        </div>
        <div role="group" aria-label="Agrupar por" className="seletor-segmentado">
          {(
            [
              ["semana", "Semana"],
              ["mes", "Mês"],
              ["pessoa", "Pessoa"],
            ] as const
          ).map(([f, rotulo]) => (
            <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {total === 0 ? (
        <p className="texto-secundario">Nenhuma coleta no último ano.</p>
      ) : (
        <>
          <div className="grafico-resultado-area">
            <Bar
              data={{ labels: grupos.rotulos, datasets }}
              options={{
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${quem === "tanque" ? "Tanque " : ""}${c.dataset.label}: ${c.parsed.y}` } } },
                scales: {
                  x: { stacked: true, grid: { display: false }, ticks: { color: secundario } },
                  y: { stacked: true, beginAtZero: true, grid: { color: borda }, ticks: { color: secundario, precision: 0 } },
                },
              }}
              role="img"
              aria-label={`Coletas por ${forma === "mes" ? "mês" : forma}: ${grupos.rotulos.length} colunas`}
            />
          </div>
          <ul className="legenda-resultado" aria-label={`Cor de cada ${quem}`} style={{ color: texto }}>
            {grupos.series.map((s) => (
              <li key={s.nome}>
                <i className="bola" style={{ background: s.cor }} /> {quem === "tanque" && s.nome !== "Outros" ? `Tanque ${s.nome}` : s.nome}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
