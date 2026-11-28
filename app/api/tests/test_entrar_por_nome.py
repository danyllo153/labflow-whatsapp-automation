"""Lite sem senha (27/11): entrar pelo nome, o Admin que some, todos iguais; a Completa continua com senha."""

import pytest

SENHA = "Senha-de-teste-1"


def nomes(c):
    r = c.get("/entrar/nomes")
    assert r.status_code == 200
    return [n["nome"] for n in r.json()]


def test_primeira_abertura_o_nome_assume_o_registro_do_admin_com_o_mesmo_id(cliente_lite, conexao, registro_inicial):
    assert cliente_lite.get("/entrar/primeira-vez").json() == {"primeira_vez": True}
    assert nomes(cliente_lite) == []  # nenhum "Admin" na lista
    # lançamento antigo do registro (histórico que precisa continuar dela)
    conexao.execute("RESET ROLE")
    r = cliente_lite.post("/entrar/novo", json={"nome": "  Ana   Souza "})
    assert r.status_code == 201, r.text
    assert (r.json()["nome"], r.json()["usuario"], r.json()["trocar_senha"]) == ("Ana Souza", "ana.souza", False)
    linha = conexao.execute("SELECT id, nome, cargo FROM usuarios WHERE id = %s", (registro_inicial,)).fetchone()
    assert linha == (registro_inicial, "Ana Souza", "Admin")  # mesmo id: histórico continua
    assert conexao.execute("SELECT count(*) FROM usuarios WHERE nome ILIKE 'Admin%'").fetchone()[0] == 0
    assert cliente_lite.get("/me").json()["nome"] == "Ana Souza"
    assert cliente_lite.get("/entrar/primeira-vez").json() == {"primeira_vez": False}
    assert nomes(cliente_lite) == ["Ana Souza"]


def test_depois_escolhe_na_lista_ou_digita_um_nome_novo(cliente_lite, registro_inicial):
    assert cliente_lite.post("/entrar/novo", json={"nome": "Ana Souza"}).status_code == 201
    cliente_lite.cookies.clear()
    assert cliente_lite.post("/entrar/novo", json={"nome": "Bia Lima"}).status_code == 201  # novo: não assume nada
    assert nomes(cliente_lite) == ["Ana Souza", "Bia Lima"]
    cliente_lite.cookies.clear()
    assert cliente_lite.get("/me").status_code == 401
    r = cliente_lite.post("/entrar/por-nome", json={"usuario": "ana.souza"})
    assert r.status_code == 200 and r.json()["nome"] == "Ana Souza"
    assert cliente_lite.get("/me").json()["usuario"] == "ana.souza"


def test_todos_tem_as_mesmas_funcoes_inclusive_quem_foi_cadastrado_como_coletor(cliente_lite, conexao, registro_inicial):
    cliente_lite.post("/entrar/novo", json={"nome": "Ana Souza"})
    conexao.execute("RESET ROLE")
    uid = conexao.execute(
        "INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000777', 'Caio Coletor', 'Coletor') RETURNING id"
    ).fetchone()[0]
    conexao.execute("INSERT INTO app.credenciais (usuario_id, usuario, trocar_senha) VALUES (%s, 'caio.coletor', true)", (uid,))
    cliente_lite.cookies.clear()
    r = cliente_lite.post("/entrar/por-nome", json={"usuario": "caio.coletor"})  # nem a "troca de senha" antiga trava
    assert r.status_code == 200 and r.json()["trocar_senha"] is False
    assert {"gerenciar_pessoas", "configurar_turnos", "registrar_analise"} <= set(r.json()["pode"])
    assert cliente_lite.get("/admin/pessoas").status_code == 200  # as telas de Admin viram de todos


def test_pessoas_na_lite_sem_o_admin_sem_senha_e_sem_cargo(cliente_lite, conexao, registro_inicial):
    cliente_lite.post("/entrar/novo", json={"nome": "Ana Souza"})
    r = cliente_lite.post("/admin/pessoas/por-nome", json={"nome": "Caio Mendes"})
    assert r.status_code == 201, r.text
    novo = r.json()
    assert (novo["nome"], novo["usuario"], novo["situacao"]) == ("Caio Mendes", "caio.mendes", "Ativo")
    outro = cliente_lite.post("/admin/pessoas/por-nome", json={"nome": "Duda Reis"}).json()
    telefones = [t for (t,) in conexao.execute("SELECT telefone FROM usuarios WHERE id = ANY(%s) ORDER BY id", ([novo["id"], outro["id"]],))]
    assert len(set(telefones)) == 2 and all(t.startswith("55000000") and len(t) == 13 for t in telefones)  # marcadores, sem bot
    lista = cliente_lite.get("/admin/pessoas").json()
    assert [p["nome"] for p in lista if p["usuario"]] == ["Ana Souza", "Caio Mendes", "Duda Reis"]
    assert all(p["nome"] != "Administrador" for p in lista)
    # na Lite não há senha provisória, usuário curto, cargo nem cadastro com telefone
    assert cliente_lite.post(f"/admin/pessoas/{novo['id']}/senha-provisoria").status_code == 404
    assert cliente_lite.put(f"/admin/pessoas/{novo['id']}/cargo", json={"cargo": "Admin"}).status_code == 404
    assert cliente_lite.put(f"/admin/pessoas/{novo['id']}/usuario", json={"usuario": "x.y.z"}).status_code == 404
    assert cliente_lite.post("/admin/pessoas", json={"nome": "X", "cargo": "Analista", "usuario": "xxx"}).status_code == 404
    assert cliente_lite.post("/login", json={"usuario": "ana.souza", "senha": ""}).status_code == 404
    assert cliente_lite.post("/trocar-senha", json={"nova_senha": "12345678"}).status_code == 404


@pytest.mark.parametrize(
    "nome",
    ["", "   ", "A" * 200, "A" * 41, "<script>alert(1)</script>", "Ana; DROP TABLE usuarios", "Ana\x00", "12345", "Admin", "administrador"],
)
def test_nome_invalido_e_recusado(cliente_lite, registro_inicial, nome):
    assert cliente_lite.post("/entrar/novo", json={"nome": nome}).status_code == 422
    assert cliente_lite.get("/entrar/primeira-vez").json() == {"primeira_vez": True}  # nada foi gravado


def test_nome_de_40_letras_vale_e_o_banco_tambem_recusa_41(cliente_lite, conexao, registro_inicial):
    assert cliente_lite.post("/entrar/novo", json={"nome": "A" * 40}).status_code == 201
    from psycopg.errors import CheckViolation

    conexao.execute("RESET ROLE")
    with pytest.raises(CheckViolation):
        with conexao.transaction():
            conexao.execute("UPDATE usuarios SET nome = %s WHERE telefone = '5500000000001'", ("B" * 41,))


def test_nome_repetido_nao_duplica(cliente_lite, registro_inicial):
    cliente_lite.post("/entrar/novo", json={"nome": "Ana Souza"})
    cliente_lite.cookies.clear()
    r = cliente_lite.post("/entrar/novo", json={"nome": "ana  SOUZA"})
    assert r.status_code == 409
    r = cliente_lite.post("/entrar/novo", json={"nome": "Ána Souza"})  # acento também é o mesmo nome
    assert r.status_code == 409


def test_pessoa_desativada_com_cookie_velho_leva_401_e_nao_entra_de_novo(cliente_lite, conexao, registro_inicial):
    cliente_lite.post("/entrar/novo", json={"nome": "Ana Souza"})
    cliente_lite.post("/admin/pessoas/por-nome", json={"nome": "Bia Lima"})
    bia = [p for p in cliente_lite.get("/admin/pessoas").json() if p["nome"] == "Bia Lima"][0]
    ana_cookie = dict(cliente_lite.cookies)
    cliente_lite.cookies.clear()
    cliente_lite.post("/entrar/por-nome", json={"usuario": "bia.lima"})
    bia_cookie = dict(cliente_lite.cookies)
    assert cliente_lite.get("/me").status_code == 200
    cliente_lite.cookies.clear()
    cliente_lite.cookies.update(ana_cookie)
    r = cliente_lite.put(f"/admin/pessoas/{bia['id']}/acesso", json={"ativo": False})
    assert r.status_code == 200 and r.json()["situacao"] == "Acesso bloqueado"
    cliente_lite.cookies.clear()
    cliente_lite.cookies.update(bia_cookie)  # o cookie velho dela
    assert cliente_lite.get("/me").status_code == 401
    assert cliente_lite.get("/admin/pessoas").status_code == 401
    assert "Bia Lima" not in nomes(cliente_lite)
    assert cliente_lite.post("/entrar/por-nome", json={"usuario": "bia.lima"}).status_code == 403


def test_sem_cookie_e_cookie_inventado_levam_401(cliente_lite, registro_inicial):
    assert cliente_lite.get("/me").status_code == 401
    cliente_lite.cookies.set("labflow_sessao", "inventado")
    assert cliente_lite.get("/me").status_code == 401
    assert cliente_lite.get("/admin/pessoas").status_code == 401


def test_a_sessao_guarda_de_qual_pc_veio(cliente_lite, conexao, registro_inicial):
    cliente_lite.post("/entrar/novo", json={"nome": "Ana Souza"}, headers={"User-Agent": "Navegador de teste"})
    aparelho = conexao.execute("SELECT aparelho FROM app.sessoes ORDER BY id DESC LIMIT 1").fetchone()[0]
    assert aparelho.startswith("PC ") and aparelho.endswith("| Navegador de teste")


def test_nome_que_nao_esta_na_lista_nao_entra(cliente_lite, registro_inicial):
    assert cliente_lite.post("/entrar/por-nome", json={"usuario": "fulano"}).status_code == 404
    # o registro que era o Admin não entra pelo "usuário" admin: ele só vira pessoa quando alguém o assume
    assert cliente_lite.post("/entrar/por-nome", json={"usuario": "admin"}).status_code == 404


def test_instalacao_antiga_mantem_as_pessoas_com_senha_na_lista(cliente_lite, conexao, criar_pessoa, registro_inicial):
    criar_pessoa("ana.teste", cargo="Analista")  # veio da Lite com senha
    criar_pessoa("bia.teste", cargo="Consultor", trocar_senha=True)
    assert nomes(cliente_lite) == ["ana.teste (teste)", "bia.teste (teste)"]
    assert cliente_lite.post("/entrar/por-nome", json={"usuario": "bia.teste"}).json()["trocar_senha"] is False
    # e a primeira abertura da versão nova ainda oferece o nome para o registro do Admin
    cliente_lite.cookies.clear()
    assert cliente_lite.get("/entrar/primeira-vez").json() == {"primeira_vez": True}
    r = cliente_lite.post("/entrar/novo", json={"nome": "Carla Dias"})
    assert r.status_code == 201
    assert conexao.execute("SELECT nome FROM usuarios WHERE id = %s", (registro_inicial,)).fetchone()[0] == "Carla Dias"


def test_o_nome_antigo_acima_de_40_fica_e_aparece_para_edicao(cliente_lite, conexao, criar_pessoa, registro_inicial):
    uid = criar_pessoa("longa.teste")
    conexao.execute("ALTER TABLE usuarios DROP CONSTRAINT usuarios_nome_seguro")
    conexao.execute("UPDATE usuarios SET nome = %s WHERE id = %s", ("N" * 45, uid))  # nome antigo, gravado antes da 087
    conexao.execute(
        "ALTER TABLE usuarios ADD CONSTRAINT usuarios_nome_seguro "
        "CHECK (nome IS NULL OR (char_length(nome) <= 40 AND nome !~ '[<>;[:cntrl:]]')) NOT VALID"
    )
    assert "N" * 45 in nomes(cliente_lite)
    assert cliente_lite.post("/entrar/por-nome", json={"usuario": "longa.teste"}).status_code == 200


# ---------------------------------------------------------------- a Completa não muda


@pytest.fixture
def completa(monkeypatch):
    monkeypatch.delenv("LABFLOW_LITE", raising=False)


def test_completa_sem_senha_leva_401_e_as_rotas_da_lite_nao_existem(cliente, criar_pessoa, completa):
    criar_pessoa("ana.teste")
    assert cliente.post("/login", json={"usuario": "ana.teste", "senha": ""}).status_code == 401
    assert cliente.post("/login", json={"usuario": "ana.teste", "senha": "errada-errada"}).status_code == 401
    assert cliente.get("/me").status_code == 401
    assert cliente.get("/entrar/nomes").status_code == 404
    assert cliente.get("/entrar/primeira-vez").status_code == 404
    assert cliente.post("/entrar/por-nome", json={"usuario": "ana.teste"}).status_code == 404
    assert cliente.post("/entrar/novo", json={"nome": "Intruso"}).status_code == 404
    assert cliente.post("/admin/pessoas/por-nome", json={"nome": "Intruso"}).status_code == 404
    assert cliente.get("/me").status_code == 401  # nada abriu sessão


def test_completa_continua_com_senha_e_cargos(cliente, criar_pessoa, completa):
    criar_pessoa("ana.teste", cargo="Consultor")
    r = cliente.post("/login", json={"usuario": "ana.teste", "senha": SENHA})
    assert r.status_code == 200 and r.json()["cargo"] == "Consultor"  # cargo do banco, não vira Admin
    assert "gerenciar_pessoas" not in r.json()["pode"]
    assert cliente.get("/admin/pessoas").status_code == 403


def test_completa_troca_de_senha_obrigatoria_continua(cliente, criar_pessoa, completa):
    criar_pessoa("bia.teste", trocar_senha=True)
    r = cliente.post("/login", json={"usuario": "bia.teste", "senha": SENHA})
    assert r.status_code == 200 and r.json()["trocar_senha"] is True
    assert cliente.get("/ambiente").json()["lite"] is False


def test_completa_a_pessoa_desativada_com_cookie_velho_leva_401(cliente, conexao, criar_pessoa, completa):
    criar_pessoa("ana.teste")
    assert cliente.post("/login", json={"usuario": "ana.teste", "senha": SENHA}).status_code == 200
    conexao.execute("UPDATE app.credenciais SET acesso_ativo = false WHERE usuario = 'ana.teste'")
    assert cliente.get("/me").status_code == 401


def test_completa_pessoas_mostra_as_situacoes_de_sempre(cliente, conexao, criar_pessoa, completa):
    criar_pessoa("adm.teste", cargo="Admin")
    criar_pessoa("pend.teste", trocar_senha=True)
    conexao.execute("UPDATE app.credenciais SET senha_hash = NULL WHERE usuario = 'pend.teste'")
    assert cliente.post("/login", json={"usuario": "adm.teste", "senha": SENHA}).status_code == 200
    situacoes = {p["usuario"]: p["situacao"] for p in cliente.get("/admin/pessoas").json() if p["usuario"]}
    assert situacoes == {"adm.teste": "Ativo", "pend.teste": "Senha provisória pendente"}


def test_a_funcao_088_so_assume_o_registro_inicial(conexao):
    """A função nova não serve para renomear mais ninguém (nem existe registro inicial na Completa)."""
    from psycopg.errors import RaiseException

    conexao.execute("SET ROLE labflow_app_web")
    try:
        with pytest.raises(RaiseException):
            with conexao.transaction():
                conexao.execute("SELECT lite_assumir_admin('Intruso')")
    finally:
        conexao.execute("RESET ROLE")
    assert conexao.execute("SELECT count(*) FROM usuarios WHERE nome = 'Intruso'").fetchone()[0] == 0
