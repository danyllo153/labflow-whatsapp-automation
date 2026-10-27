import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { enviarJson, lerJson } from "../api";
import { dm } from "../componentes/SeletorDeDias";

/**
 * A leitura dos drops (pedido de 27/10): o drop é analisado (incubado em stress) no dia dele e LIDO 5 dias depois. A lista
 * vem toda marcada; "Todos negativos" mostra o que vai ser gravado e grava depois do Confirmar. O que der positivo: o botão
 * Positivo pede um Confirmar, abre o desvio (repetição do drop de arquivo) e leva para a aba Desvios, onde se registra o
 * que vai ser feito, como nos botões das estufas. Lê GET /leituras/drops.
 */

interface DropParaLer {
  drop_id: number;
  drop: string;
  origem: string;
  tanque: string;
  navio: string | null;
  data_coleta: string;
  incubado_em: string;
  ler_em: string;
  atrasado: boolean;
}

interface Dados {
  pode_registrar: boolean;
  drops: DropParaLer[];
}

function nome(d: DropParaLer): string {
  return `${d.drop} do ${d.navio ? `${d.navio} · tanque ${d.tanque}` : `tanque ${d.tanque}`} (coleta ${dm(d.data_coleta)})`;
}

export default function LeituraDrops() {
  const navegar = useNavigate();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [desmarcados, setDesmarcados] = useState<Set<number>>(new Set());
  const [previa, setPrevia] = useState(false);
  const [positivo, setPositivo] = useState<DropParaLer | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<Dados>("/leituras/drops"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os drops.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !dados) return <p className="mensagem-erro">{erro}</p>;
  if (!dados) return <p className="carregando">Carregando...</p>;
  const marcados = dados.drops.filter((d) => !desmarcados.has(d.drop_id));

  async function gravarNegativos() {
    setEnviando(true);
    setErro("");
    try {
      setDados(await enviarJson<Dados>("/leituras/drops/negativos", { drop_ids: marcados.map((d) => d.drop_id) }));
      setPrevia(false);
      setDesmarcados(new Set());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setEnviando(false);
    }
  }

  async function abrirDesvio(d: DropParaLer) {
    setEnviando(true);
    setErro("");
    try {
      await enviarJson(`/leituras/drops/${d.drop_id}/positivo`, undefined);
      navegar("/analises/desvios?aba=abertos");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o desvio.");
      setEnviando(false);
    }
  }

  return (
    <section className="cartao" aria-label="Leitura dos drops">
      <h2>
        Drops para ler <span className="contador">{dados.drops.length}</span>
      </h2>
      <p className="texto-secundario">Lidos 5 dias depois do dia do drop. Desmarque o que ainda não leu.</p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {dados.drops.length === 0 ? (
        <p className="texto-secundario">Nenhum drop para ler.</p>
      ) : (
        <ul className="lista-marcavel">
          {dados.drops.map((d) => (
            <li key={d.drop_id}>
              <label>
                <input
                  type="checkbox"
                  checked={!desmarcados.has(d.drop_id)}
                  disabled={!dados.pode_registrar}
                  onChange={() =>
                    setDesmarcados((s) => {
                      const novo = new Set(s);
                      if (novo.has(d.drop_id)) novo.delete(d.drop_id);
                      else novo.add(d.drop_id);
                      return novo;
                    })
                  }
                />
                <span>
                  <strong>{d.drop}</strong> {d.navio ? `${d.navio} · ` : ""}tanque {d.tanque}
                  <small className="texto-secundario"> · coleta {dm(d.data_coleta)} · incubado {dm(d.incubado_em)}</small>{" "}
                  <span className={d.atrasado ? "etiqueta etiqueta-nao-ok" : "etiqueta etiqueta-pendente"}>{d.atrasado ? "Atrasado" : "Ler hoje"}</span>
                </span>
              </label>
              {dados.pode_registrar && (
                <button type="button" className="botao botao-simples botao-pequeno" aria-label={`Positivo: ${nome(d)}`} onClick={() => setPositivo(d)}>
                  Positivo
                </button>
              )}
              {positivo?.drop_id === d.drop_id && (
                <div className="previa-app" role="group" aria-label="Confirmar o drop positivo">
                  <p>
                    {nome(d)} deu positivo: abre o desvio (repetição do drop de arquivo em 7 °C, 13 °C e 25 °C) e vai para Desvios, para
                    registrar o que vai ser feito.
                  </p>
                  <div className="botoes-lado">
                    <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void abrirDesvio(d)}>
                      Confirmar
                    </button>
                    <button type="button" className="botao botao-simples" onClick={() => setPositivo(null)}>
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {dados.pode_registrar && marcados.length > 0 && !previa && (
        <div className="barra-acoes-fixa">
          <button type="button" className="botao botao-principal" onClick={() => setPrevia(true)}>
            Todos negativos ({marcados.length})
          </button>
        </div>
      )}
      {previa && (
        <div className="previa-app" role="group" aria-label="O que vai ser gravado">
          <strong>O que vai ser gravado</strong>
          <p>
            Negativo em {marcados.length} {marcados.length === 1 ? "drop" : "drops"}: {marcados.map(nome).join("; ")}.
          </p>
          <div className="botoes-lado">
            <button type="button" className="botao botao-principal" disabled={enviando} onClick={() => void gravarNegativos()}>
              Confirmar
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setPrevia(false)}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
