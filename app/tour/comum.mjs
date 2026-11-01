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

// --- demonstração da aba Resultados (a mesma tabela em todo app) ---------------------------------------------------
const formFiltros = (p) => p.locator("form.formulario-filtros");
const grafico = (p) => p.locator("main section.grafico-resultado, main section.dashboard, main .cartao:has(canvas)").first();
const segmento = (p, nome) => p.locator("main [role=group] button").filter({ hasText: new RegExp(`^\\s*${nome}\\s*$`) });

/**
 * Os passos que mostram a aba Resultados funcionando de verdade: busca, filtros com etiquetas, fábricas, as visões do
 * gráfico (e o toque numa coluna), Excel, impressão, limpar e abrir o detalhe. Cada opção ausente pula o passo.
 *   busca: texto digitado na busca · filtros: [{ campo, valor }] · fabricas: ["AQA", "UCH"]
 *   visoes: [{ botao | tocar, legenda, fala? }] · detalhe: legenda ao abrir o 1º link da tabela
 */
export function demoResultados(o) {
  const passos = [];
  if (o.busca) passos.push({
    destaque: (p) => p.locator(".busca-com-filtro"),
    legenda: o.legendaBusca ?? `A busca procura em todas as colunas e em todos os registros. Por exemplo, o ${o.busca}.`,
    fala: o.falaBusca,
    durante: async (p, f) => {
      await f.digitar(p.locator(".busca-redonda input"), o.busca); await p.keyboard.press("Enter"); await f.espera(2200);
    },
    depois: async (p, f) => { await p.locator(".busca-redonda input").fill(""); await p.keyboard.press("Enter"); await f.espera(800); },
  });
  if (o.filtros?.length) {
    passos.push({
      antes: async (p, f) => { await f.clicar(p.getByRole("button", { name: "Filtros" })); },
      destaque: formFiltros,
      legenda: o.legendaFiltros ?? `O botão Filtros abre os campos: datas, ${o.filtros.map((x) => x.campo.toLowerCase()).join(", ")} e outros. Aqui escolho ${o.filtros.map((x) => `${x.campo} ${x.valor}`).join(" e ")}.`,
      fala: o.falaFiltros,
      durante: async (p, f) => {
        for (const x of o.filtros) await f.escolher(formFiltros(p).locator("label.campo").filter({ hasText: new RegExp(`^\\s*${x.campo}`) }).locator("select"), x.valor);
      },
      depois: async (p, f) => { await f.clicar(formFiltros(p).getByRole("button", { name: "Filtrar" })); await f.espera(1200); },
    });
    passos.push({
      destaque: (p) => p.locator("ul.etiquetas-filtro"),
      legenda: "Os filtros usados viram etiquetas: o x tira um por um. A tabela, o gráfico, o Excel e a impressão passam a mostrar só o filtrado.",
    });
  }
  if (o.fabricas?.length) passos.push({
    destaque: (p) => p.locator(".pilulas-fabrica"),
    legenda: o.legendaFabricas ?? "As pílulas de fábrica mostram uma unidade ou comparam várias: cada toque acrescenta uma fábrica, com a cor dela no gráfico.",
    durante: async (p, f) => {
      for (const fab of o.fabricas) { await f.espera(900); await f.clicar(p.locator(".pilulas-fabrica button").filter({ hasText: new RegExp(`^\\s*${fab}\\s*$`) })); }
    },
  });
  // visões do gráfico: { botao, legenda } troca a visão; { tocar: true, legenda } toca numa coluna (abre os lotes dela)
  for (const v of o.visoes ?? []) passos.push({
    destaque: grafico,
    legenda: v.legenda,
    fala: v.fala,
    durante: async (p, f) => {
      await f.espera(1500);
      if (v.tocar) await f.tocarGrafico(grafico(p).locator("canvas, svg").first(), v.x ?? 0.82, v.y ?? 0.85);
      else await f.clicar(segmento(p, v.botao));
    },
  });
  passos.push({
    destaque: (p) => p.getByRole("link", { name: "Exportar Excel" }),
    legenda: "O Exportar Excel baixa a planilha com exatamente o que está na tela, já filtrado, pronta para abrir no Excel ou no Power BI.",
    durante: async (p, f) => { await f.espera(1500); await f.baixar(p.getByRole("link", { name: "Exportar Excel" }), "só o que está filtrado"); },
  });
  passos.push({
    destaque: (p) => p.locator(".menu-imprimir"),
    legenda: "O Imprimir pergunta o papel, A4 em pé ou deitado, e imprime só a tabela filtrada.",
    durante: async (p, f) => { await f.espera(1200); await f.clicar(p.getByRole("button", { name: "Imprimir" })); await f.espera(2500); },
    depois: async (p, f) => { await f.clicar(p.getByRole("button", { name: "Imprimir" })); },
  });
  if (o.filtros?.length) passos.push({
    antes: async (p, f) => { await f.clicar(p.getByRole("button", { name: "Filtros" })); },
    destaque: (p) => formFiltros(p).getByRole("button", { name: "Limpar filtros" }),
    legenda: "E o Limpar filtros volta tudo ao começo. Os filtros ficam no endereço da página: dá para mandar o link já filtrado para um colega.",
    depois: async (p, f) => { await f.clicar(formFiltros(p).getByRole("button", { name: "Limpar filtros" })); },
  });
  if (o.detalhe) passos.push({
    antes: async (p, f) => { await f.clicar(p.locator(".pagina-dados table tbody tr a").first()); await f.espera(800); },
    legenda: o.detalhe,
    depois: async (p, f) => { await p.goBack(); await f.espera(1500); },
  });
  return passos;
}
