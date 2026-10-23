import { useState, type ReactNode } from "react";

/** As pendências de hoje agrupadas por bloco (Início e Turno): análises e leituras a fazer, com a situação e a data. */

export interface Pendencia {
  bloco: string;
  tipo: string;
  referencia: string;
  analise: string;
  prevista: string | null; // AAAA-MM-DD
  situacao: "Vence hoje" | "Atrasado";
}

const ITENS_ANTES_DE_RECOLHER = 8;

function dia(data: string | null): string {
  if (!data) return "";
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

export default function BlocosDePendencias({ itens, vazio }: { itens: Pendencia[]; vazio: ReactNode }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const blocos = itens.reduce<Record<string, Pendencia[]>>((grupos, item) => {
    (grupos[item.bloco] ??= []).push(item);
    return grupos;
  }, {});

  if (itens.length === 0) return <div className="cartao">{vazio}</div>;

  return (
    <>
      {Object.entries(blocos).map(([bloco, lista]) => {
        const mostrarTudo = abertos[bloco] || lista.length <= ITENS_ANTES_DE_RECOLHER;
        const visiveis = mostrarTudo ? lista : lista.slice(0, ITENS_ANTES_DE_RECOLHER);
        return (
          <div className="cartao bloco-pendencias" key={bloco}>
            <h2>
              {bloco} <span className="contador">{lista.length}</span>
            </h2>
            <ul className="lista-pendencias">
              {visiveis.map((item, n) => (
                <li key={`${item.referencia}-${item.analise}-${n}`}>
                  <div className="pendencia-texto">
                    <span className="pendencia-ref">{item.referencia}</span>
                    <span className="texto-secundario">
                      {item.analise}
                      {item.analise !== item.tipo && ` · ${item.tipo}`}
                    </span>
                  </div>
                  <div className="pendencia-situacao">
                    <span className={item.situacao === "Atrasado" ? "etiqueta etiqueta-nao-ok" : "etiqueta etiqueta-pendente"}>
                      {item.situacao}
                    </span>
                    <span className="texto-secundario">{dia(item.prevista)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {!mostrarTudo && (
              <button type="button" className="link-botao" onClick={() => setAbertos({ ...abertos, [bloco]: true })}>
                Mostrar todos ({lista.length})
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
