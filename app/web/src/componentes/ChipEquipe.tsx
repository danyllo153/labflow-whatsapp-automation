import { Link } from "react-router-dom";

import { pessoasNoTurno, useEquipe } from "../paginas/EquipeDoTurno";

/** Quantas pessoas estão no turno agora, no topo de todas as telas; toca para abrir o Turno (APP-033). */
export default function ChipEquipe() {
  const equipe = useEquipe(60_000);
  if (!equipe) return null;
  return (
    <Link to="/turno" className="chip-equipe" aria-label={`${pessoasNoTurno(equipe.no_turno)}, turno ${equipe.turno}`}>
      <span className={`ponto-online${equipe.no_turno === 0 ? " apagado" : ""}`} aria-hidden="true" />
      {equipe.turno} · {equipe.no_turno}
    </Link>
  );
}
