"""APP-038: branco do dia (controle de meio de cultura e fluxo laminar) e o laudo."""

import io
from datetime import datetime

import pytest
from pypdf import PdfReader

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa, monkeypatch):
    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2026, 10, 22, 10, tzinfo=FUSO))

    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def test_sugere_traco_no_pca_sem_agua_e_menor_que_1_com_agua(cliente, logado):
    logado()
    d = cliente.get("/fluxo-laminar", params={"dia": "2026-10-22"}).json()
    assert d["registro"] is None and (d["sugestao"]["osa"], d["sugestao"]["pca"]) == ("<1", "-")
    assert "nenhuma" in d["motivo_pca"]
    cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["08"], "dia": "2026-10-22", "hora": "07:10"})
    d = cliente.get("/fluxo-laminar", params={"dia": "2026-10-22"}).json()
    assert d["sugestao"]["pca"] == "<1" and d["motivo_pca"].startswith("1 coleta")


def test_preencher_e_o_laudo(cliente, logado):
    logado()
    r = cliente.put("/fluxo-laminar/2026-10-22", json={"capela_ct": "<1", "capela_bl": "<1", "osa": "<1", "pda": "<1", "wort": "", "pca": "<1"})
    assert r.status_code == 200, r.text
    reg = r.json()["registro"]
    assert (reg["wort"], reg["pca"], reg["quem"]) == ("-", "<1", "analista.teste (teste)")
    assert cliente.put("/fluxo-laminar/2026-10-23", json={}).status_code == 422  # amanhã
    pagina = cliente.get("/laudos/fluxo-laminar").json()["paginas"][0]
    assert (pagina["linhas"], pagina["capacidade"]) == (1, 39)
    texto = PdfReader(io.BytesIO(cliente.get(f"/laudos/fluxo-laminar/{pagina['id']}/pdf").content)).pages[0].extract_text()
    assert "22.10.26" in texto and "analista.teste" in texto
