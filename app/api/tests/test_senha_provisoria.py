"""APP-006: senha provisória e troca obrigatória (06 v1.0, "Primeiro acesso, esqueci a senha"; 08 A1)."""

import re

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from labflow_api.dependencias import obter_conexao
from labflow_api.main import app
from labflow_api.permissoes import exigir

SENHA = "Senha-de-teste-1"


@pytest.fixture
def dois_clientes(conexao):
    """Admin e pessoa em navegadores separados (cookies separados), na mesma transação do teste."""

    def conexao_do_teste():
        conexao.execute("SET ROLE labflow_app_web")
        try:
            yield conexao
        finally:
            conexao.execute("RESET ROLE")

    app.dependency_overrides[obter_conexao] = conexao_do_teste
    try:
        yield TestClient(app, base_url="https://testserver"), TestClient(app, base_url="https://testserver")
    finally:
        app.dependency_overrides.clear()


def _entrar(c, usuario, senha):
    return c.post("/login", json={"usuario": usuario, "senha": senha})


def _admin_gera(admin_cli, pessoa_id):
    return admin_cli.post(f"/admin/pessoas/{pessoa_id}/senha-provisoria")


@pytest.fixture
def cenario(dois_clientes, criar_pessoa):
    admin_cli, pessoa_cli = dois_clientes
    criar_pessoa(usuario="chefe.teste", cargo="Admin")
    pessoa_id = criar_pessoa(usuario="ana.teste", cargo="Analista")
    assert _entrar(admin_cli, "chefe.teste", SENHA).status_code == 200
    return admin_cli, pessoa_cli, pessoa_id


def test_admin_gera_provisoria_e_a_pessoa_entra_com_ela(cenario, conexao):
    admin_cli, pessoa_cli, pid = cenario
    r = _admin_gera(admin_cli, pid)
    assert r.status_code == 200
    provisoria = r.json()["senha_provisoria"]
    assert re.fullmatch(r"[A-Za-z2-9]{4}-[A-Za-z2-9]{4}", provisoria)
    entrou = _entrar(pessoa_cli, "ana.teste", provisoria)
    assert entrou.status_code == 200 and entrou.json()["trocar_senha"] is True
    # a provisória é de uso único
    pessoa_cli.post("/sair")
    assert _entrar(pessoa_cli, "ana.teste", provisoria).status_code == 401


def test_gerar_provisoria_derruba_a_senha_antiga_e_as_sessoes(cenario):
    admin_cli, pessoa_cli, pid = cenario
    assert _entrar(pessoa_cli, "ana.teste", SENHA).status_code == 200
    _admin_gera(admin_cli, pid)
    assert pessoa_cli.get("/me").status_code == 401  # sessão aberta caiu
    assert _entrar(pessoa_cli, "ana.teste", SENHA).status_code == 401  # senha antiga não vale mais


def test_nova_provisoria_cancela_a_anterior(cenario):
    admin_cli, pessoa_cli, pid = cenario
    primeira = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
    segunda = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
    assert _entrar(pessoa_cli, "ana.teste", primeira).status_code == 401
    assert _entrar(pessoa_cli, "ana.teste", segunda).status_code == 200


def test_provisoria_vencida_nao_entra(cenario, conexao):
    admin_cli, pessoa_cli, pid = cenario
    provisoria = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
    validade_horas = conexao.execute(
        "SELECT round(extract(epoch FROM valida_ate - gerada_em) / 3600) FROM app.senhas_provisorias "
        "WHERE usuario_id = %s",
        (pid,),
    ).fetchone()[0]
    assert validade_horas == 24
    conexao.execute(
        "UPDATE app.senhas_provisorias SET gerada_em = now() - interval '25 hours', "
        "valida_ate = now() - interval '1 hour' WHERE usuario_id = %s",
        (pid,),
    )
    assert _entrar(pessoa_cli, "ana.teste", provisoria).status_code == 401


def test_so_admin_gera_provisoria(dois_clientes, criar_pessoa):
    _, operador_cli = dois_clientes
    criar_pessoa(usuario="op.teste", cargo="Analista")
    alvo = criar_pessoa(usuario="ana.teste")
    _entrar(operador_cli, "op.teste", SENHA)
    assert _admin_gera(operador_cli, alvo).status_code == 403


def test_pessoa_sem_usuario_no_app_da_404(cenario, conexao):
    admin_cli, _, _ = cenario
    sem_credencial = conexao.execute(
        "INSERT INTO usuarios (telefone, nome, cargo) VALUES ('5500000000899', 'Sem app', 'Analista') RETURNING id"
    ).fetchone()[0]
    assert _admin_gera(admin_cli, sem_credencial).status_code == 404


def test_troca_obrigatoria_bloqueia_as_rotas_protegidas(cenario):
    admin_cli, pessoa_cli, pid = cenario

    @app.get("/teste-rota-protegida")
    def rota(p=Depends(exigir("registrar_coleta"))):
        return {"ok": True}

    try:
        provisoria = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
        _entrar(pessoa_cli, "ana.teste", provisoria)
        bloqueada = pessoa_cli.get("/teste-rota-protegida")
        assert bloqueada.status_code == 403 and "Troque sua senha" in bloqueada.json()["detail"]
        assert pessoa_cli.get("/me").status_code == 200  # "quem sou eu" continua liberado
        assert pessoa_cli.post("/trocar-senha", json={"nova_senha": "Minha-senha-nova"}).status_code == 204
        assert pessoa_cli.get("/teste-rota-protegida").status_code == 200
    finally:
        app.router.routes = [r for r in app.router.routes if getattr(r, "path", "") != "/teste-rota-protegida"]


@pytest.mark.parametrize("nova", ["ana.teste", "  ANA.TESTE  "])
def test_senha_igual_ao_usuario_e_recusada(cenario, nova):
    admin_cli, pessoa_cli, pid = cenario
    provisoria = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
    _entrar(pessoa_cli, "ana.teste", provisoria)
    r = pessoa_cli.post("/trocar-senha", json={"nova_senha": nova})
    assert r.status_code == 422 and "igual ao seu usuário" in r.json()["detail"]


def test_depois_de_trocar_entra_com_a_senha_nova(cenario):
    admin_cli, pessoa_cli, pid = cenario
    provisoria = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
    _entrar(pessoa_cli, "ana.teste", provisoria)
    pessoa_cli.post("/trocar-senha", json={"nova_senha": "Minha-senha-nova"})
    pessoa_cli.post("/sair")
    r = _entrar(pessoa_cli, "ana.teste", "Minha-senha-nova")
    assert r.status_code == 200 and r.json()["trocar_senha"] is False


def test_troca_voluntaria_pede_a_senha_atual(dois_clientes, criar_pessoa):
    cli, _ = dois_clientes
    criar_pessoa(usuario="ana.teste")
    _entrar(cli, "ana.teste", SENHA)
    assert cli.post("/trocar-senha", json={"nova_senha": "Outra-senha-1"}).status_code == 403
    assert cli.post("/trocar-senha", json={"nova_senha": "Outra-senha-1", "senha_atual": "errada"}).status_code == 403
    ok = cli.post("/trocar-senha", json={"nova_senha": "Outra-senha-1", "senha_atual": SENHA})
    assert ok.status_code == 204


def test_erros_com_a_provisoria_tambem_contam_para_o_bloqueio(cenario):
    admin_cli, pessoa_cli, pid = cenario
    provisoria = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
    for _ in range(5):
        _entrar(pessoa_cli, "ana.teste", "errada")
    assert _entrar(pessoa_cli, "ana.teste", provisoria).status_code == 423


@pytest.mark.parametrize("nova, aceita", [("", False), ("1234567", False), ("12345678", True), ("abcdefgh", True)])
def test_senha_com_pelo_menos_8_caracteres(cenario, nova, aceita):
    admin_cli, pessoa_cli, pid = cenario
    provisoria = _admin_gera(admin_cli, pid).json()["senha_provisoria"]
    _entrar(pessoa_cli, "ana.teste", provisoria)
    r = pessoa_cli.post("/trocar-senha", json={"nova_senha": nova})
    assert r.status_code == (204 if aceita else 422)
