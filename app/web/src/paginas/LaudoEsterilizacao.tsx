import { useCallback, useEffect, useState, type ChangeEvent } from "react";

import { enviarArquivo, enviarJson, lerJson } from "../api";
import { useSessao } from "../sessao";

/**
 * Laudo "Controle de Ciclos de Esterilização" (07 §7; APP-035) e, com `config`, todos os outros laudos: as páginas se
 * preenchem sozinhas com o que foi registrado. "Finalizar laudo" (27/10, antes "marcar como impressa") fecha a folha, que
 * sai com o traço nas linhas vazias e vai para o arquivo. Toda folha, mesmo finalizada, pode ser impressa de novo, editada
 * (volta a "em preenchimento" para corrigir os registros) ou excluída (os registros vão para uma folha nova); editar e
 * refazer pedem um Confirmar. A assinatura (Visto) é à mão. O modelo oficial é enviado pelo Admin e fica no banco.
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
  guarda?: string | null; // o prazo de guarda do rodapé do modelo (01/11), ex.: "1 mês"
  vencidas?: number; // finalizadas que passaram do prazo: saem da lista
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
  const { pessoa } = useSessao();
  const podeApagar = !!pessoa?.pode.includes("gerenciar_pessoas"); // 01/11: só o Admin apaga a folha de vez

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

  // o que espera o Confirmar: editar (reabrir) ou refazer uma folha (a rota é a de excluir: a folha sai e os registros vão
  // para uma folha nova; 01/11: "Excluir" confundia, parecia apagar as coletas)
  const [confirmar, setConfirmar] = useState<{ acao: Acao; pagina: PaginaDoLaudo } | null>(null);

  async function acao(id: number, qual: "finalizar" | Acao) {
    setErro("");
    try {
      setDados(
        qual === "excluir"
          ? await enviarJson<DadosLaudos>(`${config.base}/${id}`, undefined, "DELETE")
          : await enviarJson<DadosLaudos>(`${config.base}/${id}/${qual}`, undefined),
      );
      setConfirmar(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    }
  }

  const [apagandoVencidas, setApagandoVencidas] = useState(false);

  async function apagarVencidas() {
    setErro("");
    try {
      setDados(await enviarJson<DadosLaudos>(`${config.base}/apagar-vencidas`, undefined));
      setApagandoVencidas(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível apagar.");
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
                  <a className="acao-laudo" href={`${config.base}/${p.id}/pdf`} target="_blank" rel="noreferrer" aria-label={`Abrir o PDF da página ${p.numero}`}>
                    <IconeAcao nome="pdf" />
                    Abrir PDF
                  </a>
                  <button type="button" className="acao-laudo acao-principal" aria-label={`Finalizar o laudo da página ${p.numero}`} onClick={() => void acao(p.id, "finalizar")}>
                    <IconeAcao nome="finalizar" />
                    Finalizar laudo
                  </button>
                  <button type="button" className="acao-laudo" aria-label={`Refazer a página ${p.numero}`} onClick={() => setConfirmar({ acao: "excluir", pagina: p })}>
                    <IconeAcao nome="refazer" />
                    Refazer folha
                  </button>
                  {podeApagar && <BotaoApagar pagina={p} aoClicar={() => setConfirmar({ acao: "apagar", pagina: p })} />}
                </span>
              </div>
              {confirmar?.pagina.id === p.id && <Confirmar pedido={confirmar} aoConfirmar={() => void acao(p.id, confirmar.acao)} aoVoltar={() => setConfirmar(null)} />}
            </li>
          ))}
        </ul>
      )}
      {arquivo.length > 0 && (
        <details className="recolhivel">
          <summary>
            Arquivo ({arquivo.length} {arquivo.length === 1 ? "página finalizada" : "páginas finalizadas"}){dados.guarda && ` · guardar por no mínimo ${dados.guarda}`}
          </summary>
          <ul className="lista-simples">
            {arquivo.map((p) => (
              <li key={p.id}>
                <div className="linha-turno">
                  <span>
                    Página {p.numero} · {p.linhas} {config.unidade} · finalizada {p.impresso_em} por {p.impresso_por}
                  </span>
                  <span className="acoes-linha">
                    <a className="acao-laudo" href={`${config.base}/${p.id}/pdf`} target="_blank" rel="noreferrer" aria-label={`Reimprimir a página ${p.numero}`}>
                      <IconeAcao nome="imprimir" />
                      Reimprimir
                    </a>
                    <button type="button" className="acao-laudo" aria-label={`Editar a página ${p.numero}`} onClick={() => setConfirmar({ acao: "reabrir", pagina: p })}>
                      <IconeAcao nome="editar" />
                      Editar
                    </button>
                    <button type="button" className="acao-laudo" aria-label={`Refazer a página ${p.numero}`} onClick={() => setConfirmar({ acao: "excluir", pagina: p })}>
                      <IconeAcao nome="refazer" />
                      Refazer folha
                    </button>
                    {podeApagar && <BotaoApagar pagina={p} aoClicar={() => setConfirmar({ acao: "apagar", pagina: p })} />}
                  </span>
                </div>
                {confirmar?.pagina.id === p.id && <Confirmar pedido={confirmar} aoConfirmar={() => void acao(p.id, confirmar.acao)} aoVoltar={() => setConfirmar(null)} />}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(dados.vencidas ?? 0) > 0 && (
        <div className="guarda-laudo">
          <p className="texto-secundario">
            {dados.vencidas === 1 ? "1 folha finalizada passou" : `${dados.vencidas} folhas finalizadas passaram`} do prazo de guarda
            ({dados.guarda ? `mínimo de ${dados.guarda}, ` : ""}conforme o rodapé do modelo) e saiu da lista.
          </p>
          {podeApagar && !apagandoVencidas && (
            <button type="button" className="acao-laudo" onClick={() => setApagandoVencidas(true)}>
              <IconeAcao nome="apagar" />
              Apagar as vencidas
            </button>
          )}
          {apagandoVencidas && (
            <div className="previa-app" role="group" aria-label="Confirmar: apagar as folhas vencidas">
              <p>As folhas vencidas saem do banco de vez. Os registros delas continuam nas telas de análise, fora do laudo.</p>
              <div className="botoes-lado">
                <button type="button" className="botao botao-principal" onClick={() => void apagarVencidas()}>
                  Confirmar
                </button>
                <button type="button" className="botao botao-simples" onClick={() => setApagandoVencidas(false)}>
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
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

const ICONES = {
  pdf: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M9 13h6M9 17h4",
  imprimir: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  finalizar: "M20 6 9 17l-5-5",
  editar: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  refazer: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  apagar: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
};

type Acao = "reabrir" | "excluir" | "apagar";

function BotaoApagar({ pagina, aoClicar }: { pagina: PaginaDoLaudo; aoClicar: () => void }) {
  return (
    <button type="button" className="acao-laudo" aria-label={`Apagar a página ${pagina.numero}`} onClick={aoClicar}>
      <IconeAcao nome="apagar" />
      Apagar
    </button>
  );
}

/** Os ícones dos botões do laudo (27/10: "ícones desses botões, por favor"). */
export function IconeAcao({ nome }: { nome: keyof typeof ICONES }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONES[nome]} />
    </svg>
  );
}

function Confirmar({
  pedido,
  aoConfirmar,
  aoVoltar,
}: {
  pedido: { acao: Acao; pagina: PaginaDoLaudo };
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  return (
    <div className="previa-app" role="group" aria-label={`Confirmar: ${{ excluir: "refazer", reabrir: "editar", apagar: "apagar" }[pedido.acao]} a página ${pedido.pagina.numero}`}>
      <p>
        {pedido.acao === "apagar"
          ? `A página ${pedido.pagina.numero} sai do banco de vez e não volta. Os ${pedido.pagina.linhas} registros dela continuam nas telas de análise, mas ficam fora do laudo: não vão para nenhuma folha nova.`
          : pedido.acao === "excluir"
          ? `A página ${pedido.pagina.numero} sai da lista e os ${pedido.pagina.linhas} registros dela vão para uma folha nova, para imprimir de novo. Nenhum registro se apaga: para apagar um, exclua-o na tela da análise (o registro ou a coleta).`
          : `A página ${pedido.pagina.numero} volta a "em preenchimento", sem o traço. Corrija os registros na tela da análise e finalize de novo.`}
      </p>
      <div className="botoes-lado">
        <button type="button" className="botao botao-principal" onClick={aoConfirmar}>
          Confirmar
        </button>
        <button type="button" className="botao botao-simples" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
    </div>
  );
}
