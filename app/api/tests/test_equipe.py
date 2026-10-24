"""APP-033: central do turno (quem está no turno, linha do tempo e atividades realizadas escritas à mão)."""

from datetime import datetime

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
def entrar(cliente, criar_pessoa, agora):
    def _entrar(usuario, cargo="Analista", turno_id=1):
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        if turno_id:
            assert cliente.post("/turno/entrar", json={"turno_id": turno_id}).status_code == 200
        return uid

    return _entrar


def test_equipe_conta_quem_esta_no_turno_e_quem_saiu(cliente, entrar, agora):
    agora(em(22, 9, 0))
    entrar("ana.teste")
    agora(em(22, 9, 15))
    entrar("bia.teste")
    agora(em(22, 11, 0))
    assert cliente.post("/turno/sair").status_code == 200
    equipe = cliente.get("/turno/equipe").json()
    assert (equipe["turno"], equipe["dia"], equipe["no_turno"]) == ("Manhã", "2026-10-22", 1)
    assert [(p["entrada"], p["saida"], p["sou_eu"]) for p in equipe["pessoas"]] == [("09:00", None, False), ("09:15", "11:00", True)]


def test_equipe_abre_antes_do_checkin(cliente, entrar, agora):
    agora(em(22, 9))
    entrar("ana.teste")
    entrar("carla.teste", turno_id=None)  # ainda não entrou: vê o turno de agora
    equipe = cliente.get("/turno/equipe").json()
    assert equipe["no_turno"] == 1 and not any(p["sou_eu"] for p in equipe["pessoas"])


def test_escrever_atividade_realizada_com_quem_e_hora_e_excluir(cliente, entrar, agora):
    agora(em(22, 9))
    entrar("ana.teste")
    r = cliente.post("/turno/registros", json={"texto": "  Conferência   do estoque de meios "})
    assert r.status_code == 201, r.text
    item = r.json()["itens"][0]
    assert (item["tipo"], item["texto"], item["pode_excluir"]) == ("livre", "Conferência do estoque de meios", True)
    assert item["quem"] and item["quando"]
    assert cliente.post("/turno/registros", json={"texto": "   "}).status_code == 422
    assert cliente.post("/turno/registros", json={"texto": "x" * 201}).status_code == 422
    # outra pessoa vê a linha, mas não exclui; o Admin exclui
    entrar("bia.teste")
    vista = cliente.get("/turno/registros").json()["itens"][0]
    assert vista["texto"] == "Conferência do estoque de meios" and vista["pode_excluir"] is False
    assert cliente.delete(f"/turno/registros/{item['id']}").status_code == 403
    entrar("admin.teste", cargo="Admin", turno_id=1)
    assert cliente.delete(f"/turno/registros/{item['id']}").status_code == 200
    assert cliente.get("/turno/registros").json()["itens"] == []
    assert cliente.delete(f"/turno/registros/{item['id']}").status_code == 404


def test_linha_do_tempo_junta_esterilizacao_e_atividades_fixas(cliente, entrar, agora):
    agora(em(22, 9))
    entrar("ana.teste")
    assert cliente.post("/esterilizacao", json={"tipo": "Ponteira", "ciclo": "102"}).status_code == 201
    cliente.post("/turno/registros", json={"texto": "Troca de ponteiras"})
    itens = cliente.get("/turno/registros").json()["itens"]
    assert [i["tipo"] for i in itens] == ["livre", "esterilizacao"]
    assert itens[1]["texto"] == "Esterilização ponteira · ciclo 102"


def test_coletor_nao_ve_a_linha_do_tempo_nem_escreve(cliente, entrar, agora):
    agora(em(22, 9))
    entrar("caio.teste", cargo="Coletor")
    r = cliente.get("/turno/registros").json()
    assert r["itens"] == [] and r["pode_escrever"] is False
    assert cliente.post("/turno/registros", json={"texto": "x"}).status_code == 403


def test_relatorio_do_turno_traz_as_atividades_realizadas(cliente, entrar, agora):
    agora(em(22, 9))
    entrar("ana.teste")
    cliente.post("/turno/registros", json={"texto": "Limpeza da capela"})
    realizadas = cliente.get("/turno/relatorio").json()["realizadas"]
    assert [r["texto"] for r in realizadas] == ["Limpeza da capela"] and realizadas[0]["quem"] and realizadas[0]["quando"]
