/** Itens do menu (07 §Visual): no celular é a barra de baixo, no computador o menu lateral. */
export interface ItemDoMenu {
  caminho: string;
  rotulo: string;
  pronto: boolean; // false = a tela ainda não existe ("Em breve")
  tarefa?: string; // tarefa da Fase C que entrega a tela
  pode?: string; // só aparece para quem tem esta permissão (GET /me → pode)
  soNoMenuLateral?: boolean; // no celular a barra de baixo tem só os 5 fixos; o resto fica em "Minha conta"
}

export const MENU: ItemDoMenu[] = [
  { caminho: "/", rotulo: "Início", pronto: true },
  { caminho: "/turno", rotulo: "Turno", pronto: true },
  { caminho: "/paginas", rotulo: "Análises", pronto: true },
  { caminho: "/esterilizacao", rotulo: "Esterilização", pronto: true },
  { caminho: "/registros-diarios", rotulo: "Registros diários", pronto: true, soNoMenuLateral: true },
  { caminho: "/relatorio-do-dia", rotulo: "Leituras", pronto: true, pode: "ver_paginas" }, // o relatório do dia, na barra do celular
  { caminho: "/arquivo", rotulo: "Arquivo", pronto: true, pode: "ver_paginas", soNoMenuLateral: true }, // contra-amostras (PB21)
  { caminho: "/assistente", rotulo: "Assistente", pronto: false, tarefa: "Fase D", soNoMenuLateral: true },
  { caminho: "/admin/turnos", rotulo: "Turnos e estufas", pronto: true, pode: "configurar_turnos", soNoMenuLateral: true },
  { caminho: "/admin/coletas-excluidas", rotulo: "Coletas excluídas", pronto: true, pode: "configurar_turnos", soNoMenuLateral: true },
  { caminho: "/admin/pessoas", rotulo: "Pessoas", pronto: true, pode: "gerenciar_pessoas", soNoMenuLateral: true },
];
