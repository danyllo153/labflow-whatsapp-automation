import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { MENU } from "../menu";
import { APPS, GRUPOS, useContagensDosApps, type Grupo } from "../paginas/Paginas";
import { useSessao } from "../sessao";
import Icone from "./Icone";
import IconeApp from "./IconeApp";

/**
 * Menu lateral por análise (pedido de 26/10, inspirado nos modelos kaiadmin e Dash UI, MIT): em cima o dia a dia
 * (Início, Turno, Leituras); depois as análises em grupos que abrem e fecham (NFC, FCOJ, testes, águas, registros
 * diários), cada análise com o seu ícone e cor; embaixo a administração. O grupo da tela aberta já vem aberto, e o que
 * a pessoa abriu ou fechou fica lembrado neste aparelho. No celular é o mesmo menu, numa gaveta.
 */

const NO_TOPO = ["/", "/turno", "/relatorio-do-dia", "/paginas/coletas"];
const ICONE_DO_GRUPO: Record<Grupo, string> = {
  Geral: "visao-geral",
  NFC: "tanques",
  FCOJ: "recebimento-fcoj",
  Testes: "tab",
  Aguas: "agua",
  Rotina: "esterilizacao",
};
const CHAVE = "labflow.menu.grupos";

function lerAbertos(): Grupo[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(salvo) ? salvo : [];
  } catch {
    return [];
  }
}

function salvarAbertos(grupos: Grupo[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(grupos));
  } catch {
    // sem armazenamento (aba anônima): o menu só não lembra
  }
}

/** O endereço do app, sem a aba (?aba=...), para saber qual está aberto. */
function semConsulta(caminho: string): string {
  return caminho.split("?")[0];
}

export default function MenuNavegacao() {
  const { pessoa } = useSessao();
  const { pathname } = useLocation();
  const coletor = pessoa?.cargo === "Coletor";
  const pode = (p?: string) => !p || !!pessoa?.pode.includes(p);
  const topo = MENU.filter((i) => NO_TOPO.includes(i.caminho) && pode(i.pode));
  const admin = MENU.filter((i) => i.caminho.startsWith("/admin") && pode(i.pode));
  const breve = MENU.filter((i) => !i.pronto && pode(i.pode));
  const apps = APPS.filter((a) => !(a.semColetor && coletor));
  const grupos = GRUPOS.map((g) => ({ ...g, apps: apps.filter((a) => a.grupo === g.grupo) })).filter((g) => g.apps.length > 0);
  const grupoDaTela = grupos.find((g) => g.apps.some((a) => semConsulta(a.caminho) === pathname))?.grupo;

  const contagens = useContagensDosApps(pathname); // o número vermelho de atrasados, de novo a cada tela
  const [abertos, setAbertos] = useState<Grupo[]>(() => lerAbertos());
  useEffect(() => {
    if (grupoDaTela && !abertos.includes(grupoDaTela)) setAbertos((a) => [...a, grupoDaTela]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoDaTela]);

  function atrasadosDo(lista: typeof apps): number {
    return lista.reduce((n, a) => n + (contagens?.[a.chave ?? a.caminho]?.atrasados ?? 0), 0);
  }

  function alternar(grupo: Grupo) {
    const novos = abertos.includes(grupo) ? abertos.filter((g) => g !== grupo) : [...abertos, grupo];
    setAbertos(novos);
    salvarAbertos(novos);
  }

  return (
    <nav className="menu-navegacao" aria-label="Menu">
      {topo.map((item) => (
        <NavLink key={item.caminho} to={item.caminho} end={item.caminho === "/"} className="item-menu">
          <span className="item-rotulo">
            <Icone caminho={item.caminho} />
            {item.rotulo}
          </span>
        </NavLink>
      ))}

      <p className="menu-secao">
        Análises
        <NavLink to="/paginas" end className="menu-secao-link">
          ver todas
        </NavLink>
      </p>
      {grupos.map((g) => {
        const aberto = abertos.includes(g.grupo);
        const id = `menu-grupo-${g.grupo}`;
        return (
          <div key={g.grupo} className={`menu-grupo${g.grupo === grupoDaTela ? " com-ativo" : ""}`}>
            <button type="button" className="item-menu menu-grupo-botao" aria-expanded={aberto} aria-controls={id} onClick={() => alternar(g.grupo)}>
              <span className="item-rotulo">
                <span className="icone" aria-hidden="true">
                  <IconeApp nome={ICONE_DO_GRUPO[g.grupo]} />
                </span>
                {g.titulo}
              </span>
              {!aberto && atrasadosDo(g.apps) > 0 && <span className="menu-contador" title="Atrasados">{atrasadosDo(g.apps)}</span>}
              <svg className="menu-seta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {aberto && (
              <ul id={id} className="menu-filhos">
                {g.apps.map((a) => (
                  <li key={a.caminho}>
                    <NavLink to={a.caminho} className={({ isActive }) => `menu-filho${isActive || semConsulta(a.caminho) === pathname ? " active" : ""}`}>
                      <span className={`menu-bolinha app-cor-${a.cor}`} aria-hidden="true" />
                      <span className="menu-filho-nome">{a.titulo}</span>
                      {!!contagens?.[a.chave ?? a.caminho]?.atrasados && (
                        <span className="menu-contador" aria-label={`${contagens[a.chave ?? a.caminho].atrasados} atrasados`}>
                          {contagens[a.chave ?? a.caminho].atrasados}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {admin.length > 0 && <p className="menu-secao">Administração</p>}
      {admin.map((item) => (
        <NavLink key={item.caminho} to={item.caminho} className="item-menu">
          <span className="item-rotulo">
            <Icone caminho={item.caminho} />
            {item.rotulo}
          </span>
        </NavLink>
      ))}
      {breve.map((item) => (
        <NavLink key={item.caminho} to={item.caminho} className="item-menu">
          <span className="item-rotulo">
            <Icone caminho={item.caminho} />
            {item.rotulo}
          </span>
          <span className="etiqueta-breve">Em breve</span>
        </NavLink>
      ))}
    </nav>
  );
}
