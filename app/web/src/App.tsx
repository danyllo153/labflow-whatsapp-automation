import { Route, Routes } from "react-router-dom";

import Moldura from "./componentes/Moldura";
import { MENU } from "./menu";
import EmBreve from "./paginas/EmBreve";
import Inicio from "./paginas/Inicio";
import NaoEncontrada from "./paginas/NaoEncontrada";

export default function App() {
  return (
    <Routes>
      <Route element={<Moldura />}>
        <Route index element={<Inicio />} />
        {MENU.filter((item) => !item.pronto).map((item) => (
          <Route key={item.caminho} path={item.caminho} element={<EmBreve item={item} />} />
        ))}
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
