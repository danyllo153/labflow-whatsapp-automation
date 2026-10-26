import { useSessao } from "../../sessao";
import LaudoEsterilizacao from "../LaudoEsterilizacao";
import { SoQuemGrava } from "./comum";

/**
 * A aba Laudo dos apps de análise (26/10): o laudo oficial preenchido sozinho, como o papel (Times 11), com as folhas para
 * imprimir e a folha impressa fechada com o traço. O modelo em PDF é enviado pelo Admin aqui (fica no banco, nunca no Git).
 */

type Laudo = "tab" | "coliformes" | "howard" | "nfc-tanques" | "embarque-fcoj";

const CONFIGS: Record<Laudo, { titulo: string; explicacao: string; unidade: string }> = {
  tab: {
    titulo: "Laudo do TAB – Método II (IFU 2019)",
    explicacao:
      "Uma folha por dia de análise (a data vai no cabeçalho), 20 por folha. TAB: + quando confirmado positivo, - quando negativo; o que está em confirmação sai como “aguardando confirmação”. Guaiacol em branco.",
    unidade: "testes",
  },
  coliformes: {
    titulo: "Laudo de Coliformes em suco",
    explicacao: "Um teste por linha, 33 por folha: data e hora, a amostra, Coliformes totais (presença ou ausência); E. coli com “-”.",
    unidade: "testes",
  },
  howard: {
    titulo: "Laudo da contagem de bolores (Howard)",
    explicacao: "5 amostras por folha: amostra, data, nº de campos positivos e o Howard (%). As grades #1, #2 e #3 ficam em branco.",
    unidade: "amostras",
  },
  "nfc-tanques": {
    titulo: "Laudo de análises de NFC",
    explicacao:
      "Uma folha por tanque de terra ou por navio (no “Nº do Tanque”), uma coleta por linha, 13 por folha: as 3 placas de cada leitura no Normal e, à direita, no Stress. B.L. superfície com “-”.",
    unidade: "coletas",
  },
  "embarque-fcoj": {
    titulo: "Laudo de análises do embarque",
    explicacao: "Uma folha por navio (Embarque = a viagem), uma amostra por linha, 13 por folha: linha/fase, load, amostra, C.T. e B.L.",
    unidade: "amostras",
  },
};

export function AbaLaudo({ laudo }: { laudo: Laudo }) {
  const { pessoa } = useSessao();
  const c = CONFIGS[laudo];
  return (
    <SoQuemGrava pode={!!pessoa?.pode.includes("registrar_analise")}>
      <LaudoEsterilizacao versao={0} config={{ base: `/laudos/${laudo}`, titulo: c.titulo, rotulo: c.titulo, explicacao: c.explicacao, unidade: c.unidade }} />
    </SoQuemGrava>
  );
}

export const ABA_LAUDO = { aba: "laudo", rotulo: "Laudo" };
