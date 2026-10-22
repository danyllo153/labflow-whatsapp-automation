/** Quem está logado no app (APP-013). Spec: 06 §Primeiro acesso; 07 §1 Login. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { enviarJson, ErroDaApi, lerJson, SESSAO_EXPIRADA } from "./api";

export interface Pessoa {
  usuario: string;
  nome: string | null;
  cargo: string;
  trocar_senha: boolean;
  pode: string[];
}

interface Sessao {
  pessoa: Pessoa | null;
  carregando: boolean;
  entrar: (usuario: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  trocarSenha: (novaSenha: string, senhaAtual?: string) => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    lerJson<Pessoa>("/me")
      .then(setPessoa)
      .catch(() => setPessoa(null))
      .finally(() => setCarregando(false));
    const expirou = () => setPessoa(null);
    window.addEventListener(SESSAO_EXPIRADA, expirou);
    return () => window.removeEventListener(SESSAO_EXPIRADA, expirou);
  }, []);

  const entrar = useCallback(async (usuario: string, senha: string) => {
    setPessoa(await enviarJson<Pessoa>("/login", { usuario, senha }));
  }, []);

  const sair = useCallback(async () => {
    try {
      await enviarJson("/sair");
    } catch (erro) {
      if (!(erro instanceof ErroDaApi && erro.status === 401)) throw erro; // já estava fora: tudo bem
    }
    setPessoa(null);
  }, []);

  const trocarSenha = useCallback(async (novaSenha: string, senhaAtual?: string) => {
    await enviarJson("/trocar-senha", { nova_senha: novaSenha, senha_atual: senhaAtual ?? null });
    setPessoa(await lerJson<Pessoa>("/me"));
  }, []);

  return <Contexto.Provider value={{ pessoa, carregando, entrar, sair, trocarSenha }}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const sessao = useContext(Contexto);
  if (!sessao) throw new Error("useSessao fora do ProvedorDeSessao");
  return sessao;
}
