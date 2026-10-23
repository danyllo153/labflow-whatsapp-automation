import { Route, Routes } from "react-router-dom";

import Moldura from "./componentes/Moldura";
import { MENU } from "./menu";
import Pessoas from "./paginas/admin/Pessoas";
import Conta from "./paginas/Conta";
import EmBreve from "./paginas/EmBreve";
import Entrar from "./paginas/Entrar";
import Inicio from "./paginas/Inicio";
import NaoEncontrada from "./paginas/NaoEncontrada";
import { DetalheNavio, DetalheTanque } from "./paginas/dados/Detalhes";
import { ListaDePaginas, PaginaEscolhida } from "./paginas/Paginas";
import TrocarSenha from "./paginas/TrocarSenha";
import Turno from "./paginas/Turno";
import { useSessao } from "./sessao";

export default function App() {
  const { pessoa, carregando } = useSessao();

  if (carregando) return <p className="carregando">Carregando...</p>;
  if (!pessoa) return <Entrar />;
  if (pessoa.trocar_senha) return <TrocarSenha obrigatoria />;

  return (
    <Routes>
      <Route element={<Moldura />}>
        <Route index element={<Inicio />} />
        <Route path="/turno" element={<Turno />} />
        <Route path="/paginas" element={<ListaDePaginas />} />
        <Route path="/paginas/tanques-terra/:id" element={<DetalheTanque />} />
        <Route path="/paginas/navios/:navio" element={<DetalheNavio />} />
        <Route path="/paginas/:pagina" element={<PaginaEscolhida />} />
        {MENU.filter((item) => !item.pronto).map((item) => (
          <Route key={item.caminho} path={item.caminho} element={<EmBreve item={item} />} />
        ))}
        <Route path="/conta" element={<Conta />} />
        <Route path="/conta/senha" element={<TrocarSenha />} />
        <Route path="/admin/pessoas" element={<Pessoas />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
