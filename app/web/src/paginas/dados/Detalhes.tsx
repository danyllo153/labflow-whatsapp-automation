import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { lerJson } from "../../api";
import type { Coluna } from "./definicoes";
import { classeDaSituacao, formatar } from "./formatos";

/**
 * Página de um tanque e de um navio (APP-019b, pedido de 23/10/2026). Mostra o status, o que já foi lido e o que falta.
 * Lê as rotas /paginas/tanques-terra/{coleta} e /paginas/navios/{navio}; atualiza a cada minuto.
 */

type Linha = Record<string, unknown>;
const ATUALIZAR_A_CADA_MS = 60_000;

function useDetalhe<T>(caminho: string) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<T>(caminho));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, [caminho]);
  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [carregar]);
  return { dados, erro };
}

function Valor({ coluna, linha }: { coluna: Coluna; linha: Linha }) {
  const texto = formatar(linha[coluna.chave], coluna.formato);
  if (coluna.formato === "situacao" && texto) return <span className={classeDaSituacao(texto)}>{texto}</span>;
  return <>{texto}</>;
}

function Bloco(props: { titulo: string; colunas: Coluna[]; linhas: Linha[]; vazio: string; link?: (l: Linha) => string }) {
  return (
    <div className="cartao">
      <h2>
        {props.titulo} <span className="contador">{props.linhas.length}</span>
      </h2>
      {props.linhas.length === 0 ? (
        <p className="texto-secundario">{props.vazio}</p>
      ) : (
        <div className="so-tela">
          <table className="tabela-dados">
            <thead>
              <tr>
                {props.colunas.map((c) => (
                  <th key={c.chave} scope="col">
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.linhas.map((l, n) => (
                <tr key={n}>
                  {props.colunas.map((c) => (
                    <td key={c.chave} data-rotulo={c.rotulo} className={c.principal ? "principal" : undefined}>
                      {c.principal && props.link ? (
                        <Link to={props.link(l)}>
                          <Valor coluna={c} linha={l} />
                        </Link>
                      ) : (
                        <Valor coluna={c} linha={l} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Numeros({ itens }: { itens: [string, unknown, boolean?][] }) {
  return (
    <div className="grade-numeros">
      {itens.map(([rotulo, valor, alerta]) => (
        <div key={rotulo} className={`cartao-numero estatico${alerta && Number(valor) > 0 ? " alerta" : ""}`}>
          <span className="numero">{String(valor ?? 0)}</span>
          <span className="rotulo">{rotulo}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Um tanque (terra ou navio)
const COLS_LEITURAS: Coluna[] = [
  { chave: "analise", rotulo: "Análise", principal: true },
  { chave: "metodo", rotulo: "Método" },
  { chave: "frasco", rotulo: "Frasco" },
  { chave: "etapa", rotulo: "Etapa" },
  { chave: "prevista", rotulo: "Prevista", formato: "data" },
  { chave: "contagem", rotulo: "Placas" },
  { chave: "resultado", rotulo: "Resultado", formato: "situacao" },
  { chave: "situacao", rotulo: "Situação", formato: "situacao" },
  { chave: "lida_por", rotulo: "Lido por" },
];
const COLS_DROPS: Coluna[] = [
  { chave: "drop", rotulo: "Drop", principal: true },
  { chave: "prevista", rotulo: "Prevista", formato: "data" },
  { chave: "situacao", rotulo: "Situação", formato: "situacao" },
  { chave: "concluido_por", rotulo: "Concluído por" },
  { chave: "desvio_resultado", rotulo: "Desvio", formato: "situacao" },
];
const COLS_DESVIOS: Coluna[] = [
  { chave: "tipo", rotulo: "Tipo", principal: true },
  { chave: "analise", rotulo: "Análise" },
  { chave: "frasco", rotulo: "Frasco" },
  { chave: "data_abertura", rotulo: "Aberto em", formato: "data" },
  { chave: "prazo", rotulo: "Prazo", formato: "data" },
  { chave: "status", rotulo: "Status" },
  { chave: "resultado", rotulo: "Resultado", formato: "situacao" },
];
const COLS_TESTES: Coluna[] = [
  { chave: "teste", rotulo: "Teste", principal: true },
  { chave: "data_feito", rotulo: "Feito em", formato: "data" },
  { chave: "status", rotulo: "Status" },
  { chave: "resultado", rotulo: "Resultado", formato: "situacao" },
  { chave: "proxima_etapa", rotulo: "Próxima etapa", formato: "data" },
  { chave: "situacao", rotulo: "Situação", formato: "situacao" },
];

interface DadosTanque {
  resumo: Linha;
  leituras: Linha[];
  drops: Linha[];
  desvios: Linha[];
  testes: Linha[];
}

export function DetalheTanque() {
  const { id } = useParams();
  const { dados, erro } = useDetalhe<DadosTanque>(`/paginas/tanques-terra/${id}`);
  const r = dados?.resumo;
  const deNavio = r?.origem === "Navio";
  return (
    <section>
      <p className="trilha">
        <Link to="/paginas">Páginas</Link> /{" "}
        {deNavio ? (
          <Link to={`/paginas/navios/${encodeURIComponent(String(r?.navio))}`}>{String(r?.navio)}</Link>
        ) : (
          <Link to="/paginas/tanques-terra">Tanques terra</Link>
        )}{" "}
        / Tanque {r ? String(r.tanque) : ""}
      </p>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {r && dados && (
        <>
          <h1>
            Tanque {String(r.tanque)} <span className={classeDaSituacao(String(r.status))}>{String(r.status)}</span>
          </h1>
          <p className="texto-secundario">
            {deNavio ? `Navio ${String(r.navio)}` : "Terra"} · coleta de {formatar(r.data_coleta, "data")}
          </p>
          <Numeros
            itens={[
              ["Leituras lidas", `${r.lidas} de ${r.leituras}`],
              ["Pendentes", r.pendentes],
              ["Atrasadas", r.atrasadas, true],
              ["Não ok", r.nao_ok, true],
              ["Drops pendentes", r.drops_pendentes],
              ["Desvios abertos", r.desvios_abertos, true],
            ]}
          />
          <Bloco titulo="Leituras" colunas={COLS_LEITURAS} linhas={dados.leituras} vazio="Nenhuma leitura registrada." />
          <Bloco titulo="Drops" colunas={COLS_DROPS} linhas={dados.drops} vazio="Sem drops." />
          <Bloco titulo="Desvios" colunas={COLS_DESVIOS} linhas={dados.desvios} vazio="Nenhum desvio." />
          {!deNavio && <Bloco titulo="TAB" colunas={COLS_TESTES} linhas={dados.testes} vazio="Nenhum TAB registrado." />}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Um navio: tanques NFC e concentrado (FCOJ)
const COLS_TANQUES_NAVIO: Coluna[] = [
  { chave: "tanque", rotulo: "Tanque", principal: true },
  { chave: "data_coleta", rotulo: "Coleta", formato: "data" },
  { chave: "status", rotulo: "Status", formato: "situacao" },
  { chave: "lidas", rotulo: "Lidas" },
  { chave: "pendentes", rotulo: "Pendentes" },
  { chave: "nao_ok", rotulo: "Não ok" },
  { chave: "desvios_abertos", rotulo: "Desvios abertos" },
];
const COLS_EMBARQUES: Coluna[] = [
  { chave: "embarque", rotulo: "Linha e fase", principal: true },
  { chave: "status", rotulo: "Status", formato: "situacao" },
  { chave: "amostras", rotulo: "Amostras" },
  { chave: "lidas", rotulo: "Leituras lidas" },
  { chave: "pendentes", rotulo: "Pendentes" },
  { chave: "nao_ok", rotulo: "Não ok" },
  { chave: "testes_abertos", rotulo: "TAB/Coliformes/Howard abertos" },
  { chave: "positivos", rotulo: "Positivos" },
];

interface DadosNavio {
  resumo: Linha;
  tanques: Linha[];
  embarques: Linha[];
}

export function DetalheNavio() {
  const { navio = "" } = useParams();
  const { dados, erro } = useDetalhe<DadosNavio>(`/paginas/navios/${encodeURIComponent(navio)}`);
  const r = dados?.resumo;
  const embarques = (dados?.embarques ?? []).map((e) => ({ ...e, embarque: `Linha ${e.linha} · fase ${e.fase}` }));
  return (
    <section>
      <p className="trilha">
        <Link to="/paginas">Páginas</Link> / <Link to="/paginas/navios">Navios</Link> / {navio}
      </p>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {r && dados && (
        <>
          <h1>
            {navio} <span className={classeDaSituacao(String(r.status))}>{String(r.status)}</span>
          </h1>
          <p className="texto-secundario">
            {String(r.produto)} · de {formatar(r.primeira_data, "data")} a {formatar(r.ultima_data, "data")}
          </p>
          <Numeros
            itens={[
              ["Tanques NFC", r.tanques_nfc],
              ["Pendentes NFC", r.pendentes_nfc],
              ["Embarques FCOJ", r.embarques_fcoj],
              ["Pendentes FCOJ", r.pendentes_fcoj],
              ["Não ok", r.nao_ok, true],
              ["Desvios abertos", r.desvios_abertos, true],
            ]}
          />
          <Bloco
            titulo="Tanques NFC do navio"
            colunas={COLS_TANQUES_NAVIO}
            linhas={dados.tanques}
            vazio="Este navio não tem tanque de NFC."
            link={(l) => `/paginas/tanques-terra/${l.coleta_id}`}
          />
          <Bloco
            titulo="Concentrado (FCOJ) do navio"
            colunas={COLS_EMBARQUES}
            linhas={embarques}
            vazio="Este navio não tem concentrado (FCOJ)."
            link={(l) => `/paginas/embarque?navio=${encodeURIComponent(navio)}&linha=${l.linha}&fase=${l.fase}`}
          />
        </>
      )}
    </section>
  );
}
