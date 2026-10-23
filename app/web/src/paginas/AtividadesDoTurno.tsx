import { useCallback, useEffect, useState } from "react";

import { enviarJson, lerJson } from "../api";

/**
 * "Para fazer agora" (07 §3; APP-023): as atividades fixas do turno, cada uma com Feito e Não feito (grava quem e
 * quando). O Não feito passa como pendência herdada para o turno seguinte, com a caixa de Feito.
 */

export interface AtividadeDoTurno {
  id: number;
  texto: string;
  estado: "feito" | "nao_feito" | null;
  quem: string | null;
  quando: string | null;
}

export interface Herdada {
  atividade_id: number;
  texto: string;
  turno: string;
  dia: string; // AAAA-MM-DD
  quem: string | null;
}

export interface Recado {
  texto: string;
  turno: string;
  dia: string;
  por: string | null;
}

export interface DadosAtividades {
  turno_id: number;
  turno: string;
  dia: string;
  pode_marcar: boolean;
  total: number;
  feitas: number;
  atividades: AtividadeDoTurno[];
  herdadas: Herdada[];
  recados: Recado[];
}

function diaMes(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

export default function AtividadesDoTurno() {
  const [dados, setDados] = useState<DadosAtividades | null>(null);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<DadosAtividades>("/turno/atividades"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as atividades.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function marcarRecado(texto: string) {
    setGravando(-1);
    setErro("");
    try {
      setDados(await enviarJson<DadosAtividades>("/turno/atividades/recados/feito", { texto }, "PUT"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setGravando(null);
    }
  }

  async function marcar(id: number, feito: boolean | null) {
    setGravando(id);
    setErro("");
    try {
      setDados(await enviarJson<DadosAtividades>(`/turno/atividades/${id}`, { feito }, "PUT"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setGravando(null);
    }
  }

  if (!dados) return erro ? <p className="mensagem-erro">{erro}</p> : null;

  return (
    <section className="cartao atividades-turno" aria-label="Atividades do turno">
      <h2>
        Para fazer agora · {dados.turno}{" "}
        <span className="contador">
          {dados.feitas} de {dados.total}
        </span>
      </h2>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}

      {(dados.herdadas.length > 0 || dados.recados.length > 0) && (
        <div className="herdadas" role="group" aria-label="Pendências herdadas">
          <h3>Pendências herdadas</h3>
          <ul className="lista-atividades">
            {dados.recados.map((r) => (
              <li key={r.texto}>
                <label className="marcar-feito">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={!dados.pode_marcar || gravando === -1}
                    onChange={() => void marcarRecado(r.texto)}
                  />
                  <span>
                    {r.texto}
                    <span className="texto-secundario">
                      {" "}
                      · recado do turno {r.turno} de {diaMes(r.dia)}
                      {r.por && ` (${r.por})`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {dados.herdadas.map((h) => (
              <li key={h.atividade_id}>
                <label className="marcar-feito">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={!dados.pode_marcar || gravando === h.atividade_id}
                    onChange={() => void marcar(h.atividade_id, true)}
                  />
                  <span>
                    {h.texto}
                    <span className="texto-secundario">
                      {" "}
                      · não feito no turno {h.turno} de {diaMes(h.dia)}
                      {h.quem && ` (${h.quem})`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="lista-atividades">
        {dados.atividades.map((a) => (
          <li key={a.id} className={a.estado ? `atividade ${a.estado}` : "atividade"}>
            <div className="atividade-texto">
              <span>{a.texto}</span>
              {a.estado && (
                <span className="texto-secundario">
                  {a.estado === "feito" ? "Feito" : "Não feito"}
                  {a.quem && ` por ${a.quem}`}
                  {a.quando && ` às ${a.quando}`}
                </span>
              )}
            </div>
            {dados.pode_marcar && (
              <div className="atividade-botoes" role="group" aria-label={`Marcar ${a.texto}`}>
                <button
                  type="button"
                  className="botao-secundario"
                  aria-pressed={a.estado === "feito"}
                  disabled={gravando === a.id}
                  onClick={() => void marcar(a.id, a.estado === "feito" ? null : true)}
                >
                  Feito
                </button>
                <button
                  type="button"
                  className="botao-secundario"
                  aria-pressed={a.estado === "nao_feito"}
                  disabled={gravando === a.id}
                  onClick={() => void marcar(a.id, a.estado === "nao_feito" ? null : false)}
                >
                  Não feito
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {dados.total === 0 && <p className="texto-secundario">Nenhuma atividade fixa para este turno hoje.</p>}
    </section>
  );
}
