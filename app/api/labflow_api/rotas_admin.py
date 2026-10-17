"""Rotas do Admin.

Spec: 06-api-e-auth.md (v1.0), "Primeiro acesso, esqueci a senha..."; 07-app-pwa.md, "10. Admin"; 08 A1.
Tarefa: APP-006 (senha provisória). A lista de pessoas chega na APP-007.
"""

import secrets

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.seguranca import gerar_hash_senha

roteador = APIRouter(prefix="/admin", tags=["admin"])

# Sem letras e números que se confundem (0/O, 1/l/I), para ler em voz alta ou copiar do papel.
_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"


def gerar_senha_provisoria() -> str:
    """Ex.: K7m4-Tq2p (8 caracteres aleatórios em dois blocos)."""
    partes = ["".join(secrets.choice(_ALFABETO) for _ in range(4)) for _ in range(2)]
    return "-".join(partes)


class SenhaProvisoria(BaseModel):
    usuario: str
    senha_provisoria: str  # mostrada uma vez só, para o Admin entregar à pessoa
    valida_ate: str  # dd/mm/aaaa hh:mm (America/Sao_Paulo)


@roteador.post("/pessoas/{usuario_id}/senha-provisoria", response_model=SenhaProvisoria)
def gerar_provisoria(
    usuario_id: int,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> SenhaProvisoria:
    linha = con.execute("SELECT usuario FROM app.credenciais WHERE usuario_id = %s", (usuario_id,)).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Essa pessoa ainda não tem usuário no app.")
    senha = gerar_senha_provisoria()
    # A anterior em aberto deixa de valer; a senha antiga também (esqueci a senha) e as sessões abertas caem.
    con.execute(
        "UPDATE app.senhas_provisorias SET cancelada_em = now() "
        "WHERE usuario_id = %s AND usada_em IS NULL AND cancelada_em IS NULL",
        (usuario_id,),
    )
    valida_ate = con.execute(
        """
        INSERT INTO app.senhas_provisorias (usuario_id, senha_hash, gerada_por) VALUES (%s, %s, %s)
        RETURNING to_char(valida_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
        """,
        (usuario_id, gerar_hash_senha(senha), admin.usuario_id),
    ).fetchone()[0]
    con.execute(
        "UPDATE app.credenciais SET senha_hash = NULL, trocar_senha = true, tentativas_erradas = 0, "
        "bloqueado_ate = NULL, atualizado_em = now() WHERE usuario_id = %s",
        (usuario_id,),
    )
    con.execute(
        "UPDATE app.sessoes SET encerrada_em = now() WHERE usuario_id = %s AND encerrada_em IS NULL", (usuario_id,)
    )
    return SenhaProvisoria(usuario=linha[0], senha_provisoria=senha, valida_ate=valida_ate)
