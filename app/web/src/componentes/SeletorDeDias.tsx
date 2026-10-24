/** Hoje e os 7 dias anteriores em botões pequenos (material asséptico, branco do dia); ✓ = dia já preenchido. */

export function dm(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

export function diasPossiveis(hoje: string): string[] {
  const base = new Date(`${hoje}T12:00:00`);
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

export default function SeletorDeDias(props: { hoje: string; escolhido: string; preenchidos: string[]; aoEscolher: (dia: string) => void }) {
  return (
    <div className="dias-material" role="group" aria-label="Dia da análise">
      {diasPossiveis(props.hoje).map((d) => (
        <button key={d} type="button" className="botao-secundario" aria-pressed={d === props.escolhido} onClick={() => props.aoEscolher(d)}>
          {d === props.hoje ? `Hoje (${dm(d)})` : dm(d)}
          {props.preenchidos.includes(d) ? " ✓" : ""}
        </button>
      ))}
    </div>
  );
}
