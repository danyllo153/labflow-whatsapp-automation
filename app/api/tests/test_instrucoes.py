"""APP-062 (Fase E, E9): a instrução e o vídeo de cada app, escritos pelo Admin e guardados no banco. Dados fictícios."""

import psycopg
import pytest

SENHA = "Senha-de-teste-1"
URL = "/analises/instrucoes/drops"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Admin"):
        usuario = f"{cargo.lower()}.instrucao"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


def test_sem_instrucao_vem_vazia(cliente, logado):
    logado("Analista")
    r = cliente.get(URL)
    assert r.status_code == 200
    assert r.json() == {"app": "drops", "texto": "", "video_url": None, "versao": 0, "escrita_por": None,
                        "escrita_em": None, "pode_editar": False}


def test_o_admin_escreve_e_cada_mudanca_vira_versao(cliente, logado, conexao):
    logado("Admin")
    r = cliente.put(URL, json={"texto": "  1. Separe as placas do dia.  ", "video_url": ""})
    assert r.status_code == 200, r.text
    assert r.json()["texto"] == "1. Separe as placas do dia." and r.json()["versao"] == 1 and r.json()["pode_editar"]
    assert r.json()["escrita_por"] == "admin.instrucao (teste)"

    igual = cliente.put(URL, json={"texto": "1. Separe as placas do dia."})
    assert igual.json()["versao"] == 1  # nada mudou: não cria versão

    r = cliente.put(URL, json={"texto": "1. Separe as placas do dia.", "video_url": "https://exemplo.com/video-ficticio"})
    assert r.json()["versao"] == 2 and r.json()["video_url"] == "https://exemplo.com/video-ficticio"
    assert conexao.execute("SELECT count(*) FROM app.instrucoes WHERE app = 'drops'").fetchone()[0] == 2  # a 1 fica


def test_link_do_video_so_https(cliente, logado):
    logado("Admin")
    assert cliente.put(URL, json={"texto": "x", "video_url": "http://exemplo.com"}).status_code == 422
    assert cliente.put(URL, json={"texto": "x", "video_url": "javascript:alert(1)"}).status_code == 422
    assert cliente.put(URL, json={"texto": "", "video_url": None}).status_code == 422


@pytest.mark.parametrize("cargo", ["Analista", "Consultor", "Coletor"])
def test_so_o_admin_escreve(cliente, logado, cargo):
    logado(cargo)
    assert cliente.put(URL, json={"texto": "x"}).status_code == 403


def test_app_desconhecido(cliente, logado):
    logado("Admin")
    assert cliente.get("/analises/instrucoes/outro").status_code == 422


def test_o_app_nao_apaga_nem_reescreve_versao(conexao):
    conexao.execute("SET ROLE labflow_app_web")
    try:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conexao.execute("UPDATE app.instrucoes SET texto = 'x'")
    finally:
        conexao.rollback()
