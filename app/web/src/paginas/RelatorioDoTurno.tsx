import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BotaoImprimir } from "../componentes/CabecalhoDaPagina";
import { Link, useSearchParams } from "react-router-dom";

import { enviarJson, lerJson } from "../api";
import { useSessao } from "../sessao";
import { TURNO_MUDOU } from "./Turno";

/**
 * Relatório do turno (07 §4; APP-024): uma página por turno e dia, a mesma para todos. O automático vem das views do
 * Power BI; o escrito à mão (pendências, esterilizações pendentes, ocorrências, analistas que não entraram pelo app) é
 * gravado aqui. A Madrugada conta no dia em que começou. Imprimir: A4 em pé, só o conteúdo.
 */

interface Vizinho {
  turno_id: number;
  turno: string;
  dia: string;
}

interface GrupoFeito {
  tipo: string;
  total: number;
  por_pessoa: { quem: string; n: number }[];
}

export interface Relatorio {
  turno_id: number;
  turno: string;
  dia: string;
  inicio: string;
  fim: string;
  em_andamento: boolean;
  anterior: Vizinho;
  proximo: Vizinho | null;
  analistas: { nome: string; entrada: string; saida: string | null; corrigido: boolean }[];
  analistas_extras: string | null;
  feito: GrupoFeito[];
  atividades_feitas: { texto: string; quem: string | null; quando: string | null }[];
  atividades_nao_feitas: string[];
  estufas_nao_ok: string[];
  realizadas: { texto: string; quem: string; quando: string }[];
  esterilizacoes: { id: number; tipo: string; ciclo: string; meio: string | null; descricao: string | null; quem: string; quando: string }[];
  adiantados: { total: number; itens: { tipo: string; referencia: string; prevista: string; quem: string | null }[] };
  pendentes: {
    vence_hoje: number;
    atrasados: number;
    desvios_abertos: number;
    por_bloco: { bloco: string; vence_hoje: number; atrasados: number }[];
  };
  do_dia: { contagens_lidas: number; testes_com_resultado: number };
  escritos: { pendencias_escritas: string | null; esterilizacoes_pendentes: string | null; ocorrencias: string | null };
  encerramento: { encerrado: boolean; por: string | null; quando: string | null; automatico: boolean };
  adiante: {
    turno: string;
    dia: string;
    atividades_nao_feitas: number;
    vence_hoje: number;
    atrasados: number;
    desvios_abertos: number;
    recados: number;
  };
  reaberto: string | null;
  atualizado_por: string | null;
  pode_editar: boolean;
  pode_encerrar: boolean;
  pode_reabrir: boolean;
}

function dm(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

const CAMPOS = [
  { chave: "pendencias_escritas", rotulo: "Pendências escritas à mão", dica: "O que fica para o próximo turno" },
  { chave: "esterilizacoes_pendentes", rotulo: "Esterilizações pendentes", dica: "O que precisa esterilizar" },
  { chave: "ocorrencias", rotulo: "Ocorrências do turno", dica: "Falta de energia, equipamento, recados..." },
  { chave: "analistas_extras", rotulo: "Outros analistas (que não entraram pelo app)", dica: "Nomes" },
] as const;

export default function RelatorioDoTurno() {
  const [busca] = useSearchParams();
  const turnoId = busca.get("turno");
  const dia = busca.get("dia");
  const consulta = turnoId && dia ? `?turno_id=${encodeURIComponent(turnoId)}&dia=${encodeURIComponent(dia)}` : "";

  const [dados, setDados] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<Relatorio>(`/turno/relatorio${consulta}`));
      setErro("");
    } catch (e) {
      setDados(null);
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o relatório.");
    }
  }, [consulta]);

  useEffect(() => {
    void carregar();
    const relogio = window.setInterval(() => void carregar(), 60_000);
    return () => window.clearInterval(relogio);
  }, [carregar]);

  if (erro && !dados)
    return (
      <section>
        <h1>Relatório do turno</h1>
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
          <Link to="/turno/relatorio">Ver o turno de agora</Link>
        </div>
      </section>
    );
  if (!dados) return <p className="carregando">Carregando...</p>;

  const r = dados;
  const link = (v: Vizinho) => `/turno/relatorio?turno=${v.turno_id}&dia=${v.dia}`;

  return (
    <section className="relatorio-turno">
      <p className="trilha nao-imprime">
        <Link to="/turno">Turno</Link> / Relatório
      </p>
      <h1>
        Relatório do turno · {r.turno} de {dm(r.dia)}
      </h1>
      <p className="texto-secundario">
        {r.inicio} às {r.fim}
        {r.em_andamento && " · em andamento"}
        {r.encerramento.encerrado &&
          ` · encerrado${r.encerramento.automatico ? " automaticamente" : r.encerramento.por ? ` por ${r.encerramento.por}` : ""}${r.encerramento.quando ? ` às ${r.encerramento.quando}` : ""}`}
      </p>

      <div className="barra-acoes nao-imprime">
        <Link className="botao-secundario" to={link(r.anterior)}>
          Turno anterior ({r.anterior.turno} {dm(r.anterior.dia)})
        </Link>
        {r.proximo && (
          <Link className="botao-secundario" to={link(r.proximo)}>
            Próximo turno ({r.proximo.turno} {dm(r.proximo.dia)})
          </Link>
        )}
        <BotaoImprimir aoClicar={() => window.print()} />
      </div>

      <div className="cartao">
        <h2>Analistas do turno</h2>
        {r.analistas.length === 0 ? (
          <p className="texto-secundario">Ninguém marcou entrada pelo app neste turno.</p>
        ) : (
          <ul className="lista-simples">
            {r.analistas.map((a, n) => (
              <li key={n}>
                <strong>{a.nome}</strong> · {a.entrada} às {a.saida ?? "ainda no turno"}
                {a.corrigido && <span className="texto-secundario"> (horário corrigido)</span>}
              </li>
            ))}
          </ul>
        )}
        {r.analistas_extras && <p>Outros: {r.analistas_extras}</p>}
      </div>

      <div className="cartao">
        <h2>Análises feitas</h2>
        <ul className="lista-simples">
          {r.feito.map((g) => (
            <li key={g.tipo}>
              <strong>{g.total}</strong> {g.tipo.toLowerCase()}
              {g.por_pessoa.length > 0 && <span className="texto-secundario"> · {g.por_pessoa.map((p) => `${p.quem} ${p.n}`).join(", ")}</span>}
            </li>
          ))}
        </ul>
        {r.atividades_feitas.length > 0 && (
          <ul className="lista-simples texto-secundario">
            {r.atividades_feitas.map((a) => (
              <li key={a.texto}>
                {a.texto}
                {a.quem && ` · ${a.quem}`}
                {a.quando && ` às ${a.quando}`}
              </li>
            ))}
          </ul>
        )}
        {r.realizadas.length > 0 && (
          <>
            <h3>Atividades realizadas ({r.realizadas.length})</h3>
            <ul className="lista-simples texto-secundario">
              {r.realizadas.map((a, n) => (
                <li key={n}>
                  {a.texto} · {a.quem} às {a.quando}
                </li>
              ))}
            </ul>
          </>
        )}
        {r.esterilizacoes.length > 0 && (
          <>
            <h3>Esterilizações realizadas ({r.esterilizacoes.length})</h3>
            <ul className="lista-simples texto-secundario">
              {r.esterilizacoes.map((e) => (
                <li key={e.id}>
                  {e.tipo}
                  {e.meio && ` (${e.meio})`}
                  {e.descricao && ` (${e.descricao})`} · ciclo {e.ciclo} · {e.quem} às {e.quando}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="texto-secundario">
          No dia {dm(r.dia)}, sem separar por turno (só guardam a data): {r.do_dia.contagens_lidas} leituras de C.T/B.L e{" "}
          {r.do_dia.testes_com_resultado} resultados de TAB, Coliformes e Howard.
        </p>
      </div>

      {r.adiantados.total > 0 && (
        <div className="cartao" role="group" aria-label="Adiantados">
          <h2>
            Adiantado <span className="contador">{r.adiantados.total}</span>
          </h2>
          <p className="texto-secundario">Registrados antes da data prevista; não contam como feitos neste turno.</p>
          <ul className="lista-simples">
            {r.adiantados.itens.map((a, n) => (
              <li key={n}>
                {a.tipo} · {a.referencia} · prevista {dm(a.prevista)}
                {a.quem && ` · ${a.quem}`}
              </li>
            ))}
          </ul>
          {r.adiantados.total > r.adiantados.itens.length && (
            <p className="texto-secundario">E mais {r.adiantados.total - r.adiantados.itens.length}.</p>
          )}
        </div>
      )}

      <div className="cartao">
        <h2>Análises pendentes (neste momento)</h2>
        <p>
          <strong>{r.pendentes.vence_hoje}</strong> vencem hoje · <strong>{r.pendentes.atrasados}</strong> atrasadas ·{" "}
          <strong>{r.pendentes.desvios_abertos}</strong> desvios abertos
        </p>
        <ul className="lista-simples texto-secundario">
          {r.pendentes.por_bloco.map((b) => (
            <li key={b.bloco}>
              {b.bloco}: {b.vence_hoje} hoje, {b.atrasados} atrasadas
            </li>
          ))}
        </ul>
        {r.atividades_nao_feitas.length > 0 && (
          <>
            <h3>Atividades do turno ainda sem Feito ({r.atividades_nao_feitas.length})</h3>
            <p className="texto-secundario">{r.atividades_nao_feitas.join(" · ")}</p>
          </>
        )}
      </div>

      {r.estufas_nao_ok.length > 0 && (
        <div className="cartao" role="group" aria-label="Estufas Não ok">
          <h2>Estufas Não ok</h2>
          <ul className="lista-simples">
            {r.estufas_nao_ok.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <Escritos relatorio={r} aoGravar={setDados} />
      {r.reaberto && <p className="texto-secundario">{r.reaberto}</p>}
      {r.pode_encerrar && <EncerrarTurno relatorio={r} aoMudar={setDados} />}
      {r.pode_reabrir && <ReabrirTurno relatorio={r} aoMudar={setDados} />}
    </section>
  );
}

function Escritos({ relatorio: r, aoGravar }: { relatorio: Relatorio; aoGravar: (r: Relatorio) => void }) {
  const inicial = (c: (typeof CAMPOS)[number]["chave"]) => (c === "analistas_extras" ? r.analistas_extras : r.escritos[c]) ?? "";
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS.map((c) => [c.chave, inicial(c.chave)])));
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState("");

  async function gravar(evento: FormEvent) {
    evento.preventDefault();
    setGravando(true);
    setAviso("");
    try {
      aoGravar(await enviarJson<Relatorio>("/turno/relatorio", { turno_id: r.turno_id, dia: r.dia, ...valores }, "PUT"));
      setAviso("Gravado.");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setGravando(false);
    }
  }

  if (!r.pode_editar) {
    return (
      <div className="cartao">
        <h2>Escrito à mão</h2>
        {CAMPOS.filter((c) => c.chave !== "analistas_extras").map((c) => (
          <div key={c.chave}>
            <h3>{c.rotulo}</h3>
            <p className="texto-pre">{r.escritos[c.chave as keyof Relatorio["escritos"]] || "Nada escrito."}</p>
          </div>
        ))}
        {r.encerramento.encerrado && <p className="texto-secundario">Relatório encerrado: só leitura.</p>}
      </div>
    );
  }

  return (
    <form className="cartao" onSubmit={gravar} aria-label="Escrito à mão">
      <h2>Escrito à mão</h2>
      {CAMPOS.map((c) => (
        <label className="campo" key={c.chave}>
          {c.rotulo}
          <textarea
            rows={c.chave === "analistas_extras" ? 1 : 3}
            placeholder={c.dica}
            maxLength={c.chave === "esterilizacoes_pendentes" ? 2000 : c.chave === "analistas_extras" ? 500 : 4000}
            value={valores[c.chave]}
            onChange={(e) => setValores({ ...valores, [c.chave]: e.target.value })}
          />
        </label>
      ))}
      <div className="botoes-lado nao-imprime">
        <button type="submit" className="botao botao-principal" disabled={gravando}>
          Gravar
        </button>
      </div>
      {aviso && (
        <p className={aviso === "Gravado." ? "texto-secundario" : "mensagem-erro"} role="status">
          {aviso}
        </p>
      )}
      {r.atualizado_por && <p className="texto-secundario">Última alteração: {r.atualizado_por}.</p>}
    </form>
  );
}

function EncerrarTurno({ relatorio: r, aoMudar }: { relatorio: Relatorio; aoMudar: (r: Relatorio) => void }) {
  const { pessoa } = useSessao();
  const admin = pessoa?.cargo === "Admin";
  const [aberto, setAberto] = useState(false);
  const [forcar, setForcar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const a = r.adiante;

  async function encerrar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      aoMudar(await enviarJson<Relatorio>("/turno/relatorio/encerrar", { turno_id: r.turno_id, dia: r.dia, forcar }));
      window.dispatchEvent(new Event(TURNO_MUDOU)); // a saída foi registrada: o check-in confere de novo
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível encerrar o turno.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto)
    return (
      <div className="nao-imprime">
        <button type="button" className="botao botao-principal" onClick={() => setAberto(true)}>
          Encerrar turno
        </button>
      </div>
    );

  return (
    <form className="cartao confirmacao nao-imprime" aria-label="Encerrar o turno" onSubmit={encerrar}>
      <h2>
        Encerrar o turno {r.turno} de {dm(r.dia)}?
      </h2>
      <p>
        Ficam para a {a.turno}: <strong>{a.atividades_nao_feitas}</strong> atividades sem Feito, <strong>{a.vence_hoje}</strong> análises que
        vencem hoje, <strong>{a.atrasados}</strong> atrasadas, <strong>{a.desvios_abertos}</strong> desvios abertos e{" "}
        <strong>{a.recados}</strong> recados escritos.
      </p>
      <p className="texto-secundario">
        O relatório passa a ser só leitura (só o Admin reabre, com motivo) e a sua saída do turno é registrada agora.
      </p>
      {admin && (
        <label className="marcar-feito">
          <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} />
          <span>Fazer sair também quem ainda está no turno</span>
        </label>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="botoes-lado">
        <button type="submit" className="botao botao-principal" disabled={enviando}>
          Confirmar e encerrar
        </button>
        <button type="button" className="botao botao-simples" onClick={() => setAberto(false)}>
          Voltar
        </button>
      </div>
    </form>
  );
}

function ReabrirTurno({ relatorio: r, aoMudar }: { relatorio: Relatorio; aoMudar: (r: Relatorio) => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  async function reabrir(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      aoMudar(await enviarJson<Relatorio>("/turno/relatorio/reabrir", { turno_id: r.turno_id, dia: r.dia, motivo }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível reabrir.");
    }
  }

  return (
    <form className="cartao nao-imprime" aria-label="Reabrir o turno" onSubmit={reabrir}>
      <h2>Reabrir o turno (Admin)</h2>
      <label className="campo">
        Motivo da reabertura
        <textarea rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao-secundario">
        Reabrir turno
      </button>
    </form>
  );
}
