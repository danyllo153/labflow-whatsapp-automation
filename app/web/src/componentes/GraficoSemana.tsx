import { useEffect, useState } from "react";

import { lerJson } from "../api";

/**
 * O que foi concluído em cada um dos últimos 7 dias, por tipo, em colunas empilhadas, com a legenda e os totais ao lado
 * (visual repaginado, APP-055). Lê GET /painel/semana. As cores são as dos blocos do Início.
 */

export interface Semana {
  tipos: string[];
  dias: { dia: string; contagens: Record<string, number> }[];
  totais: Record<string, number>;
}

const CLASSE: Record<string, string> = { TAB: "serie-azul", Coliformes: "serie-laranja", NFC: "serie-verde", "C.T/B.L": "serie-marinho" };
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
  const maior = Math.max(1, ...semana.dias.map((d) => semana.tipos.reduce((s, t) => s + d.contagens[t], 0)));
  const descricao = semana.dias
    .map((d) => `${rotulo(d.dia)}: ${semana.tipos.map((t) => `${d.contagens[t]} ${t}`).join(", ")}`)
    .join("; ");

  return (
    <section className="cartao grafico-semana" aria-label="Concluído na semana">
      <div className="grafico-semana-corpo">
        <div className="grafico-semana-colunas" role="img" aria-label={`Concluído por dia na semana. ${descricao}`}>
          {semana.dias.map((d) => (
            <div key={d.dia} className="coluna-dia">
              <div className="pilha" aria-hidden="true">
                {[...semana.tipos].reverse().map((t) =>
                  d.contagens[t] > 0 ? (
                    <div key={t} className={`fatia ${CLASSE[t] ?? ""}`} style={{ height: `${(d.contagens[t] / maior) * 100}%` }} />
                  ) : null,
                )}
              </div>
              <span className="dia-rotulo">{rotulo(d.dia)}</span>
            </div>
          ))}
        </div>
        <ul className="grafico-semana-legenda">
          <li className="legenda-titulo">Concluído nos últimos 7 dias</li>
          {semana.tipos.map((t) => (
            <li key={t}>
              <span className={`ponto-legenda ${CLASSE[t] ?? ""}`} aria-hidden="true" />
              <span className="legenda-nome">{t}</span>
              <span className="legenda-valor">{semana.totais[t]}</span>
            </li>
          ))}
          <li className="legenda-total">
            <span className="legenda-nome">Total</span>
            <span className="legenda-valor">{total}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
