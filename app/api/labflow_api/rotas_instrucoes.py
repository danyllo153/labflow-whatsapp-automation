"""Instrução de trabalho e vídeo de cada app de análise (Fase E, E9).

Spec: rumo-do-app.md, "Fase E". Tarefa: APP-062. Tabela da migration 071.
Regras (decididas com o Danyllo em 24/10): o Admin escreve a instrução no próprio app e ela fica só no banco (o método da
empresa não vai para o repositório); os vídeos virão depois, feitos por IA a partir da instrução, e entram como link.
Cada gravação é uma versão nova; a tela mostra a última e quantas houve.
"""

from datetime import datetime
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/analises/instrucoes", tags=["apps de análise (Fase E)"])

App = Literal["recebimento-fcoj", "tanques", "testes", "drops", "embarque-fcoj", "recebimento-nfc", "desvios"]


class Instrucao(BaseModel):
    app: str
    texto: str  # vazio enquanto o Admin não escreveu
    video_url: str | None
    versao: int  # 0 = ainda não escrita
    escrita_por: str | None
    escrita_em: str | None  # dd/mm/aaaa HH:MM
    pode_editar: bool


class NovaInstrucao(BaseModel):
    texto: str = Field(max_length=20000)
    video_url: str | None = Field(default=None, max_length=500)

    @field_validator("texto")
    @classmethod
    def _texto(cls, v: str) -> str:
        return v.strip()

    @field_validator("video_url")
    @classmethod
    def _video(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        if not v.startswith("https://") or any(c.isspace() for c in v):
            raise ValueError("O link do vídeo precisa começar com https://")
        return v


ULTIMA_SQL = """
SELECT i.texto, i.video_url, i.versao, coalesce(u.nome, c.usuario), i.escrita_em
FROM app.instrucoes i LEFT JOIN usuarios u ON u.id = i.escrita_por LEFT JOIN app.credenciais c ON c.usuario_id = i.escrita_por
WHERE i.app = %s ORDER BY i.versao DESC LIMIT 1
"""


def _instrucao(con: psycopg.Connection, app: str, pessoa: PessoaLogada) -> Instrucao:
    linha = con.execute(ULTIMA_SQL, (app,)).fetchone()
    editar = pode(pessoa.cargo, "configurar_turnos")
    if linha is None:
        return Instrucao(app=app, texto="", video_url=None, versao=0, escrita_por=None, escrita_em=None, pode_editar=editar)
    texto, video, versao, por, em = linha
    em_txt = em.astimezone(FUSO).strftime("%d/%m/%Y %H:%M") if isinstance(em, datetime) else None
    return Instrucao(app=app, texto=texto, video_url=video, versao=versao, escrita_por=por, escrita_em=em_txt, pode_editar=editar)


@roteador.get("/{app}", response_model=Instrucao)
def ver(
    app: App, pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)
) -> Instrucao:
    return _instrucao(con, app, pessoa)


@roteador.put("/{app}", response_model=Instrucao)
def escrever(
    app: App,
    nova: NovaInstrucao,
    pessoa: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Instrucao:
    """O Admin grava a instrução (e o link do vídeo); igual à última, não cria versão nova."""
    atual = _instrucao(con, app, pessoa)
    if atual.versao and atual.texto == nova.texto and atual.video_url == nova.video_url:
        return atual
    if not nova.texto and not nova.video_url:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva a instrução ou cole o link do vídeo.")
    con.execute(
        "INSERT INTO app.instrucoes (app, versao, texto, video_url, escrita_por, escrita_em) VALUES (%s, %s, %s, %s, %s, clock_timestamp())",
        (app, atual.versao + 1, nova.texto, nova.video_url, pessoa.usuario_id),
    )
    return _instrucao(con, app, pessoa)
