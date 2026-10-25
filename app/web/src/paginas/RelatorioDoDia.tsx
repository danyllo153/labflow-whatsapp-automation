import { useCallback, useEffect, useState } from "react";

import { lerJson } from "../api";
import BlocosDePendencias, { type Pendencia } from "../componentes/BlocosDePendencias";
import { useSessao } from "../sessao";
import { Numeros, PreviaDaGravacao, SoQuemGrava, useGravacao } from "./analises/comum";

/**
 * Relatório do dia (pedido de 25/10, APP-066): uma página só para ver o que sai hoje em todas as análises, como o
 * relatório diário do bot, e finalizar o dia. A "Leitura do dia" saiu do app de Desvios e veio para cá: Desvios fica
 * só com o que fugiu do padrão. O formato do relatório completo do bot foi pedido à sessão do bot (rumo-do-app.md).
 */

interface Pendencias {
  itens: Pendencia[];
  vence_hoje: number;
  atrasados: number;
}

interface Desvios {
  dia_finalizado: boolean;
}

export default function RelatorioDoDia() {
  const { pessoa } = useSessao();
  const pode = !!pessoa?.pode.includes("registrar_analise");
  const [dados, setDados] = useState<Pendencias | null>(null);
  const [finalizado, setFinalizado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([lerJson<Pendencias>("/pendencias-hoje"), lerJson<Desvios>("/analises/desvios")]);
      setDados(p);
      setFinalizado(d.dia_finalizado);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o relatório do dia.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const blocos = dados ? new Set(dados.itens.map((i) => i.bloco)).size : 0;

  return (
    <section className="relatorio-do-dia">
      <h1>Relatório do dia</h1>
      <p className="texto-secundario">O que sai hoje em cada análise (atrasados e para hoje). No fim, finalize o dia.</p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && (
        <>
          <Numeros
            itens={[
              { rotulo: "Para hoje", valor: dados.vence_hoje, tom: "hoje" },
              { rotulo: "Atrasados", valor: dados.atrasados, tom: "atrasado" },
              { rotulo: "Análises com leitura", valor: blocos, tom: "hoje" },
            ]}
          />
          <BlocosDePendencias itens={dados.itens} vazio={<p className="texto-secundario">Nada para ler hoje.</p>} />
        </>
      )}
      <SoQuemGrava pode={pode}>
        <FinalizarODia finalizado={finalizado} aoGravar={() => void carregar()} />
      </SoQuemGrava>
    </section>
  );
}

function FinalizarODia({ finalizado, aoGravar }: { finalizado: boolean; aoGravar: () => void }) {
  const g = useGravacao("/analises/leitura-do-dia/finalizar", () => aoGravar());
  return (
    <div className="cartao" aria-label="Finalizar o dia">
      <h2>Finalizar o dia</h2>
      <p>
        Finalizar marca como lido tudo o que sai hoje: as placas que ninguém digitou nas leituras de tanque viram <code>&lt;1</code>, os
        drops de hoje são concluídos e o TAB e os Coliformes com leitura hoje ficam negativos. C.T/B.L do concentrado e o que está em
        confirmação não mudam.
      </p>
      {finalizado && <p className="etiqueta etiqueta-ok">O dia de hoje já foi finalizado.</p>}
      {!g.previa && (
        <button type="button" className="botao botao-principal" disabled={g.enviando} onClick={() => void g.ver({})}>
          Ver o que vai ser finalizado
        </button>
      )}
      <PreviaDaGravacao g={g} titulo="O que vai ser finalizado" />
    </div>
  );
}
