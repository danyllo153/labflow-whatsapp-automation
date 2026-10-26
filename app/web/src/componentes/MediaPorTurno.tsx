import { lazy, Suspense, useEffect, useState } from "react";

import { lerJson } from "../api";

/**
 * Média por turno (pedido de 26/10): quantas análises e esterilizações cada turno faz, em média, nos últimos 30 dias, num
 * relógio por turno, com o que o turno de hoje já fez. Lê GET /painel/turnos.
 */

export interface MediaDoTurno {
  turno: string;
  inicio: string;
  fim: string;
  analises: number;
  esterilizacoes: number;
  hoje_analises: number;
  hoje_esterilizacoes: number;
  agora: boolean;
}

const RelogioDoTurno = lazy(() => import("./GraficosDoInicio").then((m) => ({ default: m.RelogioDoTurno })));

function numero(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export default function MediaPorTurno() {
  const [dados, setDados] = useState<{ dias: number; turnos: MediaDoTurno[] } | null>(null);

  useEffect(() => {
    lerJson<{ dias: number; turnos: MediaDoTurno[] }>("/painel/turnos").then(setDados, () => setDados(null));
  }, []);

  if (!dados) return null;
  const maxA = Math.max(1, ...dados.turnos.map((t) => Math.max(t.analises, t.hoje_analises)));
  const maxE = Math.max(1, ...dados.turnos.map((t) => Math.max(t.esterilizacoes, t.hoje_esterilizacoes)));
  return (
    <section className="cartao media-por-turno" aria-label="Média por turno">
      <div className="cabeca-cartao">
        <div>
          <h2>Média por turno</h2>
          <p className="texto-secundario">Análises e esterilizações por turno, últimos {dados.dias} dias</p>
        </div>
        <ul className="legenda-pontos">
          <li style={{ ["--cor" as string]: "#1F3BB3" }}>Análises</li>
          <li style={{ ["--cor" as string]: "#34B1AA" }}>Esterilizações</li>
        </ul>
      </div>
      <div className="relogios">
        {dados.turnos.map((t) => (
          <div key={t.turno} className={`relogio-turno${t.agora ? " agora" : ""}`}>
            <div className="relogio">
              <Suspense fallback={null}>
                <RelogioDoTurno
                  analises={t.analises}
                  esterilizacoes={t.esterilizacoes}
                  maxAnalises={maxA}
                  maxEsterilizacoes={maxE}
                  descricao={`${t.turno}: média de ${numero(t.analises)} análises e ${numero(t.esterilizacoes)} esterilizações por turno`}
                />
              </Suspense>
              <div className="relogio-centro">
                <b>{numero(t.analises)}</b>
                <small>análises</small>
              </div>
            </div>
            <p className="relogio-nome">
              {t.turno} {t.agora && <span className="etiqueta etiqueta-no-prazo">agora</span>}
            </p>
            <p className="texto-secundario relogio-detalhe">
              {numero(t.esterilizacoes)} esterilizações · {t.inicio} às {t.fim}
              <br />
              hoje: {t.hoje_analises} análises, {t.hoje_esterilizacoes} esterilizações
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
