import { useEffect, useMemo, useState } from "react";
import { BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";

import { lerJson } from "../../api";

ChartJS.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/**
 * Painel dos tanques (pedido de 27/10): quantas coletas por semana, por mês ou por pessoa, com uma cor para cada mês
 * (a semana pega a cor do mês em que começa; por pessoa, as colunas empilham os meses). Lê GET /analises/tanques/coletas.
 */

interface ColetasDoDia {
  data: string; // AAAA-MM-DD
  pessoa: string;
  n: number;
}

type Forma = "semana" | "mes" | "pessoa";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// uma cor por mês do ano, legíveis no claro e no escuro
export const COR_DO_MES = ["#1f6fb5", "#e08a00", "#0f8b8d", "#7d5ba6", "#c2410c", "#2f9e44", "#d6336c", "#5a6677", "#1098ad", "#a07c00", "#6741d9", "#e8590c"];

const mesDe = (data: string) => data.slice(0, 7); // AAAA-MM
const rotuloDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
const corDoMes = (mes: string) => COR_DO_MES[Number(mes.slice(5, 7)) - 1];

/** Segunda-feira da semana da data (AAAA-MM-DD). */
export function inicioDaSemana(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** As barras de cada forma: rótulos e uma série por mês (semana e mês: uma cor por barra; pessoa: empilhado). */
type Grupos =
  | { tipo: "pessoa"; rotulos: string[]; series: { nome: string; cor: string; valores: number[] }[] }
  | { tipo: "periodo"; rotulos: string[]; cores: string[]; meses: string[]; valores: number[] };

export function agrupar(coletas: ColetasDoDia[], forma: Forma): Grupos {
  if (forma === "pessoa") {
    const meses = [...new Set(coletas.map((c) => mesDe(c.data)))].sort().slice(-6);
    const doPeriodo = coletas.filter((c) => meses.includes(mesDe(c.data)));
    const total = new Map<string, number>();
    doPeriodo.forEach((c) => total.set(c.pessoa, (total.get(c.pessoa) ?? 0) + c.n));
    const pessoas = [...total.keys()].sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0) || a.localeCompare(b, "pt-BR"));
    return {
      tipo: "pessoa",
      rotulos: pessoas,
      series: meses.map((m) => ({
        nome: rotuloDoMes(m),
        cor: corDoMes(m),
        valores: pessoas.map((p) => doPeriodo.filter((c) => c.pessoa === p && mesDe(c.data) === m).reduce((s, c) => s + c.n, 0)),
      })),
    };
  }
  const chave = forma === "semana" ? (c: ColetasDoDia) => inicioDaSemana(c.data) : (c: ColetasDoDia) => mesDe(c.data);
  const soma = new Map<string, number>();
  coletas.forEach((c) => soma.set(chave(c), (soma.get(chave(c)) ?? 0) + c.n));
  const chaves = [...soma.keys()].sort().slice(-12);
  return {
    tipo: "periodo",
    rotulos: chaves.map((k) => (forma === "semana" ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : rotuloDoMes(k))),
    cores: chaves.map((k) => corDoMes(mesDe(k))),
    meses: [...new Set(chaves.map((k) => mesDe(k)))],
    valores: chaves.map((k) => soma.get(k) ?? 0),
  };
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
  const datasets =
    grupos.tipo === "pessoa"
      ? grupos.series.map((s) => ({ label: s.nome, data: s.valores, backgroundColor: s.cor, borderRadius: 4, stack: "meses", maxBarThickness: 56 }))
      : [{ label: "Coletas", data: grupos.valores, backgroundColor: grupos.cores, borderRadius: 4, maxBarThickness: 56 }];
  const legenda = grupos.tipo === "pessoa" ? grupos.series.map((s) => [s.nome, s.cor]) : grupos.meses.map((m) => [rotuloDoMes(m), corDoMes(m)]);

  return (
    <section className="cartao grafico-resultado" aria-label="Coletas dos tanques">
      <div className="dashboard-topo">
        <div>
          <h2>Coletas de tanques {origem === "terra" ? "terra" : "de navio"}</h2>
          <span className="texto-secundario">
            {total} {total === 1 ? "coleta" : "coletas"} no último ano ·{" "}
            {forma === "semana" ? "últimas 12 semanas" : forma === "mes" ? "últimos 12 meses" : "últimos 6 meses, por quem coletou"}
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
                plugins: { legend: { display: false } },
                scales: {
                  x: { stacked: true, grid: { display: false }, ticks: { color: secundario } },
                  y: { stacked: true, beginAtZero: true, grid: { color: borda }, ticks: { color: secundario, precision: 0 } },
                },
              }}
              role="img"
              aria-label={`Coletas por ${forma === "mes" ? "mês" : forma}: ${grupos.rotulos.length} colunas`}
            />
          </div>
          <ul className="legenda-resultado" aria-label="Cor de cada mês" style={{ color: texto }}>
            {legenda.map(([nome, cor]) => (
              <li key={nome}>
                <i className="bola" style={{ background: cor }} /> {nome}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
