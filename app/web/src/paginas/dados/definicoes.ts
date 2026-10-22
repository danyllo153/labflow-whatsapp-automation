/** Páginas do laboratório (07 §5): o que cada uma mostra e filtra. A API já filtra pelas views do Power BI. */

export type Formato = "texto" | "data" | "dataHora" | "situacao";

export interface Coluna {
  chave: string;
  rotulo: string;
  formato?: Formato;
  principal?: boolean; // no celular, vira o título do cartão
}

export interface Filtro {
  chave: string; // nome do parâmetro na API
  rotulo: string;
  tipo: "data" | "texto" | "numero" | "opcoes";
  opcoes?: string[];
  dica?: string;
}

export interface DefinicaoDePagina {
  caminho: string; // /paginas/<caminho>
  titulo: string;
  descricao: string;
  api: string;
  colunas: Coluna[];
  filtros: Filtro[];
  impressao: "em pé" | "deitado"; // 07: em pé para listas estreitas, deitado para tabelas largas
  semColetor?: boolean; // 07: o Coletor não vê esta página
}

export const FABRICAS = ["AQA", "CON", "COL", "UCH", "ITA", "TMG"]; // fábricas travadas (decisão de 14/10)

export const PAGINAS: DefinicaoDePagina[] = [
  {
    caminho: "coletas",
    titulo: "Coletas",
    descricao: "Coletas de tanques de terra e de navio, com quem coletou e quem digitou.",
    api: "/paginas/coletas",
    impressao: "em pé",
    colunas: [
      { chave: "data_coleta", rotulo: "Data da coleta", formato: "data" },
      { chave: "tanque", rotulo: "Tanque", principal: true },
      { chave: "origem", rotulo: "Origem" },
      { chave: "navio", rotulo: "Navio" },
      { chave: "coletado_por", rotulo: "Coletado por" },
      { chave: "digitado_por", rotulo: "Digitado por" },
      { chave: "registrado_em", rotulo: "Registrado em", formato: "dataHora" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Data de", tipo: "data" },
      { chave: "data_ate", rotulo: "Data até", tipo: "data" },
      { chave: "origem", rotulo: "Origem", tipo: "opcoes", opcoes: ["Terra", "Navio"] },
      { chave: "tanque", rotulo: "Tanque", tipo: "texto" },
      { chave: "navio", rotulo: "Navio", tipo: "texto", dica: "parte do nome" },
      { chave: "quem", rotulo: "Quem", tipo: "texto", dica: "quem coletou ou digitou" },
    ],
  },
  {
    caminho: "recebimento",
    titulo: "Recebimento",
    descricao: "C.T e B.L por load e lote, com a situação Ok / Não ok.",
    api: "/paginas/recebimento",
    impressao: "deitado",
    semColetor: true,
    colunas: [
      { chave: "load", rotulo: "Load", principal: true },
      { chave: "lote", rotulo: "Lote" },
      { chave: "fabrica", rotulo: "Fábrica" },
      { chave: "item", rotulo: "Item" },
      { chave: "analise", rotulo: "Análise" },
      { chave: "prevista", rotulo: "Leitura prevista", formato: "data" },
      { chave: "resultado", rotulo: "Resultado" },
      { chave: "situacao", rotulo: "Situação", formato: "situacao" },
      { chave: "lido_por", rotulo: "Lido por" },
      { chave: "data_leitura", rotulo: "Data da leitura", formato: "data" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Prevista de", tipo: "data" },
      { chave: "data_ate", rotulo: "Prevista até", tipo: "data" },
      { chave: "load", rotulo: "Load", tipo: "texto" },
      { chave: "lote", rotulo: "Lote", tipo: "numero" },
      { chave: "fabrica", rotulo: "Fábrica", tipo: "opcoes", opcoes: FABRICAS },
      { chave: "analise", rotulo: "Análise", tipo: "opcoes", opcoes: ["C.T 48h", "B.L 72h", "B.L 120h"] },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Ok", "Não ok", "Atrasado", "Vence hoje", "No prazo"] },
      { chave: "quem", rotulo: "Quem leu", tipo: "texto" },
    ],
  },
];

/** Páginas do Power BI que ainda não chegaram ao app (APP-019). */
export const PAGINAS_EM_BREVE = ["Visão geral", "Tanques", "Drops", "Desvios", "Embarque", "TAB e Coliformes", "Recebimento NFC", "Navios"];
