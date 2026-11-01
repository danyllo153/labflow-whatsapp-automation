// Peças comuns dos roteiros do tour: a usuária fictícia, os seletores e os cartões (capa e fim) de cada vídeo.
// Dados sempre FICTÍCIOS (banco de teste). Usuária do tour: preparar.py.

export const USUARIO = "marina.lopes";
export const SENHA = "Tour-2026-ok";

/** Um cartão da tela pelo texto do título. */
export const cartao = (page, texto) => page.locator(".cartao").filter({ hasText: texto });

/** Uma aba do app (a barra de pílulas embaixo do título), pelo começo do nome (o contador vem depois). */
export const abaApp = (page, nome) =>
  page.locator("nav.abas-app button, nav.abas-app a").filter({ hasText: new RegExp(`^\\s*${nome}`) });

/** A barra de abas do app, para mostrar todas de uma vez. */
export const barraDeAbas = (page) => page.locator("nav.abas-app");

/** O conteúdo da página (sem o menu e o topo). */
export const conteudo = (page) => page.locator("main");

const FRASCO = `<svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.5L4.6 18.2A1.8 1.8 0 0 0 6.1 21h11.8a1.8 1.8 0 0 0 1.5-2.8L14 9.5V3M7.5 15h9"/></svg>`;
export const FUNDO = `margin:0;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;
  background:radial-gradient(ellipse at 50% 35%,#2541b8 0%,#16245e 55%,#0d1638 100%);color:#fff;font-family:Manrope,"Segoe UI",Arial,sans-serif;`;

/** Cartão de capa (ou de fim) com o título do vídeo. `itens`: o que o vídeo mostra, em linha. */
export const capa = (titulo, subtitulo, itens = []) => `<!doctype html><html><body style='${FUNDO}'>
  <div style="width:92px;height:92px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;margin-bottom:22px">${FRASCO}</div>
  <div style="font-size:30px;font-weight:800;letter-spacing:.5px;margin-bottom:6px">LabFlow</div>
  <div style="font-size:40px;font-weight:800;text-align:center;max-width:1000px">${titulo}</div>
  <div style="width:70px;height:3px;background:#ffa726;margin:22px 0"></div>
  <div style="font-size:20px;opacity:.85;text-align:center;max-width:900px">${subtitulo}</div>
  ${itens.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:1000px;margin-top:26px">${itens
    .map((i) => `<span style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 16px;font-size:17px">${i}</span>`)
    .join("")}</div>` : ""}</body></html>`;

export const FIM = capa("Todo o laboratório num lugar só", "Dados de demonstração · LabFlow");
