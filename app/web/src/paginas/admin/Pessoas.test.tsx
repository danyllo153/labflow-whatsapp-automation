import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../../App";
import { ProvedorDeSessao } from "../../sessao";
import { ANA, servidorFalso } from "../../testes-servidor";
import { sugerirUsuario, telefoneComDdi, type Pessoa } from "./Pessoas";

const ADMIN = { ...ANA, usuario: "danyllo", nome: "Danyllo G.", cargo: "Admin", pode: ["ver_paginas", "gerenciar_pessoas"] };

let LISTA: Pessoa[] = [];
function lista(): Pessoa[] {
  return [
    { id: 4, nome: "Danyllo G.", cargo: "Admin", usuario: "danyllo", situacao: "Ativo" },
    { id: 7, nome: "Bruno Lima", cargo: "Operador", usuario: "bruno.lima", situacao: "Bloqueado por senhas erradas" },
    { id: 9, nome: "Carla Dias", cargo: "Operador", usuario: null, situacao: "Sem usuário no app" },
  ];
}

function abrir(caminho = "/admin/pessoas", eu: any = ADMIN, extra: Record<string, (c: any) => any> = {}) {
  LISTA = lista();
  const api = servidorFalso({
    "GET /me": () => ({ status: 200, corpo: eu }),
    "GET /admin/pessoas": () => ({ status: 200, corpo: LISTA }),
    ...extra,
  });
  render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
  return api;
}

function cartaoDe(nome: string): HTMLElement {
  const lista = document.querySelector(".lista-pessoas") as HTMLElement;
  return within(lista).getByText(nome).closest("li") as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

describe("ajudas do cadastro", () => {
  it("sugere o usuário pelo nome, sem acento", () => {
    expect(sugerirUsuario("Ana Paula de Souza")).toBe("ana.souza");
    expect(sugerirUsuario("  João  ")).toBe("joao");
  });
  it("põe o 55 do Brasil quando vem só DDD e número", () => {
    expect(telefoneComDdi("(11) 98765-4321")).toBe("5511987654321");
    expect(telefoneComDdi("+55 11 98765-4321")).toBe("5511987654321");
    expect(telefoneComDdi("11 3456-7890")).toBe("551134567890");
  });
});

describe("Admin → Pessoas (APP-016)", () => {
  it("só o Admin vê Pessoas no menu", async () => {
    abrir("/");
    const lateral = await screen.findByRole("complementary", { name: "Menu" });
    expect(within(lateral).getByRole("link", { name: "Pessoas" })).toHaveAttribute("href", "/admin/pessoas");
    expect(within(screen.getByRole("navigation", { name: "Menu do celular" })).queryByRole("link", { name: "Pessoas" })).toBeNull();
  });

  it("quem não é Admin não vê o menu e a página avisa", async () => {
    abrir("/admin/pessoas", ANA);
    expect(await screen.findByText("Só o Admin cadastra pessoas e troca cargos.")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Menu" })).queryByRole("link", { name: "Pessoas" })).toBeNull();
  });

  it("no celular o Admin chega a Pessoas por Minha conta", async () => {
    abrir("/conta");
    const conta = (await screen.findByRole("heading", { name: "Minha conta" })).closest("section") as HTMLElement;
    expect(within(conta).getByRole("link", { name: /Pessoas/ })).toHaveAttribute("href", "/admin/pessoas");
  });

  it("lista com usuário, cargo e situação em texto", async () => {
    abrir();
    expect(await screen.findByText("Bruno Lima")).toBeInTheDocument();
    expect(within(cartaoDe("Bruno Lima")).getByText("Bloqueado por senhas erradas")).toHaveClass("etiqueta-nao-ok");
    expect(within(cartaoDe("Carla Dias")).getByText(/Sem usuário no app · Analista/)).toBeInTheDocument();
  });

  it("Nova pessoa: confere, mostra o resumo, cadastra e mostra a senha provisória uma vez", async () => {
    const api = abrir("/admin/pessoas", ADMIN, {
      "POST /admin/pessoas": (corpo) => ({
        status: 201,
        corpo: { pessoa: { id: 12, nome: corpo.nome, cargo: corpo.cargo, usuario: corpo.usuario, situacao: "Senha provisória pendente" }, senha_provisoria: "K7m4-Tq2p", valida_ate: "23/10/2026 20:15" },
      }),
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Nova pessoa" }));
    const form = screen.getByRole("form", { name: "Nova pessoa" });
    await u.type(within(form).getByLabelText("Nome"), "Érica Nunes Prado");
    await u.type(within(form).getByLabelText("Telefone (WhatsApp)"), "11 98765-4321");
    await u.selectOptions(within(form).getByLabelText("Cargo"), "Consultor");
    expect(within(form).getByLabelText("Usuário no app")).toHaveValue("erica.prado");
    await u.click(within(form).getByRole("button", { name: "Continuar" }));
    const resumo = within(form).getByRole("dialog", { name: "Confirmar" });
    expect(resumo).toHaveTextContent("Érica Nunes Prado como Consultor, telefone 5511987654321, usuário no app erica.prado");
    expect(api.vezes("POST /admin/pessoas")).toBe(0);
    await u.click(within(resumo).getByRole("button", { name: "Cadastrar e gerar senha provisória" }));
    expect(await screen.findByText("K7m4-Tq2p")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ela não aparece de novo");
    expect(api.chamadas.find((c) => c.rota === "POST /admin/pessoas")?.corpo).toEqual({
      nome: "Érica Nunes Prado",
      telefone: "5511987654321",
      cargo: "Consultor",
      usuario: "erica.prado",
    });
    await u.click(screen.getByRole("button", { name: "Pronto, entreguei" }));
    expect(screen.queryByText("K7m4-Tq2p")).not.toBeInTheDocument();
  });

  it("Nova pessoa: telefone incompleto não chega a mandar", async () => {
    const api = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Nova pessoa" }));
    const form = screen.getByRole("form", { name: "Nova pessoa" });
    await u.type(within(form).getByLabelText("Nome"), "Teo");
    await u.type(within(form).getByLabelText("Telefone (WhatsApp)"), "98765");
    await u.click(within(form).getByRole("button", { name: "Continuar" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Telefone com DDD");
    expect(api.vezes("POST /admin/pessoas")).toBe(0);
  });

  it("Nova pessoa: a recusa do banco aparece como veio", async () => {
    abrir("/admin/pessoas", ADMIN, {
      "POST /admin/pessoas": () => ({ status: 422, corpo: { detail: "Esse telefone já está cadastrado; para mudar o cargo use a troca de cargo." } }),
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Nova pessoa" }));
    const form = screen.getByRole("form", { name: "Nova pessoa" });
    await u.type(within(form).getByLabelText("Nome"), "Teo Silva");
    await u.type(within(form).getByLabelText("Telefone (WhatsApp)"), "11987654321");
    await u.click(within(form).getByRole("button", { name: "Continuar" }));
    await u.click(within(form).getByRole("button", { name: "Cadastrar e gerar senha provisória" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("já está cadastrado");
  });

  it("trocar cargo pede confirmação dizendo de quê para quê e grava com PUT", async () => {
    const api = abrir("/admin/pessoas", ADMIN, {
      "PUT /admin/pessoas/7/cargo": (corpo) => {
        LISTA = LISTA.map((p) => (p.id === 7 ? { ...p, cargo: corpo.cargo } : p));
        return { status: 200, corpo: LISTA[1] };
      },
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Gerenciar Bruno Lima" }));
    const cartao = cartaoDe("Bruno Lima");
    await u.selectOptions(within(cartao).getByLabelText("Cargo"), "Admin");
    await u.click(within(cartao).getByRole("button", { name: "Trocar cargo" }));
    expect(within(cartao).getByRole("dialog")).toHaveTextContent("Trocar o cargo de Bruno Lima de Analista para Admin? Vale também no WhatsApp.");
    await u.click(within(cartao).getByRole("button", { name: "Confirmar" }));
    expect(await within(cartaoDe("Bruno Lima")).findByText(/bruno.lima · Admin/)).toBeInTheDocument();
    expect(api.chamadas.find((c) => c.rota === "PUT /admin/pessoas/7/cargo")?.corpo).toEqual({ cargo: "Admin" });
  });

  it("Desbloquear só aparece para quem está bloqueado por senhas erradas", async () => {
    const api = abrir("/admin/pessoas", ADMIN, { "POST /admin/pessoas/7/desbloquear": () => ({ status: 200, corpo: {} }) });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Gerenciar Danyllo G." }));
    expect(within(cartaoDe("Danyllo G.")).queryByRole("button", { name: "Desbloquear" })).toBeNull();
    // o Admin não se bloqueia
    expect(within(cartaoDe("Danyllo G.")).queryByRole("button", { name: "Bloquear acesso" })).toBeNull();
    await u.click(screen.getByRole("button", { name: "Gerenciar Bruno Lima" }));
    await u.click(within(cartaoDe("Bruno Lima")).getByRole("button", { name: "Desbloquear" }));
    await u.click(within(cartaoDe("Bruno Lima")).getByRole("button", { name: "Confirmar" }));
    expect(api.vezes("POST /admin/pessoas/7/desbloquear")).toBe(1);
  });

  it("gerar senha provisória mostra a senha para entregar", async () => {
    abrir("/admin/pessoas", ADMIN, {
      "POST /admin/pessoas/7/senha-provisoria": () => ({ status: 200, corpo: { usuario: "bruno.lima", senha_provisoria: "Ab3d-Ef4g", valida_ate: "23/10/2026 21:00" } }),
    });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Gerenciar Bruno Lima" }));
    await u.click(within(cartaoDe("Bruno Lima")).getByRole("button", { name: "Gerar senha provisória" }));
    expect(within(cartaoDe("Bruno Lima")).getByRole("dialog")).toHaveTextContent("A senha atual dela deixa de valer");
    await u.click(within(cartaoDe("Bruno Lima")).getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Ab3d-Ef4g")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Senha provisória de bruno.lima" })).toBeInTheDocument();
  });

  it("quem não tem usuário recebe um, sugerido pelo nome", async () => {
    const api = abrir("/admin/pessoas", ADMIN, { "PUT /admin/pessoas/9/usuario": () => ({ status: 200, corpo: {} }) });
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Gerenciar Carla Dias" }));
    const cartao = cartaoDe("Carla Dias");
    expect(within(cartao).getByLabelText("Usuário no app")).toHaveValue("carla.dias");
    expect(within(cartao).queryByRole("button", { name: "Gerar senha provisória" })).toBeNull();
    await u.click(within(cartao).getByRole("button", { name: "Salvar usuário" }));
    await u.click(within(cartao).getByRole("button", { name: "Confirmar" }));
    expect(api.chamadas.find((c) => c.rota === "PUT /admin/pessoas/9/usuario")?.corpo).toEqual({ usuario: "carla.dias" });
  });

  it("cancelar não grava nada", async () => {
    const api = abrir();
    const u = userEvent.setup();
    await u.click(await screen.findByRole("button", { name: "Gerenciar Bruno Lima" }));
    await u.click(within(cartaoDe("Bruno Lima")).getByRole("button", { name: "Bloquear acesso" }));
    await u.click(within(cartaoDe("Bruno Lima")).getByRole("button", { name: "Cancelar" }));
    expect(api.chamadas.filter((c) => c.rota.startsWith("PUT") || c.rota.startsWith("POST"))).toHaveLength(0);
  });
});
