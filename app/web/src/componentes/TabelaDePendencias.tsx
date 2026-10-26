import { Link } from "react-router-dom";

import { agrupar, resumoDos, type Pendencia } from "./BlocosDePendencias";
import { destinoDe } from "./CartaoAgora";
import IconeApp from "./IconeApp";

/**
 * As pendências do Início numa tabela do modelo StarAdmin (26/10): uma linha por grupo (o que se faz junto), com o ícone
 * da análise, o que é (os primeiros tanques, loads ou compostas), quantos, a situação e o atalho para o app. O Início
 * separa o que é para ANALISAR (plaquear, espalhar, confirmar, drops) do que é para LER no dia (placas na estufa).
 */

export type Tipo = "analisar" | "ler" | "desvio";

/** Para ler: as placas que vencem (C.T/B.L, leituras de tanque, águas e superfícies, TAB/Coliformes "para ler"). */
export function tipoDa(p: Pendencia): Tipo {
  if (p.bloco === "Desvios") return "desvio";
  if (p.tipo === "C.T/B.L" || p.tipo === "Leitura de NFC" || p.bloco === "Águas e superfícies" || /para ler/.test(p.analise)) return "ler";
  return "analisar";
}

// o ícone e a cor da família de cada bloco (as mesmas do menu e da grade de Análises)
const VISUAL: Record<string, { icone: string; cor: string }> = {
  "FCOJ Recebimento": { icone: "recebimento-fcoj", cor: "fcoj" },
  "FCOJ Embarque": { icone: "embarque-fcoj", cor: "embarque" },
  "NFC Tank farm": { icone: "tanques", cor: "nfc" },
  "NFC Navio": { icone: "tanques", cor: "nfc" },
  "Recebimento NFC": { icone: "recebimento-nfc", cor: "nfc-receb" },
  "Águas e superfícies": { icone: "agua", cor: "agua" },
  Desvios: { icone: "desvios", cor: "desvios" },
};

function visualDo(p: Pendencia): { icone: string; cor: string } {
  if (/^TAB/.test(p.analise) || p.tipo === "TAB") return { icone: "tab", cor: "tab" };
  if (/^Coliformes/.test(p.analise) || p.tipo === "Coliformes") return { icone: "coliformes", cor: "coli" };
  if (p.tipo === "Drop") return { icone: "drops", cor: "drops" };
  return VISUAL[p.bloco] ?? { icone: "visao-geral", cor: "geral" };
}

interface Linha {
  chave: string;
  nome: string;
  bloco: string;
  itens: Pendencia[];
  atrasados: number;
  hoje: number;
}

/** As linhas da tabela: os grupos de todos os blocos, os com atraso primeiro. */
export function linhasDa(itens: Pendencia[]): Linha[] {
  const porBloco = new Map<string, Pendencia[]>();
  for (const p of itens) porBloco.set(p.bloco, [...(porBloco.get(p.bloco) ?? []), p]);
  const linhas = [...porBloco].flatMap(([bloco, lista]) =>
    agrupar(lista).map((g) => ({ chave: `${bloco}|${g.nome}`, nome: g.nome, bloco, itens: g.itens, atrasados: g.atrasados, hoje: g.hoje })),
  );
  return linhas.sort((a, b) => b.atrasados - a.atrasados || b.itens.length - a.itens.length);
}

export default function TabelaDePendencias({
  titulo,
  subtitulo,
  itens,
  limite,
  verTudo,
  vazio,
}: {
  titulo: string;
  subtitulo: string;
  itens: Pendencia[];
  limite?: number;
  verTudo?: () => void;
  vazio: string;
}) {
  const todas = linhasDa(itens);
  const linhas = limite ? todas.slice(0, limite) : todas;
  return (
    <section className="cartao cartao-tabela" aria-label={titulo}>
      <div className="cabeca-cartao">
        <div>
          <h2>
            {titulo} <span className="contador">{itens.length}</span>
          </h2>
          <p className="texto-secundario">{subtitulo}</p>
        </div>
        {verTudo && todas.length > linhas.length && (
          <button type="button" className="botao botao-simples botao-pequeno" onClick={verTudo}>
            Ver tudo ({todas.length})
          </button>
        )}
      </div>
      {linhas.length === 0 ? (
        <p className="texto-secundario vazio-tabela">{vazio}</p>
      ) : (
        <div className="tabela-rolavel">
          <table className="tabela-dados tabela-pendencias">
            <thead>
              <tr>
                <th>Análise</th>
                <th className="so-largo">O quê</th>
                <th className="numero-coluna">Qtd</th>
                <th>Situação</th>
                <th className="so-largo">
                  <span className="so-leitor">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const v = visualDo(l.itens[0]);
                const destino = destinoDe(l.itens[0]);
                return (
                  <tr key={l.chave}>
                    <td>
                      <span className="celula-analise">
                        <span className={`icone-quadrado app-cor-${v.cor}`} aria-hidden="true">
                          <IconeApp nome={v.icone} />
                        </span>
                        <span>
                          <Link className="nome-da-linha" to={destino.caminho}>
                            {l.nome}
                          </Link>
                          <small className="texto-secundario">{l.bloco}</small>
                        </span>
                      </span>
                    </td>
                    <td className="so-largo texto-secundario celula-refs">{resumoDos(l.itens)}</td>
                    <td className="numero-coluna">
                      <strong>{l.itens.length}</strong>
                    </td>
                    <td>
                      <span className="situacoes">
                        {l.atrasados > 0 && <span className="etiqueta etiqueta-nao-ok">{l.atrasados} atrasado{l.atrasados > 1 ? "s" : ""}</span>}
                        {l.hoje > 0 && <span className="etiqueta etiqueta-pendente">{l.hoje} para hoje</span>}
                      </span>
                    </td>
                    <td className="celula-acao so-largo">
                      <Link className="botao botao-principal botao-pequeno" to={destino.caminho} aria-label={`Abrir ${l.nome}`}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
