import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { lerJson } from "../../api";
import type { Coluna, DefinicaoDePagina, Filtro } from "./definicoes";
import { classeDaSituacao, formatar } from "./formatos";
import GraficoG2 from "./GraficoG2";
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

export default function PaginaDeDados({ def }: { def: DefinicaoDePagina }) {
  const [busca, setBusca] = useSearchParams();
  const aplicados = useMemo(() => filtrosDoEndereco(busca, def.filtros), [busca, def.filtros]);
  const pagina = Math.max(1, Number(busca.get("pagina")) || 1);

  const [rascunho, setRascunho] = useState<Record<string, string>>(aplicados);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [erro, setErro] = useState("");
  const [orientacao, setOrientacao] = useState(def.impressao);
  const [paraImprimir, setParaImprimir] = useState<Record<string, unknown>[] | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [avisoImpressao, setAvisoImpressao] = useState("");

  useEffect(() => setRascunho(aplicados), [aplicados]);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<Pagina>(`${def.api}?${consulta(aplicados, { pagina, por_pagina: POR_PAGINA })}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a página.");
    }
  }, [def.api, aplicados, pagina]);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [carregar]);

  function irPara(valores: Record<string, string>, novaPagina = 1) {
    const limpos = Object.fromEntries(Object.entries(valores).filter(([, v]) => v.trim() !== ""));
    setBusca(consulta(limpos, novaPagina > 1 ? { pagina: novaPagina } : {}));
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

  async function imprimir() {
    setAvisoImpressao("");
    if (dados && dados.total > LIMITE_IMPRESSAO) {
      setAvisoImpressao(`São ${dados.total} linhas: para imprimir, filtre até ${LIMITE_IMPRESSAO} ou use o Excel.`);
      return;
    }
    setPreparando(true);
    try {
      const todas: Record<string, unknown>[] = [];
      for (let p = 1; ; p++) {
        const parte = await lerJson<Pagina>(`${def.api}?${consulta(aplicados, { pagina: p, por_pagina: POR_PAGINA_IMPRESSAO })}`);
        todas.push(...parte.linhas);
        if (todas.length >= parte.total || parte.linhas.length === 0) break;
      }
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
  const textoDosFiltros = etiquetas.length
    ? etiquetas.map((f) => `${f.rotulo}: ${valorDoFiltro(f, aplicados[f.chave])}`).join(" · ")
    : "Sem filtro (todos os registros)";

  return (
    <section className="pagina-dados">
      <div className="so-tela">
        <p className="trilha">
          <Link to="/paginas">Páginas</Link> / {def.titulo}
        </p>
        <h1>{def.titulo}</h1>

        <div className="barra-acoes">
          <button type="button" className="botao-secundario" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(!filtrosAbertos)}>
            Filtros{etiquetas.length > 0 && ` (${etiquetas.length})`}
          </button>
          <a className="botao-secundario" href={`${def.api}/excel?${consulta(aplicados)}`} download>
            Exportar Excel
          </a>
          <button type="button" className="botao-secundario" onClick={() => void imprimir()} disabled={preparando || !dados}>
            {preparando ? "Preparando..." : "Imprimir"}
          </button>
          <label className="orientacao">
            Papel
            <select value={orientacao} onChange={(e) => setOrientacao(e.target.value as typeof orientacao)}>
              <option value="em pé">A4 em pé</option>
              <option value="deitado">A4 deitado</option>
            </select>
          </label>
        </div>
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

        {def.grafico === "g2" && <GraficoG2 consulta={consulta(aplicados)} aoEscolherLoad={(load) => irPara({ ...aplicados, load })} />}

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
