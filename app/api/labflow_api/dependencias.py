"""Dependências comuns das rotas: conexão com o banco e pessoa logada.

Tarefa: APP-004.
"""

import os
from collections.abc import Iterator
from dataclasses import dataclass

import psycopg
from fastapi import Cookie, Depends, HTTPException, status

from labflow_api import banco
from labflow_api.seguranca import hash_token

NOME_COOKIE = "labflow_sessao"
DIAS_SEM_USO = 30  # 06: conectada até "Sair", desde que use o app a cada 30 dias


def cookie_seguro() -> bool:
    """Cookie só por HTTPS. Desligar (LABFLOW_COOKIE_SEGURO=0) só para testar no próprio PC."""
    return os.environ.get("LABFLOW_COOKIE_SEGURO", "1") != "0"


def obter_conexao() -> Iterator[psycopg.Connection]:
    """Uma conexão por requisição; grava (commit) se a rota terminar sem erro."""
    with banco.conectar() as con:
        yield con


@dataclass(frozen=True)
class PessoaLogada:
    usuario_id: int
    usuario: str
    nome: str | None
    cargo: str
    trocar_senha: bool
    sessao_id: int


def pessoa_logada(
    con: psycopg.Connection = Depends(obter_conexao),
    labflow_sessao: str | None = Cookie(default=None),
) -> PessoaLogada:
    """Confere o cookie a cada chamada. O cargo vem de `usuarios` na hora (06: permissão no código)."""
    nao_logado = HTTPException(status.HTTP_401_UNAUTHORIZED, "Entre com seu usuário e senha.")
    if not labflow_sessao:
        raise nao_logado
    linha = con.execute(
        """
        SELECT s.id, c.usuario_id, c.usuario, u.nome, u.cargo, c.trocar_senha
        FROM app.sessoes s
        JOIN app.credenciais c ON c.usuario_id = s.usuario_id
        JOIN usuarios u ON u.id = c.usuario_id
        WHERE s.token_hash = %s
          AND s.encerrada_em IS NULL
          AND s.ultimo_uso_em > now() - make_interval(days => %s)
          AND c.acesso_ativo
        """,
        (hash_token(labflow_sessao), DIAS_SEM_USO),
    ).fetchone()
    if linha is None:
        raise nao_logado
    sessao_id, usuario_id, usuario, nome, cargo, trocar_senha = linha
    con.execute("UPDATE app.sessoes SET ultimo_uso_em = now() WHERE id = %s", (sessao_id,))
    return PessoaLogada(usuario_id, usuario, nome, cargo, trocar_senha, sessao_id)
