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
    assert TestClient(app).get("/ambiente").json() == {"demonstracao": esperado, "lite": False}


def test_icones_da_marca_valem_no_lugar_dos_neutros(telas, tmp_path, monkeypatch):
    (tmp_path / "favicon.ico").write_bytes(b"neutro")
    assert telas.get("/app/favicon.ico").content == b"neutro"
    marca = tmp_path / "marca"
    marca.mkdir()
    (marca / "icone.ico").write_bytes(b"da-marca")
    (marca / "icone.png").write_bytes(b"\x89PNG")
    monkeypatch.setenv("LABFLOW_MARCA_DIR", str(marca))
    assert telas.get("/app/favicon.ico").content == b"da-marca"
    svg = telas.get("/app/icone.svg")
    assert svg.status_code == 200 and "image/svg+xml" in svg.headers["content-type"] and "data:image/png;base64" in svg.text


def test_icone_da_marca_acima_de_1_mb_cai_no_neutro(telas, tmp_path, monkeypatch):
    (tmp_path / "icone.svg").write_text("<svg>neutro</svg>", encoding="utf-8")
    marca = tmp_path / "marca"
    marca.mkdir()
    (marca / "icone.png").write_bytes(b"0" * (1024 * 1024 + 1))
    monkeypatch.setenv("LABFLOW_MARCA_DIR", str(marca))
    assert telas.get("/app/icone.svg").text == "<svg>neutro</svg>"


# ---------------------------------------------------------------- Lite: sem versão de celular (27/11)
INDICE_COM_APP = (
    '<!doctype html><title>LabFlow</title>\n<link rel="manifest" href="/app/manifest.webmanifest" />\n'
    '<link rel="icon" href="/app/icone.svg" />\n<link rel="apple-touch-icon" href="/app/icone-192.png" />\n'
)


def test_completa_continua_instalavel(telas, tmp_path):
    (tmp_path / "index.html").write_text(INDICE_COM_APP, encoding="utf-8")
    assert 'rel="manifest"' in telas.get("/app/").text and 'rel="apple-touch-icon"' in telas.get("/app/turno").text
    assert telas.get("/app/manifest.webmanifest").status_code == 200
    assert telas.get("/app/sw.js").status_code == 200


def test_lite_nao_e_instalavel_como_app(telas, tmp_path, monkeypatch):
    monkeypatch.setenv("LABFLOW_LITE", "1")
    (tmp_path / "index.html").write_text(INDICE_COM_APP, encoding="utf-8")
    c = TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000))
    for caminho in ("/app/", "/app/index.html", "/app/turno"):
        r = c.get(caminho)
        assert r.status_code == 200 and "LabFlow" in r.text, caminho
        assert 'rel="manifest"' not in r.text and 'rel="apple-touch-icon"' not in r.text, caminho
        assert 'rel="icon"' in r.text  # o ícone da aba fica
    assert c.get("/app/manifest.webmanifest").status_code == 404
    assert c.get("/app/sw.js").status_code == 404
    assert c.get("/app/assets/index-abc123.js").status_code == 200  # o resto das telas segue igual
