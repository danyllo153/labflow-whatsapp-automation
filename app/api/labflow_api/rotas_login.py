"""Entrar, sair e "quem sou eu".

Spec: 06-api-e-auth.md (v1.0), "Primeiro acesso..." e "Arquitetura"; 08-fluxos.md A1.
Tarefas: APP-004 (entrar, sair, quem sou eu) e APP-006 (entrar com a senha provisória e trocar a senha).
"""

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from labflow_api.dependencias import (
    DIAS_SEM_USO,
    NOME_COOKIE,
    PessoaLogada,
    cookie_seguro,
    obter_conexao,
    pessoa_logada,
)
from labflow_api.permissoes import acoes_do_cargo
from labflow_api.seguranca import gerar_hash_senha, hash_token, novo_token, senha_confere

roteador = APIRouter(tags=["login"])

ERROS_PARA_BLOQUEAR = 5  # 06: 5 senhas erradas seguidas
MINUTOS_BLOQUEADO = 15


class PedidoLogin(BaseModel):
    usuario: str
    senha: str


class QuemSou(BaseModel):
    usuario: str
    nome: str | None
    cargo: str
    trocar_senha: bool
    pode: list[str]  # ações que o cargo permite (o app usa para mostrar ou esconder botões)


def _quem_sou(p: PessoaLogada) -> QuemSou:
    return QuemSou(
        usuario=p.usuario, nome=p.nome, cargo=p.cargo, trocar_senha=p.trocar_senha, pode=acoes_do_cargo(p.cargo)
    )


@roteador.post("/login", response_model=QuemSou)
def entrar(
    pedido: PedidoLogin,
    request: Request,
    response: Response,
    con: psycopg.Connection = Depends(obter_conexao),
) -> QuemSou | JSONResponse:
    errado = HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário ou senha incorretos.")
    linha = con.execute(
        """
        SELECT c.usuario_id, c.usuario, c.senha_hash, c.trocar_senha, c.acesso_ativo,
               c.bloqueado_ate > now() AS bloqueado, to_char(c.bloqueado_ate AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
               u.nome, u.cargo
        FROM app.credenciais c JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.usuario = %s
        """,
        (pedido.usuario.strip().lower(),),
    ).fetchone()
    if linha is None:
        raise errado
    usuario_id, usuario, senha_hash, trocar_senha, acesso_ativo, bloqueado, ate, nome, cargo = linha
    if not acesso_ativo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seu acesso ao app está bloqueado. Fale com o Admin.")
    if bloqueado:
        raise HTTPException(
            status.HTTP_423_LOCKED, f"Muitas senhas erradas. Tente de novo depois das {ate}."
        )
    entrou_com_provisoria = False
    if not senha_confere(senha_hash, pedido.senha):
        provisoria = con.execute(
            """
            SELECT id, senha_hash FROM app.senhas_provisorias
            WHERE usuario_id = %s AND usada_em IS NULL AND cancelada_em IS NULL AND valida_ate > now()
            """,
            (usuario_id,),
        ).fetchone()
        if provisoria and senha_confere(provisoria[1], pedido.senha):
            con.execute("UPDATE app.senhas_provisorias SET usada_em = now() WHERE id = %s", (provisoria[0],))
            entrou_com_provisoria = True
    if not entrou_com_provisoria and not senha_confere(senha_hash, pedido.senha):
        con.execute(
            """
            UPDATE app.credenciais
            SET tentativas_erradas = CASE WHEN tentativas_erradas + 1 >= %(limite)s THEN 0
                                          ELSE tentativas_erradas + 1 END,
                bloqueado_ate = CASE WHEN tentativas_erradas + 1 >= %(limite)s
                                     THEN now() + make_interval(mins => %(minutos)s) ELSE bloqueado_ate END,
                atualizado_em = now()
            WHERE usuario_id = %(id)s
            """,
            {"limite": ERROS_PARA_BLOQUEAR, "minutos": MINUTOS_BLOQUEADO, "id": usuario_id},
        )
        # Resposta de erro SEM exceção: assim a conexão grava a tentativa errada (com exceção, desfaria).
        return JSONResponse({"detail": errado.detail}, status_code=errado.status_code)

    token = novo_token()
    con.execute(
        "UPDATE app.credenciais SET tentativas_erradas = 0, bloqueado_ate = NULL, atualizado_em = now() "
        "WHERE usuario_id = %s",
        (usuario_id,),
    )
    con.execute(
        "INSERT INTO app.sessoes (token_hash, usuario_id, aparelho) VALUES (%s, %s, %s)",
        (hash_token(token), usuario_id, (request.headers.get("user-agent") or "")[:200] or None),
    )
    response.set_cookie(
        NOME_COOKIE,
        token,
        max_age=DIAS_SEM_USO * 24 * 3600,
        httponly=True,
        secure=cookie_seguro(),
        samesite="lax",
    )
    trocar_senha = trocar_senha or entrou_com_provisoria  # 06: no primeiro login com a provisória, troca obrigatória
    return QuemSou(
        usuario=usuario, nome=nome, cargo=cargo, trocar_senha=trocar_senha, pode=acoes_do_cargo(cargo)
    )


@roteador.get("/me", response_model=QuemSou)
def quem_sou(pessoa: PessoaLogada = Depends(pessoa_logada)) -> QuemSou:
    return _quem_sou(pessoa)


@roteador.post("/sair", status_code=status.HTTP_204_NO_CONTENT)
def sair(
    response: Response,
    pessoa: PessoaLogada = Depends(pessoa_logada),
    con: psycopg.Connection = Depends(obter_conexao),
) -> None:
    con.execute("UPDATE app.sessoes SET encerrada_em = now() WHERE id = %s", (pessoa.sessao_id,))
    response.delete_cookie(NOME_COOKIE, httponly=True, secure=cookie_seguro(), samesite="lax")


class PedidoTrocaSenha(BaseModel):
    nova_senha: str
    senha_atual: str | None = None  # obrigatória só na troca voluntária (sem senha provisória pendente)


@roteador.post("/trocar-senha", status_code=status.HTTP_204_NO_CONTENT)
def trocar_senha(
    pedido: PedidoTrocaSenha,
    pessoa: PessoaLogada = Depends(pessoa_logada),
    con: psycopg.Connection = Depends(obter_conexao),
) -> None:
    nova = pedido.nova_senha
    if not nova.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Digite a nova senha.")
    if nova.strip().lower() == pessoa.usuario.lower():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A senha não pode ser igual ao seu usuário.")
    if not pessoa.trocar_senha:
        senha_hash = con.execute(
            "SELECT senha_hash FROM app.credenciais WHERE usuario_id = %s", (pessoa.usuario_id,)
        ).fetchone()[0]
        if not senha_confere(senha_hash, pedido.senha_atual or ""):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "A senha atual não confere.")
    con.execute(
        "UPDATE app.credenciais SET senha_hash = %s, trocar_senha = false, atualizado_em = now() "
        "WHERE usuario_id = %s",
        (gerar_hash_senha(nova), pessoa.usuario_id),
    )
