import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { lerJson } from "../../api";
import { VISUAL_DAS_PAGINAS, type Coluna, type DefinicaoDePagina, type Filtro } from "./definicoes";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { classeDaSituacao, formatar } from "./formatos";
import Dashboard, { type Linha } from "./Dashboard";
import { BarrasPorSituacao, type ItemDeSituacao } from "../../componentes/Graficos";

/**
 * Página do laboratório em leitura (07 §5; APP-015): filtros com etiquetas removíveis, tabela (cartões no celular),
 * paginação, Exportar Excel e Imprimir só o que está filtrado. Os filtros moram no endereço da página.
 */

interface Pagina {
  total: number;
  pagina: number;
  por_pagina: number;
  linhas: Record<string, unknown>[];
  resumo?: ItemDeSituacao[] | null;
  resumo_coluna?: string | null;
}

// o Chart.js só é baixado nas páginas com gráfico de resultado (26/10)
const GraficoResultado = lazy(() => import("./GraficoResultado"));
const TabPositivos = lazy(() => import("./TabPositivos"));

const POR_PAGINA = 50;
const POR_PAGINA_IMPRESSAO = 200; // máximo da API
export const LIMITE_IMPRESSAO = 2000; // mais que isso: o Excel é o caminho
const ATUALIZAR_A_CADA_MS = 60_000;

function filtrosDoEndereco(busca: URLSearchParams, filtros: Filtro[]): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const f of filtros) {
    const v = busca.get(f.chave);
    if (v) valores[f.chave] = v;
  }
  return valores;
}

function consulta(valores: Record<string, string>, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) p.set(k, v);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
}

function valorDoFiltro(filtro: Filtro, valor: string): string {
  if (filtro.tipo === "data") return formatar(valor, "data");
  return filtro.rotulos?.[valor] ?? valor;
}

function Celula({ coluna, linha }: { coluna: Coluna; linha: Record<string, unknown> }) {
  const texto = formatar(linha[coluna.chave], coluna.formato);
  if (coluna.formato === "situacao" && texto) return <span className={classeDaSituacao(texto)}>{texto}</span>;
  return <>{texto}</>;
}

/** `embutida`: dentro da aba Resultados de um app (26/10): sem a faixa do título, e o endereço guarda a aba do app. */
export default function PaginaDeDados({ def, embutida = false }: { def: DefinicaoDePagina; embutida?: boolean }) {
  const [busca, setBusca] = useSearchParams();
  const aplicados = useMemo(() => filtrosDoEndereco(busca, def.filtros), [busca, def.filtros]);
  const pagina = Math.max(1, Number(busca.get("pagina")) || 1);
  // a busca (24/10): texto em qualquer coluna, em todos os registros (a API procura), e segue para o Excel e a impressão
  const termo = (busca.get("busca") ?? "").trim();
  const [texto, setTexto] = useState(termo);
  const comBusca = useMemo(() => (termo ? { ...aplicados, busca: termo } : aplicados), [aplicados, termo]);

  const [rascunho, setRascunho] = useState<Record<string, string>>(aplicados);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [erro, setErro] = useState("");
  const [orientacao, setOrientacao] = useState(def.impressao);
  const [paraImprimir, setParaImprimir] = useState<Record<string, unknown>[] | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [avisoImpressao, setAvisoImpressao] = useState("");
  const [menuImprimir, setMenuImprimir] = useState(false);
  const [dashboard, setDashboard] = useState<{ linhas: Linha[]; total: number } | null>(null);
  const [dashboardAberto, setDashboardAberto] = useState(!!def.resultado || !!def.dashboard?.aberto);
  // o gráfico de resultado vai para a impressão como imagem, em cima da tabela (26/10)
  const canvasDoGrafico = useRef<HTMLCanvasElement | null>(null);
  const [imagemDoGrafico, setImagemDoGrafico] = useState<string | null>(null);

  useEffect(() => setRascunho(aplicados), [aplicados]);
  useEffect(() => setTexto(termo), [termo]);
  useEffect(() => {
    if (texto.trim() === termo) return;
    const t = window.setTimeout(() => irPara(aplicados, 1, texto.trim()), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<Pagina>(`${def.api}?${consulta({ ...comBusca, ...def.fixos }, { pagina, por_pagina: POR_PAGINA })}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a página.");
    }
  }, [def.api, def.fixos, comBusca, pagina]);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [carregar]);

  function irPara(valores: Record<string, string>, novaPagina = 1, novoTermo = termo) {
    const limpos = Object.fromEntries(Object.entries(valores).filter(([, v]) => v.trim() !== ""));
    const manter = embutida ? Object.fromEntries(["aba", "tabela"].flatMap((k) => (busca.get(k) ? [[k, busca.get(k) as string]] : []))) : {};
    setBusca(consulta({ ...manter, ...(novoTermo ? { ...limpos, busca: novoTermo } : limpos) }, novaPagina > 1 ? { pagina: novaPagina } : {}));
  }

  function aplicar(evento: FormEvent) {
    evento.preventDefault();
    irPara(rascunho);
    setFiltrosAbertos(false);
  }

  function tirar(chave: string) {
    const resto = { ...aplicados };
    delete resto[chave];
    irPara(resto);
  }

  /** Todas as linhas do filtro (até o limite), página por página: para imprimir e para o Dashboard. */
  const buscarTodas = useCallback(async (limite = Infinity) => {
    const todas: Record<string, unknown>[] = [];
    let total = 0;
    for (let p = 1; ; p++) {
      const parte = await lerJson<Pagina>(`${def.api}?${consulta({ ...comBusca, ...def.fixos }, { pagina: p, por_pagina: POR_PAGINA_IMPRESSAO })}`);
      total = parte.total;
      todas.push(...parte.linhas);
      if (todas.length >= parte.total || parte.linhas.length === 0 || todas.length >= limite) break;
    }
    return { linhas: todas, total };
  }, [def.api, def.fixos, comBusca]);

  // o Dashboard acompanha o filtro da tela (pedido de 25/10)
  useEffect(() => {
    if (!dashboardAberto || def.resultado) return;
    let vivo = true;
    buscarTodas(LIMITE_IMPRESSAO).then(
      (r) => vivo && setDashboard(r),
      () => vivo && setDashboard({ linhas: [], total: 0 }),
    );
    return () => {
      vivo = false;
    };
  }, [dashboardAberto, buscarTodas, def.resultado]);

  async function imprimir() {
    setAvisoImpressao("");
    if (dados && dados.total > LIMITE_IMPRESSAO) {
      setAvisoImpressao(`São ${dados.total} linhas: para imprimir, filtre até ${LIMITE_IMPRESSAO} ou use o Excel.`);
      return;
    }
    setPreparando(true);
    try {
      const { linhas: todas } = await buscarTodas();
      let imagem: string | null = null;
      try {
        imagem = dashboardAberto && canvasDoGrafico.current ? canvasDoGrafico.current.toDataURL("image/png") : null;
      } catch {
        imagem = null; // sem o desenho (ex.: navegador sem canvas), imprime só a tabela
      }
      setImagemDoGrafico(imagem);
      setParaImprimir(todas);
    } catch (e) {
      setAvisoImpressao(e instanceof Error ? e.message : "Não foi possível preparar a impressão.");
    } finally {
      setPreparando(false);
    }
  }

  // Com as linhas prontas, abre a janela de impressão do navegador; ao fechar, volta à tela normal.
  useEffect(() => {
    if (!paraImprimir) return;
    const fim = () => setParaImprimir(null);
    window.addEventListener("afterprint", fim, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", fim);
  }, [paraImprimir]);

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;
  const etiquetas = def.filtros.filter((f) => aplicados[f.chave]);
  // a fábrica à vista, em pílulas (26/10): o filtro mais usado no recebimento e no embarque, sem abrir o funil
  const filtroFabrica = def.filtros.find((f) => f.chave === "fabrica" && f.tipo === "opcoes");
  const descritos = [...(termo ? [`Busca: ${termo}`] : []), ...etiquetas.map((f) => `${f.rotulo}: ${valorDoFiltro(f, aplicados[f.chave])}`)];
  const textoDosFiltros = descritos.length ? descritos.join(" · ") : "Sem filtro (todos os registros)";

  const acoes = (
    <>
      {(def.resultado || def.dashboard) && (
        <button
          type="button"
          className="botao-icone"
          aria-pressed={dashboardAberto}
          title={def.resultado ? "Gráfico do resultado com o filtro da tela" : "Gráfico com o filtro da tela: colunas ou tendência"}
          onClick={() => setDashboardAberto(!dashboardAberto)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
          Gráfico
        </button>
      )}
      <a
        className="botao-icone"
        aria-label="Exportar Excel"
        title="Exportar para o Excel (só o que está filtrado)"
        href={`${def.api}/excel?${consulta({ ...comBusca, ...def.fixos })}`}
        download
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M9 13l6 6M15 13l-6 6" />
        </svg>
      </a>
      <div className="menu-imprimir">
        <button
          type="button"
          className="botao-icone"
          aria-label="Imprimir"
          aria-expanded={menuImprimir}
          title="Imprimir (escolha o papel)"
          onClick={() => setMenuImprimir(!menuImprimir)}
          disabled={preparando || !dados}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="7" />
          </svg>
        </button>
        {menuImprimir && (
          <div className="menu-imprimir-opcoes" role="group" aria-label="Papel">
            {(["em pé", "deitado"] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={orientacao === o}
                onClick={() => {
                  setOrientacao(o);
                  setMenuImprimir(false);
                  void imprimir();
                }}
              >
                A4 {o}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <section className="pagina-dados">
      <div className="so-tela">
        {embutida ? (
          <div className="barra-da-tabela">
            <h2>{def.titulo}</h2>
            <div className="acoes-icone">{acoes}</div>
          </div>
        ) : (
          <CabecalhoDaPagina
            icone={VISUAL_DAS_PAGINAS[def.caminho]?.icone ?? "coletas"}
            cor={VISUAL_DAS_PAGINAS[def.caminho]?.cor ?? "geral"}
            titulo={def.titulo}
            descricao={def.descricao}
            acoes={acoes}
          />
        )}
        {preparando && <p className="texto-secundario">Preparando a impressão...</p>}

        <div className="busca-com-filtro">
          <label className="busca-redonda">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              aria-label={`Pesquisar em ${def.titulo}`}
              placeholder="Pesquisar load, lote, tanque, navio, nome..."
              maxLength={60}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="botao-filtro"
            aria-label="Filtros"
            aria-expanded={filtrosAbertos}
            onClick={() => setFiltrosAbertos(!filtrosAbertos)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {etiquetas.length > 0 && <span className="abas-contador">{etiquetas.length}</span>}
          </button>
        </div>
        {filtroFabrica && (
          <div className="seletor-de-tabela pilulas-fabrica" role="group" aria-label="Fábrica">
            {["", ...(filtroFabrica.opcoes ?? [])].map((f) => (
              <button
                key={f || "todas"}
                type="button"
                aria-pressed={(aplicados.fabrica ?? "") === f}
                onClick={() => irPara({ ...aplicados, fabrica: f })}
              >
                {f || "Todas as fábricas"}
              </button>
            ))}
          </div>
        )}
        {avisoImpressao && (
          <p className="mensagem-erro" role="alert">
            {avisoImpressao}
          </p>
        )}

        {filtrosAbertos && (
          <form className="cartao formulario-filtros" onSubmit={aplicar} aria-label="Filtros">
            <div className="grade-filtros">
              {def.filtros.map((f) => (
                <label key={f.chave} className="campo">
                  {f.rotulo}
                  {f.tipo === "opcoes" ? (
                    <select value={rascunho[f.chave] ?? ""} onChange={(e) => setRascunho({ ...rascunho, [f.chave]: e.target.value })}>
                      <option value="">Todos</option>
                      {f.opcoes?.map((o) => (
                        <option key={o} value={o}>
                          {f.rotulos?.[o] ?? o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.tipo === "data" ? "date" : f.tipo === "numero" ? "number" : "text"}
                      inputMode={f.tipo === "numero" ? "numeric" : undefined}
                      placeholder={f.dica}
                      value={rascunho[f.chave] ?? ""}
                      onChange={(e) => setRascunho({ ...rascunho, [f.chave]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="botoes-lado">
              <button type="submit" className="botao botao-principal">
                Filtrar
              </button>
              <button type="button" className="botao botao-simples" onClick={() => irPara({})}>
                Limpar filtros
              </button>
            </div>
          </form>
        )}

        {etiquetas.length > 0 && (
          <ul className="etiquetas-filtro" aria-label="Filtros usados">
            {etiquetas.map((f) => (
              <li key={f.chave}>
                {f.rotulo}: <strong>{valorDoFiltro(f, aplicados[f.chave])}</strong>
                <button type="button" aria-label={`Tirar o filtro ${f.rotulo}`} onClick={() => tirar(f.chave)}>
                  x
                </button>
              </li>
            ))}
          </ul>
        )}

        {erro && (
          <div className="cartao" role="alert">
            <p className="mensagem-erro">{erro}</p>
            <button type="button" className="botao botao-simples" onClick={() => void carregar()}>
              Tentar de novo
            </button>
          </div>
        )}
        {!dados && !erro && <p className="carregando">Carregando...</p>}

        {dados && !erro && dados.resumo && dados.resumo.length > 0 && dados.total > 0 && (
          <section className="cartao" aria-label="Por situação">
            <h2>
              {dados.resumo_coluna === "status" ? "Por status" : "Por situação"} <span className="contador">{dados.total}</span>
            </h2>
            <BarrasPorSituacao
              itens={dados.resumo}
              escolhido={dados.resumo_coluna ? aplicados[dados.resumo_coluna] : undefined}
              aoEscolher={
                dados.resumo_coluna && def.filtros.some((f) => f.chave === dados.resumo_coluna)
                  ? (rotulo) => {
                      const chave = dados.resumo_coluna as string;
                      irPara(aplicados[chave] === rotulo ? Object.fromEntries(Object.entries(aplicados).filter(([k]) => k !== chave)) : { ...aplicados, [chave]: rotulo });
                    }
                  : undefined
              }
            />
          </section>
        )}

        {dashboardAberto && def.resultado && (
          <Suspense fallback={<p className="carregando">Montando o gráfico...</p>}>
            {def.resultado.tipo === "positivos" ? (
              <TabPositivos teste={def.resultado.teste} aoDesenhar={(c) => (canvasDoGrafico.current = c)} />
            ) : (
              <GraficoResultado
                api={def.resultado.api ?? def.api}
                consulta={consulta({ ...comBusca, ...def.fixos })}
                rotuloData={def.resultado.data}
                aoDesenhar={(c) => (canvasDoGrafico.current = c)}
              />
            )}
          </Suspense>
        )}
        {dashboardAberto &&
          !def.resultado &&
          (dashboard ? (
            <Dashboard def={def} linhas={dashboard.linhas} total={dashboard.total} inicial={def.dashboard} aoFechar={() => setDashboardAberto(false)} />
          ) : (
            <p className="carregando">Montando o dashboard...</p>
          ))}

        {dados && !erro && (
          <>
            <p className="texto-secundario">
              {dados.total === 1 ? "1 registro" : `${dados.total} registros`}
              {dados.total > 0 && ` · página ${pagina} de ${totalPaginas}`}
            </p>
            {dados.linhas.length === 0 ? (
              <div className="cartao">
                <p>Nenhum registro com esses filtros.</p>
              </div>
            ) : (
              <Tabela colunas={def.colunas} linhas={dados.linhas} link={def.linkDaLinha} />
            )}
            {totalPaginas > 1 && (
              <nav className="paginacao" aria-label="Páginas da lista">
                <button type="button" className="botao-secundario" disabled={pagina <= 1} onClick={() => irPara(aplicados, pagina - 1)}>
                  Anterior
                </button>
                <span>
                  {pagina} de {totalPaginas}
                </span>
                <button type="button" className="botao-secundario" disabled={pagina >= totalPaginas} onClick={() => irPara(aplicados, pagina + 1)}>
                  Próxima
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      {paraImprimir && (
        <div className="so-impressao" data-testid="impressao">
          {/* só o tamanho do papel muda por página; margem e "Página X de Y" ficam no estilos.css */}
          <style>{`@page { size: A4 ${orientacao === "deitado" ? "landscape" : "portrait"}; }`}</style>
          <h1>LabFlow · {def.titulo}</h1>
          <p>
            {textoDosFiltros}
            <br />
            {paraImprimir.length} registros · impresso em{" "}
            {formatar(new Date().toISOString(), "dataHora")}
          </p>
          {imagemDoGrafico && <img className="grafico-impressao" src={imagemDoGrafico} alt="Gráfico do resultado com o filtro da tela" />}
          <Tabela colunas={def.colunas} linhas={paraImprimir} />
        </div>
      )}
    </section>
  );
}

function Tabela({ colunas, linhas, link }: { colunas: Coluna[]; linhas: Record<string, unknown>[]; link?: (l: Record<string, unknown>) => string }) {
  return (
    <table className="tabela-dados">
      <thead>
        <tr>
          {colunas.map((c) => (
            <th key={c.chave} scope="col">
              {c.rotulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, n) => (
          <tr key={n}>
            {colunas.map((c) => (
              <td key={c.chave} data-rotulo={c.rotulo} className={c.principal ? "principal" : undefined}>
                {c.principal && link ? (
                  <Link to={link(linha)}>
                    <Celula coluna={c} linha={linha} />
                  </Link>
                ) : (
                  <Celula coluna={c} linha={linha} />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
