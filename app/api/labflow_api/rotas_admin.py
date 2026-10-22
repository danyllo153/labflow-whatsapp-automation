"""Rotas do Admin.

Spec: 06-api-e-auth.md (v1.0), "Primeiro acesso, esqueci a senha..."; 07-app-pwa.md, "10. Admin"; 08 A1.
Tarefas: APP-006 (senha provisória), APP-007 (lista de pessoas e usuário curto) e APP-016 (Nova pessoa, trocar cargo,
desbloquear, bloquear acesso). Cadastrar e trocar cargo usam as funções do bot (PB5, migration 031; liberadas na 051):
a regra mora num lugar só e quem o app cadastra já é reconhecido no WhatsApp.
"""

import secrets

import psycopg
from typing import Literal

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


def _nova_provisoria(con: psycopg.Connection, usuario_id: int, admin_id: int) -> tuple[str, str]:
    """Gera a senha provisória (24 h, uso único). A anterior em aberto, a senha antiga e as sessões abertas deixam de valer."""
    senha = gerar_senha_provisoria()
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
        (usuario_id, gerar_hash_senha(senha), admin_id),
    ).fetchone()[0]
    con.execute(
        "UPDATE app.credenciais SET senha_hash = NULL, trocar_senha = true, tentativas_erradas = 0, "
        "bloqueado_ate = NULL, atualizado_em = now() WHERE usuario_id = %s",
        (usuario_id,),
    )
    con.execute(
        "UPDATE app.sessoes SET encerrada_em = now() WHERE usuario_id = %s AND encerrada_em IS NULL", (usuario_id,)
    )
    return senha, valida_ate


@roteador.post("/pessoas/{usuario_id}/senha-provisoria", response_model=SenhaProvisoria)
def gerar_provisoria(
    usuario_id: int,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> SenhaProvisoria:
    linha = con.execute("SELECT usuario FROM app.credenciais WHERE usuario_id = %s", (usuario_id,)).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Essa pessoa ainda não tem usuário no app.")
    senha, valida_ate = _nova_provisoria(con, usuario_id, admin.usuario_id)
    return SenhaProvisoria(usuario=linha[0], senha_provisoria=senha, valida_ate=valida_ate)


class Pessoa(BaseModel):
    id: int
    nome: str | None
    cargo: str
    usuario: str | None  # usuário curto no app; nulo se ainda não tem
    situacao: str  # "Sem usuário no app", "Senha provisória pendente", "Ativo", "Bloqueado pelo Admin", "Bloqueado por senhas erradas"


SQL_PESSOAS = """
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
"""


def _pessoas(con: psycopg.Connection, usuario_id: int | None = None) -> list[Pessoa]:
    sql, valores = SQL_PESSOAS, []
    if usuario_id is not None:
        sql += " WHERE u.id = %s"
        valores.append(usuario_id)
    linhas = con.execute(sql + " ORDER BY lower(coalesce(u.nome, '')), u.id", valores).fetchall()
    return [Pessoa(id=i, nome=n, cargo=cg, usuario=us, situacao=st) for i, n, cg, us, st in linhas]


def _uma_pessoa(con: psycopg.Connection, usuario_id: int) -> Pessoa:
    pessoas = _pessoas(con, usuario_id)
    if not pessoas:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pessoa não encontrada.")
    return pessoas[0]


@roteador.get("/pessoas", response_model=list[Pessoa])
def listar_pessoas(
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[Pessoa]:
    """Lista para a tela Admin → Pessoas (07, "10. Admin"). Sem telefone: não é preciso para a tela (LGPD)."""
    return _pessoas(con)


USUARIO_INVALIDO = (
    "Use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado, começando e terminando "
    "com letra ou número (ex.: ana.souza)."
)


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
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, USUARIO_INVALIDO) from None
    return _uma_pessoa(con, usuario_id)


# ---------------------------------------------------------------- APP-016: Nova pessoa, cargo, desbloquear, acesso
Cargo = Literal["Admin", "Operador", "Consultor", "Coletor"]


def _recusa_do_banco(erro: psycopg.errors.RaiseException) -> HTTPException:
    """As funções do bot recusam com uma mensagem pronta em português (RAISE EXCEPTION): ela vai como está."""
    mensagem = erro.diag.message_primary or "O banco recusou o pedido."
    codigo = status.HTTP_404_NOT_FOUND if "não encontrada" in mensagem else status.HTTP_422_UNPROCESSABLE_ENTITY
    return HTTPException(codigo, mensagem)


class PedidoNovaPessoa(BaseModel):
    nome: str
    telefone: str  # DDI + DDD + número; obrigatório porque o bot identifica a pessoa pelo número (06)
    cargo: Cargo
    usuario: str


class NovaPessoa(BaseModel):
    pessoa: Pessoa
    senha_provisoria: str  # mostrada uma vez só
    valida_ate: str


@roteador.post("/pessoas", response_model=NovaPessoa, status_code=status.HTTP_201_CREATED)
def nova_pessoa(
    pedido: PedidoNovaPessoa,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> NovaPessoa:
    """07 §10 "Nova pessoa": cadastra (função do bot), dá o usuário curto e gera a senha provisória, tudo ou nada."""
    usuario = pedido.usuario.strip().lower()
    if con.execute("SELECT 1 FROM app.credenciais WHERE usuario = %s", (usuario,)).fetchone():
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse usuário já é de outra pessoa.")
    try:
        with con.transaction():  # ponto de volta: se o usuário curto for inválido, a pessoa também não fica cadastrada
            novo_id = con.execute(
                "SELECT id FROM cadastrar_usuario(%s, %s, %s, %s)",
                (pedido.nome, pedido.telefone, pedido.cargo, admin.usuario_id),
            ).fetchone()[0]
            con.execute("INSERT INTO app.credenciais (usuario_id, usuario) VALUES (%s, %s)", (novo_id, usuario))
            senha, valida_ate = _nova_provisoria(con, novo_id, admin.usuario_id)
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None
    except psycopg.errors.CheckViolation:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, USUARIO_INVALIDO) from None
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse usuário já é de outra pessoa.") from None
    return NovaPessoa(pessoa=_uma_pessoa(con, novo_id), senha_provisoria=senha, valida_ate=valida_ate)


class PedidoCargo(BaseModel):
    cargo: Cargo


@roteador.put("/pessoas/{usuario_id}/cargo", response_model=Pessoa)
def trocar_cargo(
    usuario_id: int,
    pedido: PedidoCargo,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pessoa:
    """Troca o cargo pela função do bot (ela não deixa o sistema sem Admin). Vale na chamada seguinte da pessoa (APP-005)."""
    try:
        with con.transaction():
            con.execute("SELECT trocar_cargo(%s, %s, %s)", (usuario_id, pedido.cargo, admin.usuario_id))
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None
    return _uma_pessoa(con, usuario_id)


@roteador.post("/pessoas/{usuario_id}/desbloquear", response_model=Pessoa)
def desbloquear(
    usuario_id: int,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pessoa:
    """Zera as senhas erradas: para quem lembra a senha e só errou a digitação (a senha continua a mesma)."""
    feito = con.execute(
        "UPDATE app.credenciais SET tentativas_erradas = 0, bloqueado_ate = NULL, atualizado_em = now() "
        "WHERE usuario_id = %s",
        (usuario_id,),
    ).rowcount
    if not feito:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Essa pessoa ainda não tem usuário no app.")
    return _uma_pessoa(con, usuario_id)


class PedidoAcesso(BaseModel):
    ativo: bool


@roteador.put("/pessoas/{usuario_id}/acesso", response_model=Pessoa)
def acesso(
    usuario_id: int,
    pedido: PedidoAcesso,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pessoa:
    """Bloqueia ou libera o acesso ao app (07 §10). Bloquear derruba as sessões abertas. O WhatsApp não muda."""
    if usuario_id == admin.usuario_id and not pedido.ativo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Você não pode bloquear o seu próprio acesso.")
    feito = con.execute(
        "UPDATE app.credenciais SET acesso_ativo = %s, atualizado_em = now() WHERE usuario_id = %s",
        (pedido.ativo, usuario_id),
    ).rowcount
    if not feito:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Essa pessoa ainda não tem usuário no app.")
    if not pedido.ativo:
        con.execute(
            "UPDATE app.sessoes SET encerrada_em = now() WHERE usuario_id = %s AND encerrada_em IS NULL", (usuario_id,)
        )
    return _uma_pessoa(con, usuario_id)
