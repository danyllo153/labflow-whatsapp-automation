import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { enviarJson, lerJson } from "../../api";
import LaudoEsterilizacao from "../LaudoEsterilizacao";
import { agoraSP, classeDaSituacao, dm, hojeSP, mensagem } from "./comum";

/**
 * Limpeza de superfícies (07 §5.1; APP-037): baias (CIP dos mangotes do recebimento) e linhas (CIP das linhas de
 * embarque). Uma coleta por ponto, com o dia da análise (plaqueamento), C.T. 48 h, B.L. 72 h e 120 h. Uma folha do
 * laudo para baias e outra para linhas.
 */

type Tipo = "Baia" | "Linha";

interface Coleta {
  id: number;
  tipo: Tipo;
  ponto: string;
  dia: string;
  hora: string;
  analisada_em: string;
  ct_48: string | null;
  bl_72: string | null;
  bl_120: string | null;
  observacao: string | null;
  quem: string;
  resultado_por: string | null;
  situacao: string;
}

export interface Superficies {
  tipo: Tipo;
  pode_coletar: boolean;
  pode_lancar: boolean;
  coletas: Coleta[];
}

const TEXTOS: Record<Tipo, { titulo: string; descricao: string; plural: string }> = {
  Baia: { titulo: "Baias", descricao: "CIP dos mangotes do recebimento.", plural: "baias" },
  Linha: { titulo: "Linhas", descricao: "CIP das linhas de embarque.", plural: "linhas" },
};

const ROTULO = { ct_48: "C.T. 48h", bl_72: "B.L. 72h", bl_120: "B.L. 120h" } as const;

export default function SuperficiesPagina({ tipo }: { tipo: Tipo }) {
  const [dados, setDados] = useState<Superficies | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<Superficies>(`/aguas/superficies?tipo=${tipo}`));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar as coletas."));
    }
  }, [tipo]);

  useEffect(() => {
    setDados(null);
    void carregar();
  }, [carregar]);

  function mudou(novo: Superficies) {
    setDados(novo);
    setVersao((v) => v + 1);
  }

  const t = TEXTOS[tipo];
  return (
    <section>
      <p className="voltar">
        <Link to="/paginas">← Análises</Link>
      </p>
      <h1>{t.titulo}</h1>
      <p className="texto-secundario">{t.descricao} C.T. em 48 h, B.L. em 72 h e 120 h, contadas do dia da análise.</p>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados?.pode_coletar && <NovaColeta tipo={tipo} aoGravar={mudou} />}
      {dados && (
        <div className="cartao" aria-label={`Coletas de ${t.plural}`}>
          <h2>
            Coletas dos últimos 30 dias <span className="contador">{dados.coletas.length}</span>
          </h2>
          {dados.coletas.length === 0 ? (
            <p className="texto-secundario">Nenhuma coleta registrada.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">Coleta</th>
                    <th scope="col">Ponto</th>
                    <th scope="col">Análise</th>
                    <th scope="col">C.T. 48h</th>
                    <th scope="col">B.L. 72h</th>
                    <th scope="col">B.L. 120h</th>
                    <th scope="col">Situação</th>
                    {dados.pode_lancar && <th scope="col">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {dados.coletas.map((c) => (
                    <LinhaDaColeta key={`${c.id}-${versao}`} coleta={c} pode={dados.pode_lancar} aoMudar={mudou} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {dados?.pode_lancar && (
        <LaudoEsterilizacao
          versao={versao}
          config={{
            base: `/laudos/superficies-${tipo}`,
            titulo: `Laudo de limpeza de superfícies · ${t.plural}`,
            rotulo: `Laudo de limpeza de superfícies ${t.plural}`,
            explicacao: "Uma coleta por linha, 31 por folha. O responsável assina à mão, na folha impressa.",
            unidade: "coletas",
          }}
        />
      )}
    </section>
  );
}

function NovaColeta({ tipo, aoGravar }: { tipo: Tipo; aoGravar: (d: Superficies) => void }) {
  const [pontos, setPontos] = useState("");
  const [dia, setDia] = useState(hojeSP());
  const [hora, setHora] = useState(agoraSP());
  const [analise, setAnalise] = useState(hojeSP());
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function gravar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const lista = pontos.split(/[,;\s]+/).filter(Boolean);
      aoGravar(await enviarJson<Superficies>("/aguas/superficies", { tipo, pontos: lista, dia, hora, analisada_em: analise, observacao }));
      setPontos("");
      setObservacao("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível registrar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={gravar} aria-label={`Nova coleta de ${TEXTOS[tipo].plural}`}>
      <h2>Nova coleta</h2>
      <label className="campo">
        {tipo === "Baia" ? "Baias (uma ou mais)" : "Linhas (uma ou mais)"}
        <input value={pontos} placeholder={tipo === "Baia" ? "Ex.: 08, 10" : "Ex.: 4, 6"} onChange={(e) => setPontos(e.target.value)} />
      </label>
      <div className="linha-formulario">
        <label className="campo campo-hora">
          Data da coleta
          <input
            type="date"
            max={hojeSP()}
            value={dia}
            onChange={(e) => {
              setDia(e.target.value);
              setAnalise(e.target.value);
            }}
          />
        </label>
        <label className="campo campo-hora">
          Hora
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
        <label className="campo campo-hora">
          Dia da análise
          <input type="date" min={dia} value={analise} onChange={(e) => setAnalise(e.target.value)} />
        </label>
      </div>
      <label className="campo">
        Observação (opcional)
        <input maxLength={60} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </label>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao botao-principal" disabled={enviando || !pontos.trim()}>
        Registrar coleta
      </button>
    </form>
  );
}

function LinhaDaColeta({ coleta: c, pode, aoMudar }: { coleta: Coleta; pode: boolean; aoMudar: (d: Superficies) => void }) {
  const [valores, setValores] = useState({ ct_48: c.ct_48 ?? "", bl_72: c.bl_72 ?? "", bl_120: c.bl_120 ?? "" });
  const [modo, setModo] = useState<"editar" | "excluir" | null>(null);
  const [ponto, setPonto] = useState(c.ponto);
  const [dia, setDia] = useState(c.dia);
  const [hora, setHora] = useState(c.hora);
  const [analise, setAnalise] = useState(c.analisada_em);
  const [observacao, setObservacao] = useState(c.observacao ?? "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const mudou = valores.ct_48 !== (c.ct_48 ?? "") || valores.bl_72 !== (c.bl_72 ?? "") || valores.bl_120 !== (c.bl_120 ?? "");

  async function salvarResultados() {
    setErro("");
    try {
      aoMudar(await enviarJson<Superficies>(`/aguas/superficies/${c.id}/resultados`, valores, "PUT"));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível salvar."));
    }
  }

  async function salvarColeta() {
    setErro("");
    try {
      aoMudar(await enviarJson<Superficies>(`/aguas/superficies/${c.id}`, { ponto, dia, hora, analisada_em: analise, observacao }, "PUT"));
      setModo(null);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível corrigir."));
    }
  }

  async function excluir() {
    setErro("");
    try {
      aoMudar(await enviarJson<Superficies>(`/aguas/superficies/${c.id}/excluir`, { motivo }));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível excluir."));
    }
  }

  const nome = `${c.tipo} ${c.ponto}`;
  return (
    <>
      <tr>
        <td>
          {dm(c.dia)} {c.hora}
        </td>
        <td>{nome}</td>
        <td>{dm(c.analisada_em)}</td>
        {(["ct_48", "bl_72", "bl_120"] as const).map((campo) => (
          <td key={campo}>
            {pode ? (
              <input
                className="entrada-celula"
                maxLength={10}
                aria-label={`${ROTULO[campo]} da ${nome} de ${dm(c.dia)}`}
                value={valores[campo]}
                onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
              />
            ) : (
              (c[campo] ?? "…")
            )}
          </td>
        ))}
        <td>
          <span className={classeDaSituacao(c.situacao)}>{c.situacao}</span>
          {pode && mudou && (
            <button type="button" className="link-botao" aria-label={`Salvar ${nome} de ${dm(c.dia)}`} onClick={() => void salvarResultados()}>
              Salvar
            </button>
          )}
          {erro && !modo && (
            <span className="mensagem-erro" role="alert">
              {erro}
            </span>
          )}
        </td>
        {pode && (
          <td className="acoes-celula">
            <button type="button" className="link-botao" aria-label={`Editar a coleta da ${nome} de ${dm(c.dia)}`} onClick={() => setModo("editar")}>
              Editar
            </button>
            <button type="button" className="link-botao" aria-label={`Excluir a coleta da ${nome} de ${dm(c.dia)}`} onClick={() => setModo("excluir")}>
              Excluir
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={pode ? 8 : 7}>
            <div className="corrigir-horario" role="group" aria-label={modo === "editar" ? `Editar a coleta da ${nome}` : `Excluir a coleta da ${nome}`}>
              {modo === "editar" ? (
                <div className="linha-formulario">
                  <label className="campo campo-hora">
                    {c.tipo}
                    <input maxLength={10} value={ponto} onChange={(e) => setPonto(e.target.value)} />
                  </label>
                  <label className="campo campo-hora">
                    Data da coleta
                    <input type="date" max={hojeSP()} value={dia} onChange={(e) => setDia(e.target.value)} />
                  </label>
                  <label className="campo campo-hora">
                    Hora
                    <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                  </label>
                  <label className="campo campo-hora">
                    Dia da análise
                    <input type="date" min={dia} value={analise} onChange={(e) => setAnalise(e.target.value)} />
                  </label>
                  <label className="campo">
                    Observação
                    <input maxLength={60} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                  </label>
                </div>
              ) : (
                <label className="campo">
                  Motivo da exclusão (a coleta sai da lista e do laudo, mas fica guardada)
                  <input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </label>
              )}
              {erro && (
                <p className="mensagem-erro" role="alert">
                  {erro}
                </p>
              )}
              <div className="botoes-lado">
                <button type="button" className="botao botao-principal" onClick={() => void (modo === "editar" ? salvarColeta() : excluir())}>
                  {modo === "editar" ? "Salvar" : "Excluir a coleta"}
                </button>
                <button type="button" className="botao botao-simples" onClick={() => setModo(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
