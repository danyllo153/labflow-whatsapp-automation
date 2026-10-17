"""APP-007: Admin → Pessoas (07 v1.0, "10. Admin"): lista com situação e usuário curto de quem já existe."""

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def admin(cliente, criar_pessoa):
    criar_pessoa(usuario="chefe.teste", cargo="Admin")
    assert cliente.post("/login", json={"usuario": "chefe.teste", "senha": SENHA}).status_code == 200
    return cliente


def _pessoa(lista, pid):
    return next(p for p in lista if p["id"] == pid)


def test_lista_mostra_todos_com_situacao_e_sem_telefone(admin, criar_pessoa, conexao):
    ativa = criar_pessoa(usuario="ana.teste")
    pendente = criar_pessoa(usuario="bia.teste", trocar_senha=True)
    bloqueada = criar_pessoa(usuario="caio.teste", ativo=False)
    conexao.execute(
        "UPDATE app.credenciais SET bloqueado_ate = now() + interval '10 minutes' WHERE usuario = 'ana.teste'"
    )
    sem_app = conexao.execute(
        "INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000898', 'Davi (teste)', 'Operador') RETURNING id"
    ).fetchone()[0]
    r = admin.get("/admin/pessoas")
    assert r.status_code == 200
    lista = r.json()
    assert "telefone" not in lista[0]
    assert _pessoa(lista, ativa)["situacao"] == "Bloqueado por senhas erradas"
    assert _pessoa(lista, pendente)["situacao"] == "Senha provisória pendente"
    assert _pessoa(lista, bloqueada)["situacao"] == "Bloqueado pelo Admin"
    assert _pessoa(lista, sem_app) | {"id": 0} == {
        "id": 0, "nome": "Davi (teste)", "cargo": "Operador", "usuario": None, "situacao": "Sem usuário no app"
    }
    # os usuários fictícios do demo.sql também aparecem
    assert any(p["nome"] == "Ana (demo)" for p in lista)


def test_admin_define_usuario_e_depois_gera_a_provisoria(admin, conexao):
    pid = conexao.execute(
        "INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000897', 'Eva (teste)', 'Operador') RETURNING id"
    ).fetchone()[0]
    r = admin.put(f"/admin/pessoas/{pid}/usuario", json={"usuario": " Eva.Teste "})
    assert r.status_code == 200
    assert r.json()["usuario"] == "eva.teste" and r.json()["situacao"] == "Senha provisória pendente"
    assert admin.post(f"/admin/pessoas/{pid}/senha-provisoria").status_code == 200


def test_trocar_o_usuario_de_quem_ja_tem(admin, criar_pessoa):
    pid = criar_pessoa(usuario="ana.teste")
    r = admin.put(f"/admin/pessoas/{pid}/usuario", json={"usuario": "ana.souza"})
    assert r.status_code == 200 and r.json()["usuario"] == "ana.souza"


def test_usuario_de_outra_pessoa_e_recusado(admin, criar_pessoa):
    criar_pessoa(usuario="ana.teste")
    outra = criar_pessoa(usuario="bia.teste")
    r = admin.put(f"/admin/pessoas/{outra}/usuario", json={"usuario": "ana.teste"})
    assert r.status_code == 409


@pytest.mark.parametrize("usuario", ["ab", "ana souza", ".ana", "ana@souza"])
def test_usuario_invalido_e_recusado_com_explicacao(admin, criar_pessoa, usuario):
    pid = criar_pessoa(usuario="ana.teste")
    r = admin.put(f"/admin/pessoas/{pid}/usuario", json={"usuario": usuario})
    assert r.status_code == 422 and "ana.souza" in r.json()["detail"]
    # a requisição seguinte continua funcionando (o erro não estragou a conexão)
    assert admin.get("/admin/pessoas").status_code == 200


def test_pessoa_inexistente_da_404(admin):
    assert admin.put("/admin/pessoas/999999999/usuario", json={"usuario": "ninguem.aqui"}).status_code == 404


@pytest.mark.parametrize("cargo", ["Operador", "Consultor", "Coletor"])
def test_so_admin_ve_e_mexe_em_pessoas(cliente, criar_pessoa, cargo):
    pid = criar_pessoa(usuario="nao.admin", cargo=cargo)
    cliente.post("/login", json={"usuario": "nao.admin", "senha": SENHA})
    assert cliente.get("/admin/pessoas").status_code == 403
    assert cliente.put(f"/admin/pessoas/{pid}/usuario", json={"usuario": "outro.nome"}).status_code == 403
