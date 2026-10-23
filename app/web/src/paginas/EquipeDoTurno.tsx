import { useEffect, useState } from "react";

import { lerJson } from "../api";

/**
 * Equipe do turno (APP-033): quem está no turno agora e quem já saiu, com a hora da entrada. Vários analistas dividem o
 * mesmo turno; a tela se atualiza sozinha para o celular e o computador mostrarem a mesma equipe.
 */

export interface Colega {
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
}

export const ATUALIZAR_EQUIPE_A_CADA_MS = 30_000;

/** Lê a equipe e a renova sozinha; sem rede ou sem permissão, devolve nulo (o resto da tela segue). */
export function useEquipe(intervalo = ATUALIZAR_EQUIPE_A_CADA_MS, aviso?: unknown): Equipe | null {
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
  return equipe;
}

export function pessoasNoTurno(n: number): string {
  return n === 1 ? "1 pessoa no turno" : `${n} pessoas no turno`;
}

export default function EquipeDoTurno({ aviso }: { aviso?: unknown }) {
  const equipe = useEquipe(ATUALIZAR_EQUIPE_A_CADA_MS, aviso);
  if (!equipe) return null;
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
                <span className="ponto-online" aria-hidden="true" />
                <strong>{p.nome}</strong>
                {p.sou_eu && <span className="etiqueta etiqueta-pendente">Você</span>}
                <span className="texto-secundario">desde {p.entrada}</span>
              </li>
            ))}
        </ul>
      )}
      {sairam.length > 0 && (
        <p className="texto-secundario">
          Já saíram: {sairam.map((p) => `${p.nome} (${p.entrada}–${p.saida})`).join(", ")}.
        </p>
      )}
    </section>
  );
}
