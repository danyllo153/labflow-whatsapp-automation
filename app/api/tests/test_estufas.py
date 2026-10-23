"""APP-027: temperatura das estufas (07 v1.0, "7.1"; 08 A8)."""

from datetime import datetime
from decimal import Decimal

import pytest

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


def em(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def agora(monkeypatch):
    def _fixar(quando: datetime):
        monkeypatch.setattr(rotas_turno, "_agora", lambda con: quando)

    return _fixar


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Operador", usuario=None):
        usuario = usuario or f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


@pytest.fixture
def faixas(conexao):
    """Faixas fictícias só deste teste (o banco de teste pode ou não ter o seed)."""
    conexao.execute("DELETE FROM app.faixas_estufa")
    conexao.execute(
        "INSERT INTO app.faixas_estufa (estufa_id, minimo, maximo, vigente_desde) "
        "SELECT id, 35.0, 37.0, DATE '2026-01-01' FROM app.estufas WHERE NOT auxiliar"
    )
    conexao.execute("INSERT INTO app.faixas_estufa (estufa_id, minimo, maximo, vigente_desde) VALUES (1, 30.0, 32.0, DATE '2026-10-23')")


def _estufa(corpo, numero):
    return next(e for e in corpo["estufas"] if e["id"] == numero)


def test_onze_estufas_pendentes_no_comeco_do_turno_com_a_faixa_vigente(cliente, logado, agora, faixas):
    agora(em(22, 9))
    logado()
    corpo = cliente.get("/estufas").json()
    assert [e["id"] for e in corpo["estufas"]] == [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]
    assert corpo["resumo"] == {"total": 11, "conferidas": 0, "nao_ok": 0, "pendentes": 11}
    assert all(e["status"] == "Pendente" for e in corpo["estufas"])
    assert _estufa(corpo, 6)["faixa"] is None and _estufa(corpo, 6)["auxiliar"] is True  # a 06 é auxiliar: sem faixa
    assert Decimal(_estufa(corpo, 3)["faixa"]["minimo"]) == Decimal("35.0")
    assert Decimal(_estufa(corpo, 1)["faixa"]["minimo"]) == Decimal("35.0")  # a faixa nova só vale a partir de 23/10
    agora(em(23, 9))
    assert Decimal(_estufa(cliente.get("/estufas").json(), 1)["faixa"]["minimo"]) == Decimal("30.0")


def test_duas_leituras_ok_deixam_a_estufa_ok(cliente, logado, agora, faixas):
    agora(em(22, 9))
    logado()
    r = cliente.put("/estufas/3", json={"leitura": "Supervisório", "ok": True})
    assert r.status_code == 200, r.text
    assert _estufa(r.json(), 3)["status"] == "Pendente"  # falta a outra leitura
    r = cliente.put("/estufas/3", json={"leitura": "Field chart", "ok": True, "temperatura": 36.5})  # Ok não guarda número
    e = _estufa(r.json(), 3)
    assert e["status"] == "Ok" and e["field_chart"]["temperatura"] is None and e["diferenca"] is None
    assert e["supervisorio"]["quem"] and e["supervisorio"]["quando"]
    assert r.json()["resumo"] == {"total": 11, "conferidas": 1, "nao_ok": 0, "pendentes": 10}


def test_nao_ok_pede_a_temperatura_e_a_diferenca_so_com_as_duas(cliente, logado, agora, faixas):
    agora(em(22, 9))
    logado()
    sem = cliente.put("/estufas/4", json={"leitura": "Supervisório", "ok": False})
    assert sem.status_code == 422 and "temperatura" in sem.json()["detail"]
    r = cliente.put("/estufas/4", json={"leitura": "Supervisório", "ok": False, "temperatura": 43.8, "observacao": "  porta aberta "})
    e = _estufa(r.json(), 4)
    assert e["status"] == "Não ok" and Decimal(e["supervisorio"]["temperatura"]) == Decimal("43.8")
    assert e["supervisorio"]["observacao"] == "porta aberta" and e["diferenca"] is None
    r = cliente.put("/estufas/4", json={"leitura": "Field chart", "ok": False, "temperatura": 45.0})
    e = _estufa(r.json(), 4)
    assert Decimal(e["diferenca"]) == Decimal("1.2")  # field chart - supervisório
    assert r.json()["resumo"]["nao_ok"] == 1 and r.json()["resumo"]["conferidas"] == 1


def test_conferir_de_novo_atualiza(cliente, logado, agora, faixas, conexao):
    agora(em(22, 9))
    logado()
    cliente.put("/estufas/2", json={"leitura": "Supervisório", "ok": False, "temperatura": 40.0})
    r = cliente.put("/estufas/2", json={"leitura": "Supervisório", "ok": True})
    assert _estufa(r.json(), 2)["supervisorio"]["ok"] is True
    assert conexao.execute("SELECT count(*) FROM app.leituras_estufa WHERE estufa_id = 2").fetchone()[0] == 1


def test_cada_turno_tem_a_sua_conferencia(cliente, logado, agora, faixas):
    logado()
    agora(em(22, 9))
    cliente.put("/estufas/3", json={"leitura": "Supervisório", "ok": True})
    agora(em(22, 17))  # Tarde: tudo pendente de novo
    corpo = cliente.get("/estufas").json()
    assert corpo["turno"] == "Tarde" and corpo["resumo"]["conferidas"] == 0
    assert _estufa(corpo, 3)["supervisorio"] is None


def test_estufa_que_nao_existe_e_leitura_invalida(cliente, logado, agora, faixas):
    agora(em(22, 9))
    logado()
    assert cliente.put("/estufas/5", json={"leitura": "Supervisório", "ok": True}).status_code == 404  # não existe a 05
    assert cliente.put("/estufas/3", json={"leitura": "Painel", "ok": True}).status_code == 422
    assert cliente.put("/estufas/3", json={"leitura": "Supervisório", "ok": False, "temperatura": 999}).status_code == 422


def test_nao_ok_entra_nas_ocorrencias_do_relatorio_do_turno(cliente, logado, agora, faixas):
    agora(em(22, 9))
    logado()
    cliente.put("/estufas/4", json={"leitura": "Field chart", "ok": False, "temperatura": 43.8, "observacao": "porta aberta"})
    cliente.put("/estufas/7", json={"leitura": "Supervisório", "ok": True})
    rel = cliente.get("/turno/relatorio", params={"turno_id": 1, "dia": "2026-10-22"}).json()
    assert len(rel["estufas_nao_ok"]) == 1
    assert rel["estufas_nao_ok"][0].startswith("Estufa 04: field chart Não ok, 43,8 °C (porta aberta) · ")


def test_consultor_ve_e_nao_confere(cliente, logado, agora, faixas):
    agora(em(22, 9))
    logado("Consultor")
    assert cliente.get("/estufas").json()["pode_registrar"] is False
    assert cliente.put("/estufas/3", json={"leitura": "Supervisório", "ok": True}).status_code == 403


@pytest.mark.checkin
def test_sem_check_in_nao_ve_nem_confere(cliente, logado):
    logado()
    assert cliente.get("/estufas").status_code == 403
    assert cliente.put("/estufas/3", json={"leitura": "Supervisório", "ok": True}).status_code == 403
