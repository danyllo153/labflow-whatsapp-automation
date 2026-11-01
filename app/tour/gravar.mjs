// Grava o tour guiado do LabFlow (vídeo de apresentação), no estilo "tour pelas ferramentas": a parte da tela que importa
// ganha uma moldura laranja e o resto escurece, a legenda aparece embaixo e o cursor mostra os cliques.
// Roda contra um LabFlow com DADOS FICTÍCIOS (o banco de teste). O vídeo nunca vai para o repositório.
//
// Uso: node gravar.mjs --tour 02-nfc --base http://127.0.0.1:8100 --saida pasta [--duracoes pasta/duracoes.json]
//   gera pasta/tour.webm e pasta/linha-do-tempo.json (início de cada fala, para o montar.py pôr a narração no lugar).
//   --tour: um dos nomes de roteiros/index.mjs (padrão: 00-geral, o tour de ponta a ponta).
//   Os vídeos que não mostram a tela de entrar já começam com a Marina Lopes logada.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { SENHA, USUARIO, abaApp } from "./comum.mjs";
import { TOURS, passosDo } from "./roteiros/index.mjs";

// require (e não import) para achar o Playwright também pelo NODE_PATH (instalação global)
const { chromium } = createRequire(import.meta.url)("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, v, i, todos) => (v.startsWith("--") ? [...pares, [v.slice(2), todos[i + 1]]] : pares), []),
);
const BASE = args.base ?? "http://127.0.0.1:8100";
const SAIDA = path.resolve(args.saida ?? "tour-saida");
const NOME = args.tour ?? "00-geral";
const TOUR = TOURS[NOME];
const roteiro = passosDo(NOME);
const DURACOES = args.duracoes && fs.existsSync(args.duracoes) ? JSON.parse(fs.readFileSync(args.duracoes, "utf8")) : {};
const LARGURA = 1280;
const ALTURA = 720;
fs.mkdirSync(SAIDA, { recursive: true });

/** Sem a narração (teste local): tempo estimado pela quantidade de palavras. */
function estimar(texto) {
  return Math.max(3.5, texto.split(/\s+/).length / 2.6);
}

// --- camada do tour (injetada em toda página) -----------------------------------------------------------------------
const CAMADA = `
(() => {
  if (window.__tour) return;
  const css = document.createElement("style");
  css.textContent = \`
    #tour-foco { position: fixed; z-index: 2147483000; pointer-events: none; border: 3px solid #ffa726; border-radius: 12px;
      box-shadow: 0 0 0 4000px rgba(8, 12, 28, .55), 0 0 18px rgba(255, 167, 38, .55); transition: all .55s ease; display: none; }
    #tour-legenda { position: fixed; z-index: 2147483001; pointer-events: none; left: 50%; transform: translateX(-50%);
      max-width: 1000px; width: max-content; background: rgba(15, 22, 46, .96); color: #fff; border-bottom: 3px solid #ffa726;
      border-radius: 10px; padding: 13px 24px; font: 500 18px/1.45 Manrope, "Segoe UI", Arial, sans-serif; text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, .35); transition: opacity .35s ease, top .4s ease, bottom .4s ease; opacity: 0; }
    #tour-cursor { position: fixed; z-index: 2147483002; pointer-events: none; width: 22px; height: 22px; left: -40px; top: -40px;
      transition: transform .12s ease; }
    #tour-cursor.clicou { transform: scale(.8); }
    .tour-pulso { position: fixed; z-index: 2147483001; pointer-events: none; width: 36px; height: 36px; margin: -18px 0 0 -18px;
      border-radius: 50%; border: 3px solid #ffa726; animation: tour-pulso .6s ease-out forwards; }
    @keyframes tour-pulso { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }\`;
  const foco = document.createElement("div"); foco.id = "tour-foco";
  const legenda = document.createElement("div"); legenda.id = "tour-legenda";
  const cursor = document.createElement("div"); cursor.id = "tour-cursor";
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  // marca de sincronia: 6 quadradinhos no canto de baixo à esquerda, com o número do passo em binário (branco = 1).
  // O montar.py lê a marca no próprio vídeo para pôr cada fala no quadro exato (o vídeo do navegador não segue o relógio)
  // e depois a cobre.
  const marca = document.createElement("div");
  marca.style.cssText = "position:fixed;left:0;bottom:0;width:48px;height:8px;display:flex;z-index:2147483003;pointer-events:none;background:#000";
  for (let i = 0; i < 6; i++) { const b = document.createElement("span"); b.style.cssText = "width:8px;height:8px;background:#000"; marca.appendChild(b); }
  const marcar = (n) => [...marca.children].forEach((b, i) => (b.style.background = (n >> i) & 1 ? "#fff" : "#000"));
  const montar = () => { document.head.appendChild(css); document.body.append(foco, legenda, cursor, marca); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", montar) : montar();
  addEventListener("mousemove", (e) => { cursor.style.left = e.clientX - 3 + "px"; cursor.style.top = e.clientY - 2 + "px"; }, true);
  addEventListener("mousedown", (e) => {
    cursor.classList.add("clicou"); setTimeout(() => cursor.classList.remove("clicou"), 150);
    const p = document.createElement("div"); p.className = "tour-pulso"; p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px";
    document.body.appendChild(p); setTimeout(() => p.remove(), 700);
  }, true);
  window.__tour = {
    mostrar(alvo, texto, n = 0) {
      if (!foco.isConnected) montar();
      marcar(n);
      if (alvo) {
        Object.assign(foco.style, { display: "block", left: alvo.x + "px", top: alvo.y + "px", width: alvo.w + "px", height: alvo.h + "px" });
      } else foco.style.display = "none";
      const embaixo = !alvo || alvo.y + alvo.h < innerHeight - 150;
      Object.assign(legenda.style, embaixo ? { bottom: "26px", top: "auto" } : { top: "22px", bottom: "auto" });
      legenda.textContent = texto; legenda.style.opacity = texto ? 1 : 0;
    },
    esconder() { foco.style.display = "none"; legenda.style.opacity = 0; marcar(0); },
  };
})();`;

async function camada(page) {
  await page.evaluate(CAMADA);
}

/** A caixa (com folga) do que vai em destaque, já rolado para aparecer na tela. */
async function caixa(page, destaque) {
  const alvo = destaque(page).first();
  await alvo.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
  const b = await alvo.boundingBox({ timeout: 6000 }).catch(() => null);
  if (!b) {
    console.warn("  (destaque não encontrado: segue sem moldura)");
    return null;
  }
  const folga = 7;
  const x = Math.max(4, b.x - folga);
  const y = Math.max(4, b.y - folga);
  return { x, y, w: Math.min(LARGURA - 8 - x, b.width + 2 * folga), h: Math.min(ALTURA - 8 - y, b.height + 2 * folga) };
}

/** Ferramentas que o roteiro usa nas ações: ir para uma tela (sem recarregar), clicar e digitar com o cursor visível. */
function ferramentas(page) {
  return {
    async ir(caminho) {
      const destino = "/app" + caminho;
      if (!page.url().startsWith(BASE + "/app")) await page.goto(BASE + destino, { waitUntil: "networkidle" });
      else {
        await page.evaluate((d) => { history.pushState({}, "", d); dispatchEvent(new PopStateEvent("popstate")); }, destino);
        await page.waitForLoadState("networkidle").catch(() => {});
      }
      await page.waitForTimeout(900);
      await camada(page);
    },
    async mover(locator) {
      const b = await locator.first().boundingBox();
      if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 28 });
      await page.waitForTimeout(250);
    },
    async clicar(locator) {
      // Sem o alvo (a tela mudou), o vídeo segue sem o clique e fica a foto para corrigir o roteiro.
      const achou = await locator.first().waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false);
      if (!achou) {
        console.warn(`  (clique não encontrado: ${locator}; segue sem ele)`);
        await page.screenshot({ path: path.join(SAIDA, `aviso-clique-${Date.now()}.png`) }).catch(() => {});
        return;
      }
      await locator.first().scrollIntoViewIfNeeded().catch(() => {});
      await this.mover(locator);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(900);
      await camada(page);
    },
    async digitar(locator, texto) {
      await this.mover(locator);
      await locator.first().click();
      await page.keyboard.type(texto, { delay: 70 });
    },
    async abrir(caminho) {
      await page.goto(BASE + caminho, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await camada(page);
    },
    /** Uma aba do app (Painel, Registrar, Resultados, Laudo, IT, Vídeo...). */
    async aba(nome) {
      await this.clicar(abaApp(page, nome));
      await page.waitForLoadState("networkidle").catch(() => {});
    },
    /** Um cartão em tela cheia: o HTML pronto (capa e fim) ou a chave de `cartoes` do roteiro. */
    async cartao(chaveOuHtml) {
      await page.setContent(chaveOuHtml.startsWith("<") ? chaveOuHtml : TOUR.cartoes[chaveOuHtml]);
      await camada(page);
    },
    espera: (ms) => page.waitForTimeout(ms),
  };
}

const navegador = await chromium.launch();

/** Entra antes de gravar (sem aparecer no vídeo) e devolve a sessão, para os vídeos que não mostram a tela de entrar. */
async function sessaoLogada() {
  const ctx = await navegador.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const pg = await ctx.newPage();
  await pg.goto(BASE + "/app/", { waitUntil: "networkidle" });
  await pg.fill("input[name=usuario]", USUARIO);
  await pg.fill("input[type=password]", SENHA);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForLoadState("networkidle");
  await pg.waitForTimeout(800);
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

console.log(`tour: ${NOME} (${TOUR.titulo}), ${roteiro.length} passos`);
const contexto = await navegador.newContext({
  storageState: TOUR.mostraEntrada ? undefined : await sessaoLogada(),
  viewport: { width: LARGURA, height: ALTURA },
  recordVideo: { dir: SAIDA, size: { width: LARGURA, height: ALTURA } },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
});
const page = await contexto.newPage();
const inicio = Date.now();
const f = ferramentas(page);
const linhaDoTempo = [];

for (const [i, passo] of roteiro.entries()) {
  try {
    await page.evaluate(() => window.__tour?.esconder()).catch(() => {}); // a legenda anterior não fica sobre a tela nova
    if (passo.antes) await passo.antes(page, f);
    await camada(page);
    const alvo = passo.destaque ? await caixa(page, passo.destaque) : null;
    await page.evaluate(([a, t, n]) => window.__tour.mostrar(a, t, n), [alvo, passo.legenda, i + 1]);
    const comeco = (Date.now() - inicio) / 1000;
    linhaDoTempo.push({ passo: i, inicio: comeco, legenda: passo.legenda });
    const dura = (DURACOES[i] ?? estimar(passo.fala ?? passo.legenda)) + (passo.folga ?? 0.7);
    if (passo.durante) await passo.durante(page, f);
    const falta = dura * 1000 - (Date.now() - inicio - comeco * 1000);
    if (falta > 0) await page.waitForTimeout(falta);
    if (passo.depois) {
      await page.evaluate(() => window.__tour.esconder());
      await passo.depois(page, f);
    }
    console.log(`passo ${i + 1}/${roteiro.length} ok (${comeco.toFixed(1)} s)`);
  } catch (erro) {
    console.error(`passo ${i + 1} falhou: ${erro.message}`);
    await page.screenshot({ path: path.join(SAIDA, `erro-passo-${i + 1}.png`) });
    throw erro;
  }
}

await page.waitForTimeout(1200);
const fim = (Date.now() - inicio) / 1000; // o vídeo começa antes do primeiro passo: o montar.py corta a diferença
const video = page.video();
await contexto.close();
await navegador.close();
fs.renameSync(await video.path(), path.join(SAIDA, "tour.webm"));
fs.writeFileSync(path.join(SAIDA, "linha-do-tempo.json"), JSON.stringify({ fim, passos: linhaDoTempo }, null, 1));
console.log(`vídeo: ${path.join(SAIDA, "tour.webm")} (${((Date.now() - inicio) / 1000).toFixed(0)} s)`);
