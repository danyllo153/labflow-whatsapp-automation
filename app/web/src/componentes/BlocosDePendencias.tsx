import { useState, type ReactNode } from "react";

/**
 * As pendências de hoje por bloco (Início e Turno). Dentro de cada bloco, o que se faz junto vira UM grupo com o número
 * (ex.: "TAB · para espalhar 20", "O.SKY 189 · Psicrotróficos Normal · Leitura final 4"); tocar no grupo abre a lista
 * das compostas, lotes ou tanques (pedido de 24/10: mais compacto, e dá para ter ideia de quantas coisas são).
 */

export interface Pendencia {
  bloco: string;
  tipo: string;
  referencia: string;
  analise: string;
  prevista: string | null; // AAAA-MM-DD
  situacao: "Vence hoje" | "Atrasado";
  grupo?: string; // da API (24/10); sem ele, o grupo é o tipo com a análise
  item?: string;
}

interface Grupo {
  nome: string;
  itens: Pendencia[];
  atrasados: number;
  hoje: number;
}

function dia(data: string | null): string {
  if (!data) return "";
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

/** Os primeiros tanques, lotes ou compostas do grupo numa linha, para ver sem precisar abrir (26/10). */
function resumoDos(itens: Pendencia[]): string {
  const nomes = [...new Set(itens.map((i) => i.item ?? i.referencia))];
  return nomes.length > 4 ? `${nomes.slice(0, 4).join(", ")} e mais ${nomes.length - 4}` : nomes.join(", ");
}

function agrupar(lista: Pendencia[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const p of lista) {
    const nome = p.grupo ?? (!p.analise || p.analise.startsWith(p.tipo) ? p.analise || p.tipo : `${p.tipo} · ${p.analise}`);
    const g = grupos.get(nome) ?? { nome, itens: [], atrasados: 0, hoje: 0 };
    g.itens.push(p);
    if (p.situacao === "Atrasado") g.atrasados += 1;
    else g.hoje += 1;
    grupos.set(nome, g);
  }
  // ordem fixa dentro do bloco (B.L 72h antes de B.L 120h; o navio junta as análises dele)
  return [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

export default function BlocosDePendencias({ itens, vazio }: { itens: Pendencia[]; vazio: ReactNode }) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const blocos = itens.reduce<Record<string, Pendencia[]>>((grupos, item) => {
    (grupos[item.bloco] ??= []).push(item);
    return grupos;
  }, {});

  if (itens.length === 0) return <div className="cartao">{vazio}</div>;

  return (
    <div className="grade-blocos">
      {Object.entries(blocos).map(([bloco, lista]) => (
        <div className="cartao bloco-pendencias" key={bloco}>
          <h2>
            {bloco} <span className="contador">{lista.length}</span>
          </h2>
          <ul className="lista-grupos">
            {agrupar(lista).map((g) => {
              const chave = `${bloco}|${g.nome}`;
              const aberto = abertos[chave] ?? false;
              return (
                <li key={g.nome}>
                  <button
                    type="button"
                    className="grupo-pendencia"
                    aria-expanded={aberto}
                    onClick={() => setAbertos({ ...abertos, [chave]: !aberto })}
                  >
                    <span className="grupo-numero">{g.itens.length}</span>
                    <span className="grupo-nome">
                      {g.nome}
                      {!aberto && <span className="grupo-refs">{resumoDos(g.itens)}</span>}
                    </span>
                    <span className="grupo-situacoes">
                      {g.atrasados > 0 && <span className="etiqueta etiqueta-nao-ok">{g.atrasados} atrasado{g.atrasados > 1 ? "s" : ""}</span>}
                      {g.hoje > 0 && <span className="etiqueta etiqueta-pendente">{g.hoje} para hoje</span>}
                    </span>
                    <span className="grupo-seta" aria-hidden="true">
                      {aberto ? "▾" : "▸"}
                    </span>
                  </button>
                  {aberto && (
                    <ul className="lista-pendencias">
                      {g.itens.map((item, n) => (
                        <li key={`${item.referencia}-${item.analise}-${n}`}>
                          <div className="pendencia-texto">
                            <span className="pendencia-ref">{item.item ?? item.referencia}</span>
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
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
