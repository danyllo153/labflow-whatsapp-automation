"""Entrega as telas do app (React, pasta app/web) no mesmo endereço da API (APP-012).

Spec: docs/specs/lims/07-app-pwa.md (v1.0), "Direção" e "Visual"; decisão de 22/10/2026 (telas servidas pela própria API).

As telas moram em /app/ e a API continua na raiz (/login, /me, /docs...): recarregar uma tela nunca cai numa rota da API.
Qualquer endereço de /app/ que não seja um arquivo devolve o index.html (o React decide a tela).
A pasta vem de LABFLOW_WEB_DIR (no container: /app/web); sem ela, /app/ responde 404 com um aviso.
"""

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

roteador = APIRouter(include_in_schema=False)

PASTA_PADRAO = Path(__file__).resolve().parent.parent / "web"
# index.html, sw.js e manifest mudam a cada versão: o navegador sempre confere com o servidor.
SEMPRE_CONFERIR = {"index.html", "sw.js", "manifest.webmanifest"}


def pasta_telas() -> Path:
    return Path(os.environ.get("LABFLOW_WEB_DIR", PASTA_PADRAO)).resolve()


def _arquivo(caminho: Path, pasta: Path) -> FileResponse:
    if caminho.name in SEMPRE_CONFERIR:
        cache = "no-cache"
    elif caminho.parent == pasta / "assets":
        cache = "public, max-age=31536000, immutable"  # nome com hash: nunca muda
    else:
        cache = "public, max-age=3600"
    cabecalhos = {"Cache-Control": cache, "X-Content-Type-Options": "nosniff"}
    if caminho.name == "sw.js":
        cabecalhos["Service-Worker-Allowed"] = "/app/"
    return FileResponse(caminho, headers=cabecalhos)


@roteador.get("/")
def raiz() -> RedirectResponse:
    return RedirectResponse("/app/")


@roteador.get("/app")
def app_sem_barra() -> RedirectResponse:
    return RedirectResponse("/app/")


@roteador.get("/app/{caminho:path}")
def telas(caminho: str) -> FileResponse:
    pasta = pasta_telas()
    indice = pasta / "index.html"
    if not indice.is_file():
        raise HTTPException(404, "As telas do app não estão nesta instalação (pasta app/web/dist).")
    pedido = (pasta / caminho).resolve()
    if caminho and pedido.is_relative_to(pasta) and pedido.is_file():
        return _arquivo(pedido, pasta)
    if caminho.startswith("assets/"):
        raise HTTPException(404, "Arquivo não encontrado.")
    return _arquivo(indice, pasta)
