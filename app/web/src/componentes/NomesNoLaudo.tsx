import { useEffect, useState } from "react";

import { enviarJson, lerJson } from "../api";

/**
 * Quem vai no laudo (086, pedido do Danyllo de 27/11): numa folha em preenchimento, escolher o nome de quem vai em cada
 * data (fluxo laminar, material asséptico, ciclos) ou na folha inteira (recebimento). Cabe mais de uma pessoa (o turno é
 * dividido). Quem marcou entrada no turno nesse dia aparece primeiro, com "no turno". Sem ninguém marcado, o NOME sai em
 * branco (assinatura à mão). Grava a cada toque.
 */

interface Pessoa {
  id: number;
  nome: string;
}

interface Escolha {
  dia: string | null;
  pessoas: number[];
  sugeridas: number[];
}

export interface NomesDaFolha {
  laudo: string;
  pagina_id: number;
  por: "folha" | "dia";
  pode_mudar: boolean;
  pessoas: Pessoa[];
  escolhas: Escolha[];
}

function dataBr(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

export default function NomesNoLaudo({ laudo, paginaId }: { laudo: string; paginaId: number }) {
  const [dados, setDados] = useState<NomesDaFolha | null>(null);
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const url = `/laudos-nomes/${laudo}/${paginaId}`;

  useEffect(() => {
    lerJson<NomesDaFolha>(url).then(setDados, (e) => setErro(e instanceof Error ? e.message : "Não foi possível abrir."));
  }, [url]);

  async function alternar(escolha: Escolha, pessoa: number) {
    if (gravando || !dados?.pode_mudar) return;
    const pessoas = escolha.pessoas.includes(pessoa) ? escolha.pessoas.filter((p) => p !== pessoa) : [...escolha.pessoas, pessoa];
    setErro("");
    setGravando(true);
    try {
      setDados(await enviarJson<NomesDaFolha>(url, { dia: escolha.dia, pessoas }, "PUT"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setGravando(false);
    }
  }

  if (!dados) return erro ? <p className="mensagem-erro" role="alert">{erro}</p> : <p className="carregando">Carregando...</p>;

  return (
    <div className="nomes-no-laudo" role="group" aria-label="Quem vai no laudo">
      {dados.escolhas.length === 0 && <p className="texto-secundario">A folha ainda não tem nenhum dia lançado.</p>}
      {dados.escolhas.map((escolha) => {
        const primeiro = [...dados.pessoas].sort(
          (a, b) => Number(escolha.sugeridas.includes(b.id)) - Number(escolha.sugeridas.includes(a.id)),
        );
        const titulo = escolha.dia ? dataBr(escolha.dia) : "Folha inteira";
        return (
          <fieldset key={escolha.dia ?? "folha"} className="nomes-do-dia">
            <legend>{titulo}</legend>
            {primeiro.map((p) => {
              const marcado = escolha.pessoas.includes(p.id);
              return (
                <label key={p.id} className="marcar">
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!dados.pode_mudar || gravando}
                    onChange={() => void alternar(escolha, p.id)}
                  />{" "}
                  {p.nome}
                  {escolha.sugeridas.includes(p.id) && <span className="etiqueta etiqueta-ok">no turno</span>}
                </label>
              );
            })}
            {escolha.pessoas.length === 0 && <p className="texto-secundario">Ninguém marcado: o nome sai em branco.</p>}
          </fieldset>
        );
      })}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
