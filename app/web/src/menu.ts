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
  { caminho: "/paginas", rotulo: "Páginas", pronto: true },
  { caminho: "/esterilizacao", rotulo: "Esterilização", pronto: true },
  { caminho: "/estufas", rotulo: "Estufas", pronto: true, soNoMenuLateral: true },
  { caminho: "/assistente", rotulo: "Assistente", pronto: false, tarefa: "Fase D" },
  { caminho: "/admin/pessoas", rotulo: "Pessoas", pronto: true, pode: "gerenciar_pessoas", soNoMenuLateral: true },
];
