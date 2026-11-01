"""Marca da instalação (Lite, spec 12): pasta com marca.json, logo.png e estilo.css. Valores fictícios."""

import json

import pytest
from fastapi.testclient import TestClient

from labflow_api import marca
from labflow_api.main import app

PNG_MINIMO = marca.ASSINATURA_PNG + b"\x00" * 16


@pytest.fixture
def pasta(tmp_path, monkeypatch):
    monkeypatch.setenv("LABFLOW_MARCA_DIR", str(tmp_path))
    marca.marca.cache_clear()
    yield tmp_path
    marca.marca.cache_clear()


def test_sem_pasta_fica_o_labflow(monkeypatch):
    monkeypatch.delenv("LABFLOW_MARCA_DIR", raising=False)
    marca.marca.cache_clear()
    resposta = TestClient(app).get("/marca")
    assert resposta.status_code == 200
    assert resposta.json() == {"nome": "LabFlow", "cor_principal": None, "cor_secundaria": None, "logo": False, "estilo": False}
    assert TestClient(app).get("/marca/logo.png").status_code == 404
    assert TestClient(app).get("/marca/estilo.css").status_code == 404
    marca.marca.cache_clear()


def test_marca_completa(pasta):
    (pasta / "marca.json").write_text(
        json.dumps({"nome": "Laboratório Exemplo", "cor_principal": "#0A7C4A", "cor_secundaria": "#123"}), encoding="utf-8"
    )
    (pasta / "logo.png").write_bytes(PNG_MINIMO)
    (pasta / "estilo.css").write_text(".marca-nome { letter-spacing: 1px; }", encoding="utf-8")
    cliente = TestClient(app)
    assert cliente.get("/marca").json() == {
        "nome": "Laboratório Exemplo", "cor_principal": "#0a7c4a", "cor_secundaria": "#123", "logo": True, "estilo": True,
    }
    logo = cliente.get("/marca/logo.png")
    assert logo.headers["content-type"] == "image/png" and logo.content == PNG_MINIMO
    assert "letter-spacing" in cliente.get("/marca/estilo.css").text


def test_cada_arquivo_errado_e_ignorado_sozinho(pasta):
    (pasta / "marca.json").write_text(json.dumps({"nome": "  Exemplo  ", "cor_principal": "verde", "cor_secundaria": "#1e283d"}))
    (pasta / "logo.png").write_bytes(b"GIF89a nao e png")
    m = marca.carregar(pasta)
    assert (m.nome, m.cor_principal, m.cor_secundaria, m.logo) == ("Exemplo", None, "#1e283d", None)


def test_json_quebrado_nao_impede_o_resto(pasta):
    (pasta / "marca.json").write_text("{ nome: sem aspas }")
    (pasta / "logo.png").write_bytes(PNG_MINIMO)
    m = marca.carregar(pasta)
    assert m.nome == "LabFlow" and m.logo == PNG_MINIMO


def test_limites_de_tamanho(pasta):
    (pasta / "marca.json").write_text(json.dumps({"nome": "X" * 200}))
    (pasta / "logo.png").write_bytes(PNG_MINIMO + b"\x00" * marca.LOGO_MAXIMO)
    (pasta / "estilo.css").write_bytes(b"a" * (marca.ESTILO_MAXIMO + 1))
    m = marca.carregar(pasta)
    assert len(m.nome) == marca.TAMANHO_NOME and m.logo is None and m.estilo is None
