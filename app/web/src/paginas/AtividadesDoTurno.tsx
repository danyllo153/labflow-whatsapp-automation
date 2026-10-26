import { useCallback, useEffect, useState } from "react";

import { enviarJson, lerJson } from "../api";

/**
 * "Para fazer agora" (07 §3; APP-023): as atividades fixas do turno, cada uma com a caixa de Feito (grava quem e quando;
 * desde 25/10, APP-065, sem o botão Não feito). O que ninguém marcar até o fim do turno passa como não feito para o
 * turno seguinte, em "Pendências herdadas".
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

/** Lê as atividades do turno e marca Feito (a atividade, a herdada ou o recado); usado aqui e no Início (26/10). */
export function useAtividades() {
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

  return { dados, erro, gravando, marcar, marcarRecado };
}

export default function AtividadesDoTurno() {
  const { dados, erro, gravando, marcar, marcarRecado } = useAtividades();

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
            <label className="atividade-caixa">
              <input
                type="checkbox"
                checked={a.estado === "feito"}
                disabled={!dados.pode_marcar || gravando === a.id}
                onChange={() => void marcar(a.id, a.estado === "feito" ? null : true)}
              />
              <span className="atividade-texto">
                <span>{a.texto}</span>
                {a.estado && (
                  <span className="texto-secundario">
                    {a.estado === "feito" ? "Feito" : "Não feito"}
                    {a.quem && ` por ${a.quem}`}
                    {a.quando && ` às ${a.quando}`}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {dados.pode_marcar && dados.total > 0 && (
        <p className="texto-secundario atividades-dica">O que ficar sem marcar até o fim do turno passa como não feito para o turno seguinte.</p>
      )}
      {dados.total === 0 && <p className="texto-secundario">Nenhuma atividade fixa para este turno hoje.</p>}
    </section>
  );
}
