"""Ponto de entrada da API do LabFlow.

Spec: docs/specs/lims/06-api-e-auth.md (v1.0), seção "Arquitetura".
Tarefas: APP-001 (esqueleto), APP-004 (login e sessão), APP-005 (permissões), APP-006 (senha provisória), APP-007 (pessoas), APP-008 (páginas Coletas e Recebimento), APP-009 (Excel), APP-010 (pendências de hoje).
"""

from fastapi import FastAPI

from labflow_api.rotas_admin import roteador as roteador_admin
from labflow_api.rotas_login import roteador as roteador_login
from labflow_api.rotas_paginas import roteador as roteador_paginas
from labflow_api.rotas_pendencias import roteador as roteador_pendencias

app = FastAPI(
    title="LabFlow API",
    description="API do app LabFlow (LIMS do laboratório de microbiologia).",
    version="0.1.0",
)


@app.get("/saude", tags=["sistema"])
def saude() -> dict[str, str]:
    """Responde se a API está no ar. Não toca no banco."""
    return {"status": "ok"}


app.include_router(roteador_login)
app.include_router(roteador_admin)
app.include_router(roteador_paginas)
app.include_router(roteador_pendencias)
