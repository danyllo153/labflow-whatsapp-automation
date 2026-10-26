import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BotaoImprimir, CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Link, useSearchParams } from "react-router-dom";

import { lerJson } from "../../api";
import { ColunasPorDia, LinhaPorDia } from "../../componentes/Graficos";
import { formatar } from "./formatos";

/** Visão geral (07 §5): números do período, pendências por bloco e os Não ok mais recentes. APP-019. */

interface VisaoGeralDados {
  data_de: string;
  data_ate: string;
  numeros: { chave: string; rotulo: string; valor: number }[];
  pendencias: { bloco: string; vence_hoje: number; atrasados: number }[];
  alertas: { pagina: string; caminho: string; referencia: string; analise: string; resultado: string; data: string | null }[];
  serie: { dia: string; registradas: number; nao_ok: number }[];
}

const ATUALIZAR_A_CADA_MS = 60_000;
const ALERTA = new Set(["tanques_nao_ok", "recebimento_nao_ok", "embarque_nao_ok", "testes_positivos", "desvios_abertos"]);

export default function VisaoGeral() {
  const [busca, setBusca] = useSearchParams();
  const de = busca.get("data_de") ?? "";
  const ate = busca.get("data_ate") ?? "";
  const [rascunho, setRascunho] = useState({ de, ate });
  const [dados, setDados] = useState<VisaoGeralDados | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => setRascunho({ de, ate }), [de, ate]);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams();
    if (de) p.set("data_de", de);
    if (ate) p.set("data_ate", ate);
    try {
      setDados(await lerJson<VisaoGeralDados>(`/paginas/visao-geral${p.toString() ? `?${p}` : ""}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a visão geral.");
    }
  }, [de, ate]);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [carregar]);

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (rascunho.de) p.set("data_de", rascunho.de);
    if (rascunho.ate) p.set("data_ate", rascunho.ate);
    setBusca(p);
  }

  return (
    <section>
      <CabecalhoDaPagina
        icone="visao-geral"
        cor="geral"
        titulo="Visão geral"
        descricao="Os números do período e o que pede atenção, em todas as análises."
        acoes={<BotaoImprimir aoClicar={() => window.print()} />}
      />

      <form className="periodo" onSubmit={aplicar} aria-label="Período">
        <label className="campo">
          De
          <input type="date" value={rascunho.de} onChange={(e) => setRascunho({ ...rascunho, de: e.target.value })} />
        </label>
        <label className="campo">
          Até
          <input type="date" value={rascunho.ate} onChange={(e) => setRascunho({ ...rascunho, ate: e.target.value })} />
        </label>
        <button type="submit" className="botao-secundario">
          Ver período
        </button>
      </form>

      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}

      {dados && (
        <>
          <p className="texto-secundario">
            Período: {formatar(dados.data_de, "data")} a {formatar(dados.data_ate, "data")}
            {!de && !ate && " (últimos 30 dias)"}
          </p>
          <div className="grade-numeros">
            {dados.numeros.map((n) => (
              <div key={n.chave} className={`cartao-numero estatico${ALERTA.has(n.chave) && n.valor > 0 ? " alerta" : ""}`}>
                <span className="numero">{n.valor}</span>
                <span className="rotulo">{n.rotulo}</span>
              </div>
            ))}
          </div>

          {dados.serie && dados.serie.length > 1 && (
            <div className="graficos-dupla">
              <section className="cartao" aria-label="Análises registradas por dia">
                <h2>Análises registradas por dia</h2>
                <ColunasPorDia pontos={dados.serie.map((p) => ({ dia: p.dia, valor: p.registradas }))} descricao="Análises registradas por dia" />
                <p className="texto-secundario">Leituras de NFC, drops, C.T/B.L, Recebimento NFC e resultados de TAB, Coliformes e Howard.</p>
              </section>
              <section className="cartao" aria-label="Não ok por dia">
                <h2>Não ok por dia</h2>
                <LinhaPorDia pontos={dados.serie.map((p) => ({ dia: p.dia, valor: p.nao_ok }))} descricao="Não ok por dia" />
                <p className="texto-secundario">C.T/B.L Não ok, resultados positivos e desvios abertos.</p>
              </section>
            </div>
          )}

          <div className="cartao">
            <h2>Pendências de hoje por bloco</h2>
            <table className="tabela-simples">
              <thead>
                <tr>
                  <th scope="col">Bloco</th>
                  <th scope="col">Vence hoje</th>
                  <th scope="col">Atrasados</th>
                </tr>
              </thead>
              <tbody>
                {dados.pendencias.map((p) => (
                  <tr key={p.bloco}>
                    <td>{p.bloco}</td>
                    <td>{p.vence_hoje}</td>
                    <td className={p.atrasados > 0 ? "texto-nao-ok" : undefined}>{p.atrasados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              <Link to="/">Ver a lista no Início</Link>
            </p>
          </div>

          <div className="cartao">
            <h2>Não ok mais recentes</h2>
            {dados.alertas.length === 0 ? (
              <p>Nenhum Não ok no período.</p>
            ) : (
              <ul className="lista-pendencias">
                {dados.alertas.map((a, n) => (
                  <li key={`${a.referencia}-${a.analise}-${n}`}>
                    <div className="pendencia-texto">
                      <Link to={a.caminho} className="pendencia-ref">
                        {a.referencia}
                      </Link>
                      <span className="texto-secundario">
                        {a.analise} · {a.resultado}
                      </span>
                    </div>
                    <div className="pendencia-situacao">
                      <span className="etiqueta etiqueta-nao-ok">Não ok</span>
                      <span className="texto-secundario">{formatar(a.data, "data")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
