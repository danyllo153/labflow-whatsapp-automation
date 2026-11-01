// Vídeo 7: Registros diários (esterilização, material asséptico, meios e lotes, branco do dia e incubação).
import { cartao } from "../comum.mjs";

export default {
  titulo: "Registros diários",
  subtitulo: "Esterilização, material asséptico, meios de cultura, branco do dia e incubação",
  itens: ["Esterilização", "Material asséptico", "Meios e lotes", "Branco do dia", "Incubação"],
  passos: [
    {
      antes: (p, f) => f.ir("/registros-diarios"),
      legenda: "Os registros diários são os controles da rotina do laboratório. Cada um tem a sua tela e o seu laudo de rastreio, que se preenche sozinho.",
    },
    {
      antes: (p, f) => f.ir("/esterilizacao"),
      destaque: (p) => cartao(p, "O que foi esterilizado?"),
      legenda: "Na Esterilização, cada ciclo da autoclave é registrado: escolhe-se o que foi esterilizado, como ponteira, meio ou frasco, e o número do ciclo.",
      durante: async (p, f) => { await f.espera(2500); await f.clicar(p.getByRole("button", { name: "Ponteira", exact: true })); },
    },
    {
      destaque: (p) => cartao(p, "Esterilizações por tipo e turno"),
      legenda: "Ao lado ficam as esterilizações do turno, e o gráfico mostra os ciclos por tipo e por turno.",
    },
    {
      antes: (p, f) => f.ir("/material-asseptico"),
      destaque: (p) => cartao(p, "Material do dia"),
      legenda: "No Material asséptico, cada dia de análise guarda o que foi usado. Os dias anteriores ficam nos botões de data.",
    },
    {
      destaque: (p) => p.getByRole("button", { name: "Salvar o dia" }),
      legenda: "O botão menor que um em todos preenche o resultado de uma vez, e o Salvar o dia grava a folha.",
    },
    {
      antes: (p, f) => f.ir("/meios-lotes"),
      legenda: "Em Meios de cultura, cada meio tem a sua aba: OSA, PDA, PCA e Wort. O lote em uso aparece em destaque para todos.",
    },
    {
      destaque: (p) => cartao(p, "Lote recebido"),
      legenda: "Cada lote recebido é aceito com o pH e a conservação, no botão Cadastrar lote.",
      fala: "Cada lote recebido é aceito com o p H e a conservação, no botão Cadastrar lote.",
    },
    {
      destaque: (p) => p.getByLabel("Importar histórico"),
      legenda: "O histórico em papel entra de uma vez: o Admin salva a planilha como CSV, com meio, lote, data, conservação, pH, observação e em uso, e clica em Importar CSV.",
      fala: "O histórico em papel entra de uma vez: o Admin salva a planilha como C S V, com meio, lote, data, conservação, p H, observação e em uso, e clica em Importar C S V.",
      durante: async (p, f) => {
        await f.espera(3000);
        await f.enviar(p.getByLabel("Arquivo CSV do histórico de lotes"), "historico-meios.csv",
          "OSA;DEMO-101;05/09/2026;OK;OK;-;nao\nOSA;DEMO-102;20/09/2026;OK;OK;-;nao\nPDA;DEMO-201;12/09/2026;OK;OK;-;nao\n");
      },
    },
    {
      destaque: (p) => p.getByLabel("Importar histórico"),
      legenda: "O LabFlow diz quantos lotes entraram e quantos já existiam. Se uma linha estiver errada, nada é gravado e ele mostra qual linha corrigir.",
    },
    {
      antes: (p, f) => f.ir("/fluxo-laminar"),
      legenda: "No Branco do dia ficam o controle da capela do fluxo laminar e o controle do meio de cultura. Os dias já salvos ganham o sinal de feito.",
    },
    {
      antes: (p, f) => f.ir("/incubacao"),
      legenda: "Na Incubação, o LabFlow mostra o que entrou nas estufas em cada dia, a partir das análises registradas. Entra na folha no dia seguinte.",
    },
    {
      antes: (p, f) => f.aba("Laudo"),
      legenda: "Todos os registros diários têm a aba Laudo, com a folha pronta para finalizar e imprimir. O Abrir PDF mostra a folha no modelo da empresa.",
    },
    {
      destaque: (p) => p.getByText(/Enviar o modelo \(PDF\)|Trocar o modelo \(PDF\)/).first(),
      legenda: "E o modelo de cada laudo é importado uma vez pelo Admin: o PDF em branco da empresa, no botão Enviar o modelo. Daí em diante, as folhas saem nele.",
    },
  ],
};
