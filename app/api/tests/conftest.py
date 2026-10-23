import os

import pytest

from labflow_api import banco


@pytest.fixture(autouse=True)
def _sem_trava_de_checkin(request, monkeypatch):
    """A trava do check-in fica desligada nos testes das outras telas; os testes com @pytest.mark.checkin a ligam."""
    if request.node.get_closest_marker("checkin") is None:
        from labflow_api import permissoes

        monkeypatch.setattr(permissoes, "CHECKIN_OBRIGATORIO", frozenset())


@pytest.fixture
def conexao():
    """Conexão com o banco de TESTE (montado por scripts/preparar_banco_teste.sh).

    Sem LABFLOW_DB_URL, o teste é pulado no computador local; no GitHub Actions
    (LABFLOW_EXIGIR_BANCO=1) a falta do banco é erro, para nunca passar sem testar.
    """
    if not os.environ.get("LABFLOW_DB_URL"):
        if os.environ.get("LABFLOW_EXIGIR_BANCO") == "1":
            pytest.fail("LABFLOW_DB_URL não definida, mas o banco de teste é obrigatório aqui.")
        pytest.skip("Sem banco de teste (defina LABFLOW_DB_URL).")
    with banco.conectar() as con:
        yield con
        con.rollback()  # cada teste desfaz o que gravou: o banco de teste fica igual para o próximo


@pytest.fixture
def cliente(conexao):
    """Cliente da API usando a MESMA transação do teste (tudo é desfeito no fim).

    Cada requisição roda com as permissões do labflow_app_web, como no servidor.
    """
    from fastapi.testclient import TestClient

    from labflow_api.dependencias import obter_conexao
    from labflow_api.main import app

    def conexao_do_teste():
        conexao.execute("SET ROLE labflow_app_web")
        try:
            yield conexao
        finally:
            conexao.execute("RESET ROLE")

    app.dependency_overrides[obter_conexao] = conexao_do_teste
    try:
        yield TestClient(app, base_url="https://testserver")
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def criar_pessoa(conexao):
    """Cria uma pessoa fictícia (telefone 5500000008xx) com credencial no app."""
    from labflow_api.seguranca import gerar_hash_senha

    contador = iter(range(10, 100))

    def _criar(usuario="ana.teste", senha="Senha-de-teste-1", cargo="Analista", trocar_senha=False, ativo=True):
        telefone = f"55000000008{next(contador)}"
        uid = conexao.execute(
            "INSERT INTO usuarios (telefone, nome, cargo) VALUES (%s, %s, %s) RETURNING id",
            (telefone, f"{usuario} (teste)", cargo),
        ).fetchone()[0]
        conexao.execute(
            "INSERT INTO app.credenciais (usuario_id, usuario, senha_hash, trocar_senha, acesso_ativo) "
            "VALUES (%s, %s, %s, %s, %s)",
            (uid, usuario, gerar_hash_senha(senha), trocar_senha, ativo),
        )
        return uid

    return _criar
