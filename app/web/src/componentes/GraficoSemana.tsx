import { lazy, Suspense, useEffect, useState } from "react";

import { lerJson } from "../api";

/**
 * O que foi concluído em cada um dos últimos 7 dias, por tipo, em colunas empilhadas, com a legenda e os totais em cima
 * (visual repaginado, APP-055). Lê GET /painel/semana. As cores são as dos blocos do Início.
 */

export interface Semana {
  tipos: string[];
  dias: { dia: string; contagens: Record<string, number> }[];
  totais: Record<string, number>;
}

// as mesmas cores da legenda (classes serie-*), para o gráfico de colunas do Chart.js (26/10)
const COR: Record<string, string> = { TAB: "#1572e8", Coliformes: "#f3802b", NFC: "#1aa39a", "C.T/B.L": "#6861ce" };
const OUTRAS = ["#48abf7", "#f25961", "#ffad46"];
const BarrasEmpilhadas = lazy(() => import("./BarrasEmpilhadas"));
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function rotulo(dia: string): string {
  const d = new Date(`${dia}T12:00:00`);
  return `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`;
}

export default function GraficoSemana() {
  const [semana, setSemana] = useState<Semana | null>(null);

  useEffect(() => {
    lerJson<Semana>("/painel/semana").then(setSemana, () => setSemana(null));
  }, []);

  if (!semana) return null;
  const total = semana.tipos.reduce((s, t) => s + semana.totais[t], 0);
  const descricao = semana.dias
    .map((d) => `${rotulo(d.dia)}: ${semana.tipos.map((t) => `${d.contagens[t]} ${t}`).join(", ")}`)
    .join("; ");

  // título e legenda em cima, colunas embaixo com a largura toda (26/10): cabe na coluna estreita sem quebrar
  return (
    <section className="cartao grafico-semana" aria-label="Concluído na semana">
      <div className="grafico-semana-topo">
        <h2>Concluído na semana</h2>
        <span className="contador">Total {total}</span>
      </div>
      <ul className="grafico-semana-legenda">
        {semana.tipos.map((t, n) => (
          <li key={t}>
            <span className="ponto-legenda" style={{ background: COR[t] ?? OUTRAS[n % OUTRAS.length] }} aria-hidden="true" />
            <span className="legenda-nome">{t}</span>
            <span className="legenda-valor">{semana.totais[t]}</span>
          </li>
        ))}
      </ul>
      <div className="grafico-semana-colunas">
        <Suspense fallback={<p className="carregando">Montando o gráfico...</p>}>
          <BarrasEmpilhadas
            rotulos={semana.dias.map((d) => rotulo(d.dia))}
            series={semana.tipos.map((t, n) => ({ nome: t, cor: COR[t] ?? OUTRAS[n % OUTRAS.length], valores: semana.dias.map((d) => d.contagens[t]) }))}
            descricao={`Concluído por dia na semana. ${descricao}`}
            altura="100%"
          />
        </Suspense>
      </div>
    </section>
  );
}
