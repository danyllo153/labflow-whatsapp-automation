import { useEffect, useState, type FormEvent } from "react";

import { ErroDaApi, enviarJson, lerJson } from "../api";
import { iniciais } from "../componentes/MenuConta";
import { Corrigido, CorrigirHorario, agoraHHMM } from "./CorrigirHorario";
import type { Entrada } from "./Turno";

/**
 * Equipe do turno (APP-033): quem está no turno agora e quem já saiu, com a hora da entrada. Vários analistas dividem o
 * mesmo turno; a tela se atualiza sozinha para o celular e o computador mostrarem a mesma equipe.
 * LabFlow Lite (27/11): um PC para todos, então quem está no turno coloca os colegas nele ("Adicionar ao
 * turno") e tira quem entrou por engano.
 */

export interface Colega {
  usuario_id: number;
  nome: string;
  entrada: string; // HH:MM
  saida: string | null;
  sou_eu: boolean;
}

export interface Equipe {
  turno: string;
  dia: string;
  no_turno: number;
  pessoas: Colega[];
  pode_colocar: boolean;
  disponiveis: { usuario_id: number; nome: string }[];
}

export const ATUALIZAR_EQUIPE_A_CADA_MS = 30_000;

/** Lê a equipe e a renova sozinha; sem rede ou sem permissão, devolve nulo (o resto da tela segue). */
export function useEquipe(intervalo = ATUALIZAR_EQUIPE_A_CADA_MS, aviso?: unknown): Equipe | null {
  return useEquipeQueMuda(intervalo, aviso)[0] ?? null;
}

/** Indefinida: ainda lendo; nula: a leitura falhou. */
function useEquipeQueMuda(intervalo: number, aviso?: unknown): [Equipe | null | undefined, (e: Equipe) => void] {
  const [equipe, setEquipe] = useState<Equipe | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    const ler = () =>
      lerJson<Equipe>("/turno/equipe").then(
        (e) => vivo && setEquipe(e),
        () => vivo && setEquipe(null),
      );
    void ler();
    const relogio = window.setInterval(() => void ler(), intervalo);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
    };
  }, [intervalo, aviso]);
  return [equipe, setEquipe];
}

export function pessoasNoTurno(n: number): string {
  return n === 1 ? "1 pessoa no turno" : `${n} pessoas no turno`;
}

/** Quantos registros cada pessoa fez no turno (pela linha do tempo); vazio se a linha do tempo não carregar. */
function useRegistrosPorPessoa(ligado: boolean): Record<string, number> {
  const [contagem, setContagem] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!ligado) return; // antes da entrada (check-in obrigatório) a linha do tempo não abre
    lerJson<{ itens: { quem: string }[] }>("/turno/registros").then(
      (r) => setContagem(r.itens.reduce<Record<string, number>>((c, i) => ({ ...c, [i.quem]: (c[i.quem] ?? 0) + 1 }), {})),
      () => setContagem({}),
    );
  }, [ligado]);
  return contagem;
}

/** Equipe de reserva (se a lista não carregar): só quem está logado, para ainda poder sair do turno. */
function soEu(entrada: Entrada): Equipe {
  return {
    turno: entrada.turno, dia: entrada.dia, no_turno: 1, pode_colocar: false, disponiveis: [],
    pessoas: [{ usuario_id: 0, nome: "Você", entrada: entrada.entrada, saida: null, sou_eu: true }],
  };
}

interface Props {
  aviso?: unknown;
  contarRegistros?: boolean;
  /** A entrada de quem está logado: liga o "Sair do turno" e o "Corrigir a entrada" aqui dentro. */
  entrada?: Entrada;
  /** Chamado depois que a própria pessoa sai ou corrige a entrada (o Turno recarrega). */
  aoMudar?: () => Promise<void>;
}

export default function EquipeDoTurno({ aviso, contarRegistros = true, entrada, aoMudar }: Props) {
  const [equipeLida, setEquipe] = useEquipeQueMuda(ATUALIZAR_EQUIPE_A_CADA_MS, aviso);
  const equipeBase = equipeLida === undefined ? null : (equipeLida ?? (entrada ? soEu(entrada) : null));
  // quem está logado e no turno aparece sempre na lista (mesmo que a equipe ainda não o traga), para poder sair
  const equipe =
    equipeBase && entrada && !equipeBase.pessoas.some((p) => p.sou_eu && !p.saida)
      ? {
          ...equipeBase,
          no_turno: equipeBase.no_turno + 1,
          pessoas: [{ usuario_id: 0, nome: "Você", entrada: entrada.entrada, saida: null, sou_eu: true }, ...equipeBase.pessoas.filter((p) => !p.sou_eu)],
        }
      : equipeBase;
  const [corrigindo, setCorrigindo] = useState(false);
  const [saindo, setSaindo] = useState<string | null>(null); // a hora mostrada na confirmação
  const [saem, setSaem] = useState<number[]>([]);
  const registros = useRegistrosPorPessoa(contarRegistros);
  const [escolhida, setEscolhida] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!equipe) return null;

  async function mudar(caminho: string, metodo: "POST" | "DELETE", corpo?: unknown) {
    setErro("");
    setEnviando(true);
    try {
      setEquipe(await enviarJson<Equipe>(caminho, corpo, metodo));
      setEscolhida("");
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "Não deu para mudar a equipe agora. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  const sairam = equipe.pessoas.filter((p) => p.saida);
  const ativos = equipe.pessoas.filter((p) => !p.saida);

  function abrirSaida() {
    setSaem(ativos.filter((p) => p.sou_eu).map((p) => p.usuario_id)); // "Você" já vem marcado
    setSaindo(agoraHHMM());
  }

  async function confirmarSaida(evento: FormEvent) {
    evento.preventDefault();
    if (saem.length === 0) return;
    setErro("");
    setEnviando(true);
    try {
      // os outros primeiro: depois que quem está logado sai, ele não mexe mais na equipe
      for (const p of ativos.filter((x) => !x.sou_eu && saem.includes(x.usuario_id))) {
        await enviarJson<Equipe>(`/turno/equipe/${p.usuario_id}`, undefined, "DELETE");
      }
      const euSaio = ativos.some((p) => p.sou_eu && saem.includes(p.usuario_id));
      if (euSaio) await enviarJson("/turno/sair", {});
      setSaindo(null);
      if (euSaio || !aoMudar) {
        await aoMudar?.();
      } else {
        setEquipe(await lerJson<Equipe>("/turno/equipe"));
      }
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : "Não foi possível registrar a saída.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <section className="cartao equipe-turno" aria-label="Equipe do turno">
      <h2>
        Equipe do turno {equipe.turno} <span className="contador">{equipe.no_turno}</span>
      </h2>
      {equipe.pessoas.every((p) => p.saida) ? (
        <p className="texto-secundario">Ninguém marcou entrada neste turno ainda.</p>
      ) : (
        <ul className="lista-equipe">
          {equipe.pessoas
            .filter((p) => !p.saida)
            .map((p) => (
              <li key={`${p.nome}-${p.entrada}`}>
                <span className={`avatar${p.sou_eu ? "" : " avatar-claro"}`} aria-hidden="true">
                  {iniciais(p.nome)}
                </span>
                <span className="equipe-nome">
                  <strong>{p.nome}</strong>
                  {p.sou_eu && <span className="etiqueta etiqueta-neutra">Você</span>}
                  <span className="texto-secundario equipe-desde">
                    desde {p.entrada}
                    {p.sou_eu && entrada && !corrigindo && !saindo && (
                      <>
                        {" · "}
                        <button type="button" className="link-botao" onClick={() => setCorrigindo(true)}>
                          Corrigir a entrada
                        </button>
                      </>
                    )}
                  </span>
                </span>
                {contarRegistros && (
                  <span className="texto-secundario equipe-registros">
                    {registros[p.nome] ?? 0} registro{(registros[p.nome] ?? 0) === 1 ? "" : "s"}
                  </span>
                )}
                {equipe.pode_colocar && !p.sou_eu && (
                  <button
                    type="button"
                    className="botao-simples equipe-tirar"
                    disabled={enviando}
                    aria-label={`Tirar ${p.nome} do turno`}
                    onClick={() => void mudar(`/turno/equipe/${p.usuario_id}`, "DELETE")}
                  >
                    Tirar
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}
      {entrada && <Corrigido entrada={entrada} />}
      {entrada && corrigindo && (
        <CorrigirHorario
          entrada={entrada}
          titulo={`a entrada no turno ${entrada.turno}`}
          aoTerminar={(salvou) => {
            setCorrigindo(false);
            if (salvou) void aoMudar?.();
          }}
        />
      )}
      {saindo ? (
        <form className="confirmacao equipe-sair" aria-label="Confirmar a saída" onSubmit={confirmarSaida}>
          <fieldset>
            <legend>
              Quem está saindo agora, às <strong>{saindo}</strong>?
            </legend>
            {ativos.map((p) => (
              <label key={p.usuario_id} className="equipe-sair-pessoa">
                <input
                  type="checkbox"
                  checked={saem.includes(p.usuario_id)}
                  onChange={(e) => setSaem(e.target.checked ? [...saem, p.usuario_id] : saem.filter((i) => i !== p.usuario_id))}
                />
                {p.nome}
                {p.sou_eu && p.nome !== "Você" ? " (Você)" : ""}
              </label>
            ))}
          </fieldset>
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal" disabled={enviando || saem.length === 0}>
              Sair
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setSaindo(null)}>
              Continuar no turno
            </button>
          </div>
        </form>
      ) : (
        <div className="equipe-acoes">
      {equipe.pode_colocar && equipe.disponiveis.length > 0 && (
          <form
            className="equipe-colocar"
            onSubmit={(e) => {
              e.preventDefault();
              if (escolhida) void mudar("/turno/equipe", "POST", { usuario_id: Number(escolhida) });
            }}
          >
            <label>
              Adicionar ao turno
              <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} disabled={enviando}>
                <option value="">Escolha quem está com você</option>
                {equipe.disponiveis.map((d) => (
                  <option key={d.usuario_id} value={d.usuario_id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="botao botao-principal" disabled={!escolhida || enviando}>
              Adicionar
            </button>
          </form>
        )}
          {entrada && !corrigindo && (
            <button type="button" className="botao botao-secundario" onClick={abrirSaida}>
              Sair do turno
            </button>
          )}
        </div>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {sairam.length > 0 && (
        <p className="texto-secundario">
          Já saíram: {sairam.map((p) => `${p.nome} (${p.entrada}–${p.saida})`).join(", ")}.
        </p>
      )}
    </section>
  );
}
