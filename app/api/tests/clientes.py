"""Cliente de teste que escolhe o IP de quem chama, igual nas versões do starlette (0.41 não tem TestClient(client=...))."""

from fastapi.testclient import TestClient

from labflow_api.main import app


def cliente_http(base_url: str, ip: str = "127.0.0.1", porta: int = 50000) -> TestClient:
    """TestClient cujo `request.client` é (ip, porta): o app é embrulhado numa camada que troca o `scope["client"]`.
    As trocas de dependência (`app.dependency_overrides`) continuam valendo, pois o app é o mesmo."""

    async def com_ip(scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            scope = {**scope, "client": (ip, porta)}
        await app(scope, receive, send)

    return TestClient(com_ip, base_url=base_url)
