import { useCallback, useEffect, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../api";

/**
 * "Atividades realizadas" e linha do tempo do turno (APP-033): o que o laboratório fez, com quem e a que horas.
 * As linhas livres substituem o campo escrito à mão do relatório em Excel; o resto vem sozinho dos registros do app.
 */

export interface Registro {
  tipo: "coleta" | "nfc" | "drop" | "esterilizacao" | "estufa" | "atividade" | "livre";
  texto: string;
  quem: string;
  quando: string; // HH:MM
  id: number | null;
  pode_excluir: boolean;
}

export interface RegistrosDoTurno {
  turno: string;
  dia: string;
  pode_escrever: boolean;
  itens: Registro[];
}

const ROTULO: Record<Registro["tipo"], string> = {
  coleta: "Coleta",
  nfc: "Leitura",
  drop: "Drop",
  esterilizacao: "Esterilização",
  estufa: "Estufa",
  atividade: "Atividade",
  livre: "Anotação",
};

const ATUALIZAR_A_CADA_MS = 30_000;

export default function RegistrosDoTurnoCartao() {
  const [dados, setDados] = useState<RegistrosDoTurno | null>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<RegistrosDoTurno>("/turno/registros"));
    } catch {
      /* a linha do tempo é um extra: sem ela o resto da tela segue */
    }
  }, []);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), ATUALIZAR_A_CADA_MS);
    return () => window.clearInterval(relogio);
  }, [carregar]);

  async function escrever(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      setDados(await enviarJson<RegistrosDoTurno>("/turno/registros", { texto }));
      setTexto("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(id: number) {
    setErro("");
    try {
      setDados(await enviarJson<RegistrosDoTurno>(`/turno/registros/${id}`, undefined, "DELETE"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  if (!dados) return null;

  return (
    <section className="cartao registros-turno" aria-label="Atividades realizadas">
      <h2>
        Atividades realizadas <span className="contador">{dados.itens.length}</span>
      </h2>
      {dados.pode_escrever && (
        <form className="linha-registro" onSubmit={escrever}>
          <label className="campo">
            <span>O que foi feito</span>
            <input value={texto} maxLength={200} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: troca das ponteiras da bancada 2" />
          </label>
          <button type="submit" className="botao" disabled={enviando || !texto.trim()}>
            Anotar
          </button>
        </form>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {dados.itens.length === 0 ? (
        <p className="texto-secundario">Nada registrado neste turno ainda.</p>
      ) : (
        <ul className="linha-do-tempo">
          {dados.itens.map((r, n) => (
            <li key={`${r.tipo}-${r.id ?? n}-${r.quando}`}>
              <span className="hora-registro">{r.quando}</span>
              <span className={`etiqueta etiqueta-tipo-${r.tipo}`}>{ROTULO[r.tipo]}</span>
              <span className="texto-registro">{r.texto}</span>
              <span className="texto-secundario">por {r.quem}</span>
              {r.pode_excluir && r.id !== null && (
                <button type="button" className="link-botao" aria-label={`Excluir: ${r.texto}`} onClick={() => void excluir(r.id as number)}>
                  Excluir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
