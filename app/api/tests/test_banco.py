import pytest

from labflow_api import banco


def test_le_usuarios_ficticios_do_banco_de_teste(conexao):
    with conexao.cursor() as cur:
        cur.execute("SELECT nome, cargo FROM usuarios WHERE telefone LIKE '55000000009%' ORDER BY telefone")
        linhas = cur.fetchall()
    assert linhas == [
        ("Ana (demo)", "Consultor"),
        ("Bruno (demo)", "Consultor"),
        ("Carla (demo)", "Consultor"),
    ]


def test_views_do_power_bi_existem(conexao):
    # A API vai ler por views (06, Direção); as do painel precisam estar no banco de teste.
    with conexao.cursor() as cur:
        cur.execute("SELECT count(*) FROM bi.coletas")
        assert cur.fetchone()[0] > 0


def test_sem_url_do_banco_da_erro_claro(monkeypatch):
    monkeypatch.delenv("LABFLOW_DB_URL", raising=False)
    with pytest.raises(banco.BancoNaoConfigurado):
        banco.url_do_banco()
