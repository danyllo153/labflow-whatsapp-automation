"""Marca da instalação (LabFlow Lite, spec 12): nome, logo, cores e um estilo extra, escolhidos por quem instala.

A pasta vem de LABFLOW_MARCA_DIR (a Lite copia `dados\\marca` do G: para o PC ao abrir). Sem a variável, ou com a pasta
vazia, o app fica com a marca do LabFlow: o servidor de demonstração não muda. Nada da marca vai para o repositório.

Arquivos da pasta (todos opcionais):
- marca.json  {"nome": "...", "cor_principal": "#1f3bb3", "cor_secundaria": "#1e283d"}
- logo.png    PNG de até 2 MB
- estilo.css  CSS extra, carregado por último, de até 200 KB

Lido uma vez, quando o app liga ("ao abrir"); o que estiver errado é ignorado com um aviso no log, nunca impede o app de abrir.
Rotas sem login, porque a tela de entrar também mostra a marca.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

aviso = logging.getLogger("labflow.marca")

NOME_PADRAO = "LabFlow"
TAMANHO_NOME = 60
LOGO_MAXIMO = 2 * 1024 * 1024
ESTILO_MAXIMO = 200 * 1024
ASSINATURA_PNG = b"\x89PNG\r\n\x1a\n"
COR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


@dataclass(frozen=True)
class MarcaCarregada:
    nome: str = NOME_PADRAO
    cor_principal: str | None = None
    cor_secundaria: str | None = None
    logo: bytes | None = None
    estilo: str | None = None


def _cor(valor: object, campo: str) -> str | None:
    if valor is None or valor == "":
        return None
    if isinstance(valor, str) and COR.match(valor.strip()):
        return valor.strip().lower()
    aviso.warning("marca.json: %s inválida (%r); use #rrggbb. Fica a cor do LabFlow.", campo, valor)
    return None


def carregar(pasta: Path | None) -> MarcaCarregada:
    """Lê a pasta da marca; cada arquivo com problema é ignorado sozinho (o resto vale)."""
    if pasta is None or not pasta.is_dir():
        return MarcaCarregada()
    nome, principal, secundaria, logo, estilo = NOME_PADRAO, None, None, None, None

    arquivo = pasta / "marca.json"
    if arquivo.is_file():
        try:
            dados = json.loads(arquivo.read_text(encoding="utf-8-sig"))
            if not isinstance(dados, dict):
                raise ValueError("o arquivo precisa ser um objeto { ... }")
            texto = str(dados.get("nome") or "").strip()
            if texto:
                nome = texto[:TAMANHO_NOME]
            principal = _cor(dados.get("cor_principal"), "cor_principal")
            secundaria = _cor(dados.get("cor_secundaria"), "cor_secundaria")
        except (ValueError, OSError) as erro:
            aviso.warning("marca.json ignorado: %s", erro)

    arquivo = pasta / "logo.png"
    if arquivo.is_file():
        conteudo = arquivo.read_bytes()
        if len(conteudo) > LOGO_MAXIMO:
            aviso.warning("logo.png ignorado: maior que 2 MB.")
        elif not conteudo.startswith(ASSINATURA_PNG):
            aviso.warning("logo.png ignorado: não é um PNG.")
        else:
            logo = conteudo

    arquivo = pasta / "estilo.css"
    if arquivo.is_file():
        conteudo = arquivo.read_bytes()
        if len(conteudo) > ESTILO_MAXIMO:
            aviso.warning("estilo.css ignorado: maior que 200 KB.")
        else:
            estilo = conteudo.decode("utf-8-sig", errors="replace")

    return MarcaCarregada(nome, principal, secundaria, logo, estilo)


@lru_cache(maxsize=1)
def marca() -> MarcaCarregada:
    pasta = os.environ.get("LABFLOW_MARCA_DIR", "").strip()
    return carregar(Path(pasta) if pasta else None)


class Marca(BaseModel):
    nome: str
    cor_principal: str | None
    cor_secundaria: str | None
    logo: bool
    estilo: bool


roteador = APIRouter(prefix="/marca", tags=["sistema"])
SEM_CACHE = {"Cache-Control": "no-cache"}  # muda só quando o app é reaberto, mas o navegador confere


@roteador.get("", response_model=Marca)
def ver_marca(resposta: Response) -> Marca:
    m = marca()
    resposta.headers.update(SEM_CACHE)
    return Marca(nome=m.nome, cor_principal=m.cor_principal, cor_secundaria=m.cor_secundaria, logo=m.logo is not None, estilo=m.estilo is not None)


@roteador.get("/logo.png")
def logo() -> Response:
    m = marca()
    if m.logo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sem logo nesta instalação.")
    return Response(m.logo, media_type="image/png", headers=SEM_CACHE)


@roteador.get("/estilo.css")
def estilo() -> Response:
    m = marca()
    if m.estilo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sem estilo extra nesta instalação.")
    return Response(m.estilo, media_type="text/css; charset=utf-8", headers=SEM_CACHE)
