// Os vídeos do tour: um por grupo do app (escolha do Danyllo em 01/11) e o tour geral.
// Cada roteiro: { titulo, subtitulo, itens, abertura?, mostraEntrada?, semCapa?, cartoes?, passos }.
// Sem `semCapa`, o vídeo ganha a capa (com o que ele mostra) e o fim automaticamente.
//
// Uso na linha de comando: node roteiros/index.mjs --lista (os nomes, em JSON) ou --falas <nome> (a fala de cada passo).

import { FIM, capa } from "../comum.mjs";
import admin from "./admin.mjs";
import aguas from "./aguas.mjs";
import dados from "./dados.mjs";
import dropsDesvios from "./drops-desvios.mjs";
import fcoj from "./fcoj.mjs";
import geral from "./geral.mjs";
import inicio from "./inicio.mjs";
import nfc from "./nfc.mjs";
import rotina from "./rotina.mjs";
import testes from "./testes.mjs";

/** Na ordem de numeração dos vídeos (o nome do arquivo sai `LabFlow-01-inicio.mp4` etc.). */
export const TOURS = {
  "01-inicio": inicio,
  "02-nfc": nfc,
  "03-fcoj": fcoj,
  "04-tab-coliformes-howard": testes,
  "05-drops-desvios": dropsDesvios,
  "06-aguas-superficies": aguas,
  "07-registros-diarios": rotina,
  "08-leituras-coletas-arquivo": dados,
  "09-administracao": admin,
  "00-geral": geral,
};

/** Os passos do vídeo, já com a capa e o fim. */
export function passosDo(nome) {
  const tour = TOURS[nome];
  if (!tour) throw new Error(`tour desconhecido: ${nome} (há: ${Object.keys(TOURS).join(", ")})`);
  if (tour.semCapa) return tour.passos;
  return [
    {
      antes: (p, f) => f.cartao(capa(tour.titulo, tour.subtitulo, tour.itens)),
      legenda: "",
      fala: tour.abertura ?? `${tour.titulo}. Neste vídeo: ${tour.subtitulo}.`,
      folga: 1,
    },
    ...tour.passos,
    {
      antes: (p, f) => f.cartao(FIM),
      legenda: "",
      fala: `Esse foi o vídeo de ${tour.titulo}. Os outros vídeos ficam na aba Vídeo de cada app do LabFlow.`,
      folga: 1.5,
    },
  ];
}

if (process.argv[1]?.endsWith("index.mjs")) {
  const [, , opcao, nome] = process.argv;
  if (opcao === "--lista") console.log(JSON.stringify(Object.keys(TOURS)));
  else if (opcao === "--falas") console.log(JSON.stringify(passosDo(nome).map((p) => p.fala ?? p.legenda)));
  else console.error("uso: node roteiros/index.mjs --lista | --falas <nome>");
}
