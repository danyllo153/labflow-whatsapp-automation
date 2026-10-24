import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { lerJson } from "../api";

/**
 * Cartão no pé do menu lateral (visual repaginado, APP-055): a folha de laudo mais perto de encher, ou as folhas cheias
 * esperando impressão, com o atalho para o laudo. Lê GET /painel/folhas (a mais urgente vem primeiro).
 */

export interface Folha {
  laudo: string;
  titulo: string;
  caminho: string;
  linhas: number;
  capacidade: number;
  cheias: number;
}

export default function CartaoFolhas() {
  const [folhas, setFolhas] = useState<Folha[] | null>(null);
  const local = useLocation();

  useEffect(() => {
    lerJson<Folha[]>("/painel/folhas").then(setFolhas, () => setFolhas(null));
  }, [local.pathname]);

  const folha = folhas?.[0];
  if (!folha) return null;
  const cheias = folhas.reduce((s, f) => s + f.cheias, 0);
  const faltam = folha.capacidade - folha.linhas;
  // a folha de incubação enche por dia, e a do recebimento por lote
  const unidade = folha.laudo === "incubacao" ? "dia" : folha.laudo === "recebimento-fcoj" ? "lote" : "linha";
  const porcento = Math.round((folha.linhas / folha.capacidade) * 100);

  return (
    <div className="cartao-folhas" aria-label="Folhas dos laudos">
      <div className="cartao-folhas-titulo">{cheias > 0 ? "Laudos para imprimir" : "Próxima folha a fechar"}</div>
      <div className="cartao-folhas-texto">
        {cheias > 0
          ? `${cheias} folha${cheias > 1 ? "s" : ""} cheia${cheias > 1 ? "s" : ""} esperando impressão (${folha.titulo}).`
          : `${folha.titulo}: falta${faltam > 1 ? "m" : ""} ${faltam} ${unidade}${faltam > 1 ? "s" : ""}.`}
      </div>
      {cheias === 0 && (
        <div className="cartao-folhas-barra">
          <div className="barra-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={folha.capacidade} aria-valuenow={folha.linhas} aria-label={unidade === "dia" ? "Dias preenchidos" : unidade === "lote" ? "Lotes preenchidos" : "Linhas preenchidas"}>
            <div className="barra-cheia" style={{ width: `${porcento}%` }} />
          </div>
          <span>
            {folha.linhas} / {folha.capacidade}
          </span>
        </div>
      )}
      <Link to={folha.caminho} className="botao botao-principal cartao-folhas-botao">
        Ver o laudo
      </Link>
    </div>
  );
}
