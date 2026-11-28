"""Segurança HTTP do modo Lite: só 127.0.0.1 (decisão do Danyllo, 27/11).

A LabFlow Lite roda num PC só e é aberta só nesse PC. Por isso, no modo Lite (LABFLOW_LITE=1):
- o app se recusa a SUBIR se não souber que escuta só em loopback (LABFLOW_BIND_HOST = 127.0.0.1, localhost ou ::1);
- Host fora de localhost/127.0.0.1 leva 400 (barra DNS rebinding: um site mau que aponta o próprio nome para 127.0.0.1);
- Origin de outro endereço (ou Sec-Fetch-Site cross-site) em pedido que altera dados leva 403 (barra CSRF).
A versão Completa (servidor com bot, nomes de domínio) não passa por nada disto: o comportamento dela não muda.
"""

import os
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from labflow_api.rotas_admin import e_lite

HOSTS_PERMITIDOS = frozenset({"localhost", "127.0.0.1"})
ENDERECOS_LOOPBACK = frozenset({"127.0.0.1", "localhost", "::1"})
CLIENTES_LOOPBACK = frozenset({"127.0.0.1", "::1"})  # IP de quem se conecta (request.client.host)
METODOS_QUE_ALTERAM = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def hosts_permitidos() -> frozenset[str]:
    """Só localhost e 127.0.0.1. Nenhuma variável de ambiente alarga a lista (os testes ajustam HOSTS_PERMITIDOS com monkeypatch)."""
    return HOSTS_PERMITIDOS


def exigir_loopback_no_modo_lite(ambiente: dict | None = None) -> None:
    """No modo Lite o app só sobe se quem o liga disse que escuta em loopback. Sem a variável, também recusa: sem senha,
    escutar fora do 127.0.0.1 deixaria qualquer PC da rede entrar escolhendo um nome."""
    env = os.environ if ambiente is None else ambiente
    if env.get("LABFLOW_LITE", "0") != "1":
        return
    endereco = env.get("LABFLOW_BIND_HOST", "").strip().lower()
    if endereco not in ENDERECOS_LOOPBACK:
        raise RuntimeError(
            "O LabFlow no modo Lite só pode escutar em 127.0.0.1 (este PC). "
            f"Endereço informado: {endereco or 'nenhum'}. O app não sobe assim."
        )


def _nome_do_host(valor: str) -> str:
    return (urlsplit("//" + valor.strip()).hostname or "").lower()


def _recusa(codigo: int, mensagem: str) -> JSONResponse:
    return JSONResponse({"detail": mensagem}, status_code=codigo)


def _origem_e_deste_pedido(request: Request, origem: str) -> bool:
    """O Origin tem de ter o mesmo esquema, host e porta do Host do próprio pedido (e o host ser localhost/127.0.0.1)."""
    try:
        o = urlsplit(origem)
        h = urlsplit("//" + request.headers.get("host", "").strip())
        padrao = 443 if request.url.scheme == "https" else 80
        porta_o = o.port or (443 if o.scheme == "https" else 80)
        porta_h = h.port or padrao
    except ValueError:
        return False
    return (
        o.scheme == request.url.scheme
        and (o.hostname or "").lower() == (h.hostname or "").lower() != ""
        and (o.hostname or "").lower() in hosts_permitidos()
        and porta_o == porta_h
    )


def ligar(app: FastAPI) -> None:
    @app.middleware("http")
    async def _host_e_origin_da_lite(request: Request, call_next):
        if not e_lite():
            return await call_next(request)
        try:
            host = _nome_do_host(request.headers.get("host", ""))
        except ValueError:
            host = ""
        cliente = request.client.host if request.client else ""
        if cliente not in CLIENTES_LOOPBACK:  # defesa em profundidade: mesmo se algo escutar fora do loopback
            return _recusa(403, "Acesso só neste PC.")
        if host not in hosts_permitidos():
            return _recusa(400, "Endereço não permitido.")
        if request.method in METODOS_QUE_ALTERAM:
            origem = request.headers.get("origin")
            if origem is not None and not _origem_e_deste_pedido(request, origem):
                return _recusa(403, "Origem não permitida.")
            if request.headers.get("sec-fetch-site", "").lower() == "cross-site":
                return _recusa(403, "Origem não permitida.")
        return await call_next(request)
