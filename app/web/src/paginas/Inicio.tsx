import { useSessao } from "../sessao";

export default function Inicio() {
  const { pessoa } = useSessao();
  return (
    <section>
      <h1>Início</h1>
      <div className="cartao">
        <h2>Olá, {pessoa?.nome || pessoa?.usuario}</h2>
        <p>
          O app está sendo montado por partes. As próximas a chegar: as <strong>pendências de hoje</strong> e as páginas{" "}
          <strong>Coletas</strong> e <strong>Recebimento</strong>.
        </p>
        <p className="texto-secundario">No celular, use "Adicionar à tela inicial" para abrir o LabFlow como um app.</p>
      </div>
    </section>
  );
}
