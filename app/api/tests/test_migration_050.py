"""APP-003: migration 050_app_login (spec 06 v1.0, "Tabelas do login"; regras do rumo).

O usuário de banco do app (labflow_app_web) LÊ as tabelas do bot e GRAVA só no schema app.
"""

import psycopg
import pytest
from psycopg import errors


def _como_app(con):
    """Faz o resto da transação rodar com as permissões do labflow_app_web."""
    con.execute("SET LOCAL ROLE labflow_app_web")


def _um_usuario(con):
    return con.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]


def test_tabelas_do_login_existem(conexao):
    nomes = {
        linha[0]
        for linha in conexao.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'app'"
        )
    }
    assert {"credenciais", "senhas_provisorias", "sessoes"} <= nomes


def test_app_web_le_tabelas_e_views_do_bot(conexao):
    _como_app(conexao)
    assert conexao.execute("SELECT count(*) FROM usuarios").fetchone()[0] > 0
    assert conexao.execute("SELECT count(*) FROM bi.coletas").fetchone()[0] > 0


@pytest.mark.parametrize(
    "comando",
    [
        "INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000999', 'Intruso', 'Admin')",
        "UPDATE usuarios SET cargo = 'Admin'",
        "DELETE FROM coletas",
        "UPDATE coletas SET tanque = '99'",
    ],
)
def test_app_web_nao_grava_nas_tabelas_do_bot(conexao, comando):
    _como_app(conexao)
    with pytest.raises(errors.InsufficientPrivilege):
        conexao.execute(comando)


def test_app_web_grava_no_schema_app(conexao):
    uid = _um_usuario(conexao)
    _como_app(conexao)
    conexao.execute("INSERT INTO app.credenciais (usuario_id, usuario) VALUES (%s, 'ana.demo')", (uid,))
    conexao.execute(
        "INSERT INTO app.sessoes (token_hash, usuario_id, aparelho) VALUES ('hash-ficticio', %s, 'teste')", (uid,)
    )
    assert conexao.execute("SELECT trocar_senha FROM app.credenciais WHERE usuario = 'ana.demo'").fetchone()[0] is True


@pytest.mark.parametrize("usuario", ["Ana", "a", "ana souza", ".ana", "ana.", "ana@souza"])
def test_usuario_curto_invalido_e_recusado(conexao, usuario):
    uid = _um_usuario(conexao)
    with pytest.raises(errors.CheckViolation):
        conexao.execute("INSERT INTO app.credenciais (usuario_id, usuario) VALUES (%s, %s)", (uid, usuario))


def test_so_uma_senha_provisoria_em_aberto_por_pessoa(conexao):
    uid = _um_usuario(conexao)
    conexao.execute("INSERT INTO app.credenciais (usuario_id, usuario) VALUES (%s, 'ana.demo')", (uid,))
    conexao.execute(
        "INSERT INTO app.senhas_provisorias (usuario_id, senha_hash, gerada_por) VALUES (%s, 'h1', %s)", (uid, uid)
    )
    with pytest.raises(errors.UniqueViolation):
        conexao.execute(
            "INSERT INTO app.senhas_provisorias (usuario_id, senha_hash, gerada_por) VALUES (%s, 'h2', %s)",
            (uid, uid),
        )


def test_nova_provisoria_depois_de_cancelar_a_anterior(conexao):
    uid = _um_usuario(conexao)
    conexao.execute("INSERT INTO app.credenciais (usuario_id, usuario) VALUES (%s, 'ana.demo')", (uid,))
    conexao.execute(
        "INSERT INTO app.senhas_provisorias (usuario_id, senha_hash, gerada_por) VALUES (%s, 'h1', %s)", (uid, uid)
    )
    conexao.execute("UPDATE app.senhas_provisorias SET cancelada_em = now() WHERE usuario_id = %s", (uid,))
    conexao.execute(
        "INSERT INTO app.senhas_provisorias (usuario_id, senha_hash, gerada_por) VALUES (%s, 'h2', %s)", (uid, uid)
    )
    assert conexao.execute(
        "SELECT count(*) FROM app.senhas_provisorias WHERE usuario_id = %s", (uid,)
    ).fetchone()[0] == 2
