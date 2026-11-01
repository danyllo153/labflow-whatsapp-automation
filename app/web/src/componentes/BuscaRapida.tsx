import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { lerJson } from "../api";
import { APPS } from "../paginas/Paginas";
import { useSessao } from "../sessao";

/**
 * Busca da barra do topo: o nome de uma análise ("drops", "tab", "água") e, desde 01/11, o RASTREIO de um load, tanque
 * ou navio (GET /busca): recebimento de FCOJ e de NFC, embarque, tanques terra e de navio e o arquivo de contra-amostras,
 * inclusive o que já foi descartado. Cada achado abre a página do load, do tanque ou do navio, com tudo dele.
 */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface Achado {
  tipo: string;
  titulo: string;
  detalhe: string;
  caminho: string;
  situacao: string | null;
}

const ESPERA_MS = 250; // espera parar de digitar antes de perguntar à API

export default function BuscaRapida() {
  const navegar = useNavigate();
  const { pessoa } = useSessao();
  const [texto, setTexto] = useState("");
  const [rastreio, setRastreio] = useState<Achado[]>([]);
  const coletor = pessoa?.cargo === "Coletor";
  const podeRastrear = !coletor && !!pessoa?.pode.includes("ver_paginas");

  const achados = useMemo(() => {
    const t = semAcento(texto.trim());
    if (!t) return [];
    return APPS.filter((a) => !(a.semColetor && coletor) && semAcento(`${a.titulo} ${a.descricao}`).includes(t)).slice(0, 4);
  }, [texto, coletor]);

  useEffect(() => {
    const t = texto.trim();
    if (!podeRastrear || t.length < 2) {
      setRastreio([]);
      return;
    }
    let valido = true;
    const relogio = window.setTimeout(() => {
      lerJson<Achado[]>(`/busca?q=${encodeURIComponent(t)}`)
        .then((r) => valido && setRastreio(r))
        .catch(() => valido && setRastreio([]));
    }, ESPERA_MS);
    return () => {
      valido = false;
      window.clearTimeout(relogio);
    };
  }, [texto, podeRastrear]);

  function abrir(caminho: string) {
    setTexto("");
    setRastreio([]);
    navegar(caminho);
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const primeiro = rastreio[0]?.caminho ?? achados[0]?.caminho;
    if (primeiro) abrir(primeiro);
  }

  const aberto = achados.length > 0 || rastreio.length > 0;
  return (
    <form className="busca-rapida" role="search" onSubmit={enviar}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        aria-label="Procurar load, tanque, navio ou análise"
        placeholder={podeRastrear ? "Load, tanque, navio ou análise..." : "Procurar análise..."}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (setTexto(""), setRastreio([]))}
        maxLength={40}
      />
      {aberto && (
        <div className="busca-rapida-sugestoes">
          {rastreio.length > 0 && (
            <>
              <p className="busca-rapida-grupo">Rastreio</p>
              <ul aria-label="Loads, tanques e navios encontrados">
                {rastreio.map((a, i) => (
                  <li key={`${a.caminho}-${i}`}>
                    <button type="button" onClick={() => abrir(a.caminho)}>
                      <strong>
                        <span className="busca-rapida-tipo">{a.tipo}</span> {a.titulo}
                        {a.situacao && <em className="busca-rapida-situacao"> · {a.situacao}</em>}
                      </strong>
                      <span>{a.detalhe}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {achados.length > 0 && (
            <>
              <p className="busca-rapida-grupo">Análises</p>
              <ul aria-label="Análises encontradas">
                {achados.map((a) => (
                  <li key={a.caminho}>
                    <button type="button" onClick={() => abrir(a.caminho)}>
                      <strong>{a.titulo}</strong>
                      <span>{a.descricao}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
