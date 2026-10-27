import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { lerJson } from "./api";

import Moldura from "./componentes/Moldura";
import { MENU } from "./menu";
import ArquivoDeContraAmostras from "./paginas/Arquivo";
import ColetasExcluidas from "./paginas/admin/ColetasExcluidas";
import Pessoas from "./paginas/admin/Pessoas";
import TurnosEstufas from "./paginas/admin/TurnosEstufas";
import Conta from "./paginas/Conta";
import EmBreve from "./paginas/EmBreve";
import Entrar from "./paginas/Entrar";
import Esterilizacao from "./paginas/Esterilizacao";
import MaterialAsseptico from "./paginas/MaterialAsseptico";
import RegistrosDiarios from "./paginas/RegistrosDiarios";
import BrancoDoDia from "./paginas/BrancoDoDia";
import IncubacaoLeitura from "./paginas/IncubacaoLeitura";
import MeiosLotes from "./paginas/MeiosLotes";
import AguaProcesso from "./paginas/aguas/AguaProcesso";
import SuperficiesPagina from "./paginas/aguas/Superficies";
import CorrigirRecebimento from "./paginas/dados/CorrigirRecebimento";
import Inicio from "./paginas/Inicio";
import NaoEncontrada from "./paginas/NaoEncontrada";
import DetalheColeta from "./paginas/dados/DetalheColeta";
import { DetalheLoad, DetalheNavio, DetalheTanque } from "./paginas/dados/Detalhes";
import { ListaDePaginas, PaginaEscolhida } from "./paginas/Paginas";
import RecebimentoFcoj from "./paginas/analises/RecebimentoFcoj";
import Desvios from "./paginas/analises/Desvios";
import Drops from "./paginas/analises/Drops";
import Embarque from "./paginas/analises/Embarque";
import RecebimentoNfc from "./paginas/analises/RecebimentoNfc";
import Tanques from "./paginas/analises/Tanques";
import Testes from "./paginas/analises/Testes";
import TrocarSenha from "./paginas/TrocarSenha";
import Leituras from "./paginas/Leituras";
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
        <Route path="/estufas" element={<Navigate to="/turno" replace />} />  {/* as estufas ficam no Início e no Turno (25/10) */}
        <Route path="/registros-diarios" element={<RegistrosDiarios />} />
        <Route path="/fluxo-laminar" element={<BrancoDoDia />} />
        <Route path="/incubacao" element={<IncubacaoLeitura />} />
        <Route path="/meios-lotes" element={<MeiosLotes />} />
        <Route path="/material-asseptico" element={<MaterialAsseptico />} />
        <Route path="/turno/relatorio" element={<RelatorioDoTurno />} />
        <Route path="/leituras" element={<Leituras />} />
        <Route path="/relatorio-do-dia" element={<Navigate to="/leituras" replace />} />  {/* Leituras virou página com abas (27/10) */}
        <Route path="/arquivo" element={<ArquivoDeContraAmostras />} />
        <Route path="/paginas" element={<ListaDePaginas />} />
        <Route path="/analises/recebimento-fcoj" element={<RecebimentoFcoj />} />
        <Route path="/analises/tanques" element={<ParaTanquesTerra />} />  {/* virou dois apps (27/10) */}
        <Route path="/analises/tanques-terra" element={<Tanques key="terra" origem="terra" />} />
        <Route path="/analises/tanques-navio" element={<Tanques key="navio" origem="navio" />} />
        <Route path="/analises/tab" element={<Testes key="TAB" qual="TAB" />} />
        <Route path="/analises/coliformes" element={<Testes key="COLIFORMES" qual="COLIFORMES" />} />
        <Route path="/analises/howard" element={<Testes key="HOWARD" qual="HOWARD" />} />
        <Route path="/analises/testes" element={<Navigate to="/analises/tab" replace />} />
        <Route path="/analises/drops" element={<Drops />} />
        <Route path="/analises/embarque-fcoj" element={<Embarque />} />
        <Route path="/analises/recebimento-nfc" element={<RecebimentoNfc />} />
        <Route path="/analises/desvios" element={<Desvios />} />
        <Route path="/paginas/agua-processo" element={<AguaProcesso />} />
        <Route path="/paginas/baias" element={<SuperficiesPagina key="Baia" tipo="Baia" />} />
        <Route path="/paginas/linhas" element={<SuperficiesPagina key="Linha" tipo="Linha" />} />
        <Route path="/paginas/recebimento/corrigir" element={<CorrigirRecebimento />} />
        <Route path="/paginas/coletas/:id" element={<DetalheColeta />} />
        <Route path="/paginas/tanques-terra/:id" element={<DetalheTanque />} />
        <Route path="/paginas/navios/:navio" element={<DetalheNavio />} />
        <Route path="/paginas/loads/:load" element={<DetalheLoad />} />
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

/** O endereço antigo do app de tanques (links e favoritos) abre o Tanques terra, com a mesma aba. */
function ParaTanquesTerra() {
  const { search } = useLocation();
  return <Navigate to={`/analises/tanques-terra${search}`} replace />;
}
