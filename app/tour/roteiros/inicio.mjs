// Vídeo 1: entrar, Início e Turno (o dia a dia de quem abre o LabFlow).
import { SENHA, USUARIO, cartao } from "../comum.mjs";

const abaDoInicio = (p, nome) => p.locator(".abas-com-acoes button, .abas-com-acoes a").filter({ hasText: new RegExp(`^\\s*${nome}`) });

export default {
  titulo: "Início e Turno",
  subtitulo: "Entrar, a visão do dia, o turno e o relatório da passagem de turno",
  itens: ["Entrar", "Início", "Turno", "Estufas", "Relatório do turno", "Busca e tema"],
  mostraEntrada: true,
  passos: [
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
    {
      destaque: (p) => p.locator(".estatisticas"),
      legenda: "O Início é a visão do dia. Os números do topo mostram o que analisar, o que ler hoje, os atrasados e o que ficou do turno anterior.",
    },
    {
      destaque: (p) => p.locator(".abas-com-acoes"),
      legenda: "As abas do Início separam cada lista: Para analisar, Ler hoje, Atrasados e Turno anterior. O Imprimir tira a folha do dia.",
    },
    {
      destaque: (p) => cartao(p, "Para analisar agora"),
      legenda: "Em Para analisar agora fica o que precisa de mão: plaquear, espalhar, confirmar e os drops, com o prazo. O botão Abrir leva à tela certa.",
    },
    {
      destaque: (p) => cartao(p, "Ler hoje"),
      legenda: "Em Ler hoje estão as placas que vencem hoje, por análise. As atrasadas aparecem em vermelho.",
    },
    {
      destaque: (p) => cartao(p, "Do turno anterior"),
      legenda: "Do turno anterior mostra as atividades que o último turno não marcou como feitas, para ninguém esquecer.",
    },
    {
      destaque: (p) => cartao(p, "Média por turno"),
      legenda: "Embaixo, os gráficos mostram o que foi concluído na semana e a média de cada turno.",
    },
    {
      antes: async (p, f) => { await f.clicar(abaDoInicio(p, "Atrasados")); },
      destaque: (p) => p.locator("main .cartao").first(),
      legenda: "Na aba Atrasados fica só o que passou do prazo, para analisar e para ler.",
    },
    {
      antes: (p, f) => f.ir("/turno"),
      destaque: (p) => cartao(p, "Entrar no turno"),
      legenda: "Na página Turno, cada analista entra no turno do dia. Assim o LabFlow sabe quem está trabalhando e registra quem fez cada coisa.",
    },
    {
      destaque: (p) => cartao(p, "Equipe do turno"),
      legenda: "A Equipe do turno mostra quem entrou, a que horas e em qual turno.",
    },
    {
      destaque: (p) => cartao(p, "Estufas"),
      legenda: "As estufas são conferidas a cada turno: um clique por estufa, ou Todas as pendentes Ok de uma vez.",
    },
    {
      destaque: (p) => cartao(p, "Para fazer agora"),
      legenda: "Para fazer agora lista as atividades fixas do turno. Cada uma é marcada como feita quando termina.",
    },
    {
      destaque: (p) => cartao(p, "Leituras pendentes"),
      legenda: "Leituras pendentes e Análises pendentes mostram tudo o que ainda está aberto no laboratório, com o prazo de cada item.",
    },
    {
      destaque: (p) => cartao(p, "Quem fez o quê"),
      legenda: "Quem fez o quê é a linha do tempo do turno. Dá para filtrar por pessoa e anotar um registro livre com o botão Anotar.",
    },
    {
      antes: (p, f) => f.ir("/turno/relatorio"),
      legenda: "O relatório do turno resume os analistas, as análises feitas e as pendentes, e as atividades sem feito. Sai pronto para imprimir na passagem de turno.",
    },
    {
      destaque: (p) => p.getByRole("button", { name: "Encerrar turno" }),
      legenda: "O campo Escrito à mão guarda o recado da passagem, e o Encerrar turno fecha o turno de quem está saindo.",
    },
    {
      antes: (p, f) => f.ir("/"),
      destaque: (p) => p.locator(".busca-rapida").first(),
      legenda: "A busca do topo leva direto a qualquer análise: é só digitar o nome, como drops, TAB ou água, e escolher.",
      durante: async (p, f) => { await f.digitar(p.locator(".busca-rapida input"), "drops"); await f.espera(1800); },
      depois: async (p) => { await p.keyboard.press("Escape"); },
    },
    {
      destaque: (p) => p.locator(".botao-tema").first(),
      legenda: "E o tema escuro deixa a tela mais confortável nos turnos da noite.",
      durante: async (p, f) => { await f.espera(1200); await f.clicar(p.locator(".botao-tema")); await f.espera(1500); await f.clicar(p.locator(".botao-tema")); },
    },
  ],
};
