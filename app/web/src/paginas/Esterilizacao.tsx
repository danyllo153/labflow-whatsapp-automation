import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../api";
import LaudoEsterilizacao from "./LaudoEsterilizacao";

/**
 * Esterilização (07 §7 e G4; APP-026): botões Ponteira, Meio, Frasco, Descarte e Outro, número do ciclo, lista do turno
 * (corrigir e excluir pedem motivo) e o gráfico G4 por tipo e turno. Sem resultado da fita: o Word continua como rastreio.
 */

export interface ItemEsterilizacao {
  id: number;
  tipo: string;
  ciclo: string;
  meio: string | null;
  descricao: string | null;
  eficiente: boolean;
  pagina_impressa: boolean;
  quem: string;
  quando: string;
  corrigida: boolean;
  motivo_correcao: string | null;
  antes: string | null;
}

export interface DadosEsterilizacao {
  turno_id: number;
  turno: string;
  dia: string;
  tipos: string[];
  pode_registrar: boolean;
  itens: ItemEsterilizacao[];
}

interface Barra {
  turno: string;
  tipo: string;
  total: number;
}

interface DadosG4 {
  de: string;
  ate: string;
  total: number;
  barras: Barra[];
}

function dm(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

function resumo(i: { tipo: string; ciclo: string; meio: string | null; descricao: string | null }): string {
  return `${i.tipo}${i.meio ? ` (${i.meio})` : ""}${i.descricao ? ` (${i.descricao})` : ""} · ciclo ${i.ciclo}`;
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

export default function Esterilizacao() {
  const [dados, setDados] = useState<DadosEsterilizacao | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0); // muda a cada gravação, para o gráfico se atualizar

  const carregar = useCallback(async () => {
    try {
      setDados(await lerJson<DadosEsterilizacao>("/esterilizacao"));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar as esterilizações."));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function atualizado(novo: DadosEsterilizacao) {
    setDados(novo);
    setVersao((v) => v + 1);
  }

  return (
    <section className="pagina-esterilizacao">
      <h1>Esterilização</h1>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
          <button type="button" className="botao botao-simples" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      )}
      {!dados && !erro && <p className="carregando">Carregando...</p>}
      {dados && (
        <>
          {dados.pode_registrar ? (
            <Registrar tipos={dados.tipos} aoRegistrar={atualizado} />
          ) : (
            <div className="cartao">
              <p>O seu cargo vê as esterilizações, mas não registra.</p>
            </div>
          )}
          <div className="cartao">
            <h2>
              Esterilizações do turno {dados.turno} de {dm(dados.dia)} <span className="contador">{dados.itens.length}</span>
            </h2>
            {dados.itens.length === 0 ? (
              <p className="texto-secundario">Nada registrado neste turno ainda.</p>
            ) : (
              <ul className="lista-simples">
                {dados.itens.map((i) => (
                  <Linha key={i.id} item={i} podeMexer={dados.pode_registrar} aoMudar={atualizado} />
                ))}
              </ul>
            )}
            <p className="texto-secundario">O laudo impresso (abaixo) é gerado a partir destes registros.</p>
          </div>
        </>
      )}
      {dados?.pode_registrar && <LaudoEsterilizacao versao={versao} />}
      <GraficoG4 versao={versao} />
    </section>
  );
}

function Registrar({ tipos, aoRegistrar }: { tipos: string[]; aoRegistrar: (d: DadosEsterilizacao) => void }) {
  const [tipo, setTipo] = useState("");
  const [ciclo, setCiclo] = useState("");
  const [meio, setMeio] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [jaTem, setJaTem] = useState<{ tipo: string; quem: string; quando: string }[]>([]);
  const cicloAtual = useRef("");
  cicloAtual.current = ciclo.trim();

  /** Avisa (sem bloquear) quando o ciclo digitado já tem material registrado hoje: o novo entra na mesma linha do laudo. */
  async function avisarCiclo() {
    const numero = ciclo.trim();
    if (!numero) {
      setJaTem([]);
      return;
    }
    try {
      const existentes = await lerJson<{ tipo: string; quem: string; quando: string }[]>(`/esterilizacao/ciclo?ciclo=${encodeURIComponent(numero)}`);
      if (cicloAtual.current === numero) setJaTem(existentes); // a resposta chegou depois de limpar ou trocar o ciclo: descarta
    } catch {
      setJaTem([]);
    }
  }

  async function registrar(evento: FormEvent) {
    evento.preventDefault();
    if (!tipo) {
      setErro("Escolha o que foi esterilizado.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      aoRegistrar(await enviarJson<DadosEsterilizacao>("/esterilizacao", { tipo, ciclo, meio, descricao }));
      setCiclo("");
      setJaTem([]);
      setMeio("");
      setDescricao("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível registrar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao" onSubmit={registrar} aria-label="Registrar esterilização">
      <h2>O que foi esterilizado?</h2>
      <div className="botoes-tipo" role="group" aria-label="Tipo">
        {tipos.map((t) => (
          <button key={t} type="button" className="botao-secundario botao-tipo" aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            {t}
          </button>
        ))}
      </div>
      <label className="campo campo-hora">
        Número do ciclo
        <input maxLength={20} placeholder="Ex.: A1092/26" value={ciclo} onChange={(e) => setCiclo(e.target.value)} onBlur={() => void avisarCiclo()} />
      </label>
      {jaTem.length > 0 && (
        <p className="aviso-ciclo" role="status">
          O ciclo {ciclo.trim()} já tem {jaTem.map((j) => `${j.tipo} (${j.quem} às ${j.quando})`).join(", ")}. Ao registrar, este material entra na
          mesma linha do laudo.
        </p>
      )}
      {tipo === "Meio" && (
        <label className="campo">
          Nome do meio (opcional)
          <input maxLength={60} placeholder="Ex.: PDA" value={meio} onChange={(e) => setMeio(e.target.value)} />
        </label>
      )}
      {tipo === "Outro" && (
        <label className="campo">
          O que foi esterilizado
          <input maxLength={120} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao botao-principal" disabled={enviando}>
        Registrar
      </button>
    </form>
  );
}

function Linha({ item, podeMexer, aoMudar }: { item: ItemEsterilizacao; podeMexer: boolean; aoMudar: (d: DadosEsterilizacao) => void }) {
  const [modo, setModo] = useState<"corrigir" | "excluir" | "nao_eficiente" | null>(null);
  const [tipo, setTipo] = useState(item.tipo);
  const [ciclo, setCiclo] = useState(item.ciclo);
  const [meio, setMeio] = useState(item.meio ?? "");
  const [descricao, setDescricao] = useState(item.descricao ?? "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (motivo.trim().length < 5) {
      setErro("Escreva o motivo (pelo menos 5 letras).");
      return;
    }
    setErro("");
    try {
      const corpo = modo === "corrigir" ? { tipo, ciclo, meio, descricao, motivo } : modo === "nao_eficiente" ? { eficiente: false, motivo } : { motivo };
      const url =
        modo === "corrigir" ? `/esterilizacao/${item.id}` : modo === "nao_eficiente" ? `/esterilizacao/${item.id}/eficiente` : `/esterilizacao/${item.id}/excluir`;
      aoMudar(await enviarJson<DadosEsterilizacao>(url, corpo, modo === "excluir" ? "POST" : "PUT"));
      setModo(null);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    }
  }

  async function voltarParaSim() {
    setErro("");
    try {
      aoMudar(await enviarJson<DadosEsterilizacao>(`/esterilizacao/${item.id}/eficiente`, { eficiente: true }, "PUT"));
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    }
  }

  return (
    <li>
      <div className="linha-turno">
        <span>
          <strong>{resumo(item)}</strong> · {item.quem} às {item.quando} ·{" "}
          <span className={item.eficiente ? "etiqueta etiqueta-ok" : "etiqueta etiqueta-nao-ok"}>{item.eficiente ? "Eficiente: Sim" : "Eficiente: Não"}</span>
        </span>
        {podeMexer && !modo && (
          <span className="acoes-linha">
            {item.eficiente ? (
              <button type="button" className="link-botao" aria-label={`Marcar não eficiente ${resumo(item)}`} onClick={() => setModo("nao_eficiente")}>
                Não eficiente
              </button>
            ) : (
              <button type="button" className="link-botao" aria-label={`Voltar para eficiente ${resumo(item)}`} onClick={() => void voltarParaSim()}>
                Voltar para Sim
              </button>
            )}
            <button type="button" className="link-botao" aria-label={`Corrigir ${resumo(item)}`} onClick={() => setModo("corrigir")}>
              Corrigir
            </button>
            <button type="button" className="link-botao" aria-label={`Excluir ${resumo(item)}`} onClick={() => setModo("excluir")}>
              Excluir
            </button>
          </span>
        )}
      </div>
      {item.pagina_impressa && item.corrigida && (
        <span className="texto-secundario corrigido">Esta linha está numa página já impressa: reimprima o laudo.</span>
      )}
      {item.corrigida && (
        <span className="texto-secundario corrigido">
          Corrigido (antes: {item.antes}). Motivo: {item.motivo_correcao}
        </span>
      )}
      {modo && (
        <form className="corrigir-horario" onSubmit={enviar} aria-label={modo === "corrigir" ? "Corrigir esterilização" : modo === "nao_eficiente" ? "Marcar não eficiente" : "Excluir esterilização"}>
          {modo === "corrigir" ? (
            <div className="linha-formulario">
              <label className="campo">
                Tipo
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {["Ponteira", "Meio", "Frasco", "Descarte", "Outro"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="campo campo-hora">
                Ciclo
                <input value={ciclo} onChange={(e) => setCiclo(e.target.value)} />
              </label>
              {tipo === "Meio" && (
                <label className="campo">
                  Meio
                  <input value={meio} onChange={(e) => setMeio(e.target.value)} />
                </label>
              )}
              {tipo === "Outro" && (
                <label className="campo">
                  O que foi
                  <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                </label>
              )}
            </div>
          ) : modo === "nao_eficiente" ? (
            <p>Marca o ciclo todo como não eficiente (a fita ou a nota da autoclave não confirmou). Escreva o motivo.</p>
          ) : (
            <p>Excluir sai da lista, mas fica guardado com o motivo.</p>
          )}
          <label className="campo">
            Motivo
            <input maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          {erro && (
            <p className="mensagem-erro" role="alert">
              {erro}
            </p>
          )}
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal">
              {modo === "corrigir" ? "Salvar correção" : modo === "nao_eficiente" ? "Marcar Não eficiente" : "Excluir"}
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setModo(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

const TIPOS_G4 = ["Ponteira", "Meio", "Frasco", "Descarte", "Outro"]; // a cor de cada um vem do CSS (.g4-0 a .g4-4), claro e escuro
const L = 320;
const A = 170;
const M = { esq: 28, dir: 8, cima: 14, baixo: 26 };

/** G4 (07 §6): esterilizações por tipo e turno, na semana. Barras agrupadas por turno; o número vai em cima de cada barra. */
function GraficoG4({ versao }: { versao: number }) {
  const [dados, setDados] = useState<DadosG4 | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    lerJson<DadosG4>("/esterilizacao/grafico")
      .then((d) => vivo && (setDados(d), setErro("")))
      .catch((e) => vivo && setErro(mensagem(e, "Não foi possível carregar o gráfico.")));
    return () => {
      vivo = false;
    };
  }, [versao]);

  if (erro) return <p className="mensagem-erro">{erro}</p>;
  if (!dados) return null;

  const turnos = [...new Set(dados.barras.map((b) => b.turno))];
  const tipos = [...new Set(dados.barras.map((b) => b.tipo))];
  const maximo = Math.max(4, ...dados.barras.map((b) => b.total));
  const largura = (L - M.esq - M.dir) / turnos.length;
  const barra = (largura - 12) / tipos.length;
  const y = (v: number) => A - M.baixo - (v / maximo) * (A - M.cima - M.baixo);

  return (
    <section className="cartao grafico-g4" aria-label="Gráfico de esterilizações por tipo e turno">
      <h2>Esterilizações por tipo e turno</h2>
      <p className="texto-secundario">
        De {dm(dados.de)} a {dm(dados.ate)} · {dados.total} no total
      </p>
      {dados.total === 0 ? (
        <p>Nenhuma esterilização nesta semana.</p>
      ) : (
        <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-hidden="true" className="svg-g4">
          {[0, Math.round(maximo / 2), maximo].map((m) => (
            <g key={m}>
              <line x1={M.esq} x2={L - M.dir} y1={y(m)} y2={y(m)} className="g2-grade" />
              <text x={M.esq - 5} y={y(m) + 3} textAnchor="end" className="g2-eixo">
                {m}
              </text>
            </g>
          ))}
          {turnos.map((t, ti) => (
            <g key={t}>
              {tipos.map((tipo, i) => {
                const total = dados.barras.find((b) => b.turno === t && b.tipo === tipo)?.total ?? 0;
                const x = M.esq + ti * largura + 6 + i * barra;
                return (
                  <g key={tipo}>
                    <rect x={x} y={y(total)} width={barra - 2} height={y(0) - y(total)} rx={2} className={`g4-barra g4-${Math.max(0, TIPOS_G4.indexOf(tipo))}`} />
                    {total > 0 && (
                      <text x={x + (barra - 2) / 2} y={y(total) - 3} textAnchor="middle" className="g2-eixo">
                        {total}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={M.esq + ti * largura + largura / 2} y={A - 8} textAnchor="middle" className="g2-eixo">
                {t}
              </text>
            </g>
          ))}
        </svg>
      )}
      <ul className="legenda-g4">
        {tipos.map((t) => (
          <li key={t}>
            <span className={`amostra g4-${Math.max(0, TIPOS_G4.indexOf(t))}`} aria-hidden="true" /> {t}
          </li>
        ))}
      </ul>
      <table className="tabela-g4">
        <caption className="so-leitor">Números do gráfico</caption>
        <thead>
          <tr>
            <th scope="col">Turno</th>
            {tipos.map((t) => (
              <th key={t} scope="col">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {turnos.map((t) => (
            <tr key={t}>
              <th scope="row">{t}</th>
              {tipos.map((tipo) => (
                <td key={tipo}>{dados.barras.find((b) => b.turno === t && b.tipo === tipo)?.total ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
