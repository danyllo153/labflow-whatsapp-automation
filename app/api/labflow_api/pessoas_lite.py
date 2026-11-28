"""Pessoas da LabFlow Lite, sem senha (decisão do Danyllo, 27/11): o nome é a entrada.

- Na primeira abertura, quem digita o nome ASSUME o registro que era o Admin (mesmo id: lançamentos e histórico continuam).
  A troca do nome é a função `lite_assumir_admin` (migration 088); o resto, aqui, no schema app.
- Depois disso, quem abre escolhe o nome na lista ou digita um nome novo, que entra na lista.
- Todas as pessoas têm as mesmas funções (dependencias.cargo_efetivo). O cargo guardado no banco só serve às funções do bot
  (cadastrar_usuario pede que quem cadastra seja Admin: passa-se o id do registro que era o Admin).
Nada daqui vale fora da Lite: as rotas conferem `e_lite()`.
"""

import re
import socket
import unicodedata

import psycopg
from fastapi import HTTPException, Request, status

from labflow_api.rotas_admin import (
    SQL_NAO_E_REGISTRO_INICIAL,
    _recusa_do_banco,
    _telefone_marcador,
)

TAMANHO_MAXIMO_NOME = 40
MAXIMO_DE_PESSOAS = 200  # a Lite é de um laboratório: barra lixo em massa (a entrada não tem senha)
USUARIO_DO_REGISTRO_INICIAL = "admin"
NOMES_RESERVADOS = {"admin", "administrador"}
TRAVA_PESSOAS = "SELECT pg_advisory_xact_lock(60, hashtext('pessoas'))"


def chave_do_nome(nome: str) -> str:
    """Para comparar nomes: sem acento, sem diferença de maiúscula e sem espaço sobrando."""
    sem_acento = unicodedata.normalize("NFD", nome).encode("ascii", "ignore").decode()
    return " ".join(sem_acento.lower().split())


def validar_nome(nome: str) -> str:
    """Confere o nome antes do banco, com mensagem clara (o banco também recusa: 087 e a função de cadastro)."""
    limpo = " ".join(nome.split())
    if not limpo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o seu nome.")
    if len(limpo) > TAMANHO_MAXIMO_NOME:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"O nome pode ter no máximo {TAMANHO_MAXIMO_NOME} caracteres.")
    if any(c in "<>;" or ord(c) < 32 or ord(c) == 127 for c in limpo):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O nome não pode ter os caracteres < > ; .")
    if not any(c.isalpha() for c in limpo):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O nome precisa ter letras.")
    if chave_do_nome(limpo) in NOMES_RESERVADOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o seu nome (não use Admin).")
    return limpo


def usuario_do_nome(con: psycopg.Connection, nome: str) -> str:
    """"Ana Souza" -> "ana.souza" (sem acento, só letras e números); se já existir, ganha um número. Nunca "admin"."""
    partes = [p for p in re.sub(r"[^a-z0-9 ]", "", chave_do_nome(nome)).split() if p]
    curto = ".".join([partes[0], partes[-1]] if len(partes) > 1 else partes)[:34].strip(".")
    if len(curto) < 3:
        curto = f"{curto or 'pessoa'}001"
    candidato, n = curto, 1
    while candidato == USUARIO_DO_REGISTRO_INICIAL or con.execute(
        "SELECT 1 FROM app.credenciais WHERE usuario = %s", (candidato,)
    ).fetchone():
        n += 1
        candidato = f"{curto}{n}"
    return candidato


def registro_inicial(con: psycopg.Connection) -> int | None:
    """O id do registro que era o Admin, enquanto ninguém o assumiu (o nome ainda é "Administrador")."""
    linha = con.execute(
        f"SELECT u.id FROM usuarios u WHERE NOT ({SQL_NAO_E_REGISTRO_INICIAL}) AND u.cargo = 'Admin'"
    ).fetchone()
    return linha[0] if linha else None


def quem_cadastra(con: psycopg.Connection) -> int | None:
    """O id que as funções do bot exigem como "quem pede" (cargo Admin): o registro que era o Admin, assumido ou não."""
    linha = con.execute("SELECT id FROM usuarios WHERE cargo = 'Admin' ORDER BY id LIMIT 1").fetchone()
    return linha[0] if linha else None


def nomes_da_lista(con: psycopg.Connection) -> list[tuple[str, str]]:
    """(usuário, nome) de quem tem acesso. O registro que era o Admin só entra depois de assumido."""
    return con.execute(
        f"""
        SELECT c.usuario, coalesce(nullif(trim(u.nome), ''), c.usuario)
        FROM app.credenciais c JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.acesso_ativo AND {SQL_NAO_E_REGISTRO_INICIAL}
        ORDER BY 2
        """
    ).fetchall()


def _conferir_novo(con: psycopg.Connection, nome: str) -> None:
    chave = chave_do_nome(nome)
    for (existente,) in con.execute("SELECT nome FROM usuarios WHERE nome IS NOT NULL"):
        if chave_do_nome(existente) == chave:
            raise HTTPException(status.HTTP_409_CONFLICT, "Já existe uma pessoa com esse nome: escolha-a na lista.")
    if con.execute("SELECT count(*) FROM app.credenciais").fetchone()[0] >= MAXIMO_DE_PESSOAS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Há pessoas demais na lista. Bloqueie quem não usa mais.")


def criar_pessoa(con: psycopg.Connection, nome: str, assumir_o_registro_inicial: bool) -> tuple[int, str, str]:
    """Cadastra pelo nome e devolve (id, usuário, nome). Com `assumir_o_registro_inicial` e o registro ainda livre, o nome vai
    para ele (mesmo id); senão cria uma pessoa nova. Tudo ou nada."""
    nome = validar_nome(nome)
    con.execute(TRAVA_PESSOAS)
    _conferir_novo(con, nome)
    livre = registro_inicial(con) if assumir_o_registro_inicial else None
    try:
        with con.transaction():  # ponto de volta: se algo recusar, nada fica pela metade
            if livre is not None:
                uid = con.execute("SELECT id FROM lite_assumir_admin(%s)", (nome,)).fetchone()[0]
                usuario = usuario_do_nome(con, nome)
                tem = con.execute("SELECT 1 FROM app.credenciais WHERE usuario_id = %s", (uid,)).fetchone()
                if tem:
                    con.execute(
                        "UPDATE app.credenciais SET usuario = %s, trocar_senha = false, atualizado_em = now() WHERE usuario_id = %s",
                        (usuario, uid),
                    )
                else:
                    con.execute("INSERT INTO app.credenciais (usuario_id, usuario, trocar_senha) VALUES (%s, %s, false)", (uid, usuario))
                # quem estava logado como o Admin antigo (outro navegador, outro dia) sai: o registro agora é desta pessoa
                con.execute("UPDATE app.sessoes SET encerrada_em = now() WHERE usuario_id = %s AND encerrada_em IS NULL", (uid,))
            else:
                quem = quem_cadastra(con)
                if quem is None:
                    raise HTTPException(
                        status.HTTP_409_CONFLICT, "Falta o registro inicial do LabFlow. Feche e abra o LabFlow de novo."
                    )
                uid = con.execute(
                    "SELECT id FROM cadastrar_usuario(%s, %s, 'Analista', %s)", (nome, _telefone_marcador(con), quem)
                ).fetchone()[0]
                usuario = usuario_do_nome(con, nome)
                con.execute("INSERT INTO app.credenciais (usuario_id, usuario, trocar_senha) VALUES (%s, %s, false)", (uid, usuario))
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None
    return uid, usuario, nome


def aparelho_do_pedido(request: Request) -> str:
    """De qual PC veio a entrada (app.sessoes.aparelho, até 200). A Lite só atende o próprio PC: é o nome dele."""
    navegador = (request.headers.get("user-agent") or "").strip()
    return f"PC {socket.gethostname()[:40]} | {navegador}"[:200]
