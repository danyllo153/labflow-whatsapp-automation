import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { lerJson } from "../api";
import type { DadosEstufas } from "../paginas/Estufas";

/**
 * As estufas do turno num cartão só, ao lado da equipe (layout do canvas, APP-056): a temperatura de cada uma, OK, Não ok
 * ou para conferir, e o aviso do Não ok que veio de antes ("desde 08:10"). Conferir continua na tela Estufas.
 */
export default function ResumoEstufas() {
  const [dados, setDados] = useState<DadosEstufas | null>(null);

  useEffect(() => {
    lerJson<DadosEstufas>("/estufas").then(setDados, () => setDados(null));
  }, []);

  if (!dados || dados.estufas.length === 0) return null;
  const alerta = dados.alertas?.[0];
  const naoOk = dados.resumo.nao_ok + (dados.alertas?.length ?? 0);

  return (
    <section className="cartao resumo-estufas" aria-label="Estufas agora">
      <h2>
        Estufas
        {naoOk > 0 ? (
          <span className="etiqueta etiqueta-nao-ok">
            {naoOk} não ok{alerta ? ` desde ${alerta.desde}` : ""}
          </span>
        ) : dados.resumo.pendentes > 0 ? (
          <span className="etiqueta etiqueta-pendente">{dados.resumo.pendentes} para conferir</span>
        ) : (
          <span className="etiqueta etiqueta-ok">Todas OK</span>
        )}
      </h2>
      <ul className="grade-estufas">
        {dados.estufas.map((e) => {
          const leitura = e.supervisorio ?? e.field_chart;
          return (
            <li key={e.id} className={`estufa-mini${e.status === "Não ok" ? " estufa-nao-ok" : ""}`}>
              <span className="texto-secundario">
                Estufa {e.id}
                {e.faixa && ` · ${e.faixa.minimo} a ${e.faixa.maximo} °C`}
              </span>
              <strong className="estufa-temperatura">{leitura?.temperatura ? `${leitura.temperatura} °C` : "—"}</strong>
              <span className={e.status === "Ok" ? "texto-ok" : e.status === "Não ok" ? "texto-nao-ok" : "texto-pendente"}>
                {e.status === "Pendente" ? "Conferir" : e.status}
              </span>
            </li>
          );
        })}
      </ul>
      <Link to="/estufas">{dados.resumo.pendentes > 0 ? "Conferir as estufas" : "Ver as estufas"}</Link>
    </section>
  );
}
