import { Link } from "react-router-dom";

/**
 * Registros diários (APP-043): os laudos de rastreio do dia a dia num lugar só. Cada um se preenche com o que o
 * laboratório registra (app, assistente ou bot) e vira o PDF oficial para imprimir e assinar. O laudo de ciclos de
 * esterilização fica na própria Esterilização; água do processo e limpeza de superfícies (baias e linhas) são análises e
 * ficam na aba Páginas (24/10). Ordem e regras de cada laudo: rumo-do-app.md, "Laudos automáticos".
 */

interface Laudo {
  titulo: string;
  descricao: string;
  caminho?: string; // sem caminho: ainda não existe ("Em breve")
}

const LAUDOS: Laudo[] = [
  {
    titulo: "Material asséptico",
    descricao: "O que foi usado em cada dia de análise: ciclos de ponteiras, água de diluição e meios, e os lotes das placas.",
    caminho: "/material-asseptico",
  },
  {
    titulo: "Meio de cultura e fluxo laminar",
    descricao: "O branco do dia: as placas da capela e de cada meio em uso, para ver se cresceu algo.",
    caminho: "/fluxo-laminar",
  },
  {
    titulo: "Incubação e leitura",
    descricao: "Um dia de incubação por linha: as amostras, os lotes dos meios e as datas de leitura. Depende de uma resposta da sessão do bot (PB10).",
  },
  {
    titulo: "Meios de cultura (lotes)",
    descricao: "Recebimento e aceitação de cada lote de OSA, PDA, PCA e Wort, e o lote em uso.",
    caminho: "/meios-lotes",
  },
];

export default function RegistrosDiarios() {
  return (
    <section>
      <h1>Registros diários</h1>
      <p className="texto-secundario">
        Os laudos de rastreio se preenchem com o que é registrado no dia e saem no modelo oficial, prontos para imprimir e
        assinar. O laudo de ciclos fica na <Link to="/esterilizacao">Esterilização</Link>.
      </p>
      <div className="grade-paginas">
        {LAUDOS.map((l) =>
          l.caminho ? (
            <Link key={l.titulo} to={l.caminho} className="cartao cartao-pagina">
              <h3>{l.titulo}</h3>
              <p className="texto-secundario">{l.descricao}</p>
            </Link>
          ) : (
            <div key={l.titulo} className="cartao cartao-pagina em-breve" aria-disabled="true">
              <h3>
                {l.titulo} <span className="etiqueta-breve">Em breve</span>
              </h3>
              <p className="texto-secundario">{l.descricao}</p>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
