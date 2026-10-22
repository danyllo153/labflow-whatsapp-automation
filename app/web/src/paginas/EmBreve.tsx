import type { ItemDoMenu } from "../menu";

export default function EmBreve({ item }: { item: ItemDoMenu }) {
  return (
    <section>
      <h1>{item.rotulo}</h1>
      <div className="cartao">
        <p>
          <span className="etiqueta etiqueta-pendente">Em breve</span>
        </p>
        <p>Esta parte do app ainda está sendo construída.</p>
        {item.tarefa && <p className="texto-secundario">Etapa: {item.tarefa}</p>}
      </div>
    </section>
  );
}
