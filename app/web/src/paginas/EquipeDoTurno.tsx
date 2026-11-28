import { useEffect, useState } from "react";

import { ErroDaApi, enviarJson, lerJson } from "../api";
import { iniciais } from "../componentes/MenuConta";

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
  return useEquipeQueMuda(intervalo, aviso)[0];
}

function useEquipeQueMuda(intervalo: number, aviso?: unknown): [Equipe | null, (e: Equipe) => void] {
  const [equipe, setEquipe] = useState<Equipe | null>(null);
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

export default function EquipeDoTurno({ aviso, contarRegistros = true }: { aviso?: unknown; contarRegistros?: boolean }) {
  const [equipe, setEquipe] = useEquipeQueMuda(ATUALIZAR_EQUIPE_A_CADA_MS, aviso);
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
  return (
    <section className="cartao equipe-turno" aria-label="Equipe do turno">
      <h2>
        Equipe do turno {equipe.turno} <span className="contador">{equipe.no_turno}</span>
      </h2>
      {equipe.no_turno === 0 ? (
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
                  <span className="texto-secundario equipe-desde">desde {p.entrada}</span>
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
