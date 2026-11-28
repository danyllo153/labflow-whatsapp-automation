"""Lite só em 127.0.0.1: Host e Origin conferidos e recusa de subir fora do loopback (sem precisar de banco)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from labflow_api import seguranca_http
from labflow_api.main import app
from tests.clientes import cliente_http

PASTA_API = Path(__file__).resolve().parents[1]


@pytest.fixture
def lite(monkeypatch):
    monkeypatch.setenv("LABFLOW_LITE", "1")


def cliente(host: str) -> TestClient:
    return cliente_http(f"http://{host}")


@pytest.mark.parametrize("host", ["localhost", "localhost:8000", "127.0.0.1", "127.0.0.1:8765", "LOCALHOST:8000"])
def test_lite_aceita_localhost_e_127(lite, host):
    assert cliente(host).get("/saude").status_code == 200


@pytest.mark.parametrize(
    "host", ["evil.example.com", "localhost.evil.com", "127.0.0.1.evil.com", "192.168.0.5:8000", "0.0.0.0:8000", "meu-pc:8000"]
)
def test_lite_host_estranho_leva_400(lite, host):
    c = cliente(host)
    assert c.get("/saude").status_code == 400
    assert c.get("/app/").status_code == 400
    assert c.get("/marca").status_code == 400


def test_lite_sem_host_leva_400(lite):
    assert cliente("localhost").get("/saude", headers={"Host": ""}).status_code == 400


def test_lite_origin_de_outro_site_nao_altera_nada(lite):
    c = cliente("127.0.0.1:8000")
    for cab in ({"Origin": "https://evil.example.com"}, {"Origin": "null"}, {"Sec-Fetch-Site": "cross-site"},
                {"Origin": "http://127.0.0.1:9999"}, {"Origin": "https://127.0.0.1:8000"}, {"Origin": "http://localhost:8000"}):
        assert c.post("/login", json={"usuario": "x", "senha": "y"}, headers=cab).status_code == 403, cab


def test_lite_origin_igual_ao_host_passa_pelo_middleware(lite):
    c = cliente("127.0.0.1:8000")
    # POST em rota que não existe para POST: 405 prova que passou pela barreira sem precisar de banco
    assert c.post("/saude", headers={"Origin": "http://127.0.0.1:8000"}).status_code == 405
    assert c.post("/saude").status_code == 405  # sem Origin (ex.: ferramentas locais) também passa


def test_completa_nao_muda(monkeypatch):
    """Fora do modo Lite o Host e o Origin não são conferidos (o servidor com bot tem nome de domínio)."""
    monkeypatch.delenv("LABFLOW_LITE", raising=False)
    c = cliente("laboratorio.exemplo.test")
    assert c.get("/saude").status_code == 200
    assert c.post("/saude", headers={"Origin": "https://outro.exemplo.test"}).status_code == 405


@pytest.mark.parametrize("endereco", ["0.0.0.0", "", "192.168.0.5", "::", "meu-pc", "localhost.evil.com"])
def test_lite_recusa_subir_fora_do_loopback(endereco):
    with pytest.raises(RuntimeError, match="127.0.0.1"):
        seguranca_http.exigir_loopback_no_modo_lite({"LABFLOW_LITE": "1", "LABFLOW_BIND_HOST": endereco})


def test_lite_recusa_subir_sem_dizer_onde_escuta():
    with pytest.raises(RuntimeError):
        seguranca_http.exigir_loopback_no_modo_lite({"LABFLOW_LITE": "1"})


@pytest.mark.parametrize("endereco", ["127.0.0.1", "localhost", "::1"])
def test_lite_sobe_em_loopback(endereco):
    seguranca_http.exigir_loopback_no_modo_lite({"LABFLOW_LITE": "1", "LABFLOW_BIND_HOST": endereco})


def test_completa_sobe_em_qualquer_endereco():
    seguranca_http.exigir_loopback_no_modo_lite({"LABFLOW_BIND_HOST": "0.0.0.0"})
    seguranca_http.exigir_loopback_no_modo_lite({})


def _importar_main(**env) -> subprocess.CompletedProcess:
    ambiente = {k: v for k, v in os.environ.items() if not k.startswith("LABFLOW_")}
    ambiente.update(env)
    return subprocess.run([sys.executable, "-c", "import labflow_api.main"], cwd=PASTA_API, env=ambiente,
                          capture_output=True, text=True, timeout=120)


def test_main_nao_sobe_no_modo_lite_com_endereco_aberto():
    r = _importar_main(LABFLOW_LITE="1", LABFLOW_BIND_HOST="0.0.0.0")
    assert r.returncode != 0 and "só pode escutar em 127.0.0.1" in r.stderr


def test_main_sobe_no_modo_lite_em_127():
    r = _importar_main(LABFLOW_LITE="1", LABFLOW_BIND_HOST="127.0.0.1")
    assert r.returncode == 0, r.stderr


def test_lite_ip_do_testclient_padrao_nao_vale_mais(lite):
    assert TestClient(app, base_url="http://127.0.0.1:8000").get("/saude").status_code == 403


@pytest.mark.parametrize("ip", ["192.168.0.5", "10.0.0.7", "8.8.8.8"])
def test_lite_ip_de_fora_leva_403_mesmo_com_host_certo(lite, ip):
    c = cliente_http("http://127.0.0.1:8000", ip)
    assert c.get("/saude").status_code == 403
    assert c.post("/saude").status_code == 403


@pytest.mark.parametrize("ip", ["127.0.0.1", "::1"])
def test_lite_ip_loopback_passa(lite, ip):
    assert cliente_http("http://127.0.0.1:8000", ip).get("/saude").status_code == 200


def test_completa_nao_confere_o_ip(monkeypatch):
    monkeypatch.delenv("LABFLOW_LITE", raising=False)
    assert cliente_http("http://127.0.0.1:8000", "192.168.0.5").get("/saude").status_code == 200


def test_variavel_de_hosts_extra_nao_vale_mais(lite, monkeypatch):
    monkeypatch.setenv("LABFLOW_HOSTS_EXTRA", "evil.example.com")
    assert cliente("evil.example.com").get("/saude").status_code == 400
