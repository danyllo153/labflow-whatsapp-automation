import { useCallback, useEffect, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../../api";
import { formatar } from "../dados/formatos";

/** Admin → Coletas excluídas (APP-029): as coletas arquivadas; o Admin recupera, com motivo, e ela volta com o mesmo número. */

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
      <p className="texto-secundario">Excluir não apaga: as coletas ficam guardadas aqui até alguém do Admin recuperar.</p>
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
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const titulo = `Tanque ${e.tanque ?? "?"}${e.data_coleta ? ` · ${formatar(e.data_coleta, "data")}` : ""}${e.origem ? ` · ${e.origem}` : ""}`;

  async function recuperar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      await enviarJson(`/coletas/excluidas/${e.id}/recuperar`, { motivo });
      aoRecuperar(`Coleta do ${titulo} recuperada, com o mesmo número.`);
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível recuperar.");
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
        <button type="button" className="botao-secundario" onClick={() => setAberto(true)}>
          Recuperar
        </button>
      ) : (
        <form className="corrigir-horario" onSubmit={recuperar} aria-label={`Recuperar ${titulo}`}>
          <label className="campo">
            Motivo da recuperação
            <input maxLength={300} value={motivo} onChange={(x) => setMotivo(x.target.value)} />
          </label>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal">
              Confirmar a recuperação
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
