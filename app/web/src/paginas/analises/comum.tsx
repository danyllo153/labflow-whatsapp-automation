import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";

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

/** A moldura do app: voltar, ícone, título, abas (no endereço, ?aba=) e o conteúdo da aba escolhida. */
export function AppDeAnalise({
  sigla,
  cor,
  titulo,
  descricao,
  abas,
  children,
}: {
  sigla: string;
  cor: string;
  titulo: string;
  descricao: string;
  abas: Aba[];
  children: (aba: string, irPara: (aba: string) => void) => ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const aba = abas.some((a) => a.aba === params.get("aba")) ? (params.get("aba") as string) : abas[0].aba;
  const irPara = (nova: string) => setParams({ aba: nova });
  return (
    <section className="app-analise">
      <p className="voltar">
        <Link to="/paginas">← Páginas</Link>
      </p>
      <div className="app-analise-topo">
        <span className={`app-icone app-cor-${cor}`} aria-hidden="true">
          {sigla}
        </span>
        <div>
          <h1>{titulo}</h1>
          <p className="texto-secundario">{descricao}</p>
        </div>
      </div>
      <nav className="abas-app" aria-label={`Partes de ${titulo}`}>
        {abas.map((a) => (
          <button key={a.aba} type="button" aria-current={aba === a.aba ? "page" : undefined} onClick={() => irPara(a.aba)}>
            {a.rotulo}
            {!!a.contador && <span className="abas-contador">{a.contador}</span>}
          </button>
        ))}
      </nav>
      {children(aba, irPara)}
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
export function Numeros({ itens }: { itens: { rotulo: string; valor: number; tom: "atrasado" | "hoje" | "nao-ok" }[] }) {
  return (
    <div className="numeros-app">
      {itens.map((n) => (
        <div key={n.rotulo} className={`numero-app numero-${n.tom}`}>
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
