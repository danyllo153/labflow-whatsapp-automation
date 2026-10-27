import { useCallback, useEffect, useState, type FormEvent } from "react";

import { enviarJson, lerJson } from "../../api";

/**
 * Admin → Turnos e estufas (07 §10; APP-028): horários padrão dos turnos, atividades fixas de cada turno, estufas e as
 * faixas de trabalho. Atividade e estufa se desativam em vez de apagar. As faixas reais ficam só no banco.
 */

interface Horario {
  id: number;
  nome: string;
  inicio: string;
  fim: string;
}

interface Atividade {
  id: number;
  turno_id: number;
  texto: string;
  dias_semana: number[] | null;
  ordem: number;
  ativa: boolean;
  opcional?: boolean; // a pessoa escolhe o dia; não passa para o turno seguinte (081)
}

interface Faixa {
  id: number;
  minimo: string;
  maximo: string;
  desde: string;
  ate: string | null;
}

interface EstufaAdmin {
  id: number;
  auxiliar: boolean;
  ativa: boolean;
  faixa: Faixa | null;
  historico: Faixa[];
}

export interface Configuracao {
  turnos: Horario[];
  atividades: Atividade[];
  estufas: EstufaAdmin[];
}

type Muda = (c: Configuracao) => void;

const DIAS = [
  [1, "seg"],
  [2, "ter"],
  [3, "qua"],
  [4, "qui"],
  [5, "sex"],
  [6, "sáb"],
  [7, "dom"],
] as const;

function dm(data: string): string {
  const [, mes, d] = data.split("-");
  return `${d}/${mes}`;
}

function virgula(valor: string): string {
  return Number(valor).toFixed(1).replace(".", ",");
}

function quando(dias: number[] | null, opcional = false): string {
  if (opcional) return "opcional (a pessoa escolhe o dia; não passa para o turno seguinte)";
  if (!dias) return "todos os dias";
  return DIAS.filter(([n]) => dias.includes(n))
    .map(([, nome]) => nome)
    .join(", ");
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

export default function TurnosEstufas() {
  const [config, setConfig] = useState<Configuracao | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setConfig(await lerJson<Configuracao>("/admin/turnos"));
      setErro("");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível carregar."));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section className="admin-turnos">
      <h1>Turnos e estufas</h1>
      {erro && (
        <div className="cartao" role="alert">
          <p className="mensagem-erro">{erro}</p>
          <button type="button" className="botao botao-simples" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      )}
      {!config && !erro && <p className="carregando">Carregando...</p>}
      {config && (
        <>
          <Horarios turnos={config.turnos} aoMudar={setConfig} />
          <AtividadesFixas config={config} aoMudar={setConfig} />
          <Estufas estufas={config.estufas} aoMudar={setConfig} />
        </>
      )}
    </section>
  );
}

function Horarios({ turnos, aoMudar }: { turnos: Horario[]; aoMudar: Muda }) {
  const [valores, setValores] = useState(turnos.map((t) => ({ id: t.id, inicio: t.inicio, fim: t.fim })));
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  function mudar(id: number, campo: "inicio" | "fim", valor: string) {
    setValores(valores.map((v) => (v.id === id ? { ...v, [campo]: valor } : v)));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    setAviso("");
    try {
      aoMudar(await enviarJson<Configuracao>("/admin/turnos/horarios", { turnos: valores }, "PUT"));
      setAviso("Horários gravados.");
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    }
  }

  return (
    <form className="cartao" onSubmit={salvar} aria-label="Horários dos turnos">
      <h2>Horários padrão dos turnos</h2>
      <p className="texto-secundario">Os três turnos precisam cobrir as 24 horas: cada um começa quando o anterior termina.</p>
      {turnos.map((t) => {
        const v = valores.find((x) => x.id === t.id)!;
        return (
          <div className="linha-formulario" key={t.id}>
            <strong className="nome-turno">{t.nome}</strong>
            <label className="campo campo-hora">
              Início de {t.nome}
              <input type="time" required value={v.inicio} onChange={(e) => mudar(t.id, "inicio", e.target.value)} />
            </label>
            <label className="campo campo-hora">
              Fim de {t.nome}
              <input type="time" required value={v.fim} onChange={(e) => mudar(t.id, "fim", e.target.value)} />
            </label>
          </div>
        );
      })}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && <p className="texto-secundario" role="status">{aviso}</p>}
      <button type="submit" className="botao botao-principal">
        Gravar horários
      </button>
    </form>
  );
}

function AtividadesFixas({ config, aoMudar }: { config: Configuracao; aoMudar: Muda }) {
  const [turnoId, setTurnoId] = useState(config.turnos[0]?.id ?? 1);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [erro, setErro] = useState("");
  const lista = config.atividades.filter((a) => a.turno_id === turnoId && (mostrarInativas || a.ativa));

  async function pedir<T>(chamada: () => Promise<T>) {
    setErro("");
    try {
      aoMudar((await chamada()) as Configuracao);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    }
  }

  return (
    <div className="cartao" role="group" aria-label="Atividades fixas">
      <h2>Atividades fixas de cada turno</h2>
      <div className="botoes-tipo" role="group" aria-label="Turno das atividades">
        {config.turnos.map((t) => (
          <button key={t.id} type="button" className="botao-secundario" aria-pressed={turnoId === t.id} onClick={() => setTurnoId(t.id)}>
            {t.nome}
          </button>
        ))}
      </div>
      <label className="marcar-feito">
        <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
        <span>Mostrar as desativadas</span>
      </label>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <ul className="lista-simples">
        {lista.map((a) => (
          <LinhaAtividade key={`${a.id}-${a.texto}-${a.ativa}-${a.ordem}`} atividade={a} pedir={pedir} />
        ))}
      </ul>
      <NovaAtividade turnoId={turnoId} pedir={pedir} />
    </div>
  );
}

function LinhaAtividade({ atividade: a, pedir }: { atividade: Atividade; pedir: <T>(c: () => Promise<T>) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(a.texto);
  const [dias, setDias] = useState<number[]>(a.dias_semana ?? []);
  const [opcional, setOpcional] = useState(!!a.opcional);

  function alternar(n: number) {
    setDias(dias.includes(n) ? dias.filter((d) => d !== n) : [...dias, n]);
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    await pedir(() => enviarJson(`/admin/turnos/atividades/${a.id}`, { texto, dias_semana: dias, ativa: a.ativa, opcional }, "PUT"));
    setEditando(false);
  }

  if (editando)
    return (
      <li>
        <form className="corrigir-horario" onSubmit={salvar} aria-label={`Editar ${a.texto}`}>
          <label className="campo">
            Atividade
            <input maxLength={120} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          <MarcaOpcional opcional={opcional} mudar={setOpcional} />
          {!opcional && (
            <fieldset className="dias-semana">
              <legend>Dias da semana (nenhum marcado = todos os dias)</legend>
              {DIAS.map(([n, nome]) => (
                <label key={n} className="marcar-feito">
                  <input type="checkbox" checked={dias.includes(n)} onChange={() => alternar(n)} />
                  <span>{nome}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="botoes-lado">
            <button type="submit" className="botao botao-principal">
              Salvar
            </button>
            <button type="button" className="botao botao-simples" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );

  return (
    <li className={a.ativa ? undefined : "desativada"}>
      <div className="linha-turno">
        <span>
          {a.texto} <span className="texto-secundario">· {quando(a.dias_semana, a.opcional)}{!a.ativa && " · desativada"}</span>
        </span>
        <span className="acoes-linha">
          <button type="button" className="botao-icone" title="Subir" aria-label={`Subir ${a.texto}`} onClick={() => void pedir(() => enviarJson(`/admin/turnos/atividades/${a.id}/mover`, { direcao: "cima" }))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
          <button type="button" className="botao-icone" title="Descer" aria-label={`Descer ${a.texto}`} onClick={() => void pedir(() => enviarJson(`/admin/turnos/atividades/${a.id}/mover`, { direcao: "baixo" }))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </button>
          <button type="button" className="botao-secundario botao-da-linha" aria-label={`Editar ${a.texto}`} onClick={() => setEditando(true)}>
            Editar
          </button>
          <button
            type="button"
            className="botao-secundario botao-da-linha"
            aria-label={`${a.ativa ? "Desativar" : "Reativar"} ${a.texto}`}
            onClick={() =>
              void pedir(() =>
                enviarJson(`/admin/turnos/atividades/${a.id}`, { texto: a.texto, dias_semana: a.dias_semana, ativa: !a.ativa, opcional: !!a.opcional }, "PUT"),
              )
            }
          >
            {a.ativa ? "Desativar" : "Reativar"}
          </button>
        </span>
      </div>
    </li>
  );
}

/** A atividade opcional (27/10): a pessoa escolhe o dia em que faz; se não fizer, não passa para o turno seguinte. */
function MarcaOpcional({ opcional, mudar }: { opcional: boolean; mudar: (v: boolean) => void }) {
  return (
    <label className="marcar-feito">
      <input type="checkbox" checked={opcional} onChange={(e) => mudar(e.target.checked)} />
      <span>Opcional: a pessoa escolhe o dia em que faz (não passa para o turno seguinte)</span>
    </label>
  );
}

function NovaAtividade({ turnoId, pedir }: { turnoId: number; pedir: <T>(c: () => Promise<T>) => Promise<void> }) {
  const [texto, setTexto] = useState("");
  const [dias, setDias] = useState<number[]>([]);
  const [opcional, setOpcional] = useState(false);

  async function adicionar(evento: FormEvent) {
    evento.preventDefault();
    await pedir(() => enviarJson("/admin/turnos/atividades", { turno_id: turnoId, texto, dias_semana: dias, opcional }));
    setTexto("");
    setDias([]);
    setOpcional(false);
  }

  return (
    <form className="corrigir-horario" onSubmit={adicionar} aria-label="Nova atividade">
      <label className="campo">
        Nova atividade neste turno
        <input maxLength={120} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <MarcaOpcional opcional={opcional} mudar={setOpcional} />
      {!opcional && (
        <fieldset className="dias-semana">
          <legend>Só nestes dias (nenhum marcado = todos)</legend>
          {DIAS.map(([n, nome]) => (
            <label key={n} className="marcar-feito">
              <input type="checkbox" checked={dias.includes(n)} onChange={() => setDias(dias.includes(n) ? dias.filter((d) => d !== n) : [...dias, n])} />
              <span>{nome}</span>
            </label>
          ))}
        </fieldset>
      )}
      <button type="submit" className="botao botao-principal">
        Adicionar atividade
      </button>
    </form>
  );
}

function Estufas({ estufas, aoMudar }: { estufas: EstufaAdmin[]; aoMudar: Muda }) {
  const [novo, setNovo] = useState("");
  const [auxiliar, setAuxiliar] = useState(false);
  const [erro, setErro] = useState("");

  async function adicionar(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      aoMudar(await enviarJson<Configuracao>("/admin/turnos/estufas", { id: Number(novo), auxiliar }));
      setNovo("");
      setAuxiliar(false);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível adicionar."));
    }
  }

  return (
    <div className="cartao" role="group" aria-label="Estufas e faixas">
      <h2>Estufas e faixas de trabalho</h2>
      <p className="texto-secundario">As faixas ficam só no banco de dados, nunca no repositório. Uma faixa nova vale a partir da data e encerra a anterior.</p>
      {/* uma estufa por cartão, na grade (27/10: as linhas estavam soltas e fora do padrão do app) */}
      <div className="estufas-admin-grade">
        {estufas.map((e) => (
          <LinhaEstufa key={`${e.id}-${e.ativa}-${e.faixa?.id}`} estufa={e} aoMudar={aoMudar} />
        ))}
      </div>
      <form className="linha-formulario" onSubmit={adicionar} aria-label="Nova estufa">
        <label className="campo campo-hora">
          Número da nova estufa
          <input inputMode="numeric" value={novo} onChange={(e) => setNovo(e.target.value)} />
        </label>
        <label className="marcar-feito">
          <input type="checkbox" checked={auxiliar} onChange={(e) => setAuxiliar(e.target.checked)} />
          <span>Auxiliar (sem faixa)</span>
        </label>
        <button type="submit" className="botao-secundario">
          Adicionar estufa
        </button>
      </form>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

function LinhaEstufa({ estufa: e, aoMudar }: { estufa: EstufaAdmin; aoMudar: Muda }) {
  const nome = `Estufa ${String(e.id).padStart(2, "0")}`;
  const [minimo, setMinimo] = useState(e.faixa ? String(Number(e.faixa.minimo)) : "");
  const [maximo, setMaximo] = useState(e.faixa ? String(Number(e.faixa.maximo)) : "");
  const [desde, setDesde] = useState("");
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);

  async function gravarFaixa(evento: FormEvent) {
    evento.preventDefault();
    setErro("");
    try {
      const corpo = { minimo: Number(minimo.replace(",", ".")), maximo: Number(maximo.replace(",", ".")), ...(desde ? { desde } : {}) };
      aoMudar(await enviarJson<Configuracao>(`/admin/turnos/estufas/${e.id}/faixa`, corpo, "PUT"));
      setAberto(false);
    } catch (x) {
      setErro(mensagem(x, "Não foi possível gravar."));
    }
  }

  async function ativar(ativa: boolean) {
    setErro("");
    try {
      aoMudar(await enviarJson<Configuracao>(`/admin/turnos/estufas/${e.id}`, { ativa }, "PUT"));
    } catch (x) {
      setErro(mensagem(x, "Não foi possível gravar."));
    }
  }

  return (
    <div className={e.ativa ? "estufa-admin" : "estufa-admin desativada"} role="group" aria-label={nome}>
      <div className="estufa-admin-topo">
        <strong className="estufa-admin-nome">{nome}</strong>
        <span className={`etiqueta ${!e.ativa ? "etiqueta-neutra" : e.auxiliar ? "etiqueta-pendente" : "etiqueta-ok"}`}>
          {!e.ativa ? "Desativada" : e.auxiliar ? "Auxiliar" : "Ativa"}
        </span>
      </div>
      <p className="estufa-admin-faixa">
        {e.auxiliar ? "auxiliar, sem faixa" : e.faixa ? `faixa ${virgula(e.faixa.minimo)} a ${virgula(e.faixa.maximo)} °C desde ${dm(e.faixa.desde)}` : "sem faixa cadastrada"}
      </p>
      <div className="botoes-lado">
        {!e.auxiliar && (
          <button type="button" className="botao-secundario botao-da-linha" aria-label={`Faixa da ${nome}`} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
            Faixa
          </button>
        )}
        <button type="button" className="botao-secundario botao-da-linha" aria-label={`${e.ativa ? "Desativar" : "Reativar"} a ${nome}`} onClick={() => void ativar(!e.ativa)}>
          {e.ativa ? "Desativar" : "Reativar"}
        </button>
      </div>
      {aberto && (
        <form className="corrigir-horario" onSubmit={gravarFaixa} aria-label={`Nova faixa da ${nome}`}>
          <div className="linha-formulario">
            <label className="campo campo-hora">
              Mínimo (°C)
              <input inputMode="decimal" value={minimo} onChange={(x) => setMinimo(x.target.value)} />
            </label>
            <label className="campo campo-hora">
              Máximo (°C)
              <input inputMode="decimal" value={maximo} onChange={(x) => setMaximo(x.target.value)} />
            </label>
            <label className="campo">
              Vale desde (vazio = hoje)
              <input type="date" value={desde} onChange={(x) => setDesde(x.target.value)} />
            </label>
          </div>
          {e.historico.length > 0 && (
            <p className="texto-secundario">
              Antes: {e.historico.map((h) => `${virgula(h.minimo)} a ${virgula(h.maximo)} (${dm(h.desde)}${h.ate ? ` a ${dm(h.ate)}` : ""})`).join("; ")}
            </p>
          )}
          <button type="submit" className="botao botao-principal">
            Gravar faixa
          </button>
        </form>
      )}
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
