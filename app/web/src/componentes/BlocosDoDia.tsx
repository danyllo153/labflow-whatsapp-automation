import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { lerJson } from "../api";

/**
 * Os dois blocos do dia (pedido de 27/10): LEITURAS pendentes (ler a placa que está na estufa) e ANÁLISES pendentes (pôr
 * para incubar: caldo, espalhar, estriar, Stress, Normal, o drop no dia dele). Cada origem numa linha, bem resumida, com o
 * número de cada coisa; tocar no número leva à tela de digitar (aba Leituras) ou de fazer (o app da análise).
 * Lê GET /leituras/pendentes.
 */

export interface ItemPendente {
  rotulo: string;
  quantidade: number;
  unidade: string;
  atrasadas: number;
  caminho: string;
}

export interface GrupoPendente {
  grupo: string;
  detalhe: string;
  itens: ItemPendente[];
}

export interface Pendentes {
  leituras: GrupoPendente[];
  analises: GrupoPendente[];
}

function total(grupos: GrupoPendente[]): number {
  return grupos.reduce((n, g) => n + g.itens.reduce((m, i) => m + i.quantidade, 0), 0);
}

export function usePendentes(): Pendentes | null {
  const [dados, setDados] = useState<Pendentes | null>(null);
  useEffect(() => {
    lerJson<Pendentes>("/leituras/pendentes").then(setDados, () => setDados(null));
  }, []);
  return dados;
}

export function Bloco({ titulo, explicacao, grupos, vazio }: { titulo: string; explicacao: string; grupos: GrupoPendente[]; vazio: string }) {
  return (
    <section className="cartao bloco-do-dia" aria-label={titulo}>
      <div className="cabeca-cartao">
        <div>
          <h2>
            {titulo} <span className="contador">{total(grupos)}</span>
          </h2>
          <p className="texto-secundario">{explicacao}</p>
        </div>
      </div>
      {grupos.length === 0 ? (
        <p className="texto-secundario vazio-tabela">{vazio}</p>
      ) : (
        <ul className="grupos-do-dia">
          {grupos.map((g) => (
            <li key={g.grupo}>
              <span className="grupo-do-dia-nome">
                <strong>{g.grupo}</strong>
                {g.detalhe && <small className="texto-secundario"> · {g.detalhe}</small>}
              </span>
              <span className="itens-do-dia">
                {g.itens.map((i) => (
                  <Link
                    key={i.rotulo}
                    to={i.caminho}
                    className={`pilula-do-dia${i.atrasadas > 0 ? " com-atraso" : ""}`}
                    aria-label={`${g.grupo}: ${i.quantidade} ${i.unidade} de ${i.rotulo}${i.atrasadas ? `, ${i.atrasadas} atrasadas` : ""}`}
                  >
                    <b>{i.quantidade}</b> {i.unidade} {i.rotulo}
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function BlocosDoDia() {
  const dados = usePendentes();
  if (!dados) return null;
  return (
    <div className="blocos-do-dia">
      <Bloco
        titulo="Leituras pendentes"
        explicacao="Placas na estufa para ler hoje (e as atrasadas). Toque no número para digitar o resultado."
        grupos={dados.leituras}
        vazio="Nenhuma leitura pendente."
      />
      <Bloco
        titulo="Análises pendentes"
        explicacao="O que pôr para incubar hoje: caldo, espalhar, estriar, Stress, Normal e os drops do dia."
        grupos={dados.analises}
        vazio="Nenhuma análise pendente."
      />
    </div>
  );
}
