"""APP-011: comando do primeiro acesso do Admin no servidor (preparar_admin)."""

import pytest

from labflow_api.primeiro_admin import listar_admins, preparar_admin

SENHA = "Senha-de-teste-1"


def _admin_do_bot(conexao, nome="Chefe (teste)"):
    return conexao.execute(
        "INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000777', %s, 'Admin') RETURNING id", (nome,)
    ).fetchone()[0]


def test_lista_so_os_admins(conexao):
    uid = _admin_do_bot(conexao)
    admins = listar_admins(conexao)
    assert (uid, "Chefe (teste)") in admins
    assert all(
        conexao.execute("SELECT cargo FROM usuarios WHERE id = %s", (i,)).fetchone()[0] == "Admin" for i, _ in admins
    )


def test_admin_entra_com_a_provisoria_e_tem_de_trocar(cliente, conexao):
    uid = _admin_do_bot(conexao)
    senha = preparar_admin(conexao, uid, " Chefe.Teste ")
    r = cliente.post("/login", json={"usuario": "chefe.teste", "senha": senha})
    assert r.status_code == 200 and r.json()["cargo"] == "Admin" and r.json()["trocar_senha"] is True
    assert cliente.get("/admin/pessoas").status_code == 403  # troca obrigatória antes
    assert cliente.post("/trocar-senha", json={"nova_senha": SENHA}).status_code == 204
    assert cliente.get("/admin/pessoas").status_code == 200


def test_rodar_de_novo_cancela_a_provisoria_anterior(cliente, conexao):
    uid = _admin_do_bot(conexao)
    primeira = preparar_admin(conexao, uid, "chefe.teste")
    segunda = preparar_admin(conexao, uid, "chefe.teste")
    assert cliente.post("/login", json={"usuario": "chefe.teste", "senha": primeira}).status_code == 401
    assert cliente.post("/login", json={"usuario": "chefe.teste", "senha": segunda}).status_code == 200


def test_nao_serve_para_quem_nao_e_admin(conexao, criar_pessoa):
    uid = criar_pessoa(usuario="op.teste", cargo="Operador")
    with pytest.raises(SystemExit, match="não é Admin"):
        preparar_admin(conexao, uid, "op.teste")


def test_usuario_de_outra_pessoa_e_recusado(conexao, criar_pessoa):
    criar_pessoa(usuario="ana.teste")
    uid = _admin_do_bot(conexao)
    with pytest.raises(SystemExit, match="outra pessoa"):
        preparar_admin(conexao, uid, "ana.teste")


def test_pessoa_inexistente(conexao):
    with pytest.raises(SystemExit, match="não encontrada"):
        preparar_admin(conexao, 999999999, "ninguem.aqui")
