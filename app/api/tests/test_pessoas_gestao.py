"""APP-016: Admin → Pessoas completo (07 v1.0, "10. Admin"; 06 "Primeiro acesso").

Nova pessoa e trocar cargo passam pelas funções do bot (PB5, 031), liberadas ao app pela 051.
"""

import re

import psycopg
import pytest

SENHA = "Senha-de-teste-1"
NOVA = {"nome": "Bia Teste", "telefone": "+55 (11) 90000-0101", "cargo": "Operador", "usuario": "bia.teste"}


@pytest.fixture
def admin(cliente, criar_pessoa):
    criar_pessoa(usuario="chefe.teste", cargo="Admin")
    assert cliente.post("/login", json={"usuario": "chefe.teste", "senha": SENHA}).status_code == 200
    return cliente


def _usuarios(conexao) -> int:
    return conexao.execute("SELECT count(*) FROM usuarios").fetchone()[0]


# ---------------------------------------------------------------- Nova pessoa
def test_nova_pessoa_cadastra_da_usuario_e_senha_provisoria(admin, conexao):
    r = admin.post("/admin/pessoas", json=NOVA)
    assert r.status_code == 201, r.text
    corpo = r.json()
    assert corpo["pessoa"]["usuario"] == "bia.teste"
    assert corpo["pessoa"]["cargo"] == "Operador"
    assert corpo["pessoa"]["situacao"] == "Senha provisória pendente"
    assert re.fullmatch(r"[A-Za-z0-9]{4}-[A-Za-z0-9]{4}", corpo["senha_provisoria"])
    # o bot reconhece a pessoa pelo número (só dígitos, gravado pela função do bot)
    assert conexao.execute("SELECT nome, cargo FROM usuarios WHERE telefone = '5511900000101'").fetchone() == (
        "Bia Teste",
        "Operador",
    )
    assert "telefone" not in corpo["pessoa"]


def test_quem_foi_cadastrado_entra_com_a_provisoria_e_troca_a_senha(admin):
    senha = admin.post("/admin/pessoas", json=NOVA).json()["senha_provisoria"]
    admin.post("/sair")
    r = admin.post("/login", json={"usuario": "bia.teste", "senha": senha})
    assert r.status_code == 200 and r.json()["trocar_senha"] is True


@pytest.mark.parametrize(
    ("mudanca", "codigo", "trecho"),
    [
        ({"telefone": "123"}, 422, "Telefone inválido"),
        ({"usuario": "Bia Teste!"}, 422, "letras minúsculas"),
        ({"usuario": "chefe.teste"}, 409, "já é de outra pessoa"),
    ],
)
def test_nova_pessoa_recusada_nao_deixa_nada_pela_metade(admin, conexao, mudanca, codigo, trecho):
    antes = _usuarios(conexao)
    r = admin.post("/admin/pessoas", json={**NOVA, **mudanca})
    assert r.status_code == codigo and trecho in r.json()["detail"]
    assert _usuarios(conexao) == antes  # tudo ou nada: a pessoa também não ficou no bot


def test_telefone_ja_cadastrado_recusado_pela_regra_do_bot(admin, conexao):
    tel = conexao.execute("SELECT telefone FROM usuarios ORDER BY id LIMIT 1").fetchone()[0]
    r = admin.post("/admin/pessoas", json={**NOVA, "telefone": tel})
    assert r.status_code == 422 and "já está cadastrado" in r.json()["detail"]


def test_cargo_invalido_da_422(admin):
    assert admin.post("/admin/pessoas", json={**NOVA, "cargo": "Chefe"}).status_code == 422


# ---------------------------------------------------------------- Trocar cargo
def test_trocar_cargo_pela_funcao_do_bot(admin, criar_pessoa, conexao):
    pid = criar_pessoa(usuario="op.teste", cargo="Operador")
    r = admin.put(f"/admin/pessoas/{pid}/cargo", json={"cargo": "Consultor"})
    assert r.status_code == 200 and r.json()["cargo"] == "Consultor"
    assert conexao.execute("SELECT cargo FROM usuarios WHERE id = %s", (pid,)).fetchone()[0] == "Consultor"


def test_nao_deixa_o_sistema_sem_admin(admin, conexao):
    meu_id = conexao.execute("SELECT usuario_id FROM app.credenciais WHERE usuario = 'chefe.teste'").fetchone()[0]
    assert conexao.execute("SELECT count(*) FROM usuarios WHERE cargo = 'Admin'").fetchone()[0] == 1
    r = admin.put(f"/admin/pessoas/{meu_id}/cargo", json={"cargo": "Operador"})
    assert r.status_code == 422 and "único Admin" in r.json()["detail"]


def test_trocar_cargo_de_quem_nao_existe_da_404(admin):
    assert admin.put("/admin/pessoas/999999/cargo", json={"cargo": "Operador"}).status_code == 404


# ---------------------------------------------------------------- Desbloquear e bloquear acesso
def test_desbloquear_zera_as_senhas_erradas_e_mantem_a_senha(admin, criar_pessoa, conexao, cliente):
    pid = criar_pessoa(usuario="erro.teste", cargo="Operador")
    hash_antes = conexao.execute("SELECT senha_hash FROM app.credenciais WHERE usuario_id = %s", (pid,)).fetchone()[0]
    conexao.execute(
        "UPDATE app.credenciais SET tentativas_erradas = 0, bloqueado_ate = now() + interval '15 minutes' WHERE usuario_id = %s",
        (pid,),
    )
    assert admin.get("/admin/pessoas").json()[-1]  # lista funciona com alguém bloqueado
    r = admin.post(f"/admin/pessoas/{pid}/desbloquear")
    assert r.status_code == 200 and r.json()["situacao"] == "Ativo"
    linha = conexao.execute(
        "SELECT tentativas_erradas, bloqueado_ate, senha_hash FROM app.credenciais WHERE usuario_id = %s", (pid,)
    ).fetchone()
    assert linha == (0, None, hash_antes)


def test_bloquear_acesso_derruba_a_sessao_e_liberar_devolve(admin, criar_pessoa, conexao):
    pid = criar_pessoa(usuario="saindo.teste", cargo="Operador")
    conexao.execute("INSERT INTO app.sessoes (token_hash, usuario_id) VALUES ('x-teste-hash', %s)", (pid,))
    r = admin.put(f"/admin/pessoas/{pid}/acesso", json={"ativo": False})
    assert r.status_code == 200 and r.json()["situacao"] == "Bloqueado pelo Admin"
    abertas = conexao.execute(
        "SELECT count(*) FROM app.sessoes WHERE usuario_id = %s AND encerrada_em IS NULL", (pid,)
    ).fetchone()[0]
    assert abertas == 0
    assert admin.put(f"/admin/pessoas/{pid}/acesso", json={"ativo": True}).json()["situacao"] == "Ativo"


def test_admin_nao_bloqueia_a_si_mesmo(admin, conexao):
    meu_id = conexao.execute("SELECT usuario_id FROM app.credenciais WHERE usuario = 'chefe.teste'").fetchone()[0]
    r = admin.put(f"/admin/pessoas/{meu_id}/acesso", json={"ativo": False})
    assert r.status_code == 422


def test_desbloquear_quem_nao_tem_usuario_da_404(admin, conexao):
    sem = conexao.execute(
        "SELECT u.id FROM usuarios u LEFT JOIN app.credenciais c ON c.usuario_id = u.id WHERE c.usuario_id IS NULL LIMIT 1"
    ).fetchone()[0]
    assert admin.post(f"/admin/pessoas/{sem}/desbloquear").status_code == 404
    assert admin.put(f"/admin/pessoas/{sem}/acesso", json={"ativo": False}).status_code == 404


# ---------------------------------------------------------------- Permissões
@pytest.mark.parametrize("cargo", ["Operador", "Consultor", "Coletor"])
def test_so_admin_cadastra_troca_desbloqueia_e_bloqueia(cliente, criar_pessoa, cargo):
    alvo = criar_pessoa(usuario="alvo.teste", cargo="Operador")
    criar_pessoa(usuario="outro.teste", cargo=cargo)
    assert cliente.post("/login", json={"usuario": "outro.teste", "senha": SENHA}).status_code == 200
    assert cliente.post("/admin/pessoas", json=NOVA).status_code == 403
    assert cliente.put(f"/admin/pessoas/{alvo}/cargo", json={"cargo": "Admin"}).status_code == 403
    assert cliente.post(f"/admin/pessoas/{alvo}/desbloquear").status_code == 403
    assert cliente.put(f"/admin/pessoas/{alvo}/acesso", json={"ativo": False}).status_code == 403


def test_o_papel_do_app_so_chama_as_duas_funcoes_liberadas(conexao):
    conexao.execute("SET LOCAL ROLE labflow_app_web")
    for chamada in ("SELECT usuario_exigir_admin(1)", "SELECT gravar_cargo_bot('5500000000999', 'X', 'Admin', '5500000000901')"):
        conexao.execute("SAVEPOINT s")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conexao.execute(chamada)
        conexao.execute("ROLLBACK TO SAVEPOINT s")
