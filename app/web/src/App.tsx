import { Route, Routes } from "react-router-dom";

import Moldura from "./componentes/Moldura";
import { MENU } from "./menu";
import EmBreve from "./paginas/EmBreve";
import Entrar from "./paginas/Entrar";
import Inicio from "./paginas/Inicio";
import NaoEncontrada from "./paginas/NaoEncontrada";
import TrocarSenha from "./paginas/TrocarSenha";
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
        {MENU.filter((item) => !item.pronto).map((item) => (
          <Route key={item.caminho} path={item.caminho} element={<EmBreve item={item} />} />
        ))}
        <Route path="/conta/senha" element={<TrocarSenha />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
