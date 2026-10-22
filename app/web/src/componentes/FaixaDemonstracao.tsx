import { useEffect, useState } from "react";

import { lerJson } from "../api";

/** Faixa no topo enquanto o servidor for de demonstração (dados fictícios). Ideia anotada no rumo em 22/10. */
export default function FaixaDemonstracao() {
  const [demonstracao, setDemonstracao] = useState(false);

  useEffect(() => {
    lerJson<{ demonstracao: boolean }>("/ambiente")
      .then((ambiente) => setDemonstracao(ambiente.demonstracao))
      .catch(() => setDemonstracao(false));
  }, []);

  if (!demonstracao) return null;
  return (
    <div className="faixa-demonstracao" role="note">
      <strong>Dados de demonstração.</strong> Servidor de testes: os registros aqui não valem para o laboratório.
    </div>
  );
}
