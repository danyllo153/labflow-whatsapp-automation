import { useEffect, useState } from "react";

import { lerJson } from "../api";
import { ConferenciaEstufas, type DadosEstufas } from "../paginas/Estufas";

/**
 * As estufas do turno num cartão só, ao lado da equipe (layout do canvas, APP-056): a temperatura de cada uma, OK, Não ok
 * ou para conferir, e o aviso do Não ok que veio de antes ("desde 08:10"). Conferir é ali mesmo: uma linha por estufa, com Ok e Não ok (25/10).
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
    <section className="cartao resumo-estufas" aria-label="Estufas agora" id="estufas">
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
      <ConferenciaEstufas embutida aoMudar={setDados} />
    </section>
  );
}
