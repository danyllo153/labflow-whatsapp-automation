import { useState, type FormEvent } from "react";

import { enviarJson } from "../api";
import type { Entrada } from "./Turno";

function mensagem(e: unknown, padrao: string): string {
  return e instanceof Error ? e.message : padrao;
}

export function agoraHHMM(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Corrigir o próprio horário: sempre com motivo; o horário do clique continua guardado (APP-022b). */
export function CorrigirHorario(props: { entrada: Entrada; titulo: string; aoTerminar: (salvou: boolean) => void }) {
  const { entrada } = props;
  const [horaEntrada, setHoraEntrada] = useState(entrada.entrada);
  const [horaSaida, setHoraSaida] = useState(entrada.saida ?? "");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (motivo.trim().length < 5) {
      setErro("Escreva o motivo da correção (por exemplo: esqueci de marcar na hora).");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const corpo = { entrada: horaEntrada, motivo: motivo.trim(), ...(entrada.saida ? { saida: horaSaida } : {}) };
      await enviarJson(`/turno/entradas/${entrada.id}`, corpo, "PUT");
      props.aoTerminar(true);
    } catch (e) {
      setErro(mensagem(e, "Não foi possível gravar."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="corrigir-horario" onSubmit={salvar} aria-label={`Corrigir ${props.titulo}`}>
      <div className="linha-formulario">
        <label className="campo campo-hora">
          Entrada
          <input type="time" required value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} />
        </label>
        {entrada.saida && (
          <label className="campo campo-hora">
            Saída
            <input type="time" required value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} />
          </label>
        )}
      </div>
      <label className="campo">
        Motivo da correção
        <textarea rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <p className="texto-secundario">
        O horário marcado no app ({entrada.entrada_registrada}
        {entrada.saida_registrada && ` às ${entrada.saida_registrada}`}) continua guardado junto com a correção.
      </p>
      {erro && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="botoes-lado">
        <button type="submit" className="botao botao-principal" disabled={enviando}>
          Salvar correção
        </button>
        <button type="button" className="botao botao-simples" onClick={() => props.aoTerminar(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function Corrigido({ entrada }: { entrada: Entrada }) {
  if (!entrada.motivo_correcao) return null;
  const marcado = entrada.saida_registrada ? `${entrada.entrada_registrada} às ${entrada.saida_registrada}` : entrada.entrada_registrada;
  return (
    <span className="texto-secundario corrigido">
      Corrigido (marcado no app: {marcado}). Motivo: {entrada.motivo_correcao}
    </span>
  );
}
