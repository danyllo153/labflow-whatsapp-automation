import { Link, useParams } from "react-router-dom";

import { useSessao } from "../sessao";
import NaoEncontrada from "./NaoEncontrada";
import { PAGINAS, type DefinicaoDePagina } from "./dados/definicoes";
import PaginaDeDados from "./dados/PaginaDeDados";
import VisaoGeral from "./dados/VisaoGeral";

/** Lista das páginas do laboratório (as do Power BI, 07 §5). */
const GRUPOS: { grupo: DefinicaoDePagina["grupo"]; titulo: string }[] = [
  { grupo: "Geral", titulo: "Geral" },
  { grupo: "NFC", titulo: "NFC" },
  { grupo: "FCOJ", titulo: "FCOJ (concentrado)" },
];

export function ListaDePaginas() {
  const { pessoa } = useSessao();
  const coletor = pessoa?.cargo === "Coletor";
  const visiveis = PAGINAS.filter((p) => !p.oculta && !(p.semColetor && coletor));
  return (
    <section>
      <h1>Páginas</h1>
      {GRUPOS.map(({ grupo, titulo }) => {
        const doGrupo = visiveis.filter((p) => p.grupo === grupo);
        if (doGrupo.length === 0 && !(grupo === "Geral" && !coletor)) return null;
        return (
          <div key={grupo} className="grupo-paginas">
            <h2>{titulo}</h2>
            <div className="grade-paginas">
              {grupo === "Geral" && !coletor && (
                <Link to="/paginas/visao-geral" className="cartao cartao-pagina">
                  <h3>Visão geral</h3>
                  <p className="texto-secundario">Números do período, pendências por bloco e os Não ok mais recentes.</p>
                </Link>
              )}
              {doGrupo.map((p) => (
                <Link key={p.caminho} to={`/paginas/${p.caminho}`} className="cartao cartao-pagina">
                  <h3>{p.titulo}</h3>
                  <p className="texto-secundario">{p.descricao}</p>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      <div className="grupo-paginas">
        <h2>Águas e superfícies</h2>
        <div className="grade-paginas">
          {AGUAS.map((a) => (
            <Link key={a.caminho} to={a.caminho} className="cartao cartao-pagina">
              <h3>{a.titulo}</h3>
              <p className="texto-secundario">{a.descricao}</p>
            </Link>
          ))}
        </div>
      </div>
      {!coletor && pessoa?.pode.includes("corrigir_registro") && (
        <p className="texto-secundario">
          <Link to="/paginas/recebimento/corrigir">Corrigir ou excluir um lote do recebimento de FCOJ</Link>
        </p>
      )}
    </section>
  );
}

/** Análises das águas (APP-037, 24/10): ficam aqui na aba Páginas, junto das outras análises. */
const AGUAS = [
  { caminho: "/paginas/agua-processo", titulo: "Água do processo", descricao: "Manifold e Câmaras 4, 5 e 6: coleta, C.T. e B.L., e o laudo." },
  { caminho: "/paginas/baias", titulo: "Baias", descricao: "CIP dos mangotes do recebimento: C.T. 48 h, B.L. 72 h e 120 h, e o laudo." },
  { caminho: "/paginas/linhas", titulo: "Linhas", descricao: "CIP das linhas de embarque: C.T. 48 h, B.L. 72 h e 120 h, e o laudo." },
];

/** /paginas/:pagina abre a página certa (a chave remonta a tela ao trocar de página). */
export function PaginaEscolhida() {
  const { pagina } = useParams();
  if (pagina === "visao-geral") return <VisaoGeral />;
  const def = PAGINAS.find((p) => p.caminho === pagina);
  if (!def) return <NaoEncontrada />;
  return <PaginaDeDados key={def.caminho} def={def} />;
}
