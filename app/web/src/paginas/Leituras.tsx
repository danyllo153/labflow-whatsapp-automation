import { useSearchParams } from "react-router-dom";

import { usePendentes } from "../componentes/BlocosDoDia";
import { AbasDaPagina, BotaoImprimir, CabecalhoDaPagina } from "../componentes/CabecalhoDaPagina";
import { LeituraDasSuperficies } from "./aguas/Superficies";
import { LeituraDaAguaDoProcesso } from "./aguas/AguaProcesso";
import { LeituraDoEmbarque } from "./analises/Embarque";
import { LeituraDoNfc } from "./analises/RecebimentoNfc";
import { LeituraDoRecebimento } from "./analises/RecebimentoFcoj";
import { LeituraDosTanques } from "./analises/Tanques";
import { LeituraDoTeste } from "./analises/Testes";
import LeituraDrops from "./LeituraDrops";
import RelatorioDoDia from "./RelatorioDoDia";

/**
 * Leituras (pedido de 27/10): o relatório do dia (o que já foi lido e o que ainda sai, com os botões de ler tudo de uma vez)
 * e uma aba para a leitura de cada análise, onde se digita o resultado. O histórico dos resultados fica na página de cada
 * análise (aba Resultados). O número de cada aba é o que falta ler (GET /leituras/pendentes); o atalho do Turno abre a aba
 * certa (?aba=...).
 */

const ABAS = [
  { aba: "dia", rotulo: "Relatório do dia", grupo: "" },
  { aba: "recebimento", rotulo: "Recebimento concentrado", grupo: "Recebimento concentrado" },
  { aba: "embarque", rotulo: "Embarque FCOJ", grupo: "Embarque FCOJ" },
  { aba: "recebimento-nfc", rotulo: "Recebimento NFC", grupo: "Recebimento NFC" },
  { aba: "tanques-terra", rotulo: "Tanques terra", grupo: "Tanques terra" },
  { aba: "tanques-navio", rotulo: "Tanques navio", grupo: "navio" },
  { aba: "drops", rotulo: "Drops", grupo: "Drops" },
  { aba: "agua-processo", rotulo: "Água do processo", grupo: "Água do processo" },
  { aba: "cip-linha", rotulo: "CIP linha de embarque", grupo: "CIP linha de embarque" },
  { aba: "cip-baia", rotulo: "CIP baia", grupo: "CIP baia" },
  { aba: "tab", rotulo: "TAB", grupo: "TAB" },
  { aba: "coliformes", rotulo: "Coliformes", grupo: "Coliformes" },
];

// os grupos da API que não são das abas fixas são os navios
const FIXOS = new Set(ABAS.map((a) => a.grupo).filter(Boolean));

export default function Leituras() {
  const [params, setParams] = useSearchParams();
  const pendentes = usePendentes();
  const aba = ABAS.some((a) => a.aba === params.get("aba")) ? (params.get("aba") as string) : "dia";

  const contar = (grupo: string) =>
    (pendentes?.leituras ?? [])
      .filter((g) => (grupo === "navio" ? !FIXOS.has(g.grupo) : g.grupo === grupo))
      .reduce((n, g) => n + g.itens.reduce((m, i) => m + i.atrasadas, 0), 0);
  const abas = ABAS.map((a) => ({ aba: a.aba, rotulo: a.rotulo, contador: a.grupo ? contar(a.grupo) || undefined : undefined }));

  return (
    <section className="pagina-leituras">
      <CabecalhoDaPagina
        icone="leituras"
        cor="geral"
        voltar={false}
        titulo="Leituras"
        descricao="O relatório do dia e a leitura de cada análise: toque na análise, digite o resultado e confira antes de gravar. O histórico fica na página de cada análise."
        acoes={aba === "dia" ? <BotaoImprimir aoClicar={() => window.print()} /> : undefined}
      />
      <AbasDaPagina titulo="Leituras" abas={abas} aba={aba} irPara={(nova) => setParams({ aba: nova })} />
      {aba === "dia" && <RelatorioDoDia embutido />}
      {aba === "recebimento" && <LeituraDoRecebimento analiseInicial={params.get("analise") ?? ""} />}
      {aba === "embarque" && <LeituraDoEmbarque />}
      {aba === "recebimento-nfc" && <LeituraDoNfc />}
      {aba === "tanques-terra" && <LeituraDosTanques origem="terra" />}
      {aba === "tanques-navio" && <LeituraDosTanques origem="navio" navio={params.get("navio") ?? undefined} />}
      {aba === "drops" && <LeituraDrops />}
      {aba === "agua-processo" && <LeituraDaAguaDoProcesso />}
      {aba === "cip-linha" && <LeituraDasSuperficies tipo="Linha" />}
      {aba === "cip-baia" && <LeituraDasSuperficies tipo="Baia" />}
      {aba === "tab" && <LeituraDoTeste qual="TAB" />}
      {aba === "coliformes" && <LeituraDoTeste qual="COLIFORMES" />}
    </section>
  );
}
