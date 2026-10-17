"""Entrar, sair e "quem sou eu".

Spec: 06-api-e-auth.md (v1.0), "Primeiro acesso..." e "Arquitetura"; 08-fluxos.md A1.
Tarefa: APP-004. A senha provisória e a troca obrigatória chegam na APP-006.
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
from labflow_api.seguranca import hash_token, novo_token, senha_confere

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


def _quem_sou(p: PessoaLogada) -> QuemSou:
    return QuemSou(usuario=p.usuario, nome=p.nome, cargo=p.cargo, trocar_senha=p.trocar_senha)


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
    if not senha_confere(senha_hash, pedido.senha):
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
    return QuemSou(usuario=usuario, nome=nome, cargo=cargo, trocar_senha=trocar_senha)


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
