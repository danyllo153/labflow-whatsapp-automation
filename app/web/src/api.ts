/** Chamadas à API do LabFlow (mesmo endereço das telas; o cookie de login vai junto sozinho). */

export class ErroDaApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export async function lerJson<T>(caminho: string): Promise<T> {
  const resposta = await fetch(caminho, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!resposta.ok) {
    let mensagem = "Não foi possível falar com o servidor.";
    try {
      const corpo = await resposta.json();
      if (typeof corpo?.detail === "string") mensagem = corpo.detail;
    } catch {
      // resposta sem JSON: fica a mensagem padrão
    }
    throw new ErroDaApi(resposta.status, mensagem);
  }
  return (await resposta.json()) as T;
}
