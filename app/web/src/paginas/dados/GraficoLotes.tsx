import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LogarithmicScale,
  PointElement,
  ScatterController,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import { Chart } from "react-chartjs-2";

import { lerJson } from "../../api";
import { corDaFabrica, FABRICAS } from "./definicoes";
import { formatar } from "./formatos";
import { coresDasSeries, diaDe, type PontoResultado } from "./GraficoResultado";

ChartJS.register(BarController, ScatterController, BarElement, PointElement, CategoryScale, LinearScale, LogarithmicScale, Tooltip, Legend, annotationPlugin);

/**
 * Gráfico do Recebimento FCOJ e do Embarque (pedido de 27/10, no lugar da "Tendência do resultado", que ninguém lia: quase
 * tudo é "<10" e os pontos caíam uns em cima dos outros, ligados por uma linha que juntava lotes diferentes). Duas vistas:
 * - Lotes por dia (ou semana): quantos lotes tiveram leitura naquele dia, Ok (verde) e Não ok (vermelho), ou por fábrica;
 *   tocar na coluna lista os lotes dela, com o resultado de cada análise lida;
 * - Leituras com crescimento: só as leituras com número (sem o "<10"), um ponto por leitura, sem linha, com o alerta.
 * Lê os mesmos pontos da tendência (GET {api}/resultados), com o filtro e a busca da página.
 */

interface Dados {
  alertas: Record<string, number>;
  pontos: PontoResultado[];
  cortado: boolean;
}

type Vista = "lotes" | "crescimento";
type Periodo = "dia" | "semana";
type Grupo = "situacao" | "fabrica";

interface LoteDoDia {
  chave: string;
  rotulo: string; // "43783 · lote 4" ou "O.SKY 189 · 43783 · A3"
  fabrica: string;
  naoOk: boolean;
  leituras: PontoResultado[];
}

const VERDE = "#16a34a";
const VERMELHO = "#d92d20";
const LARANJA = "#e8590c";
const DIA_MS = 86_400_000;

const textoDoDia = (dia: number) => formatar(new Date(dia * DIA_MS).toISOString().slice(0, 10), "data").slice(0, 5);
/** Segunda-feira da semana do dia (número de dias desde 1970). */
const segundaDe = (dia: number) => dia - ((new Date(dia * DIA_MS).getUTCDay() + 6) % 7);
const valorDe = (p: PontoResultado) => `${p.menor ? "<" : ""}${p.valor.toLocaleString("pt-BR")}`;

/** Os lotes lidos em cada dia (ou semana): um lote é Não ok no dia se alguma leitura dele, nesse dia, passou do alerta. */
export function lotesPorPeriodo(pontos: PontoResultado[], periodo: Periodo): Map<number, LoteDoDia[]> {
  const grupos = new Map<number, Map<string, LoteDoDia>>();
  for (const p of pontos) {
    const dia = diaDe(p.data);
    const chave = periodo === "semana" ? segundaDe(dia) : dia;
    const id = [p.navio ?? "", p.load ?? "", p.lote ?? "", p.ref ?? ""].join("|");
    const doPeriodo = grupos.get(chave) ?? new Map<string, LoteDoDia>();
    const lote = doPeriodo.get(id) ?? {
      chave: id,
      rotulo: [p.navio, p.load, p.lote && (p.navio ? p.lote : `lote ${p.lote}`), p.ref].filter(Boolean).join(" · "),
      fabrica: p.fabrica ?? "Sem fábrica",
      naoOk: false,
      leituras: [],
    };
    lote.naoOk ||= p.acima;
    lote.leituras.push(p);
    doPeriodo.set(id, lote);
    grupos.set(chave, doPeriodo);
  }
  return new Map([...grupos.entries()].sort(([a], [b]) => a - b).map(([k, v]) => [k, [...v.values()]]));
}

function token(nome: string, reserva: string): string {
  if (typeof window === "undefined") return reserva;
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || reserva;
}

export default function GraficoLotes({
  api,
  consulta,
  aoDesenhar,
}: {
  api: string;
  consulta: string;
  aoDesenhar?: (canvas: HTMLCanvasElement | null) => void;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [vista, setVista] = useState<Vista>("lotes");
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [grupo, setGrupo] = useState<Grupo>("situacao");
  const [aberta, setAberta] = useState<number | null>(null);
  // uma referência por tipo de gráfico (colunas e pontos): a impressão leva o que está na tela
  const graficoLotes = useRef<ChartJS<"bar"> | null>(null);
  const graficoCrescimento = useRef<ChartJS<"scatter"> | null>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    setAberta(null);
    lerJson<Dados>(`${api}/resultados${consulta ? `?${consulta}` : ""}`).then(
      (d) => vivo && (setDados(d), setErro("")),
      (e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível montar o gráfico."),
    );
    return () => {
      vivo = false;
    };
  }, [api, consulta]);

  const periodos = useMemo(() => (dados ? lotesPorPeriodo(dados.pontos, periodo) : new Map<number, LoteDoDia[]>()), [dados, periodo]);
  const crescimento = useMemo(() => (dados ? dados.pontos.filter((p) => !p.menor && p.valor > 0) : []), [dados]);

  useEffect(() => {
    aoDesenhar?.((vista === "lotes" ? graficoLotes.current?.canvas : graficoCrescimento.current?.canvas) ?? null);
  });

  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!dados) return <p className="carregando">Montando o gráfico...</p>;

  const texto = token("--texto", "#1d2733");
  const secundario = token("--texto-secundario", "#4a5565");
  const borda = token("--borda", "#e6eaf0");
  const cartao = token("--cartao", "#ffffff");
  const chaves = [...periodos.keys()];
  const rotulos = chaves.map((k) => (periodo === "semana" ? `sem. ${textoDoDia(k)}` : textoDoDia(k)));
  const totalLotes = [...periodos.values()].reduce((n, l) => n + l.length, 0);
  const totalNaoOk = [...periodos.values()].reduce((n, l) => n + l.filter((x) => x.naoOk).length, 0);

  // --- vista 1: lotes por dia/semana -------------------------------------------------------------------------------
  const fabricas = [...FABRICAS, "Sem fábrica"].filter((f) => [...periodos.values()].some((l) => l.some((x) => x.fabrica === f)));
  const dadosLotes: ChartData<"bar"> = {
    labels: rotulos,
    datasets:
      grupo === "situacao"
        ? [
            { label: "Ok", data: chaves.map((k) => periodos.get(k)!.filter((x) => !x.naoOk).length), backgroundColor: VERDE, stack: "s", borderRadius: 3, maxBarThickness: 40 },
            { label: "Não ok", data: chaves.map((k) => periodos.get(k)!.filter((x) => x.naoOk).length), backgroundColor: VERMELHO, stack: "s", borderRadius: 3, maxBarThickness: 40 },
          ]
        : fabricas.map((f) => ({
            label: f,
            data: chaves.map((k) => periodos.get(k)!.filter((x) => x.fabrica === f).length),
            backgroundColor: corDaFabrica(f),
            stack: "s",
            borderRadius: 3,
            maxBarThickness: 40,
          })),
  };
  const opcoesLotes: ChartOptions<"bar"> = {
    maintainAspectRatio: false,
    animation: false,
    onClick: (_e, elementos) => elementos[0] && setAberta(chaves[elementos[0].index]),
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: secundario, maxRotation: 0, autoSkipPadding: 12 } },
      y: { stacked: true, beginAtZero: true, grid: { color: borda }, title: { display: true, text: "lotes", color: secundario }, ticks: { color: secundario, precision: 0 } },
    },
    plugins: {
      legend: { position: "top", align: "start", labels: { color: texto, usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          title: (itens) => `${periodo === "semana" ? "Semana de " : ""}${rotulos[itens[0].dataIndex]}`,
          footer: (itens) => {
            const lotes = periodos.get(chaves[itens[0].dataIndex]) ?? [];
            return `${lotes.length} lotes · ${lotes.filter((x) => x.naoOk).length} não ok · toque para ver`;
          },
        },
      },
    },
  };

  // --- vista 2: leituras com crescimento -----------------------------------------------------------------------------
  const analises = [...new Set(crescimento.map((p) => p.analise))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cores = coresDasSeries(analises);
  const dadosCrescimento: ChartData<"scatter"> = {
    datasets: analises.map((a, i) => {
      const pontos = crescimento.filter((p) => p.analise === a);
      return {
        label: a,
        data: pontos.map((p) => ({ x: diaDe(p.data), y: p.valor })),
        backgroundColor: pontos.map((p) => (p.acima ? LARANJA : cores[i])),
        borderColor: pontos.map((p) => (p.acima ? cartao : cores[i])),
        pointRadius: pontos.map((p) => (p.acima ? 7 : 5)),
        pointHoverRadius: 8,
      };
    }),
  };
  const anotacoes: Record<string, object> = {};
  const porAlerta = new Map<number, string[]>();
  analises.forEach((a) => dados.alertas[a] && porAlerta.set(dados.alertas[a], [...(porAlerta.get(dados.alertas[a]) ?? []), a]));
  porAlerta.forEach((nomes, valor) => {
    anotacoes[`alerta${valor}`] = {
      type: "line", yMin: valor, yMax: valor, borderColor: LARANJA, borderWidth: 2, borderDash: [6, 4],
      label: { display: true, content: `Alerta ${nomes.join(", ")} · ${valor.toLocaleString("pt-BR")}`, position: "start", backgroundColor: cartao, color: LARANJA, font: { size: 11, weight: "bold" }, padding: 3 },
    };
  });
  const maior = Math.max(10, ...crescimento.map((p) => p.valor), ...[...porAlerta.keys()]);
  const opcoesCrescimento: ChartOptions<"scatter"> = {
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: { type: "linear", grid: { display: false }, ticks: { color: secundario, stepSize: 1, maxRotation: 0, autoSkipPadding: 16, callback: (v) => textoDoDia(Number(v)) } },
      y: {
        type: "logarithmic", min: 1, max: 10 ** Math.ceil(Math.log10(maior * 1.5)), grid: { color: borda },
        title: { display: true, text: "UFC/mL (com diluição)", color: secundario }, ticks: { color: secundario },
      },
    },
    plugins: {
      legend: { position: "top", align: "start", labels: { color: texto, usePointStyle: true, boxWidth: 8 } },
      annotation: { annotations: anotacoes },
      tooltip: {
        callbacks: {
          title: (itens) => {
            const p = crescimento.filter((x) => x.analise === analises[itens[0].datasetIndex])[itens[0].dataIndex];
            return `${p.analise} · ${formatar(p.data, "data")}`;
          },
          label: (item) => {
            const p = crescimento.filter((x) => x.analise === analises[item.datasetIndex])[item.dataIndex];
            return [`${valorDe(p)}${p.acima ? " · acima do alerta" : ""}`, [p.navio, p.load && `Load ${p.load}`, p.lote && `lote ${p.lote}`, p.fabrica].filter(Boolean).join(" · ")];
          },
        },
      },
    },
  };

  const lotesAbertos = aberta !== null ? periodos.get(aberta) ?? [] : [];

  return (
    <section className="cartao grafico-resultado" aria-label="Gráfico dos lotes">
      <div className="dashboard-topo">
        <div>
          <h2>{vista === "lotes" ? "Lotes lidos" : "Leituras com crescimento"}</h2>
          <span className="texto-secundario">
            {vista === "lotes"
              ? `${totalLotes} lotes com leitura · ${totalNaoOk} não ok · toque numa coluna para ver os lotes`
              : `${crescimento.length} leituras com número (o "<10" fica de fora)`}
          </span>
        </div>
        <div role="group" aria-label="O que mostrar" className="seletor-segmentado">
          <button type="button" aria-pressed={vista === "lotes"} onClick={() => setVista("lotes")}>
            Lotes por {periodo}
          </button>
          <button type="button" aria-pressed={vista === "crescimento"} onClick={() => setVista("crescimento")}>
            Com crescimento
          </button>
        </div>
        {vista === "lotes" && (
          <>
            <div role="group" aria-label="Agrupar" className="seletor-segmentado">
              <button type="button" aria-pressed={grupo === "situacao"} onClick={() => setGrupo("situacao")}>
                Ok / Não ok
              </button>
              <button type="button" aria-pressed={grupo === "fabrica"} onClick={() => setGrupo("fabrica")}>
                Por fábrica
              </button>
            </div>
            <div role="group" aria-label="Período" className="seletor-segmentado">
              <button type="button" aria-pressed={periodo === "dia"} onClick={() => (setPeriodo("dia"), setAberta(null))}>
                Dia
              </button>
              <button type="button" aria-pressed={periodo === "semana"} onClick={() => (setPeriodo("semana"), setAberta(null))}>
                Semana
              </button>
            </div>
          </>
        )}
      </div>
      {vista === "lotes" &&
        (totalLotes === 0 ? (
          <p className="texto-secundario">Nenhum lote lido com esse filtro.</p>
        ) : (
          <div className="grafico-resultado-area grafico-lotes-area">
            <Chart ref={graficoLotes} type="bar" data={dadosLotes} options={opcoesLotes} role="img" aria-label={`Lotes lidos por ${periodo}: ${totalLotes} lotes, ${totalNaoOk} não ok`} />
          </div>
        ))}
      {vista === "crescimento" &&
        (crescimento.length === 0 ? (
          <p className="texto-secundario">Nenhuma leitura com crescimento: tudo &lt;10 com esse filtro.</p>
        ) : (
          <div className="grafico-resultado-area">
            <Chart ref={graficoCrescimento} type="scatter" data={dadosCrescimento} options={opcoesCrescimento} role="img" aria-label={`Leituras com crescimento: ${crescimento.length}`} />
          </div>
        ))}
      {vista === "lotes" && aberta !== null && (
        <div className="lotes-da-coluna" aria-label="Lotes da coluna">
          <h3>
            {periodo === "semana" ? "Semana de " : ""}
            {textoDoDia(aberta)} <span className="contador">{lotesAbertos.length}</span>
            <button type="button" className="link-botao" onClick={() => setAberta(null)}>
              fechar
            </button>
          </h3>
          <ul>
            {[...lotesAbertos].sort((a, b) => Number(b.naoOk) - Number(a.naoOk) || a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true })).map((l) => (
              <li key={l.chave}>
                <strong>{l.rotulo}</strong> <span className="texto-secundario">{l.fabrica}</span>{" "}
                {l.leituras.map((p) => (
                  <span key={`${p.analise}-${p.data}`} className={p.acima ? "contagem-nao-ok" : "texto-secundario"}>
                    {" "}· {p.analise} {valorDe(p)}
                  </span>
                ))}
                <span className={`etiqueta ${l.naoOk ? "etiqueta-nao-ok" : "etiqueta-ok"}`}>{l.naoOk ? "Não ok" : "Ok"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dados.cortado && <p className="texto-secundario">Mostrando as últimas leituras: filtre um período menor para ver tudo.</p>}
    </section>
  );
}
