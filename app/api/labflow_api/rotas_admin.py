"""Rotas do Admin.

Spec: 06-api-e-auth.md (v1.0), "Primeiro acesso, esqueci a senha..."; 07-app-pwa.md, "10. Admin"; 08 A1.
Tarefas: APP-006 (senha provisória) e APP-007 (lista de pessoas e usuário curto).
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


class Pessoa(BaseModel):
    id: int
    nome: str | None
    cargo: str
    usuario: str | None  # usuário curto no app; nulo se ainda não tem
    situacao: str  # "Sem usuário no app", "Senha provisória pendente", "Ativo", "Bloqueado pelo Admin", "Bloqueado por senhas erradas"


@roteador.get("/pessoas", response_model=list[Pessoa])
def listar_pessoas(
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[Pessoa]:
    """Lista para a tela Admin → Pessoas (07, "10. Admin"). Sem telefone: não é preciso para a tela (LGPD)."""
    linhas = con.execute(
        """
        SELECT u.id, u.nome, u.cargo, c.usuario,
               CASE
                 WHEN c.usuario_id IS NULL THEN 'Sem usuário no app'
                 WHEN NOT c.acesso_ativo THEN 'Bloqueado pelo Admin'
                 WHEN c.bloqueado_ate > now() THEN 'Bloqueado por senhas erradas'
                 WHEN c.senha_hash IS NULL OR c.trocar_senha THEN 'Senha provisória pendente'
                 ELSE 'Ativo'
               END
        FROM usuarios u
        LEFT JOIN app.credenciais c ON c.usuario_id = u.id
        ORDER BY lower(coalesce(u.nome, '')), u.id
        """
    ).fetchall()
    return [Pessoa(id=i, nome=n, cargo=cg, usuario=us, situacao=st) for i, n, cg, us, st in linhas]


class PedidoUsuario(BaseModel):
    usuario: str


@roteador.put("/pessoas/{usuario_id}/usuario", response_model=Pessoa)
def definir_usuario(
    usuario_id: int,
    pedido: PedidoUsuario,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pessoa:
    """Define (ou troca) o usuário curto de quem já está cadastrado no bot. Depois, gerar a senha provisória."""
    usuario = pedido.usuario.strip().lower()
    if con.execute("SELECT 1 FROM usuarios WHERE id = %s", (usuario_id,)).fetchone() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pessoa não encontrada.")
    dono = con.execute("SELECT usuario_id FROM app.credenciais WHERE usuario = %s", (usuario,)).fetchone()
    if dono and dono[0] != usuario_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse usuário já é de outra pessoa.")
    try:
        with con.transaction():  # ponto de volta: um usuário inválido não estraga o resto da requisição
            con.execute(
                """
                INSERT INTO app.credenciais (usuario_id, usuario) VALUES (%s, %s)
                ON CONFLICT (usuario_id) DO UPDATE SET usuario = EXCLUDED.usuario, atualizado_em = now()
                """,
                (usuario_id, usuario),
            )
    except psycopg.errors.CheckViolation:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado, começando e terminando "
            "com letra ou número (ex.: ana.souza).",
        ) from None
    return next(p for p in listar_pessoas(admin, con) if p.id == usuario_id)
