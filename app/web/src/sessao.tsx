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
  /** LabFlow Lite (um PC só, sem senha, sem celular): GET /ambiente. Na Completa é false. */
  lite: boolean;
  entrar: (usuario: string, senha: string) => Promise<void>;
  entrarPorNome: (usuario: string) => Promise<void>; // Lite: quem abre toca no próprio nome
  entrarComoNovo: (nome: string) => Promise<void>; // Lite: "Sou novo aqui" (na 1ª abertura assume o registro do Admin)
  sair: () => Promise<void>;
  trocarSenha: (novaSenha: string, senhaAtual?: string) => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [lite, setLite] = useState(false);
  const [ambientePronto, setAmbientePronto] = useState(false);

  useEffect(() => {
    lerJson<{ lite?: boolean }>("/ambiente")
      .then((a) => setLite(!!a.lite))
      .catch(() => setLite(false))
      .finally(() => setAmbientePronto(true));
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

  const entrarPorNome = useCallback(async (usuario: string) => {
    setPessoa(await enviarJson<Pessoa>("/entrar/por-nome", { usuario }));
  }, []);

  const entrarComoNovo = useCallback(async (nome: string) => {
    setPessoa(await enviarJson<Pessoa>("/entrar/novo", { nome }));
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

  return (
    <Contexto.Provider value={{ pessoa, carregando: carregando || !ambientePronto, lite, entrar, entrarPorNome, entrarComoNovo, sair, trocarSenha }}>
      {children}
    </Contexto.Provider>
  );
}

export function useSessao(): Sessao {
  const sessao = useContext(Contexto);
  if (!sessao) throw new Error("useSessao fora do ProvedorDeSessao");
  return sessao;
}
