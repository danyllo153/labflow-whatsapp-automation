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
    </section>
  );
}

/** /paginas/:pagina abre a página certa (a chave remonta a tela ao trocar de página). */
export function PaginaEscolhida() {
  const { pagina } = useParams();
  if (pagina === "visao-geral") return <VisaoGeral />;
  const def = PAGINAS.find((p) => p.caminho === pagina);
  if (!def) return <NaoEncontrada />;
  return <PaginaDeDados key={def.caminho} def={def} />;
}
