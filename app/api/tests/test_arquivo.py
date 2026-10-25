"""Arquivo de contra-amostras (PB21, migration 105 do bot): caixas, conteúdo, arquivar e descartar. Dados fictícios."""

from datetime import timedelta

import pytest

SENHA = "Senha-de-teste-1"
REC = "/analises/recebimento-fcoj"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.arquivo"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


@pytest.fixture
def hoje(conexao):
    return conexao.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]


def _receber(cliente, load, lotes, dia):
    r = cliente.post(f"{REC}/registrar", json={"load": load, "item": "99902", "fabrica": "TMG", "lotes": lotes, "data": str(dia), "previa": False})
    assert r.status_code == 200, r.text


def test_caixas_e_sugerida(cliente, logado):
    logado("Consultor")
    r = cliente.get("/arquivo")
    assert r.status_code == 200, r.text
    dados = r.json()
    rec = [c for c in dados["caixas"] if c["tipo"] == "recebimento"]
    assert [c["numero"] for c in rec][:1] == [121] and rec[-1]["numero"] == 145
    assert {c["numero"] for c in dados["caixas"] if c["tipo"] == "tanque"} >= {34, 49}
    assert 121 <= dados["sugerida_recebimento"] <= 145 and dados["pode_gravar"] is False
    assert cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 121}).status_code == 403


def test_arquivar_recebimento_previa_confirmar_e_descartar(cliente, logado, hoje):
    logado()
    _receber(cliente, "98801", "1-5", hoje - timedelta(days=9))
    pedido = {"load": "98801", "lotes": "1-3", "caixa": 144, "data": str(hoje - timedelta(days=8))}
    previa = cliente.post("/arquivo/arquivar", json={**pedido, "previa": True})
    assert previa.status_code == 200, previa.text
    assert previa.json()["previa"] and "Caixa 144 (recebimento): load 98801 lotes 1-3" in previa.json()["texto"]
    assert cliente.get("/arquivo/recebimento/144").json()["itens"] == []  # a prévia não grava
    assert cliente.post("/arquivo/arquivar", json={**pedido, "previa": False}).status_code == 200

    r = cliente.post("/arquivo/arquivar", json={**pedido, "lotes": "3-4", "previa": True})
    assert r.status_code == 422 and "já está na caixa 144" in r.json()["detail"]  # a mesma recusa do bot
    r = cliente.post("/arquivo/arquivar", json={**pedido, "caixa": 99, "previa": True})
    assert r.status_code == 422 and "121 a 145" in r.json()["detail"]

    caixa = cliente.get("/arquivo/recebimento/144").json()
    assert caixa["caixa"]["situacao"] == "Vencida" and caixa["itens"][0]["situacao"] == "Vencido"
    assert caixa["itens"][0]["load"] == "98801" and caixa["itens"][0]["lotes"] == "1-3"

    previa = cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 144, "previa": True}).json()
    assert "load 98801" in previa["texto"]
    assert cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 144, "previa": False}).status_code == 200
    depois = cliente.get("/arquivo/recebimento/144", params={"descartados": True}).json()
    assert depois["caixa"]["situacao"] == "Disponível" and depois["itens"][0]["situacao"] == "Descartado"
    r = cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 144, "previa": True})
    assert r.status_code == 422 and "Nada vencido" in r.json()["detail"]


def test_caixa_que_nao_existe(cliente, logado):
    logado()
    assert cliente.get("/arquivo/recebimento/999").status_code == 404
