import { Link } from "react-router-dom";

export default function NaoEncontrada() {
  return (
    <section>
      <h1>Página não encontrada</h1>
      <div className="cartao">
        <p>Esse endereço não existe no LabFlow.</p>
        <p>
          <Link to="/">Voltar ao Início</Link>
        </p>
      </div>
    </section>
  );
}
