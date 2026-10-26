import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { lerJson } from "../api";
import { useSessao } from "../sessao";
import IconeApp from "../componentes/IconeApp";
import NaoEncontrada from "./NaoEncontrada";
import { ABAS_DESVIOS } from "./analises/Desvios";
import { ABAS_DROPS } from "./analises/Drops";
import { ABAS_EMBARQUE } from "./analises/Embarque";
import { ABAS_NFC } from "./analises/RecebimentoNfc";
import { ATALHOS_DO_APP } from "./analises/RecebimentoFcoj";
import { ABAS_TANQUES } from "./analises/Tanques";
import { ABAS_HOWARD, ABAS_TESTES } from "./analises/Testes";
import { PAGINAS, VISUAL_DAS_PAGINAS, type DefinicaoDePagina } from "./dados/definicoes";
import PaginaDeDados from "./dados/PaginaDeDados";
import VisaoGeral from "./dados/VisaoGeral";

/**
 * Páginas como tela de apps (Fase E, E1; rumo-do-app.md): cada análise é um "app" com o ícone, o nome e o estado do
 * dia (atrasados e para hoje, de /pendencias-hoje). No celular, o app que já tem página própria abre um menu que sobe
 * de baixo (Painel, Registrar, Resultados, Laudo, Instrução, Vídeo); no computador, abre direto a página dele.
 */

export type Grupo = DefinicaoDePagina["grupo"] | "Aguas" | "Rotina";

export interface App {
  caminho: string; // endereço que o app abre
  chave?: string; // de onde vem a contagem do dia (a página antiga); sem ela, o próprio caminho
  titulo: string;
  icone: string; // desenho do app (componentes/IconeApp)
  cor: string; // família: app-cor-<cor> (nfc, drops, nfc-receb, desvios, fcoj, embarque, tab, coli, howard, agua, baias, linhas, rotina, geral)
  grupo: Grupo;
  descricao: string;
  semColetor?: boolean;
  atalhos?: { aba: string; rotulo: string }[]; // o app tem página própria com abas (Fase E: E2 a E8)
}

export const GRUPOS: { grupo: Grupo; titulo: string }[] = [
  { grupo: "Geral", titulo: "Geral" },
  { grupo: "NFC", titulo: "NFC" },
  { grupo: "FCOJ", titulo: "FCOJ (concentrado)" },
  { grupo: "Testes", titulo: "TAB, Coliformes e Howard" },
  { grupo: "Aguas", titulo: "Águas e superfícies" },
  { grupo: "Rotina", titulo: "Registros diários" },
];


/** Tanques terra e navios são um app só ("Análise de tanques", com a pesquisa por navio): a página de navios não
 * aparece na grade, e as pendências dela contam no app de tanques. */
const JUNTADAS = new Set(["navios"]);

const APP_DO_RECEBIMENTO = "/analises/recebimento-fcoj";

/** A página que virou app (Fase E): o endereço do app e as abas do menu que sobe no celular. */
const APPS_DA_FASE_E: Record<string, { caminho: string; atalhos: { aba: string; rotulo: string }[] }> = {
  recebimento: { caminho: APP_DO_RECEBIMENTO, atalhos: ATALHOS_DO_APP },
  "tanques-terra": { caminho: "/analises/tanques", atalhos: ABAS_TANQUES },
  navios: { caminho: "/analises/tanques", atalhos: ABAS_TANQUES },
  drops: { caminho: "/analises/drops", atalhos: ABAS_DROPS },
  desvios: { caminho: "/analises/desvios", atalhos: ABAS_DESVIOS },
  "recebimento-nfc": { caminho: "/analises/recebimento-nfc", atalhos: ABAS_NFC },
  embarque: { caminho: "/analises/embarque-fcoj", atalhos: ABAS_EMBARQUE },
  tab: { caminho: "/analises/tab", atalhos: ABAS_TESTES },
  coliformes: { caminho: "/analises/coliformes", atalhos: ABAS_TESTES },
  howard: { caminho: "/analises/howard", atalhos: ABAS_HOWARD },
};

const APPS_FIXOS: App[] = [
  { caminho: "/paginas/visao-geral", titulo: "Visão geral", icone: "visao-geral", cor: "geral", grupo: "Geral", semColetor: true,
    descricao: "Números do período, pendências por bloco e os Não ok mais recentes." },
  { caminho: "/paginas/agua-processo", titulo: "Água do processo", icone: "agua", cor: "agua", grupo: "Aguas",
    descricao: "Manifold e Câmaras 4, 5 e 6: coleta, C.T. e B.L., e o laudo." },
  { caminho: "/paginas/baias", titulo: "Baias", icone: "baias", cor: "baias", grupo: "Aguas", semColetor: true,
    descricao: "CIP dos mangotes do recebimento: C.T. 48 h, B.L. 72 h e 120 h, e o laudo." },
  { caminho: "/paginas/linhas", titulo: "Linhas", icone: "linhas", cor: "linhas", grupo: "Aguas", semColetor: true,
    descricao: "CIP das linhas de embarque: C.T. 48 h, B.L. 72 h e 120 h, e o laudo." },
  { caminho: "/esterilizacao", titulo: "Esterilização", icone: "esterilizacao", cor: "rotina", grupo: "Rotina", semColetor: true,
    descricao: "Ciclos da autoclave e o laudo." },
  { caminho: "/material-asseptico", titulo: "Material asséptico", icone: "material", cor: "rotina", grupo: "Rotina", semColetor: true,
    descricao: "O que foi usado em cada dia de análise." },
  { caminho: "/meios-lotes", titulo: "Meios e lotes", icone: "meios", cor: "rotina", grupo: "Rotina", semColetor: true,
    descricao: "Lotes dos meios de cultura em uso." },
  { caminho: "/fluxo-laminar", titulo: "Branco do dia", icone: "branco", cor: "rotina", grupo: "Rotina", semColetor: true,
    descricao: "Fluxo laminar: o branco de cada dia." },
  { caminho: "/arquivo", titulo: "Arquivo", icone: "arquivo", cor: "rotina", grupo: "Rotina", semColetor: true,
    descricao: "Caixas de contra-amostras e o que dá para descartar." },
  { caminho: "/incubacao", titulo: "Incubação", icone: "incubacao", cor: "rotina", grupo: "Rotina", semColetor: true,
    descricao: "O que entrou nas estufas em cada dia." },
];

export const APPS: App[] = [
  ...APPS_FIXOS.filter((a) => a.grupo === "Geral"),
  ...PAGINAS.filter((p) => !p.oculta && !JUNTADAS.has(p.caminho)).map(
    (p): App => ({
      caminho: APPS_DA_FASE_E[p.caminho]?.caminho ?? `/paginas/${p.caminho}`,
      chave: `/paginas/${p.caminho}`,
      titulo: VISUAL_DAS_PAGINAS[p.caminho]?.titulo ?? p.titulo,
      grupo: p.grupo,
      descricao: p.descricao,
      semColetor: p.semColetor,
      atalhos: APPS_DA_FASE_E[p.caminho]?.atalhos,
      icone: VISUAL_DAS_PAGINAS[p.caminho]?.icone ?? p.caminho,
      cor: VISUAL_DAS_PAGINAS[p.caminho]?.cor ?? "geral",
    }),
  ),
  ...APPS_FIXOS.filter((a) => a.grupo !== "Geral"),
];

interface Pendencia {
  bloco: string;
  tipo: string;
  situacao: string; // "Vence hoje" ou "Atrasado"
}

/** De qual app é cada pendência do dia (os blocos de /pendencias-hoje). */
function appDaPendencia(p: Pendencia): string | null {
  const teste = { TAB: "/paginas/tab", Coliformes: "/paginas/coliformes", Howard: "/paginas/howard" }[p.tipo];
  if (teste) return teste; // TAB, Coliformes e Howard têm o app deles, venham do recebimento, do embarque ou dos tanques
  switch (p.bloco) {
    case "FCOJ Recebimento":
      return "/paginas/recebimento";
    case "FCOJ Embarque":
      return "/paginas/embarque";
    case "NFC Tank farm":
      return "/paginas/tanques-terra";
    case "NFC Navio":
      return "/paginas/tanques-terra"; // navios e tanques terra são o mesmo app
    case "Recebimento NFC":
      return "/paginas/recebimento-nfc";
    case "Desvios":
      return "/paginas/desvios";
    case "Águas e superfícies":
      return p.tipo === "Baia" ? "/paginas/baias" : p.tipo === "Linha" ? "/paginas/linhas" : "/paginas/agua-processo";
    default:
      return null;
  }
}

export type Contagem = { atrasados: number; hoje: number };

/** Atrasados e para hoje de cada app (pelo endereço da página antiga, `chave`), de /pendencias-hoje; usado na grade de
 * Análises e no menu lateral. `recarregar` muda quando a tela muda (o menu recarrega ao trocar de página). */
export function useContagensDosApps(recarregar?: unknown): Record<string, Contagem> | null {
  const [contagens, setContagens] = useState<Record<string, Contagem> | null>(null);
  useEffect(() => {
    let vivo = true;
    lerJson<{ itens: Pendencia[] }>("/pendencias-hoje").then(
      (r) => {
        const por: Record<string, Contagem> = {};
        for (const p of r.itens) {
          const app = appDaPendencia(p);
          if (!app) continue;
          por[app] ??= { atrasados: 0, hoje: 0 };
          if (p.situacao === "Atrasado") por[app].atrasados += 1;
          else por[app].hoje += 1;
        }
        if (vivo) setContagens(por);
      },
      () => vivo && setContagens(null),
    );
    return () => {
      vivo = false;
    };
  }, [recarregar]);
  return contagens;
}

function estadoDoApp(c: Contagem | undefined): { texto: string; classe: string } | null {
  if (!c) return { texto: "Em dia", classe: "app-estado-ok" };
  const partes = [c.atrasados && `${c.atrasados} atrasado${c.atrasados > 1 ? "s" : ""}`, c.hoje && `${c.hoje} para hoje`];
  return { texto: partes.filter(Boolean).join(" · "), classe: c.atrasados ? "app-estado-atrasado" : "app-estado-hoje" };
}

function celular() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 899px)").matches;
}

export function ListaDePaginas() {
  const { pessoa } = useSessao();
  const navegar = useNavigate();
  const coletor = pessoa?.cargo === "Coletor";
  const [busca, setBusca] = useState("");
  const contagens = useContagensDosApps();
  const [aberto, setAberto] = useState<App | null>(null);

  const termo = busca.trim().toLowerCase();
  const visiveis = APPS.filter((a) => !(a.semColetor && coletor) && (!termo || a.titulo.toLowerCase().includes(termo)));

  return (
    <section className="tela-apps">
      <div className="apps-topo">
        <h1>Análises</h1>
        <label className="busca-redonda">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input type="search" aria-label="Procurar análise" placeholder="Procurar análise" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </div>
      {GRUPOS.map(({ grupo, titulo }) => {
        const doGrupo = visiveis.filter((a) => a.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return (
          <div key={grupo} className="grupo-paginas">
            <h2>{titulo}</h2>
            <div className="grade-apps">
              {doGrupo.map((a) => {
                const estado = contagens ? estadoDoApp(contagens[a.chave ?? a.caminho]) : null;
                return (
                  <Link
                    key={a.chave ?? a.caminho}
                    to={a.caminho}
                    className="app-cartao"
                    title={a.descricao}
                    onClick={(e) => {
                      if (a.atalhos && celular()) {
                        e.preventDefault();
                        setAberto(a);
                      }
                    }}
                  >
                    <span className={`app-icone app-cor-${a.cor}`} aria-hidden="true">
                      <IconeApp nome={a.icone} />
                    </span>
                    <span className="app-textos">
                      <span className="app-nome">{a.titulo}</span>
                      {estado && <span className={`app-estado ${estado.classe}`}>{estado.texto}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
      {visiveis.length === 0 && <p className="texto-secundario">Nenhuma análise com esse nome.</p>}
      {!coletor && pessoa?.pode.includes("corrigir_registro") && (
        <p className="texto-secundario">
          <Link to="/paginas/recebimento/corrigir">Corrigir ou excluir um lote do recebimento de FCOJ</Link>
        </p>
      )}
      {aberto?.atalhos && (
        <div className="folha-fundo" onClick={() => setAberto(null)}>
          <div className="folha-de-baixo" role="dialog" aria-label={aberto.titulo} onClick={(e) => e.stopPropagation()}>
            <span className="folha-alca" aria-hidden="true" />
            <div className="folha-titulo">
              <span className={`app-icone app-cor-${aberto.cor}`} aria-hidden="true">
                <IconeApp nome={aberto.icone} />
              </span>
              <strong>{aberto.titulo}</strong>
            </div>
            <div className="folha-atalhos">
              {aberto.atalhos.map((t) => (
                <button key={t.aba} type="button" className="folha-atalho" onClick={() => navegar(`${aberto.caminho.split("?")[0]}?aba=${t.aba}`)}>
                  {t.rotulo}
                </button>
              ))}
            </div>
            <button type="button" className="botao botao-simples" onClick={() => setAberto(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
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
