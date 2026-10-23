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
  rotulos?: Record<string, string>; // valor → texto na tela (ex.: "true" → "Sim")
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
  grafico?: "g2"; // 07 §6: gráfico da página (G2 no Recebimento)
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
    grafico: "g2",
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
  {
    caminho: "tanques",
    titulo: "Tanques",
    descricao: "Leituras de C.T, B.L e Psicrotróficos por tanque (normal e stress), com o resultado Ok / Não ok.",
    api: "/paginas/tanques",
    impressao: "deitado",
    semColetor: true,
    colunas: [
      { chave: "data_coleta", rotulo: "Data da coleta", formato: "data" },
      { chave: "tanque", rotulo: "Tanque", principal: true },
      { chave: "origem", rotulo: "Origem" },
      { chave: "navio", rotulo: "Navio" },
      { chave: "analise", rotulo: "Análise" },
      { chave: "frasco", rotulo: "Frasco" },
      { chave: "etapa", rotulo: "Etapa" },
      { chave: "prevista", rotulo: "Leitura prevista", formato: "data" },
      { chave: "contagem", rotulo: "Placas" },
      { chave: "resultado", rotulo: "Resultado", formato: "situacao" },
      { chave: "situacao", rotulo: "Situação", formato: "situacao" },
      { chave: "lida_por", rotulo: "Lido por" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Coleta de", tipo: "data" },
      { chave: "data_ate", rotulo: "Coleta até", tipo: "data" },
      { chave: "origem", rotulo: "Origem", tipo: "opcoes", opcoes: ["Terra", "Navio"] },
      { chave: "tanque", rotulo: "Tanque", tipo: "texto" },
      { chave: "navio", rotulo: "Navio", tipo: "texto", dica: "parte do nome" },
      { chave: "analise", rotulo: "Análise", tipo: "opcoes", opcoes: ["C.T", "B.L", "Psicrotróficos"] },
      { chave: "frasco", rotulo: "Frasco", tipo: "opcoes", opcoes: ["Normal", "Stress"] },
      { chave: "etapa", rotulo: "Etapa", tipo: "opcoes", opcoes: ["Pré-leitura", "Leitura final"] },
      { chave: "resultado", rotulo: "Resultado", tipo: "opcoes", opcoes: ["Ok", "Não ok", "Pendente"] },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Lido", "Atrasado", "Vence hoje", "No prazo"] },
      { chave: "quem", rotulo: "Quem leu", tipo: "texto" },
    ],
  },
  {
    caminho: "drops",
    titulo: "Drops",
    descricao: "D5, D10 e D15 previstos e concluídos, com quem concluiu e o desvio, se houve.",
    api: "/paginas/drops",
    impressao: "em pé",
    semColetor: true,
    colunas: [
      { chave: "prevista", rotulo: "Prevista", formato: "data" },
      { chave: "tanque", rotulo: "Tanque", principal: true },
      { chave: "drop", rotulo: "Drop" },
      { chave: "origem", rotulo: "Origem" },
      { chave: "navio", rotulo: "Navio" },
      { chave: "data_coleta", rotulo: "Data da coleta", formato: "data" },
      { chave: "situacao", rotulo: "Situação", formato: "situacao" },
      { chave: "concluido_por", rotulo: "Concluído por" },
      { chave: "desvio_resultado", rotulo: "Desvio", formato: "situacao" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Prevista de", tipo: "data" },
      { chave: "data_ate", rotulo: "Prevista até", tipo: "data" },
      { chave: "origem", rotulo: "Origem", tipo: "opcoes", opcoes: ["Terra", "Navio"] },
      { chave: "tanque", rotulo: "Tanque", tipo: "texto" },
      { chave: "navio", rotulo: "Navio", tipo: "texto", dica: "parte do nome" },
      { chave: "drop", rotulo: "Drop", tipo: "opcoes", opcoes: ["D5", "D10", "D15"] },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Concluído", "Atrasado", "Vence hoje", "No prazo"] },
      { chave: "quem", rotulo: "Quem concluiu", tipo: "texto" },
    ],
  },
  {
    caminho: "desvios",
    titulo: "Desvios",
    descricao: "Desvios de drop e de tanque, e as repetições; os abertos primeiro.",
    api: "/paginas/desvios",
    impressao: "deitado",
    semColetor: true,
    colunas: [
      { chave: "tipo", rotulo: "Tipo" },
      { chave: "tanque", rotulo: "Tanque", principal: true },
      { chave: "origem", rotulo: "Origem" },
      { chave: "navio", rotulo: "Navio" },
      { chave: "analise", rotulo: "Análise" },
      { chave: "frasco", rotulo: "Frasco" },
      { chave: "data_abertura", rotulo: "Aberto em", formato: "data" },
      { chave: "prazo", rotulo: "Prazo", formato: "data" },
      { chave: "status", rotulo: "Status" },
      { chave: "resultado", rotulo: "Resultado", formato: "situacao" },
      { chave: "temperaturas", rotulo: "Cresceu em" },
      { chave: "situacao", rotulo: "Situação", formato: "situacao" },
      { chave: "aberto_por", rotulo: "Aberto por" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Aberto de", tipo: "data" },
      { chave: "data_ate", rotulo: "Aberto até", tipo: "data" },
      { chave: "tipo", rotulo: "Tipo", tipo: "opcoes", opcoes: ["Drop", "Tanque"] },
      { chave: "aberto", rotulo: "Abertos ou concluídos", tipo: "opcoes", opcoes: ["Abertos", "Concluídos"] },
      { chave: "origem", rotulo: "Origem", tipo: "opcoes", opcoes: ["Terra", "Navio"] },
      { chave: "tanque", rotulo: "Tanque", tipo: "texto" },
      { chave: "navio", rotulo: "Navio", tipo: "texto", dica: "parte do nome" },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Atrasado", "Vence hoje", "No prazo", "Concluído"] },
      { chave: "quem", rotulo: "Quem", tipo: "texto", dica: "quem abriu ou deu o resultado" },
    ],
  },
  {
    caminho: "embarque",
    titulo: "Embarque",
    descricao: "C.T e B.L das amostras de embarque por navio, linha e fase.",
    api: "/paginas/embarque",
    impressao: "deitado",
    semColetor: true,
    colunas: [
      { chave: "navio", rotulo: "Navio", principal: true },
      { chave: "linha", rotulo: "Linha" },
      { chave: "fase", rotulo: "Fase" },
      { chave: "load", rotulo: "Load" },
      { chave: "amostra", rotulo: "Amostra" },
      { chave: "analise", rotulo: "Análise" },
      { chave: "prevista", rotulo: "Leitura prevista", formato: "data" },
      { chave: "resultado", rotulo: "Resultado" },
      { chave: "situacao", rotulo: "Situação", formato: "situacao" },
      { chave: "lido_por", rotulo: "Lido por" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Prevista de", tipo: "data" },
      { chave: "data_ate", rotulo: "Prevista até", tipo: "data" },
      { chave: "navio", rotulo: "Navio", tipo: "texto", dica: "parte do nome" },
      { chave: "linha", rotulo: "Linha", tipo: "numero" },
      { chave: "fase", rotulo: "Fase", tipo: "numero" },
      { chave: "load", rotulo: "Load", tipo: "texto" },
      { chave: "analise", rotulo: "Análise", tipo: "opcoes", opcoes: ["C.T 48h", "B.L 72h", "B.L 120h"] },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Ok", "Não ok", "Atrasado", "Vence hoje", "No prazo"] },
      { chave: "quem", rotulo: "Quem leu", tipo: "texto" },
    ],
  },
  {
    caminho: "testes",
    titulo: "TAB e Coliformes",
    descricao: "TAB, Coliformes e Howard por composta, lote e tanque: status, resultado e próxima etapa.",
    api: "/paginas/testes",
    impressao: "deitado",
    semColetor: true,
    colunas: [
      { chave: "teste", rotulo: "Teste" },
      { chave: "referencia", rotulo: "Load ou tanque", principal: true },
      { chave: "alvo", rotulo: "Composta / lote" },
      { chave: "origem", rotulo: "Origem" },
      { chave: "data_feito", rotulo: "Feito em", formato: "data" },
      { chave: "status", rotulo: "Status" },
      { chave: "resultado", rotulo: "Resultado", formato: "situacao" },
      { chave: "howard_percentual", rotulo: "Howard (%)" },
      { chave: "proxima_etapa", rotulo: "Próxima etapa", formato: "data" },
      { chave: "situacao", rotulo: "Situação", formato: "situacao" },
      { chave: "feito_por", rotulo: "Feito por" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Feito de", tipo: "data" },
      { chave: "data_ate", rotulo: "Feito até", tipo: "data" },
      { chave: "teste", rotulo: "Teste", tipo: "opcoes", opcoes: ["TAB", "Coliformes", "Howard"] },
      { chave: "origem", rotulo: "Origem", tipo: "opcoes", opcoes: ["Recebimento", "Embarque", "Tank farm"] },
      { chave: "referencia", rotulo: "Load ou tanque", tipo: "texto" },
      { chave: "status", rotulo: "Status", tipo: "opcoes", opcoes: ["No caldo", "Estriado", "Incubado", "Em confirmação", "Positivo, em confirmação", "Concluído"] },
      { chave: "resultado", rotulo: "Resultado", tipo: "opcoes", opcoes: ["Positivo", "Negativo"] },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Atrasado", "Vence hoje", "No prazo", "Concluído"] },
      { chave: "quem", rotulo: "Quem", tipo: "texto", dica: "quem fez ou deu o resultado" },
    ],
  },
  {
    caminho: "recebimento-nfc",
    titulo: "Recebimento NFC",
    descricao: "Lotes de NFC recebidos: fresh e pasteurizado, diluição e C.T/B.L já multiplicados.",
    api: "/paginas/recebimento-nfc",
    impressao: "deitado",
    semColetor: true,
    colunas: [
      { chave: "load", rotulo: "Load", principal: true },
      { chave: "lote", rotulo: "Lote" },
      { chave: "amostra", rotulo: "Amostra" },
      { chave: "diluicao", rotulo: "Diluição" },
      { chave: "data_recebimento", rotulo: "Recebido em", formato: "data" },
      { chave: "analise", rotulo: "Análise" },
      { chave: "prevista", rotulo: "Leitura prevista", formato: "data" },
      { chave: "valor_lido", rotulo: "Valor lido" },
      { chave: "resultado", rotulo: "Com diluição" },
      { chave: "situacao", rotulo: "Situação", formato: "situacao" },
      { chave: "lido_por", rotulo: "Lido por" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Recebido de", tipo: "data" },
      { chave: "data_ate", rotulo: "Recebido até", tipo: "data" },
      { chave: "load", rotulo: "Load", tipo: "texto" },
      { chave: "lote", rotulo: "Lote", tipo: "numero" },
      { chave: "amostra", rotulo: "Amostra", tipo: "opcoes", opcoes: ["Fresh", "Pasteurizado"] },
      { chave: "analise", rotulo: "Análise", tipo: "opcoes", opcoes: ["C.T 48h", "B.L 72h", "B.L 120h"] },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Lido", "Atrasado", "Vence hoje", "No prazo"] },
      { chave: "quem", rotulo: "Quem leu", tipo: "texto" },
    ],
  },
  {
    caminho: "navios",
    titulo: "Navios",
    descricao: "Por navio e viagem: tanques coletados, leituras feitas e pendentes, Não ok e desvios.",
    api: "/paginas/navios",
    impressao: "deitado",
    semColetor: true,
    colunas: [
      { chave: "navio", rotulo: "Navio e viagem", principal: true },
      { chave: "primeira_coleta", rotulo: "Primeira coleta", formato: "data" },
      { chave: "ultima_coleta", rotulo: "Última coleta", formato: "data" },
      { chave: "tanques", rotulo: "Tanques" },
      { chave: "leituras", rotulo: "Leituras" },
      { chave: "lidas", rotulo: "Lidas" },
      { chave: "pendentes", rotulo: "Pendentes" },
      { chave: "atrasadas", rotulo: "Atrasadas" },
      { chave: "nao_ok", rotulo: "Não ok" },
      { chave: "desvios_abertos", rotulo: "Desvios abertos" },
    ],
    filtros: [
      { chave: "data_de", rotulo: "Última coleta de", tipo: "data" },
      { chave: "data_ate", rotulo: "Última coleta até", tipo: "data" },
      { chave: "navio", rotulo: "Navio", tipo: "texto", dica: "parte do nome" },
      { chave: "com_pendencia", rotulo: "Só com pendência", tipo: "opcoes", opcoes: ["true"], rotulos: { true: "Sim" } },
    ],
  },
];
/** Páginas do Power BI que ainda não chegaram ao app. */
export const PAGINAS_EM_BREVE: string[] = [];
