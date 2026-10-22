/** Chamadas à API do LabFlow (mesmo endereço das telas; o cookie de login vai junto sozinho). */

export class ErroDaApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** Aviso para o app voltar à tela de entrar quando a sessão acabou (30 dias sem uso, "Sair" em outro lugar...). */
export const SESSAO_EXPIRADA = "labflow:sessao-expirada";

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = await resposta.json();
    if (typeof corpo?.detail === "string") return corpo.detail;
    if (Array.isArray(corpo?.detail)) return "Confira os campos preenchidos.";
  } catch {
    // resposta sem JSON: fica a mensagem padrão
  }
  return "Não foi possível falar com o servidor. Tente de novo.";
}

async function pedir<T>(caminho: string, init: RequestInit, avisarSessao: boolean): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      credentials: "same-origin",
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ErroDaApi(0, "Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  if (!resposta.ok) {
    if (resposta.status === 401 && avisarSessao) window.dispatchEvent(new Event(SESSAO_EXPIRADA));
    throw new ErroDaApi(resposta.status, await mensagemDeErro(resposta));
  }
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

/** GET. Um 401 avisa o app que a sessão acabou. */
export function lerJson<T>(caminho: string): Promise<T> {
  return pedir<T>(caminho, {}, true);
}

/** POST com corpo JSON. Em /login o 401 é "senha errada", não sessão expirada. */
export function enviarJson<T>(caminho: string, corpo?: unknown): Promise<T> {
  return pedir<T>(
    caminho,
    { method: "POST", body: corpo === undefined ? undefined : JSON.stringify(corpo) },
    caminho !== "/login",
  );
}
