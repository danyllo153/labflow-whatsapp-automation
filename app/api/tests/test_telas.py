"""APP-012: a API entrega as telas em /app/ (07 §Direção; decisão de 22/10/2026)."""

import pytest
from fastapi.testclient import TestClient

from labflow_api.main import app


@pytest.fixture
def telas(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>LabFlow</title>", encoding="utf-8")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "sw.js").write_text("// sw", encoding="utf-8")
    (tmp_path / "manifest.webmanifest").write_text("{}", encoding="utf-8")
    (tmp_path.parent / "segredo.txt").write_text("nao", encoding="utf-8")
    monkeypatch.setenv("LABFLOW_WEB_DIR", str(tmp_path))
    return TestClient(app)


def test_raiz_leva_para_as_telas(telas):
    r = telas.get("/", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/app/"


def test_index_sem_cache_longo(telas):
    r = telas.get("/app/")
    assert r.status_code == 200 and "LabFlow" in r.text
    assert r.headers["cache-control"] == "no-cache"


def test_rota_do_react_devolve_o_index(telas):
    r = telas.get("/app/turno")
    assert r.status_code == 200 and "LabFlow" in r.text


def test_arquivo_versionado_com_cache_longo(telas):
    r = telas.get("/app/assets/index-abc123.js")
    assert r.status_code == 200
    assert "immutable" in r.headers["cache-control"]


def test_asset_que_nao_existe_da_404(telas):
    assert telas.get("/app/assets/nao-existe.js").status_code == 404


def test_service_worker_limitado_a_app(telas):
    r = telas.get("/app/sw.js")
    assert r.headers["service-worker-allowed"] == "/app/"
    assert r.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("caminho", ["/app/../segredo.txt", "/app/%2e%2e/segredo.txt", "/app/..%2fsegredo.txt"])
def test_nao_sai_da_pasta_das_telas(telas, caminho):
    r = telas.get(caminho)
    assert r.text != "nao"
    assert r.status_code == 404 or "LabFlow" in r.text  # cai no index do app ou em 404, nunca no arquivo de fora


def test_sem_telas_instaladas_responde_404(tmp_path, monkeypatch):
    monkeypatch.setenv("LABFLOW_WEB_DIR", str(tmp_path / "vazia"))
    assert TestClient(app).get("/app/").status_code == 404


def test_rotas_da_api_continuam_na_raiz(telas):
    assert telas.get("/saude").json() == {"status": "ok"}


@pytest.mark.parametrize(("valor", "esperado"), [(None, True), ("1", True), ("0", False)])
def test_ambiente_demonstracao(monkeypatch, valor, esperado):
    if valor is None:
        monkeypatch.delenv("LABFLOW_DEMONSTRACAO", raising=False)
    else:
        monkeypatch.setenv("LABFLOW_DEMONSTRACAO", valor)
    assert TestClient(app).get("/ambiente").json() == {"demonstracao": esperado}
