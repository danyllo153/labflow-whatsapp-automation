import { lazy, Suspense, useEffect, useState } from "react";

import { lerJson } from "../api";

/**
 * O que foi concluído nos últimos 7 dias (APP-055), no cartão azul do StarAdmin (26/10): o total grande, a linha de cada
 * dia e o total de cada tipo embaixo. Lê GET /painel/semana.
 */

export interface Semana {
  tipos: string[];
  dias: { dia: string; contagens: Record<string, number> }[];
  totais: Record<string, number>;
}

const LinhaDaSemana = lazy(() => import("./GraficosDoInicio").then((m) => ({ default: m.LinhaDaSemana })));
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

  return (
    <section className="cartao cartao-azul grafico-semana" aria-label="Concluído na semana">
      <h2>Concluído na semana</h2>
      <p className="cartao-azul-rotulo">Total dos últimos 7 dias</p>
      <p className="cartao-azul-numero">
        <span className="so-leitor">Total </span>
        {total}
      </p>
      <Suspense fallback={<p className="carregando">Montando o gráfico...</p>}>
        <LinhaDaSemana
          rotulos={semana.dias.map((d) => rotulo(d.dia))}
          valores={semana.dias.map((d) => semana.tipos.reduce((n, t) => n + d.contagens[t], 0))}
          descricao={`Concluído por dia na semana. ${descricao}`}
        />
      </Suspense>
      <ul className="tipos-da-semana">
        {semana.tipos.map((t) => (
          <li key={t}>
            <span>{t}</span>
            <b>{semana.totais[t]}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
