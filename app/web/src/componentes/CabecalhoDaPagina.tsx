import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import IconeApp from "./IconeApp";

/**
 * Cabeçalho único das telas (padronização de 26/10): "← Análises", ícone na cor da família, título e subtítulo, e as
 * ações (Gráfico, Excel, Imprimir) à direita. É o mesmo dos apps de análise, agora também nos Registros diários, na
 * Esterilização, nas Leituras, no Arquivo e nas páginas de dados.
 */
export function CabecalhoDaPagina({
  icone,
  cor,
  titulo,
  descricao,
  voltar = true,
  acoes,
  conteudoDoIcone,
}: {
  icone: string;
  cor: string;
  titulo: ReactNode;
  descricao?: ReactNode;
  voltar?: boolean; // tela do menu lateral (Leituras): sem o "← Análises"
  acoes?: ReactNode;
  conteudoDoIcone?: ReactNode; // a sigla, quando o app ainda não tem desenho
}) {
  return (
    <>
      {voltar && (
        <p className="voltar">
          <Link to="/paginas">← Análises</Link>
        </p>
      )}
      <div className="app-analise-topo">
        <span className={`app-icone app-cor-${cor}`} aria-hidden="true">
          {conteudoDoIcone ?? <IconeApp nome={icone} />}
        </span>
        <div className="app-analise-titulo">
          <h1>{titulo}</h1>
          {descricao && <p className="texto-secundario">{descricao}</p>}
        </div>
        {acoes && <div className="acoes-icone">{acoes}</div>}
      </div>
    </>
  );
}

export interface Aba {
  aba: string;
  rotulo: string;
  contador?: number;
}

/** A aba escolhida mora no endereço (?aba=), como nos apps de análise. */
export function useAba(abas: Aba[]): [string, (aba: string) => void] {
  const [params, setParams] = useSearchParams();
  const aba = abas.some((a) => a.aba === params.get("aba")) ? (params.get("aba") as string) : abas[0].aba;
  return [aba, (nova: string) => setParams({ aba: nova })];
}

export function AbasDaPagina({ titulo, abas, aba, irPara }: { titulo: string; abas: Aba[]; aba: string; irPara: (aba: string) => void }) {
  if (abas.length < 2) return null;
  return (
    <nav className="abas-app" aria-label={`Partes de ${titulo}`}>
      {abas.map((a) => (
        <button key={a.aba} type="button" aria-current={aba === a.aba ? "page" : undefined} onClick={() => irPara(a.aba)}>
          {a.rotulo}
          {!!a.contador && <span className="abas-contador">{a.contador}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Imprimir é sempre um botão de ícone (padronização de 26/10), igual ao das páginas de dados. */
export function BotaoImprimir({ aoClicar, disabled }: { aoClicar: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="botao-icone" aria-label="Imprimir" title="Imprimir" onClick={aoClicar} disabled={disabled}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="7" />
      </svg>
    </button>
  );
}
