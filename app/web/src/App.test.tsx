import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { ProvedorDeSessao } from "./sessao";
import { ANA, naoLogado, servidorFalso } from "./testes-servidor";

function abrir(caminho = "/") {
  return render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
}

const logada = () => ({ status: 200, corpo: ANA });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("moldura do app (APP-012)", () => {
  it("mostra os cinco itens do menu no computador e no celular", async () => {
    servidorFalso({ "GET /me": logada });
    abrir("/");
    const lateral = await screen.findByRole("complementary", { name: "Menu" });
    const barra = screen.getByRole("navigation", { name: "Menu do celular" });
    for (const rotulo of ["Início", "Turno", "Páginas", "Esterilização", "Assistente"]) {
      expect(within(lateral).getByRole("link", { name: new RegExp(rotulo) })).toBeInTheDocument();
      expect(within(barra).getByRole("link", { name: rotulo })).toBeInTheDocument();
    }
  });

  it("mostra a faixa de demonstração quando o servidor é de demonstração", async () => {
    servidorFalso({ "GET /me": logada });
    abrir("/");
    expect(await screen.findByText("Dados de demonstração.")).toBeInTheDocument();
  });

  it("não mostra a faixa fora da demonstração", async () => {
    servidorFalso({ "GET /me": logada, "GET /ambiente": () => ({ status: 200, corpo: { demonstracao: false } }) });
    abrir("/");
    await screen.findByRole("heading", { name: "Início" });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Dados de demonstração.")).not.toBeInTheDocument();
  });

  it("tela que ainda não existe aparece como Em breve, com a etapa", async () => {
    servidorFalso({ "GET /me": logada });
    abrir("/esterilizacao");
    expect(await screen.findByRole("heading", { level: 1, name: "Esterilização" })).toBeInTheDocument();
    expect(screen.getByText("Etapa: APP-026")).toBeInTheDocument();
  });

  it("endereço desconhecido mostra página não encontrada com volta ao Início", async () => {
    servidorFalso({ "GET /me": logada });
    abrir("/nao-existe");
    expect(await screen.findByRole("heading", { name: "Página não encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao Início" })).toBeInTheDocument();
  });

  it("não usa emoji nos textos", async () => {
    servidorFalso({ "GET /me": logada });
    const { container } = abrir("/");
    await screen.findByRole("heading", { name: "Início" });
    expect(container.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("entrar (APP-013)", () => {
  it("sem sessão abre a tela de entrar; com usuário e senha certos abre o Início com o nome", async () => {
    const api = servidorFalso({ "GET /me": naoLogado, "POST /login": () => logada() });
    abrir("/");
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Usuário"), "  Ana.Souza ");
    await u.type(screen.getByLabelText("Senha"), "Senha-certa-1");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText(/Olá, Ana Souza/)).toBeInTheDocument();
    expect(api.chamadas.find((c) => c.rota === "POST /login")?.corpo).toEqual({ usuario: "Ana.Souza", senha: "Senha-certa-1" });
  });

  it("o botão Entrar fica travado enquanto espera: dois cliques mandam um login só", async () => {
    let responder!: (r: { status: number; corpo?: unknown }) => void;
    const api = servidorFalso({
      "GET /me": naoLogado,
      "POST /login": () => new Promise((ok) => (responder = ok)),
    });
    abrir("/");
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Usuário"), "ana.souza");
    await u.type(screen.getByLabelText("Senha"), "K7m4-Tq2p");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    const botao = screen.getByRole("button", { name: "Entrando..." });
    expect(botao).toBeDisabled();
    await u.click(botao);
    await u.keyboard("{Enter}");
    expect(api.vezes("POST /login")).toBe(1);
    responder({ status: 200, corpo: { ...ANA, trocar_senha: true } });
    expect(await screen.findByRole("heading", { name: "Crie a sua senha" })).toBeInTheDocument();
  });

  it("senha errada mostra a mensagem da API e libera o botão de novo", async () => {
    servidorFalso({
      "GET /me": naoLogado,
      "POST /login": () => ({ status: 401, corpo: { detail: "Usuário ou senha incorretos." } }),
    });
    abrir("/");
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Usuário"), "ana.souza");
    await u.type(screen.getByLabelText("Senha"), "errada");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Usuário ou senha incorretos.");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("login bloqueado mostra até que horas", async () => {
    servidorFalso({
      "GET /me": naoLogado,
      "POST /login": () => ({ status: 423, corpo: { detail: "Muitas senhas erradas. Tente de novo depois das 14:35." } }),
    });
    abrir("/");
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Usuário"), "ana.souza");
    await u.type(screen.getByLabelText("Senha"), "errada");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("depois das 14:35");
  });

  it("sem internet avisa em português", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    abrir("/");
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Usuário"), "ana.souza");
    await u.type(screen.getByLabelText("Senha"), "x");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão com o servidor");
  });

  it("mostrar a senha troca o campo para texto", async () => {
    servidorFalso({ "GET /me": naoLogado });
    abrir("/");
    const u = userEvent.setup();
    const senha = await screen.findByLabelText("Senha");
    expect(senha).toHaveAttribute("type", "password");
    await u.click(screen.getByLabelText("Mostrar a senha"));
    expect(senha).toHaveAttribute("type", "text");
  });
});

describe("criar a senha depois da provisória (APP-013)", () => {
  function provisoria(extra: Record<string, any> = {}) {
    let trocou = false;
    const api = servidorFalso({
      "GET /me": () => ({ status: 200, corpo: { ...ANA, trocar_senha: !trocou } }),
      "POST /trocar-senha": (corpo) => {
        trocou = true;
        return extra.trocar ? extra.trocar(corpo) : { status: 204 };
      },
      "POST /sair": () => ({ status: 204 }),
    });
    abrir("/");
    return api;
  }

  it("não deixa entrar no app antes de trocar", async () => {
    provisoria();
    expect(await screen.findByRole("heading", { name: "Crie a sua senha" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Menu" })).not.toBeInTheDocument();
  });

  it("confere tamanho, senha igual ao usuário e as duas senhas antes de mandar", async () => {
    const api = provisoria();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Senha nova"), "curta");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("pelo menos 8 caracteres");

    await u.clear(screen.getByLabelText("Senha nova"));
    await u.type(screen.getByLabelText("Senha nova"), "ANA.SOUZA");
    await u.type(screen.getByLabelText("Repita a senha nova"), "ANA.SOUZA");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("igual ao seu usuário");

    await u.clear(screen.getByLabelText("Senha nova"));
    await u.type(screen.getByLabelText("Senha nova"), "Senha-nova-123");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("não são iguais");
    expect(api.vezes("POST /trocar-senha")).toBe(0);
  });

  it("senha válida grava sem pedir a atual e abre o Início", async () => {
    const api = provisoria();
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Senha nova"), "Senha-nova-123");
    await u.type(screen.getByLabelText("Repita a senha nova"), "Senha-nova-123");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(await screen.findByText(/Olá, Ana Souza/)).toBeInTheDocument();
    expect(api.chamadas.find((c) => c.rota === "POST /trocar-senha")?.corpo).toEqual({ nova_senha: "Senha-nova-123", senha_atual: null });
  });

  it("dá para sair sem trocar", async () => {
    provisoria();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
  });
});

describe("sair, trocar a senha por vontade própria e sessão expirada (APP-013)", () => {
  it("Sair encerra a sessão e volta para entrar", async () => {
    const api = servidorFalso({ "GET /me": logada, "POST /sair": () => ({ status: 204 }) });
    abrir("/");
    const u = userEvent.setup();
    const lateral = await screen.findByRole("complementary", { name: "Menu" });
    await u.click(within(lateral).getByRole("button", { name: "Sair" }));
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(api.vezes("POST /sair")).toBe(1);
  });

  it("troca voluntária pede a senha atual e mostra o erro da API", async () => {
    const api = servidorFalso({
      "GET /me": logada,
      "POST /trocar-senha": (corpo) =>
        corpo.senha_atual === "Atual-certa-1" ? { status: 204 } : { status: 403, corpo: { detail: "A senha atual não confere." } },
    });
    abrir("/conta/senha");
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Senha nova"), "Senha-nova-123");
    await u.type(screen.getByLabelText("Repita a senha nova"), "Senha-nova-123");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva a sua senha atual.");

    await u.type(screen.getByLabelText("Senha atual"), "errada-123");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A senha atual não confere.");

    await u.clear(screen.getByLabelText("Senha atual"));
    await u.type(screen.getByLabelText("Senha atual"), "Atual-certa-1");
    await u.type(screen.getByLabelText("Senha nova"), "Senha-nova-123");
    await u.type(screen.getByLabelText("Repita a senha nova"), "Senha-nova-123");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Senha trocada.");
    expect(api.vezes("POST /trocar-senha")).toBe(2);
  });

  it("sessão que acabou no meio do uso volta para a tela de entrar", async () => {
    let vale = true;
    servidorFalso({
      "GET /me": () => (vale ? logada() : naoLogado()),
      "POST /trocar-senha": () => {
        vale = false;
        return naoLogado();
      },
    });
    abrir("/conta/senha");
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText("Senha atual"), "qualquer-1");
    await u.type(screen.getByLabelText("Senha nova"), "Senha-nova-123");
    await u.type(screen.getByLabelText("Repita a senha nova"), "Senha-nova-123");
    await u.click(screen.getByRole("button", { name: "Salvar a senha" }));
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
  });
});
