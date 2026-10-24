"""APP-055: o gráfico da semana e o cartão das folhas dos laudos (visual repaginado). Dados fictícios."""

from datetime import datetime

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
    cliente.post("/aguas/superficies", json={"tipo": "Linha", "pontos": ["4", "6"], "dia": datetime.now(FUSO).date().isoformat(), "hora": "07:10"})
    folhas = {f["laudo"]: f for f in cliente.get("/painel/folhas").json()}
    linha = folhas["superficies-Linha"]
    assert (linha["caminho"], linha["capacidade"], linha["cheias"]) == ("/paginas/linhas", 31, 0)
    assert linha["linhas"] >= 2
