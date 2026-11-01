// Vídeo 9: Administração (pessoas, turnos e estufas, coletas excluídas, IT e vídeo de cada app).
import { cartao } from "../comum.mjs";

export default {
  titulo: "Administração",
  subtitulo: "Pessoas, turnos e estufas, coletas excluídas, instrução e vídeo de cada app",
  itens: ["Pessoas", "Turnos e estufas", "Coletas excluídas", "IT e Vídeo"],
  passos: [
    {
      antes: (p, f) => f.ir("/admin/pessoas"),
      legenda: "A administração é só do Admin. Em Pessoas ficam todos os usuários do LabFlow, com o cargo de cada um.",
    },
    {
      destaque: (p) => p.getByRole("button", { name: "Nova pessoa" }),
      legenda: "O botão Nova pessoa cadastra alguém e gera a senha provisória do primeiro acesso. Em Gerenciar, troca-se o cargo ou a senha.",
    },
    {
      antes: (p, f) => f.ir("/admin/turnos"),
      destaque: (p) => cartao(p, "Horários padrão dos turnos"),
      legenda: "Em Turnos e estufas, o Admin ajusta os horários da manhã, da tarde e da madrugada.",
    },
    {
      destaque: (p) => cartao(p, "Atividades fixas de cada turno"),
      legenda: "As atividades fixas de cada turno aparecem na página Turno para marcar como feitas. Cada uma pode valer só em alguns dias da semana.",
    },
    {
      destaque: (p) => cartao(p, "Estufas e faixas de trabalho"),
      legenda: "E as estufas, com a faixa de temperatura de trabalho de cada uma, são as que o turno confere.",
    },
    {
      antes: (p, f) => f.ir("/admin/coletas-excluidas"),
      legenda: "Em Coletas excluídas fica o que foi apagado, com quem apagou e quando, para nada sumir sem registro.",
    },
    {
      antes: async (p, f) => { await f.ir("/analises/tanques-terra"); await f.aba("IT"); },
      legenda: "Em todo app de análise, a aba IT é escrita pelo Admin, com o botão Adicionar IT. Cada nova versão fica guardada.",
      fala: "Em todo app de análise, a aba I T é escrita pelo Admin, com o botão Adicionar I T. Cada nova versão fica guardada.",
    },
    {
      antes: (p, f) => f.aba("Vídeo"),
      destaque: (p) => p.getByRole("button", { name: "Colar o link do vídeo" }),
      legenda: "Na aba Vídeo, o Admin cola o link do vídeo de explicação do app. É aqui que entram estes vídeos.",
    },
  ],
};
