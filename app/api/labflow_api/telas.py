"""Entrega as telas do app (React, pasta app/web) no mesmo endereço da API (APP-012).

Spec: docs/specs/lims/07-app-pwa.md (v1.0), "Direção" e "Visual"; decisão de 22/10/2026 (telas servidas pela própria API).

As telas moram em /app/ e a API continua na raiz (/login, /me, /docs...): recarregar uma tela nunca cai numa rota da API.
Qualquer endereço de /app/ que não seja um arquivo devolve o index.html (o React decide a tela).
A pasta vem de LABFLOW_WEB_DIR (no container: /app/web); sem ela, /app/ responde 404 com um aviso.
"""

import base64
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse, Response

from labflow_api.dependencias import e_lite

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


# Icones da marca: a Lite gera dados\\marca\\icone*.* da logo da instalacao (fora do Git). Existindo, valem no lugar dos neutros de public.
ICONES_DA_MARCA = {"favicon.ico": "icone.ico", "icone-180.png": "icone-180.png", "icone-192.png": "icone-192.png", "icone-512.png": "icone-512.png"}


def _icone_da_marca(caminho: str) -> Response | None:
    pasta = os.environ.get("LABFLOW_MARCA_DIR", "").strip()
    if not pasta:
        return None
    cabecalhos = {"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"}
    if caminho == "icone.svg":  # a aba prefere o SVG: com logo, ele so embrulha o PNG dela
        png = Path(pasta) / "icone.png"
        if not png.is_file() or png.stat().st_size > 1024 * 1024:  # acima de 1 MB: valem os icones neutros
            return None
        dados = base64.b64encode(png.read_bytes()).decode("ascii")
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image href="data:image/png;base64,{dados}" width="64" height="64"/></svg>'
        return Response(svg, media_type="image/svg+xml", headers=cabecalhos)
    nome = ICONES_DA_MARCA.get(caminho)
    arquivo = Path(pasta) / nome if nome else None
    if arquivo is not None and arquivo.is_file() and arquivo.stat().st_size <= 1024 * 1024:
        return FileResponse(arquivo, headers=cabecalhos)
    return None


@roteador.get("/")
def raiz() -> RedirectResponse:
    return RedirectResponse("/app/")


@roteador.get("/app")
def app_sem_barra() -> RedirectResponse:
    return RedirectResponse("/app/")


# Lite (27/11): atende só o próprio PC, então não há "instalar como app" nem service worker (celular não acessa).
SO_NA_COMPLETA = {"manifest.webmanifest", "sw.js"}
LINHAS_DE_APP_INSTALAVEL = ('rel="manifest"', 'rel="apple-touch-icon"')


def _indice_da_lite(indice: Path) -> Response:
    linhas = indice.read_text(encoding="utf-8").splitlines()
    html = "\n".join(l for l in linhas if not any(marca in l for marca in LINHAS_DE_APP_INSTALAVEL))
    return Response(html, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"})


@roteador.get("/app/{caminho:path}")
def telas(caminho: str) -> Response:
    if e_lite() and caminho in SO_NA_COMPLETA:
        raise HTTPException(404, "Arquivo não encontrado.")
    da_marca = _icone_da_marca(caminho)
    if da_marca is not None:
        return da_marca
    pasta = pasta_telas()
    indice = pasta / "index.html"
    if not indice.is_file():
        raise HTTPException(404, "As telas do app não estão nesta instalação (pasta app/web/dist).")
    pedido = (pasta / caminho).resolve()
    if caminho and pedido.is_relative_to(pasta) and pedido.is_file():
        return _indice_da_lite(pedido) if e_lite() and pedido == indice else _arquivo(pedido, pasta)
    if caminho.startswith("assets/"):
        raise HTTPException(404, "Arquivo não encontrado.")
    return _indice_da_lite(indice) if e_lite() else _arquivo(indice, pasta)
