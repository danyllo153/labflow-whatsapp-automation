import { useCallback, useEffect, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../../api";
import { useSessao } from "../../sessao";
import { formatar } from "../dados/formatos";

/** Admin → Coletas excluídas (APP-029): as coletas arquivadas; o Admin recupera, com motivo, e ela volta com o mesmo número,
 * ou apaga de vez (27/10, também com motivo; o rastro fica no histórico de alterações). */

interface Excluida {
  id: number;
  coleta_id: number;
  origem: string | null;
  tanque: string | null;
  data_coleta: string | null;
  motivo: string | null;
  excluida_por: string | null;
  excluida_em: string;
}

export default function ColetasExcluidas() {
  const [lista, setLista] = useState<Excluida[] | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLista(await lerJson<Excluida[]>("/coletas/excluidas"));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section>
      <h1>Coletas excluídas</h1>
      <p className="texto-secundario">
        Excluir não apaga: as coletas ficam guardadas aqui até alguém do Admin recuperar ou apagar de vez (só o Admin, com motivo).
      </p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {lista && lista.length === 0 && (
        <div className="cartao">
          <p>Nenhuma coleta excluída.</p>
        </div>
      )}
      {lista?.map((e) => (
        <Linha key={e.id} item={e} aoRecuperar={(texto) => { setAviso(texto); void carregar(); }} />
      ))}
    </section>
  );
}

function Linha({ item: e, aoRecuperar }: { item: Excluida; aoRecuperar: (texto: string) => void }) {
  const { pessoa } = useSessao();
  const podeApagar = !!pessoa?.pode.includes("gerenciar_pessoas"); // só o Admin
  const [aberto, setAberto] = useState<"recuperar" | "apagar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const titulo = `Tanque ${e.tanque ?? "?"}${e.data_coleta ? ` · ${formatar(e.data_coleta, "data")}` : ""}${e.origem ? ` · ${e.origem}` : ""}`;

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      if (aberto === "apagar") {
        await enviarJson(`/coletas/excluidas/${e.id}/apagar`, { motivo });
        aoRecuperar(`Coleta do ${titulo} apagada de vez.`);
      } else {
        await enviarJson(`/coletas/excluidas/${e.id}/recuperar`, { motivo });
        aoRecuperar(`Coleta do ${titulo} recuperada, com o mesmo número.`);
      }
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível.");
    }
  }

  return (
    <section className="cartao" aria-label={titulo}>
      <h2>{titulo}</h2>
      <p className="texto-secundario">
        Excluída por {e.excluida_por ?? "?"} em {formatar(e.excluida_em, "dataHora")}
        {e.motivo && ` · motivo: ${e.motivo}`}
      </p>
      {!aberto ? (
        <div className="botoes-lado">
          <button type="button" className="botao-secundario" onClick={() => setAberto("recuperar")}>
            Recuperar
          </button>
          {podeApagar && (
            <button type="button" className="botao botao-perigo" onClick={() => setAberto("apagar")}>
              Apagar de vez
            </button>
          )}
        </div>
      ) : (
        <form className="corrigir-horario" onSubmit={confirmar} aria-label={`${aberto === "apagar" ? "Apagar de vez" : "Recuperar"} ${titulo}`}>
          {aberto === "apagar" && (
            <p className="mensagem-erro">Apagar de vez não tem volta: a coleta some desta lista. Fica só o registro de quem apagou e por quê.</p>
          )}
          <label className="campo">
            {aberto === "apagar" ? "Motivo para apagar de vez" : "Motivo da recuperação"}
            <input maxLength={300} value={motivo} onChange={(x) => setMotivo(x.target.value)} />
          </label>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="botoes-lado">
            <button type="submit" className={aberto === "apagar" ? "botao botao-perigo" : "botao botao-principal"}>
              {aberto === "apagar" ? "Apagar de vez" : "Confirmar a recuperação"}
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setAberto(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
