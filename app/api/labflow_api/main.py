"""Ponto de entrada da API do LabFlow.

Spec: docs/specs/lims/06-api-e-auth.md (v1.0), seção "Arquitetura".
Tarefas: APP-001 (esqueleto), APP-004 (login e sessão), APP-005 (permissões), APP-006 (senha provisória).
"""

from fastapi import FastAPI

from labflow_api.rotas_admin import roteador as roteador_admin
from labflow_api.rotas_login import roteador as roteador_login

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
