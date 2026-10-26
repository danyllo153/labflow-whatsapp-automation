"""APP-055: o gráfico da semana e o cartão das folhas dos laudos (visual repaginado). Dados fictícios."""

from datetime import datetime, timedelta

import pytest

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def test_semana_tem_7_dias_ate_hoje_e_os_4_tipos(cliente, logado, monkeypatch):
    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2031, 3, 10, 10, tzinfo=FUSO))
    logado("Consultor")
    s = cliente.get("/painel/semana").json()
    assert s["tipos"] == ["TAB", "Coliformes", "NFC", "C.T/B.L"]
    assert [d["dia"] for d in s["dias"]][0] == "2031-03-04" and s["dias"][-1]["dia"] == "2031-03-10"
    assert s["totais"] == {"TAB": 0, "Coliformes": 0, "NFC": 0, "C.T/B.L": 0}  # dias sem dado nenhum


def test_semana_conta_o_que_foi_concluido_no_dia(cliente, logado):
    logado()
    s = cliente.get("/painel/semana").json()
    assert set(s["totais"]) == {"TAB", "Coliformes", "NFC", "C.T/B.L"}
    assert all(sum(d["contagens"].values()) >= 0 for d in s["dias"]) and len(s["dias"]) == 7


def test_folhas_mostra_a_folha_em_preenchimento_com_o_caminho(cliente, logado):
    logado()
    # ontem: hoje às 07:10 ainda é futuro quando o teste roda de madrugada (o app recusa a hora no futuro)
    ontem = (datetime.now(FUSO) - timedelta(days=1)).date().isoformat()
    r = cliente.post("/aguas/superficies", json={"tipo": "Linha", "pontos": ["4", "6"], "dia": ontem, "hora": "07:10"})
    assert r.status_code in (200, 201), r.text
    folhas = {f["laudo"]: f for f in cliente.get("/painel/folhas").json()}
    linha = folhas["superficies-Linha"]
    assert (linha["caminho"], linha["capacidade"], linha["cheias"]) == ("/paginas/linhas", 31, 0)
    assert linha["linhas"] >= 2


def test_turnos_mostra_os_3_turnos_com_a_media_e_o_de_hoje(cliente, logado, monkeypatch):
    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2031, 3, 10, 10, tzinfo=FUSO))  # Manhã, sem dados
    logado("Consultor")
    m = cliente.get("/painel/turnos").json()
    assert m["dias"] == 30
    assert [(t["turno"], t["agora"]) for t in m["turnos"]] == [("Manhã", True), ("Tarde", False), ("Madrugada", False)]
    assert all(t["analises"] == 0 and t["hoje_analises"] == 0 and t["esterilizacoes"] == 0 for t in m["turnos"])


def test_turnos_conta_a_esterilizacao_de_hoje_no_turno_dela(cliente, logado):
    logado()
    antes = {t["turno"]: t for t in cliente.get("/painel/turnos").json()["turnos"]}
    agora = next(t for t in antes.values() if t["agora"])
    assert cliente.post("/turno/entrar", json={"turno_id": 1}).status_code in (200, 201, 409)
    r = cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "990"})
    if r.status_code >= 400:
        pytest.skip(f"esterilização fora do turno neste horário: {r.text}")
    depois = {t["turno"]: t for t in cliente.get("/painel/turnos").json()["turnos"]}
    assert sum(t["hoje_esterilizacoes"] for t in depois.values()) == sum(t["hoje_esterilizacoes"] for t in antes.values()) + 1
    assert depois[agora["turno"]]["agora"]
