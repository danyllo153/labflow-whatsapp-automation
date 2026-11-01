import { useState } from "react";

import { AbasDaPagina, CabecalhoDaPagina, useAba } from "../componentes/CabecalhoDaPagina";
import { useSessao } from "../sessao";
import { ColetaDeTanque } from "./analises/Tanques";
import { SoQuemGrava } from "./analises/comum";
import PaginaDeDados from "./dados/PaginaDeDados";
import { PAGINAS } from "./dados/definicoes";

/**
 * Coletas (pedido de 01/11): o único lugar de registrar a coleta de tanque terra ou navio (saiu dos apps de tanques) e a
 * lista das coletas. O Coletor só vê esta página (e o Turno): sem o gráfico, só as coletas dele (a API filtra), e em
 * cada uma corrige o tanque e a data ou exclui com motivo (DetalheColeta).
 */

const DEF = PAGINAS.find((p) => p.caminho === "coletas")!;

export default function Coletas() {
  const { pessoa } = useSessao();
  const coletor = pessoa?.cargo === "Coletor";
  const podeColetar = !!pessoa?.pode.includes("registrar_coleta");
  // o Coletor abre direto no registrar; quem analisa, na lista
  const registrar = { aba: "registrar", rotulo: "Registrar coleta" };
  const abas = coletor ? [registrar, { aba: "lista", rotulo: "Minhas coletas" }] : [{ aba: "lista", rotulo: "Coletas" }, registrar];
  const [aba, irPara] = useAba(abas);
  const [origem, setOrigem] = useState<"terra" | "navio">("terra");
  const [versao, setVersao] = useState(0);
  // o Coletor não vê o gráfico (01/11): só a lista das coletas dele
  const def = coletor ? { ...DEF, titulo: "Minhas últimas coletas", dashboard: undefined } : DEF;

  return (
    <section className="app-analise">
      <CabecalhoDaPagina
        icone="coletas"
        cor="geral"
        titulo="Coletas"
        descricao={coletor ? "Registre a coleta e veja as suas: toque numa para corrigir o tanque e a data ou excluir." : DEF.descricao}
        voltar={!coletor}
      />
      <AbasDaPagina titulo="Coletas" abas={abas} aba={aba} irPara={irPara} />
      {aba === "registrar" && (
        <SoQuemGrava pode={podeColetar}>
          <div className="botoes-lado" role="group" aria-label="Origem da coleta">
            {(["terra", "navio"] as const).map((o) => (
              <button
                key={o}
                type="button"
                className={origem === o ? "botao botao-principal" : "botao botao-simples"}
                aria-pressed={origem === o}
                onClick={() => setOrigem(o)}
              >
                {o === "terra" ? "Tanque terra" : "Tanque navio"}
              </button>
            ))}
          </div>
          <ColetaDeTanque key={origem} origem={origem} aoGravar={() => setVersao((v) => v + 1)} coletor={coletor} />
        </SoQuemGrava>
      )}
      {aba === "lista" && <PaginaDeDados key={`${coletor}-${versao}`} def={def} embutida />}
    </section>
  );
}
