import { useEffect, useState } from "react";

import { enviarJson, lerJson } from "../../api";

/**
 * Instrução e Vídeo de cada app de análise (Fase E, E9; APP-062). O Admin escreve a instrução no próprio app e ela fica só
 * no banco (o método da empresa não vai para o repositório); o vídeo entra depois como link (decisão de 24/10: os vídeos
 * serão feitos por IA a partir da instrução). Cada gravação vira uma versão nova; a tela mostra a última.
 */

export type AppComInstrucao = "recebimento-fcoj" | "tanques" | "testes" | "drops" | "embarque-fcoj" | "recebimento-nfc" | "desvios";

export const ABAS_FINAIS = [
  { aba: "instrucao", rotulo: "IT" },
  { aba: "video", rotulo: "Vídeo" },
];

export interface DadosDaInstrucao {
  app: string;
  texto: string;
  video_url: string | null;
  versao: number;
  escrita_por: string | null;
  escrita_em: string | null;
  pode_editar: boolean;
}

export default function Instrucao({ app, parte }: { app: AppComInstrucao; parte: "instrucao" | "video" }) {
  const [dados, setDados] = useState<DadosDaInstrucao | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [video, setVideo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    lerJson<DadosDaInstrucao>(`/analises/instrucoes/${app}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar a instrução."));
  }, [app]);

  function editar() {
    setTexto(dados?.texto ?? "");
    setVideo(dados?.video_url ?? "");
    setErro("");
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro("");
    try {
      setDados(await enviarJson<DadosDaInstrucao>(`/analises/instrucoes/${app}`, { texto, video_url: video.trim() || null }, "PUT"));
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setSalvando(false);
    }
  }

  const titulo = parte === "instrucao" ? "Instrução de trabalho (IT)" : "Vídeo";
  if (!dados)
    return (
      <div className="cartao">
        <h2>{titulo}</h2>
        {erro ? <p className="mensagem-erro">{erro}</p> : <p className="carregando">Carregando...</p>}
      </div>
    );

  return (
    <div className="cartao">
      <h2>{titulo}</h2>
      {editando ? (
        <>
          {parte === "instrucao" ? (
            <label className="campo">
              Instrução de trabalho (IT)
              <textarea className="instrucao-editor" rows={14} maxLength={20000} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </label>
          ) : (
            <label className="campo">
              Link do vídeo (começa com https://)
              <input type="url" maxLength={500} placeholder="https://..." value={video} onChange={(e) => setVideo(e.target.value)} />
            </label>
          )}
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="botoes-lado">
            <button type="button" className="botao botao-principal" disabled={salvando} onClick={() => void salvar()}>
              Gravar
            </button>
            <button type="button" className="botao botao-simples" disabled={salvando} onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          {parte === "instrucao" &&
            (dados.texto ? (
              <div className="instrucao-texto">{dados.texto}</div>
            ) : (
              <p className="texto-secundario">
                {dados.pode_editar ? "Ainda não há IT desta análise. Toque em Adicionar IT." : "O Admin ainda não adicionou a IT desta análise."}
              </p>
            ))}
          {parte === "video" &&
            (dados.video_url ? (
              <p>
                <a className="botao botao-principal" href={dados.video_url} target="_blank" rel="noopener noreferrer">
                  Abrir o vídeo
                </a>
              </p>
            ) : (
              <p className="texto-secundario">Ainda não há vídeo. Ele será feito a partir da instrução de trabalho.</p>
            ))}
          {dados.versao > 0 && (
            <p className="texto-secundario">
              Versão {dados.versao} · {dados.escrita_por} em {dados.escrita_em}
            </p>
          )}
          {dados.pode_editar && (
            <button type="button" className="botao botao-simples" onClick={editar}>
              {parte === "instrucao" ? (dados.texto ? "Editar a IT" : "Adicionar IT") : dados.video_url ? "Trocar o link" : "Colar o link do vídeo"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
