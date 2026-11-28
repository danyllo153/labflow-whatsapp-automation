/** LabFlow Lite (27/11): sem senha, sem Admin, sem versão de celular. A Completa (servidor) continua igual. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { ProvedorDeSessao } from "./sessao";
import { ANA, naoLogado, servidorFalso } from "./testes-servidor";

const LITE = { "GET /ambiente": () => ({ status: 200, corpo: { demonstracao: false, lite: true } }) };
const COMPLETA = { "GET /ambiente": () => ({ status: 200, corpo: { demonstracao: false, lite: false } }) };
// na Lite todo mundo vale como Admin: tem todas as funções
const ELA = { ...ANA, cargo: "Admin", pode: ["ver_paginas", "gerenciar_pessoas", "configurar_turnos", "registrar_analise"] };

function abrir(caminho = "/") {
  return render(
    <MemoryRouter initialEntries={[caminho]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ProvedorDeSessao>
        <App />
      </ProvedorDeSessao>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Entrar", () => {
  it("Lite: lista de nomes e Sou novo aqui, sem campo de senha", async () => {
    const api = servidorFalso({
      ...LITE,
      "GET /me": naoLogado,
      "GET /entrar/nomes": () => ({ status: 200, corpo: [{ usuario: "ana.souza", nome: "Ana Souza" }, { usuario: "bia.lima", nome: "Bia Lima" }] }),
      "POST /entrar/por-nome": () => ({ status: 200, corpo: ELA }),
    });
    abrir("/");
    expect(await screen.findByRole("heading", { name: "Quem é você?" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/senha/i)).toBeNull();
    expect(screen.queryByText(/senha/i)).toBeNull();
    expect(screen.queryByText("Admin")).toBeNull(); // o "Admin" não existe mais
    expect(screen.getByRole("button", { name: "Sou novo aqui" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bia Lima" }));
    expect(api.chamadas.find((c) => c.rota === "POST /entrar/por-nome")?.corpo).toEqual({ usuario: "bia.lima" });
    expect(await screen.findByRole("heading", { name: "Início" })).toBeInTheDocument();
  });

  it("Lite: Sou novo aqui pede só o nome e entra", async () => {
    const api = servidorFalso({
      ...LITE,
      "GET /me": naoLogado,
      "GET /entrar/nomes": () => ({ status: 200, corpo: [{ usuario: "ana.souza", nome: "Ana Souza" }] }),
      "POST /entrar/novo": (c) => ({ status: 201, corpo: { ...ELA, nome: c.nome } }),
    });
    abrir("/");
    await userEvent.click(await screen.findByRole("button", { name: "Sou novo aqui" }));
    const form = screen.getByRole("form", { name: "Sou novo aqui" });
    expect(within(form).queryByLabelText(/senha/i)).toBeNull();
    await userEvent.type(within(form).getByLabelText("Seu nome"), "  Caio Mendes ");
    await userEvent.click(within(form).getByRole("button", { name: "Entrar" }));
    expect(api.chamadas.find((c) => c.rota === "POST /entrar/novo")?.corpo).toEqual({ nome: "Caio Mendes" });
    expect(await screen.findByRole("heading", { name: "Início" })).toBeInTheDocument();
  });

  it("Lite: primeira abertura (lista vazia) já pede o nome, sem Admin e sem senha", async () => {
    servidorFalso({ ...LITE, "GET /me": naoLogado, "GET /entrar/nomes": () => ({ status: 200, corpo: [] }) });
    abrir("/");
    expect(await screen.findByRole("heading", { name: "Primeira vez aqui" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/senha/i)).toBeNull();
    expect(screen.queryByText(/^Admin$/)).toBeNull();
  });

  it("Lite: a recusa do nome (repetido, inválido) aparece na tela", async () => {
    servidorFalso({
      ...LITE,
      "GET /me": naoLogado,
      "GET /entrar/nomes": () => ({ status: 200, corpo: [] }),
      "POST /entrar/novo": () => ({ status: 409, corpo: { detail: "Já existe uma pessoa com esse nome: escolha-a na lista." } }),
    });
    abrir("/");
    await userEvent.type(await screen.findByLabelText("Seu nome"), "Ana");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma pessoa com esse nome");
  });

  it("Completa: continua pedindo usuário e senha", async () => {
    servidorFalso({ ...COMPLETA, "GET /me": naoLogado });
    abrir("/");
    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Usuário")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByText(/Peça uma senha provisória ao Admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sou novo aqui" })).toBeNull();
  });
});

describe("telas dentro do app", () => {
  it("Lite: sem barra de baixo, sem botão do menu do celular e sem 'Trocar senha'", async () => {
    servidorFalso({ ...LITE, "GET /me": () => ({ status: 200, corpo: ELA }) });
    abrir("/");
    await screen.findByRole("heading", { name: "Início" });
    expect(screen.queryByRole("navigation", { name: "Menu do celular" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir o menu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fechar o menu" })).toBeNull();
    // as telas que eram do Admin são de todos
    const lateral = screen.getByRole("complementary", { name: "Menu" });
    expect(within(lateral).getByRole("link", { name: "Pessoas" })).toBeInTheDocument();
    expect(within(lateral).getByRole("link", { name: "Turnos e estufas" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Conta de/ }));
    const menu = screen.getByRole("menu", { name: "Conta" });
    expect(within(menu).queryByText("Trocar senha")).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Trocar de pessoa" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Sair" })).toBeNull();
    expect(within(menu).queryByText(/^(Admin|Analista)$/)).toBeNull(); // sem cargo na Lite
  });

  it("Completa: a barra de baixo, Trocar senha e Sair continuam", async () => {
    servidorFalso({ ...COMPLETA, "GET /me": () => ({ status: 200, corpo: ANA }) });
    abrir("/");
    await screen.findByRole("heading", { name: "Início" });
    expect(screen.getByRole("navigation", { name: "Menu do celular" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir o menu" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Conta de/ }));
    const menu = screen.getByRole("menu", { name: "Conta" });
    expect(within(menu).getByRole("menuitem", { name: "Trocar senha" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Sair" })).toBeInTheDocument();
  });

  it("Lite: Minha conta sem senha; trocar de pessoa sai da sessão", async () => {
    const api = servidorFalso({
      ...LITE,
      "GET /me": () => ({ status: 200, corpo: ELA }),
      "POST /sair": () => ({ status: 204 }),
      "GET /entrar/nomes": () => ({ status: 200, corpo: [{ usuario: "ana.souza", nome: "Ana Souza" }] }),
    });
    abrir("/conta");
    const conta = (await screen.findByRole("heading", { name: "Minha conta" })).closest("section") as HTMLElement;
    expect(within(conta).queryByRole("link", { name: /senha/i })).toBeNull();
    await userEvent.click(within(conta).getByRole("button", { name: "Trocar de pessoa" }));
    expect(api.vezes("POST /sair")).toBe(1);
    expect(await screen.findByRole("heading", { name: "Quem é você?" })).toBeInTheDocument();
  });

  it("Lite: o endereço de trocar a senha volta para Minha conta", async () => {
    servidorFalso({ ...LITE, "GET /me": () => ({ status: 200, corpo: ELA }) });
    abrir("/conta/senha");
    expect(await screen.findByRole("heading", { name: "Minha conta" })).toBeInTheDocument();
  });

  it("Lite: mesmo com troca de senha pendente no banco, entra direto (sem tela de senha)", async () => {
    servidorFalso({ ...LITE, "GET /me": () => ({ status: 200, corpo: { ...ELA, trocar_senha: true } }) });
    abrir("/");
    expect(await screen.findByRole("heading", { name: "Início" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/senha/i)).toBeNull();
  });

  it("Completa: troca de senha obrigatória continua", async () => {
    servidorFalso({ ...COMPLETA, "GET /me": () => ({ status: 200, corpo: { ...ANA, trocar_senha: true } }) });
    abrir("/");
    expect(await screen.findByRole("heading", { name: "Crie a sua senha" })).toBeInTheDocument();
  });
});

describe("Admin → Pessoas na Lite", () => {
  const LISTA = [
    { id: 4, nome: "Ana Souza", cargo: "Admin", usuario: "ana.souza", situacao: "Ativo" },
    { id: 7, nome: "Bruno Lima", cargo: "Analista", usuario: "bruno.lima", situacao: "Ativo" },
    { id: 9, nome: "Carla Dias", cargo: "Analista", usuario: "carla.dias", situacao: "Acesso bloqueado" },
  ];

  it("sem cargo, usuário, telefone nem senha provisória; só nome e bloquear/liberar", async () => {
    const api = servidorFalso({
      ...LITE,
      "GET /me": () => ({ status: 200, corpo: ELA }),
      "GET /admin/pessoas": () => ({ status: 200, corpo: LISTA }),
      "POST /admin/pessoas/por-nome": (c) => ({ status: 201, corpo: { id: 11, nome: c.nome, cargo: "Analista", usuario: "x.yz", situacao: "Ativo" } }),
      "PUT /admin/pessoas/7/acesso": () => ({ status: 200, corpo: { ...LISTA[1], situacao: "Acesso bloqueado" } }),
    });
    abrir("/admin/pessoas");
    expect(await screen.findByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.queryByText(/^(Analista|Admin)$/)).toBeNull();
    expect(screen.queryByText(/Usuário /)).toBeNull();
    expect(screen.getByText("Acesso bloqueado")).toBeInTheDocument();

    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Gerenciar Bruno Lima" }));
    expect(screen.queryByRole("button", { name: "Gerar senha provisória" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Trocar cargo" })).toBeNull();
    expect(screen.queryByLabelText("Cargo")).toBeNull();
    expect(screen.queryByLabelText("Usuário no app")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Bloquear acesso" }));
    await u.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(api.vezes("PUT /admin/pessoas/7/acesso")).toBe(1);

    await u.click(screen.getByRole("button", { name: "Nova pessoa" }));
    const form = screen.getByRole("form", { name: "Nova pessoa" });
    expect(within(form).queryByLabelText(/Telefone/)).toBeNull();
    expect(within(form).queryByLabelText("Cargo")).toBeNull();
    await u.type(within(form).getByLabelText("Nome"), "Duda Reis");
    await u.click(within(form).getByRole("button", { name: "Continuar" }));
    expect(within(form).getByRole("dialog", { name: "Confirmar" })).toHaveTextContent("Duda Reis");
    await u.click(within(form).getByRole("button", { name: "Cadastrar" }));
    expect(api.chamadas.find((c) => c.rota === "POST /admin/pessoas/por-nome")?.corpo).toEqual({ nome: "Duda Reis" });
    expect(screen.queryByText(/senha provisória/i)).toBeNull();
  });
});
