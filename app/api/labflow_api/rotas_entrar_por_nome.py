"""Entrar escolhendo o nome, sem senha: só na LabFlow Lite (decisão do Danyllo, 27/11).

A Lite roda num PC só e escuta só em 127.0.0.1 (a API recusa subir de outro jeito: seguranca_http). Por isso aqui ninguém
digita senha: abre quem toca no próprio nome, ou digita um nome novo ("Sou novo aqui"). O limite é aceito e está escrito na
spec 12: quem senta no PC escolhe qualquer nome; o rastro é o nome escolhido e o PC. Voltar a atender outros PCs exige senha.
Fora da Lite (Completa, com bot) estas rotas respondem 404 e nada muda: o login com senha continua igual.

- GET  /entrar/nomes          quem pode entrar (só nome e usuário; sem o registro que era o Admin enquanto ninguém o assumiu)
- GET  /entrar/primeira-vez   ainda ninguém assumiu o registro que era o Admin?
- POST /entrar/por-nome       abre a sessão de quem tocou no nome
- POST /entrar/novo           "Sou novo aqui": cria a pessoa (ou, na primeira abertura, assume o registro do Admin) e entra
- POST /admin/pessoas/por-nome  quem já entrou cadastra outra pessoa pelo nome (tela Pessoas)
O cargo vem de `usuarios` em cada chamada e vale como Admin para todos (dependencias.cargo_efetivo).
"""

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from labflow_api import pessoas_lite
from labflow_api.dependencias import (
    DIAS_SEM_USO,
    NOME_COOKIE,
    PessoaLogada,
    cargo_efetivo,
    cookie_seguro,
    e_lite,
    obter_conexao,
)
from labflow_api.permissoes import acoes_do_cargo, exigir
from labflow_api.rotas_admin import Pessoa, _uma_pessoa
from labflow_api.rotas_login import QuemSou
from labflow_api.seguranca import hash_token, novo_token

roteador = APIRouter(tags=["login"])


def _so_na_lite() -> None:
    if not e_lite():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")


class NomeParaEntrar(BaseModel):
    usuario: str
    nome: str


class PedidoPorNome(BaseModel):
    usuario: str


class PedidoNovo(BaseModel):
    nome: str


class PrimeiraVez(BaseModel):
    primeira_vez: bool


@roteador.get("/entrar/nomes", response_model=list[NomeParaEntrar], dependencies=[Depends(_so_na_lite)])
def nomes(con: psycopg.Connection = Depends(obter_conexao)) -> list[NomeParaEntrar]:
    return [NomeParaEntrar(usuario=u, nome=n) for u, n in pessoas_lite.nomes_da_lista(con)]


@roteador.get("/entrar/primeira-vez", response_model=PrimeiraVez, dependencies=[Depends(_so_na_lite)])
def primeira_vez(con: psycopg.Connection = Depends(obter_conexao)) -> PrimeiraVez:
    return PrimeiraVez(primeira_vez=pessoas_lite.registro_inicial(con) is not None)


def _abrir_sessao(
    request: Request, response: Response, con: psycopg.Connection, usuario_id: int, usuario: str, nome: str | None, cargo: str
) -> QuemSou:
    token = novo_token()
    con.execute(
        "INSERT INTO app.sessoes (token_hash, usuario_id, aparelho) VALUES (%s, %s, %s)",
        (hash_token(token), usuario_id, pessoas_lite.aparelho_do_pedido(request)),
    )
    response.set_cookie(
        NOME_COOKIE, token, max_age=DIAS_SEM_USO * 24 * 3600, httponly=True, secure=cookie_seguro(), samesite="strict"
    )
    cargo = cargo_efetivo(cargo)
    return QuemSou(usuario=usuario, nome=nome, cargo=cargo, trocar_senha=False, pode=acoes_do_cargo(cargo))


@roteador.post("/entrar/por-nome", response_model=QuemSou, dependencies=[Depends(_so_na_lite)])
def entrar_por_nome(
    pedido: PedidoPorNome, request: Request, response: Response, con: psycopg.Connection = Depends(obter_conexao)
) -> QuemSou:
    linha = con.execute(
        f"""
        SELECT c.usuario_id, c.usuario, c.acesso_ativo, u.nome, u.cargo
        FROM app.credenciais c JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.usuario = %s AND {pessoas_lite.SQL_NAO_E_REGISTRO_INICIAL}
        """,
        (pedido.usuario.strip().lower(),),
    ).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esse nome não está na lista. Se você é novo aqui, escreva o seu nome.")
    usuario_id, usuario, acesso_ativo, nome, cargo = linha
    if not acesso_ativo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "O seu acesso está bloqueado. Fale com quem cuida do LabFlow.")
    return _abrir_sessao(request, response, con, usuario_id, usuario, nome, cargo)


@roteador.post("/entrar/novo", response_model=QuemSou, status_code=status.HTTP_201_CREATED, dependencies=[Depends(_so_na_lite)])
def entrar_como_novo(
    pedido: PedidoNovo, request: Request, response: Response, con: psycopg.Connection = Depends(obter_conexao)
) -> QuemSou:
    """Na primeira abertura o nome assume o registro que era o Admin (mesmo id); depois cria uma pessoa nova. Já sai logada."""
    uid, usuario, nome = pessoas_lite.criar_pessoa(con, pedido.nome, assumir_o_registro_inicial=True)
    cargo = con.execute("SELECT cargo FROM usuarios WHERE id = %s", (uid,)).fetchone()[0]
    return _abrir_sessao(request, response, con, uid, usuario, nome, cargo)


@roteador.post(
    "/admin/pessoas/por-nome", response_model=Pessoa, status_code=status.HTTP_201_CREATED, dependencies=[Depends(_so_na_lite)]
)
def cadastrar_pela_tela(
    pedido: PedidoNovo,
    quem: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pessoa:
    """Quem já entrou cadastra mais uma pessoa só pelo nome (não assume o registro do Admin: esse é de quem abrir primeiro)."""
    uid, _, _ = pessoas_lite.criar_pessoa(con, pedido.nome, assumir_o_registro_inicial=False)
    return _uma_pessoa(con, uid)
