"""Ponto de entrada da API do LabFlow.

Spec: docs/specs/lims/06-api-e-auth.md (v1.0), seção "Arquitetura".
Tarefa: APP-001 (esqueleto). As rotas de login e de leitura chegam nas tarefas seguintes.
"""

from fastapi import FastAPI

app = FastAPI(
    title="LabFlow API",
    description="API do app LabFlow (LIMS do laboratório de microbiologia).",
    version="0.1.0",
)


@app.get("/saude", tags=["sistema"])
def saude() -> dict[str, str]:
    """Responde se a API está no ar. Não toca no banco."""
    return {"status": "ok"}
