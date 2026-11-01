// Roteiro do tour guiado do LabFlow: cada passo diz a tela, o que fica em destaque e a legenda (lida pela voz de IA).
// `fala` substitui a legenda na narração quando a escrita não soa bem lida (siglas, números).
// Dados sempre FICTÍCIOS (banco de teste). Usuária do tour: preparar.py.

export const USUARIO = "marina.lopes";
export const SENHA = "Tour-2026-ok";

const cartao = (page, texto) => page.locator(".cartao").filter({ hasText: texto });
const aba = (page, nome) => page.getByRole("tab", { name: nome }).or(page.getByRole("link", { name: nome, exact: true })).or(page.getByRole("button", { name: nome, exact: true }));

const FRASCO = `<svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.5L4.6 18.2A1.8 1.8 0 0 0 6.1 21h11.8a1.8 1.8 0 0 0 1.5-2.8L14 9.5V3M7.5 15h9"/></svg>`;
const FUNDO = `margin:0;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;
  background:radial-gradient(ellipse at 50% 35%,#2541b8 0%,#16245e 55%,#0d1638 100%);color:#fff;font-family:Manrope,"Segoe UI",Arial,sans-serif;`;
const capa = (titulo, subtitulo) => `<!doctype html><html><body style='${FUNDO}'>
  <div style="width:92px;height:92px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;margin-bottom:22px">${FRASCO}</div>
  <div style="font-size:30px;font-weight:800;letter-spacing:.5px;margin-bottom:6px">LabFlow</div>
  <div style="font-size:40px;font-weight:800;text-align:center;max-width:1000px">${titulo}</div>
  <div style="width:70px;height:3px;background:#ffa726;margin:22px 0"></div>
  <div style="font-size:20px;opacity:.85;text-align:center;max-width:900px">${subtitulo}</div></body></html>`;

const linha = (icone, nome, nota = "") =>
  `<div style="display:flex;gap:12px;align-items:center;padding:9px 14px;border-bottom:1px solid #eef0f4"><span style="font-size:20px">${icone}</span>
   <span style="flex:1">${nome}</span><span style="color:#7a8396;font-size:14px">${nota}</span></div>`;
const PASTA = `<!doctype html><html><body style='${FUNDO}'>
  <div style="width:760px;background:#fff;color:#1f2433;border-radius:12px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.4);font-size:17px">
    <div style="background:#eef1f7;padding:12px 16px;font-size:15px;color:#4a5263">📁 G: › Garantia da Qualidade › Microbiologia › <b>LabFlow</b></div>
    ${linha("▶️", "<b>Abrir LabFlow</b>", "dois cliques")}
    ${linha("⏹️", "Fechar LabFlow")}
    ${linha("📡", "Testar rede")}
    ${linha("📄", "LEIA-ME")}
    ${linha("📁", "instalacao", "o programa: trocado nas atualizações")}
    ${linha("🗄️", "dados", "o banco, os backups e a marca: nunca apagar")}
  </div></body></html>`;

export const CARTOES = {
  abertura: capa("Sistema do Laboratório de Microbiologia", "Tour guiado pelas ferramentas do sistema"),
  pasta: PASTA,
  fim: capa("Todo o laboratório num lugar só", "Dados de demonstração · LabFlow"),
};

export const roteiro = [
  // --- abertura e acesso
  { antes: (p, f) => f.cartao("abertura"), legenda: "", fala: "Bem-vindo ao LabFlow, o sistema do laboratório de microbiologia. Vamos fazer um tour pelas principais ferramentas.", folga: 1.2 },
  {
    antes: (p, f) => f.cartao("pasta"),
    legenda: "O LabFlow roda direto da pasta da rede. Dois cliques em Abrir LabFlow e ele abre no navegador.",
  },
  {
    antes: (p, f) => f.cartao("pasta"),
    legenda: "O primeiro computador que abre vira o servidor; os outros entram junto, cada um com o seu login. Os dados ficam na pasta dados, com cópia a cada minuto e backup diário.",
  },
  {
    antes: (p, f) => f.abrir("/app/"),
    destaque: (p) => p.locator(".cartao-entrar"),
    legenda: "Cada pessoa entra com o próprio usuário e senha. O cargo define o que cada um vê e pode fazer: Admin, Analista, Coletor ou Consultor.",
    durante: async (p, f) => {
      await f.digitar(p.locator("input[name=usuario]"), USUARIO);
      await f.digitar(p.locator("input[type=password]"), SENHA);
    },
    depois: async (p, f) => { await f.clicar(p.getByRole("button", { name: "Entrar" })); await f.espera(1500); },
  },
  // --- Início
  {
    destaque: (p) => p.locator(".estatisticas"),
    legenda: "Depois de entrar, abre o Início: a visão do dia, com o que analisar, as placas para ler hoje, os atrasados e o que ficou do turno anterior.",
  },
  {
    destaque: (p) => cartao(p, "Para analisar agora"),
    legenda: "Em Para analisar agora aparece o que precisa de mão: plaquear, espalhar, confirmar e os drops, com o prazo de cada um. O botão Abrir leva direto para a tela certa.",
  },
  {
    destaque: (p) => p.locator(".aviso-turno-faixa"),
    legenda: "O aviso lembra de entrar no turno. Assim o LabFlow sabe quem está trabalhando e registra quem fez cada coisa.",
    depois: async (p, f) => { await f.clicar(p.locator(".aviso-turno-faixa a")); },
  },
  // --- Turno
  {
    antes: (p, f) => f.ir("/turno"),
    destaque: (p) => cartao(p, "Equipe do turno"),
    legenda: "Na página Turno fica a equipe: quem entrou, a que horas e em qual turno.",
  },
  {
    destaque: (p) => cartao(p, "Estufas"),
    legenda: "As estufas são conferidas a cada turno, com um clique por estufa ou todas as pendentes de uma vez.",
  },
  {
    antes: (p, f) => f.ir("/turno/relatorio"),
    legenda: "O relatório do turno resume o que cada analista fez e o que ficou pendente, pronto para imprimir na passagem de turno.",
  },
  // --- menu e análises
  {
    destaque: (p) => p.locator(".menu-lateral"),
    legenda: "No menu ficam todas as áreas: NFC, FCOJ concentrado, TAB, Coliformes e Howard, águas e superfícies e os registros diários. O número vermelho mostra os atrasados.",
    fala: "No menu ficam todas as áreas: NFC, FCOJ concentrado, TAB, Coliformes e Howard, águas e superfícies, e os registros diários. O número vermelho mostra os atrasados.",
  },
  {
    antes: (p, f) => f.ir("/paginas"),
    legenda: "Em Análises ficam todos os aplicativos do laboratório, cada um com a sua cor e a situação do dia.",
  },
  {
    antes: (p, f) => f.ir("/analises/tanques-terra"),
    destaque: (p) => cartao(p, "Coletas de tanques terra"),
    legenda: "Cada análise tem o seu aplicativo. Em Tanques terra, o painel mostra as coletas das últimas semanas, por tanque.",
  },
  {
    antes: async (p, f) => { await f.clicar(aba(p, "Coleta")); },
    destaque: (p) => p.locator("form.cartao, .cartao").first(),
    legenda: "Na aba Coleta registra-se a amostra. Antes de gravar, o LabFlow mostra uma prévia do que vai ser criado, e só grava com o Confirmar.",
  },
  {
    antes: (p, f) => f.ir("/analises/recebimento-fcoj"),
    destaque: (p) => p.locator(".numeros-app"),
    legenda: "No Recebimento de FCOJ, o painel mostra os atrasados, o que vence hoje e os não ok da semana.",
  },
  {
    destaque: (p) => cartao(p, "Para fazer agora"),
    legenda: "Em Para fazer agora estão as leituras de C.T e B.L de cada load, com o prazo. Ao lado, as fábricas com não ok no mês.",
    fala: "Em Para fazer agora estão as leituras de C T e B L de cada load, com o prazo. Ao lado, as fábricas com não ok no mês.",
  },
  {
    antes: (p, f) => f.ir("/analises/embarque-fcoj"),
    destaque: (p) => cartao(p, "Últimos navios embarcados"),
    legenda: "No Embarque de FCOJ aparecem os últimos navios, com as amostras de cada um e a situação: em andamento, ok ou não ok.",
  },
  {
    antes: (p, f) => f.ir("/analises/tab"),
    destaque: (p) => cartao(p, "TAB para espalhar"),
    legenda: "No TAB, as compostas para espalhar já vêm marcadas. Um botão faz a etapa da lista inteira de uma vez.",
    fala: "No TAB, as compostas para espalhar já vêm marcadas. Um botão faz a etapa da lista inteira de uma vez.",
  },
  {
    antes: (p, f) => f.ir("/analises/drops"),
    destaque: (p) => cartao(p, "Drops para concluir"),
    legenda: "Os drops D5, D10 e D15 aparecem com o prazo. O que não deu ok vira um desvio com um clique.",
    fala: "Os drops D 5, D 10 e D 15 aparecem com o prazo. O que não deu ok vira um desvio com um clique.",
  },
  {
    antes: (p, f) => f.ir("/analises/desvios"),
    destaque: (p) => cartao(p, "Leituras não ok sem desvio"),
    legenda: "Em Desvios ficam os não ok sem desvio aberto e as repetições em andamento, para nada ficar esquecido.",
  },
  // --- leituras
  {
    antes: (p, f) => f.ir("/leituras"),
    legenda: "A página Leituras junta, por análise, tudo o que vence hoje. É só digitar o resultado da placa e conferir antes de gravar.",
  },
  {
    destaque: (p) => p.getByRole("button", { name: "Copiar o relatório" }),
    legenda: "O relatório do dia sai pronto para copiar e enviar.",
  },
  // --- águas e superfícies
  {
    antes: (p, f) => f.ir("/paginas/agua-consumo"),
    legenda: "Em Águas e superfícies ficam a água de consumo, a água do processo, as baias e as linhas. Na água de consumo, cada unidade tem a coleta mensal e a semanal.",
  },
  {
    antes: (p, f) => f.ir("/paginas/agua-processo"),
    destaque: (p) => cartao(p, "Nova coleta"),
    legenda: "Na água do processo, os pontos coletados são marcados com um toque, e o desvio aparece sozinho quando há crescimento.",
  },
  // --- registros diários
  {
    antes: (p, f) => f.ir("/esterilizacao"),
    destaque: (p) => cartao(p, "O que foi esterilizado"),
    legenda: "Nos registros diários, a esterilização guarda cada ciclo da autoclave: o que foi, o número do ciclo e quem fez.",
  },
  {
    antes: (p, f) => f.ir("/meios-lotes"),
    legenda: "Em Meios de cultura, cada lote recebido é aceito com o pH e a conservação, e o lote em uso aparece para todos.",
    fala: "Em Meios de cultura, cada lote recebido é aceito com o p H e a conservação, e o lote em uso aparece para todos.",
  },
  {
    antes: (p, f) => f.ir("/registros-diarios"),
    legenda: "Os laudos de rastreio se preenchem sozinhos com o que foi registrado no dia.",
  },
  {
    antes: async (p, f) => { await f.ir("/analises/tanques-terra"); await f.clicar(aba(p, "Laudo")); },
    legenda: "Os laudos saem no modelo oficial da empresa, preenchidos linha a linha. Ao finalizar a folha, as linhas vazias recebem o traço, como em todo documento.",
  },
  // --- dados
  {
    antes: (p, f) => f.ir("/paginas/coletas"),
    legenda: "Em Coletas fica o histórico de todas as coletas, com busca, filtros, colunas e um painel de quem coletou.",
  },
  {
    antes: (p, f) => f.ir("/arquivo"),
    legenda: "No Arquivo de contra-amostras, o LabFlow diz em qual caixa está cada load e avisa quando é hora de descartar.",
  },
  // --- administração
  {
    antes: (p, f) => f.ir("/admin/pessoas"),
    legenda: "Na administração, o Admin cadastra as pessoas, define o cargo e gera a senha provisória do primeiro acesso.",
  },
  {
    antes: (p, f) => f.ir("/admin/turnos"),
    legenda: "Os horários dos turnos, as atividades fixas de cada turno e as estufas também se ajustam aqui.",
  },
  {
    antes: (p, f) => f.ir("/"),
    destaque: (p) => p.locator(".busca-rapida").first(),
    legenda: "A busca do topo encontra qualquer análise pelo load, tanque ou navio.",
    durante: async (p, f) => { await f.digitar(p.locator(".busca-rapida input"), "tanque 85"); await f.espera(1500); },
    depois: async (p) => { await p.keyboard.press("Escape"); },
  },
  {
    destaque: (p) => p.locator(".botao-tema").first(),
    legenda: "E o tema escuro deixa a tela mais confortável nos turnos da noite.",
    durante: async (p, f) => { await f.espera(1200); await f.clicar(p.locator(".botao-tema")); },
  },
  { antes: (p, f) => f.cartao("fim"), legenda: "", fala: "LabFlow: todo o laboratório num lugar só. Obrigado por assistir.", folga: 2 },
];
