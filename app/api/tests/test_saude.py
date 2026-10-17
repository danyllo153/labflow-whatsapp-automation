from fastapi.testclient import TestClient

from labflow_api.main import app

cliente = TestClient(app)


def test_saude_responde_ok():
    resposta = cliente.get("/saude")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


def test_documentacao_existe():
    # A documentação automática (/docs) é um dos motivos da escolha do FastAPI (06, Arquitetura).
    assert cliente.get("/docs").status_code == 200
