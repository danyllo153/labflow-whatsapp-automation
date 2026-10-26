import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";
import { AbasDaPagina, CabecalhoDaPagina, useAba } from "../../componentes/CabecalhoDaPagina";
import Instrucao, { type AppComInstrucao } from "./Instrucao";

/**
 * Base dos apps de análise da Fase E (APP-061): a moldura com as abas, a prévia com o Confirmar e as listas marcáveis.
 * Toda gravação passa pela função do banco que o bot usa; quando a função tem prévia, a tela mostra o texto dela antes do
 * Confirmar; quando não tem (etapa em lote), a tela mostra a lista marcada e pede o Confirmar (decisão de 24/10).
 */

export interface Gravacao {
  ok: boolean;
  previa: boolean;
  texto: string;
  dados: Record<string, unknown>;
}

export interface Aba {
  aba: string;
  rotulo: string;
  contador?: number;
}

export function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function mensagem(e: unknown, padrao: string) {
  return e instanceof Error ? e.message : padrao;
}

export function dm(data: string | null | undefined): string {
  if (!data) return "—";
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

/** Ícone e cor da família de cada app (visual novo, APP-065): o mesmo da grade de Análises. */
const ICONE_DO_APP: Partial<Record<AppComInstrucao, string>> = {
  "recebimento-fcoj": "recebimento-fcoj",
  tanques: "tanques",
  testes: "tab",
  drops: "drops",
  "embarque-fcoj": "embarque-fcoj",
  "recebimento-nfc": "recebimento-nfc",
  desvios: "desvios",
};
const COR_DO_APP: Partial<Record<AppComInstrucao, string>> = {
  "recebimento-fcoj": "fcoj",
  tanques: "nfc",
  testes: "tab",
  drops: "drops",
  "embarque-fcoj": "embarque",
  "recebimento-nfc": "nfc-receb",
  desvios: "desvios",
};

/** A moldura do app: voltar, ícone, título, abas (no endereço, ?aba=) e o conteúdo da aba escolhida; Instrução e Vídeo
 * são iguais em todos os apps e ficam aqui (E9). */
export function AppDeAnalise({
  app,
  icone,
  sigla,
  cor,
  titulo,
  descricao,
  abas,
  children,
}: {
  app: AppComInstrucao;
  icone?: string; // quando o app divide a IT com outro (TAB, Coliformes e Howard usam a de "testes"): o ícone e a cor dele
  sigla: string;
  cor: string;
  titulo: string;
  descricao: string;
  abas: Aba[];
  children: (aba: string, irPara: (aba: string) => void) => ReactNode;
}) {
  const [aba, irPara] = useAba(abas);
  return (
    <section className="app-analise">
      <CabecalhoDaPagina
        icone={icone ?? ICONE_DO_APP[app] ?? ""}
        cor={icone ? cor : COR_DO_APP[app] ?? cor}
        titulo={titulo}
        descricao={descricao}
        conteudoDoIcone={icone || ICONE_DO_APP[app] ? undefined : sigla}
      />
      <AbasDaPagina titulo={titulo} abas={abas} aba={aba} irPara={irPara} />
      {aba === "instrucao" || aba === "video" ? <Instrucao app={app} parte={aba} /> : children(aba, irPara)}
    </section>
  );
}

/** Lê uma lista da API (com a busca) e recarrega quando pedem; a busca espera 250 ms depois da última tecla. */
export function useLista<T>(url: string, busca = "") {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const q = busca.trim() ? `${url.includes("?") ? "&" : "?"}busca=${encodeURIComponent(busca.trim())}` : "";
        setDados(await lerJson<T>(`${url}${q}`));
        setErro("");
      } catch (e) {
        setErro(mensagem(e, "Não foi possível carregar."));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [url, busca, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, erro, recarregar };
}

/** Prévia e Confirmar: `ver(corpo)` manda com previa = true; `confirmar()` manda o mesmo corpo com previa = false. */
export function useGravacao(url: string, aoGravar?: (g: Gravacao) => void) {
  const [corpo, setCorpo] = useState<Record<string, unknown> | null>(null);
  const [previa, setPrevia] = useState<Gravacao | null>(null);
  const [feito, setFeito] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function ver(novo: Record<string, unknown>) {
    setEnviando(true);
    setErro("");
    setFeito("");
    try {
      setPrevia(await enviarJson<Gravacao>(url, { ...novo, previa: true }));
      setCorpo(novo);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível ver a prévia."));
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar() {
    if (!corpo) return;
    setEnviando(true);
    setErro("");
    try {
      const g = await enviarJson<Gravacao>(url, { ...corpo, previa: false });
      setFeito(g.texto);
      setPrevia(null);
      setCorpo(null);
      aoGravar?.(g);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    } finally {
      setEnviando(false);
    }
  }

  return { ver, confirmar, voltar: () => setPrevia(null), previa, feito, erro, enviando };
}

/** Uma gravação sem prévia na função (etapa em lote, abrir desvio): a tela pergunta antes e só o Confirmar grava. */
export function useAcao(aoGravar?: (g: Gravacao) => void) {
  const [pedido, setPedido] = useState<{ url: string; corpo?: unknown; resumo: string } | null>(null);
  const [feito, setFeito] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    if (!pedido) return;
    setEnviando(true);
    setErro("");
    try {
      const g = await enviarJson<Gravacao>(pedido.url, pedido.corpo);
      setFeito(g.texto);
      setPedido(null);
      aoGravar?.(g);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    } finally {
      setEnviando(false);
    }
  }

  return {
    perguntar: (url: string, resumo: string, corpo?: unknown) => (setPedido({ url, corpo, resumo }), setFeito(""), setErro("")),
    confirmar,
    voltar: () => setPedido(null),
    pedido,
    feito,
    erro,
    enviando,
  };
}

/** A caixa amarela "o que vai ser criado" com Confirmar e Voltar, e o recado depois de gravar. */
export function CaixaDeConfirmar({
  titulo = "O que vai ser criado",
  texto,
  aviso,
  enviando,
  aoConfirmar,
  aoVoltar,
}: {
  titulo?: string;
  texto: string;
  aviso?: string;
  enviando: boolean;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  return (
    <div className="previa-app" role="status" aria-label={titulo}>
      <strong>{titulo}</strong>
      <p className="previa-texto">{texto}</p>
      {aviso && <p className="aviso-pulo-texto">⚠️ {aviso}</p>}
      <div className="botoes-lado">
        <button type="button" className="botao botao-principal" disabled={enviando} onClick={aoConfirmar}>
          Confirmar
        </button>
        <button type="button" className="botao botao-simples" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
    </div>
  );
}

export function Recados({ erro, feito }: { erro: string; feito: string }) {
  return (
    <>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {feito && (
        <p className="recado-feito" role="status">
          ✓ {feito}
        </p>
      )}
    </>
  );
}

/** A caixa da prévia ligada a um useGravacao. */
export function PreviaDaGravacao({ g, titulo }: { g: ReturnType<typeof useGravacao>; titulo?: string }) {
  return (
    <>
      {g.previa && (
        <CaixaDeConfirmar titulo={titulo} texto={g.previa.texto} enviando={g.enviando} aoConfirmar={() => void g.confirmar()} aoVoltar={g.voltar} />
      )}
      <Recados erro={g.erro} feito={g.feito} />
    </>
  );
}

/** A caixa da pergunta ligada a um useAcao. */
export function PerguntaDaAcao({ a, titulo = "Confirma?" }: { a: ReturnType<typeof useAcao>; titulo?: string }) {
  return (
    <>
      {a.pedido && (
        <CaixaDeConfirmar titulo={titulo} texto={a.pedido.resumo} enviando={a.enviando} aoConfirmar={() => void a.confirmar()} aoVoltar={a.voltar} />
      )}
      <Recados erro={a.erro} feito={a.feito} />
    </>
  );
}

export function Busca({ valor, aoMudar, rotulo, dica }: { valor: string; aoMudar: (v: string) => void; rotulo: string; dica: string }) {
  return (
    <div className="busca-com-filtro">
      <label className="busca-redonda">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input type="search" aria-label={rotulo} placeholder={dica} maxLength={40} value={valor} onChange={(e) => aoMudar(e.target.value)} />
      </label>
    </div>
  );
}

/** Os três números do topo (atrasados, para hoje, outro), como no Recebimento. */
const traco = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
/** O ícone do cartão de número (visual novo de 26/10, modelo kaiadmin): relógio, calendário, x, certo ou i. */
const ICONE_DO_TOM: Record<"atrasado" | "hoje" | "nao-ok" | "ok" | "neutro", JSX.Element> = {
  atrasado: (
    <svg width="20" height="20" viewBox="0 0 24 24" {...traco}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  hoje: (
    <svg width="20" height="20" viewBox="0 0 24 24" {...traco}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  "nao-ok": (
    <svg width="20" height="20" viewBox="0 0 24 24" {...traco}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  ),
  ok: (
    <svg width="20" height="20" viewBox="0 0 24 24" {...traco}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  ),
  neutro: (
    <svg width="20" height="20" viewBox="0 0 24 24" {...traco}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
};

/** Os números do topo. A cor tem regra (26/10): vermelho = atrasado ou não ok, laranja = atenção (hoje), verde = ok,
 * e o zero (ou o que é só informação) fica neutro. */
export function Numeros({ itens }: { itens: { rotulo: string; valor: number; tom: "atrasado" | "hoje" | "nao-ok" | "ok" | "neutro" }[] }) {
  return (
    <div className="numeros-app">
      {itens.map((n) => (
        <div key={n.rotulo} className={`numero-app numero-${n.valor === 0 ? "neutro" : n.tom}`}>
          <span className="numero-icone" aria-hidden="true">
            {ICONE_DO_TOM[n.valor === 0 ? "neutro" : n.tom]}
          </span>
          <strong>{n.valor}</strong>
          <span>{n.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

/** Marcar itens de uma lista: o conjunto dos marcados, marcar/desmarcar um e todos. */
export function useMarcados<K>() {
  const [marcados, setMarcados] = useState<Set<K>>(new Set());
  return {
    marcados,
    tem: (k: K) => marcados.has(k),
    alternar: (k: K) =>
      setMarcados((m) => {
        const n = new Set(m);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      }),
    todos: (ks: K[]) => setMarcados((m) => (ks.every((k) => m.has(k)) ? new Set([...m].filter((k) => !ks.includes(k))) : new Set([...m, ...ks]))),
    limpar: () => setMarcados(new Set()),
  };
}

export function Resultados({ paginas }: { paginas: { caminho: string; titulo: string; descricao: string }[] }) {
  return (
    <div className="cartao">
      <h2>Resultados</h2>
      <p className="texto-secundario">As tabelas completas, com pesquisa, filtros, Excel e impressão.</p>
      <ul className="lista-links-app">
        {paginas.map((p) => (
          <li key={p.caminho}>
            <Link to={p.caminho}>{p.titulo}</Link> <span className="texto-secundario">· {p.descricao}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SoQuemGrava({ pode, children }: { pode: boolean; children: ReactNode }) {
  return pode ? <>{children}</> : <p className="texto-secundario">Só Analista e Admin gravam aqui; você pode ver as listas e os resultados.</p>;
}
