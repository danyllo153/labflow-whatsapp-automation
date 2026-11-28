import { useEffect, useState } from "react";

import { lerJson } from "../api";

/** Servidor de demonstração (dados fictícios)? Ideia anotada no rumo em 22/10. */
export function useDemonstracao(): boolean {
  const [demonstracao, setDemonstracao] = useState(false);
  useEffect(() => {
    lerJson<{ demonstracao: boolean }>("/ambiente")
      .then((ambiente) => setDemonstracao(ambiente.demonstracao))
      .catch(() => setDemonstracao(false));
  }, []);
  return demonstracao;
}

const AVISO = "Servidor de testes: os registros aqui não valem para o laboratório.";

/** Faixa no topo da tela (celular). No computador ela some e fica só o selo pequeno na barra de cima. */
export default function FaixaDemonstracao({ ativo }: { ativo: boolean }) {
  if (!ativo) return null;
  return (
    <div className="faixa-demonstracao" role="note">
      <strong>Dados de demonstração.</strong> {AVISO}
    </div>
  );
}

/** Selo pequeno ao lado do turno, só no computador (varredura desktop, 28/11): a faixa gastava uma linha de 36 px. */
export function SeloDemonstracao({ ativo }: { ativo: boolean }) {
  if (!ativo) return null;
  return (
    <span className="selo-demo" title={`Dados de demonstração. ${AVISO}`}>
      Demonstração
    </span>
  );
}

/** A faixa com a própria consulta, para telas sem a moldura (Entrar). */
export function FaixaDemonstracaoSozinha() {
  return <FaixaDemonstracao ativo={useDemonstracao()} />;
}
