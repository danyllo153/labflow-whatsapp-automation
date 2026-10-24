import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";

import { lerJson } from "./api";

import Moldura from "./componentes/Moldura";
import { MENU } from "./menu";
import ColetasExcluidas from "./paginas/admin/ColetasExcluidas";
import Pessoas from "./paginas/admin/Pessoas";
import TurnosEstufas from "./paginas/admin/TurnosEstufas";
import Conta from "./paginas/Conta";
import EmBreve from "./paginas/EmBreve";
import Entrar from "./paginas/Entrar";
import Esterilizacao from "./paginas/Esterilizacao";
import MaterialAsseptico from "./paginas/MaterialAsseptico";
import Estufas from "./paginas/Estufas";
import Inicio from "./paginas/Inicio";
import NaoEncontrada from "./paginas/NaoEncontrada";
import DetalheColeta from "./paginas/dados/DetalheColeta";
import { DetalheNavio, DetalheTanque } from "./paginas/dados/Detalhes";
import { ListaDePaginas, PaginaEscolhida } from "./paginas/Paginas";
import TrocarSenha from "./paginas/TrocarSenha";
import RelatorioDoTurno from "./paginas/RelatorioDoTurno";
import Turno, { TURNO_MUDOU, type EstadoDoTurno } from "./paginas/Turno";
import { useSessao } from "./sessao";

/**
 * Check-in (APP-022b, decidido em 23/10): Analista e Coletor só usam o resto do app depois de entrar no turno.
 * A API confere de novo em cada chamada; aqui só escolhe o que mostrar. Se GET /turno falhar, não trava a tela.
 */
function usePrecisaDeCheckin(ativo: boolean): boolean | null {
  const [precisa, setPrecisa] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const conferir = () =>
      lerJson<EstadoDoTurno>("/turno").then(
        (t) => vivo && setPrecisa(t.checkin_obrigatorio && !t.no_turno),
        () => vivo && setPrecisa(false),
      );
    void conferir();
    window.addEventListener(TURNO_MUDOU, conferir);
    return () => {
      vivo = false;
      window.removeEventListener(TURNO_MUDOU, conferir);
    };
  }, [ativo]);
  return precisa;
}

export default function App() {
  const { pessoa, carregando } = useSessao();
  const precisaDeCheckin = usePrecisaDeCheckin(Boolean(pessoa && !pessoa.trocar_senha));

  if (carregando) return <p className="carregando">Carregando...</p>;
  if (!pessoa) return <Entrar />;
  if (pessoa.trocar_senha) return <TrocarSenha obrigatoria />;
  if (precisaDeCheckin === null) return <p className="carregando">Carregando...</p>;

  if (precisaDeCheckin) {
    return (
      <Routes>
        <Route element={<Moldura />}>
          <Route path="/conta" element={<Conta />} />
          <Route path="/conta/senha" element={<TrocarSenha />} />
          <Route path="*" element={<Turno />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Moldura />}>
        <Route index element={<Inicio />} />
        <Route path="/turno" element={<Turno />} />
        <Route path="/esterilizacao" element={<Esterilizacao />} />
        <Route path="/estufas" element={<Estufas />} />
        <Route path="/material-asseptico" element={<MaterialAsseptico />} />
        <Route path="/turno/relatorio" element={<RelatorioDoTurno />} />
        <Route path="/paginas" element={<ListaDePaginas />} />
        <Route path="/paginas/coletas/:id" element={<DetalheColeta />} />
        <Route path="/paginas/tanques-terra/:id" element={<DetalheTanque />} />
        <Route path="/paginas/navios/:navio" element={<DetalheNavio />} />
        <Route path="/paginas/:pagina" element={<PaginaEscolhida />} />
        {MENU.filter((item) => !item.pronto).map((item) => (
          <Route key={item.caminho} path={item.caminho} element={<EmBreve item={item} />} />
        ))}
        <Route path="/conta" element={<Conta />} />
        <Route path="/conta/senha" element={<TrocarSenha />} />
        <Route path="/admin/pessoas" element={<Pessoas />} />
        <Route path="/admin/turnos" element={<TurnosEstufas />} />
        <Route path="/admin/coletas-excluidas" element={<ColetasExcluidas />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
