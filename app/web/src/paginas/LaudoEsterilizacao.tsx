import { useCallback, useEffect, useState, type ChangeEvent } from "react";

import { enviarArquivo, enviarJson, lerJson } from "../api";

/**
 * Laudo "Controle de Ciclos de Esterilização" (07 §7; APP-035): as páginas de 35 linhas preenchidas sozinhas com o que foi
 * registrado. A página cheia fica "pendente de imprimir": abre o PDF (o próprio modelo da empresa), imprime e marca como
 * impressa; as impressas ficam no arquivo, com a opção de reimprimir. A assinatura (Visto) é à mão. O modelo oficial é
 * enviado pelo Admin e fica no banco (nunca no repositório).
 */

export interface PaginaDoLaudo {
  id: number;
  numero: number;
  linhas: number;
  capacidade: number;
  cheia: boolean;
  impresso: boolean;
  impresso_por: string | null;
  impresso_em: string | null;
  de: string | null;
  ate: string | null;
}

export interface DadosLaudos {
  pode_enviar_modelo: boolean;
  modelo_enviado: boolean;
  modelo_enviado_em: string | null;
  paginas: PaginaDoLaudo[];
}

function dm(data: string | null): string {
  if (!data) return "";
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

interface ConfigDoLaudo {
  base: string; // ex.: "/esterilizacao/laudos"
  titulo: string;
  rotulo: string; // nome da região (leitor de tela) e do campo do modelo
  explicacao: string;
  unidade: string; // "linhas" ou "dias"
}

export const LAUDO_ESTERILIZACAO: ConfigDoLaudo = {
  base: "/esterilizacao/laudos",
  titulo: "Laudo de ciclos de esterilização",
  rotulo: "Laudo de esterilização",
  explicacao:
    "As linhas se preenchem sozinhas com o que foi registrado (data, material, ciclo, eficiente e o nome de quem marcou). A assinatura (Visto) é à mão, na folha impressa.",
  unidade: "linhas",
};

export default function LaudoEsterilizacao({ versao, config = LAUDO_ESTERILIZACAO }: { versao: number; config?: ConfigDoLaudo }) {
  const [dados, setDados] = useState<DadosLaudos | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<DadosLaudos>(config.base));
    } catch {
      setDados(null); // sem permissão ou sem rede: o laudo é um extra da tela
    }
  }, [config.base]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  async function marcarImpresso(id: number) {
    setErro("");
    try {
      setDados(await enviarJson<DadosLaudos>(`${config.base}/${id}/impresso`, undefined));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível marcar como impressa.");
    }
  }

  async function enviarModelo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setErro("");
    try {
      setDados(await enviarArquivo<DadosLaudos>(`${config.base}/modelo`, arquivo));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar o modelo.");
    } finally {
      evento.target.value = "";
    }
  }

  if (!dados) return null;
  const pendentes = dados.paginas.filter((p) => !p.impresso);
  const arquivo = dados.paginas.filter((p) => p.impresso);

  return (
    <section className="cartao laudo-esterilizacao" aria-label={config.rotulo}>
      <h2>
        {config.titulo} <span className="contador">{pendentes.length}</span>
      </h2>
      <p className="texto-secundario">{config.explicacao}</p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {pendentes.length === 0 ? (
        <p className="texto-secundario">Nenhuma página pendente de impressão.</p>
      ) : (
        <ul className="lista-simples">
          {pendentes.map((p) => (
            <li key={p.id}>
              <div className="linha-turno">
                <span>
                  <strong>Página {p.numero}</strong> · {p.linhas} de {p.capacidade} {config.unidade}
                  {p.de && ` · ${dm(p.de)}${p.ate && p.ate !== p.de ? ` a ${dm(p.ate)}` : ""}`}{" "}
                  <span className={p.cheia ? "etiqueta etiqueta-nao-ok" : "etiqueta etiqueta-pendente"}>
                    {p.cheia ? "Cheia: imprimir" : "Em preenchimento"}
                  </span>
                </span>
                <span className="acoes-linha">
                  <a href={`${config.base}/${p.id}/pdf`} target="_blank" rel="noreferrer" aria-label={`Abrir o PDF da página ${p.numero}`}>
                    Abrir PDF
                  </a>
                  <button type="button" className="link-botao" aria-label={`Marcar a página ${p.numero} como impressa`} onClick={() => void marcarImpresso(p.id)}>
                    Marcar como impressa
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {arquivo.length > 0 && (
        <details className="recolhivel">
          <summary>Arquivo ({arquivo.length} páginas impressas)</summary>
          <ul className="lista-simples">
            {arquivo.map((p) => (
              <li key={p.id}>
                <div className="linha-turno">
                  <span>
                    Página {p.numero} · {p.linhas} {config.unidade} · impressa {p.impresso_em} por {p.impresso_por}
                  </span>
                  <a href={`${config.base}/${p.id}/pdf`} target="_blank" rel="noreferrer" aria-label={`Reimprimir a página ${p.numero}`}>
                    Reimprimir
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {dados.pode_enviar_modelo && (
        <div className="modelo-laudo">
          <p className="texto-secundario">
            {dados.modelo_enviado
              ? `Modelo da empresa enviado em ${dados.modelo_enviado_em}.`
              : "Ainda sem o modelo da empresa: o PDF usa uma tabela de demonstração."}
          </p>
          <label className="botao-secundario botao-arquivo">
            {dados.modelo_enviado ? "Trocar o modelo (PDF)" : "Enviar o modelo (PDF)"}
            <input type="file" accept="application/pdf" className="so-leitor" aria-label={config === LAUDO_ESTERILIZACAO ? "Arquivo PDF do modelo do laudo" : `Arquivo PDF do modelo: ${config.rotulo}`} onChange={enviarModelo} />
          </label>
        </div>
      )}
    </section>
  );
}
