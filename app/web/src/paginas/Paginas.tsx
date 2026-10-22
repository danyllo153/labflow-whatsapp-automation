import { Link, useParams } from "react-router-dom";

import { useSessao } from "../sessao";
import NaoEncontrada from "./NaoEncontrada";
import { PAGINAS, PAGINAS_EM_BREVE } from "./dados/definicoes";
import PaginaDeDados from "./dados/PaginaDeDados";

/** Lista das páginas do laboratório (as do Power BI, 07 §5). */
export function ListaDePaginas() {
  const { pessoa } = useSessao();
  const visiveis = PAGINAS.filter((p) => !(p.semColetor && pessoa?.cargo === "Coletor"));
  return (
    <section>
      <h1>Páginas</h1>
      <div className="grade-paginas">
        {visiveis.map((p) => (
          <Link key={p.caminho} to={`/paginas/${p.caminho}`} className="cartao cartao-pagina">
            <h2>{p.titulo}</h2>
            <p className="texto-secundario">{p.descricao}</p>
          </Link>
        ))}
        {pessoa?.cargo !== "Coletor" &&
          PAGINAS_EM_BREVE.map((titulo) => (
            <div key={titulo} className="cartao cartao-pagina em-breve">
              <h2>{titulo}</h2>
              <span className="etiqueta etiqueta-neutra">Em breve</span>
            </div>
          ))}
      </div>
    </section>
  );
}

/** /paginas/:pagina abre a página certa (a chave remonta a tela ao trocar de página). */
export function PaginaEscolhida() {
  const { pagina } = useParams();
  const def = PAGINAS.find((p) => p.caminho === pagina);
  if (!def) return <NaoEncontrada />;
  return <PaginaDeDados key={def.caminho} def={def} />;
}
