"""Ponto de entrada da API do LabFlow.

Spec: docs/specs/lims/06-api-e-auth.md (v1.0), seção "Arquitetura".
Tarefas: APP-001 (esqueleto), APP-004 (login e sessão), APP-005 (permissões), APP-006 (senha provisória), APP-007 (pessoas), APP-008 (páginas Coletas e Recebimento), APP-009 (Excel), APP-010 (pendências de hoje), APP-012 (telas em /app/), APP-017 (Tanques, Drops e Desvios), APP-018 (Embarque, TAB e Coliformes, Recebimento NFC, Visão geral), APP-019b (Tanques terra e Navios com status).
"""

import os

from fastapi import FastAPI

from labflow_api.rotas_admin import roteador as roteador_admin
from labflow_api.rotas_admin_turnos import roteador as roteador_admin_turnos
from labflow_api.rotas_atividades import roteador as roteador_atividades
from labflow_api.rotas_estufas import roteador as roteador_estufas
from labflow_api.rotas_coletas import roteador as roteador_coletas
from labflow_api.rotas_equipe import roteador as roteador_equipe
from labflow_api.rotas_esterilizacao import roteador as roteador_esterilizacao
from labflow_api.rotas_laudo import roteador as roteador_laudo
from labflow_api.rotas_login import roteador as roteador_login
from labflow_api.rotas_paginas import roteador as roteador_paginas
from labflow_api.laudos import roteador as roteador_laudos
from labflow_api.rotas_aguas import roteador as roteador_aguas
from labflow_api.rotas_fluxo_laminar import roteador as roteador_fluxo_laminar
from labflow_api.rotas_meios import roteador as roteador_meios
from labflow_api.rotas_material_asseptico import roteador as roteador_material_asseptico
from labflow_api.rotas_recebimento import roteador as roteador_recebimento
from labflow_api.rotas_navios_tanques import roteador as roteador_navios_tanques
from labflow_api.rotas_paginas_mais import roteador as roteador_paginas_mais
from labflow_api.rotas_paginas_nfc import roteador as roteador_paginas_nfc
from labflow_api.rotas_pendencias import roteador as roteador_pendencias
from labflow_api.rotas_relatorio_turno import roteador as roteador_relatorio_turno
from labflow_api.rotas_turno import roteador as roteador_turno
from labflow_api.telas import roteador as roteador_telas

app = FastAPI(
    title="LabFlow API",
    description="API do app LabFlow (LIMS do laboratório de microbiologia).",
    version="0.1.0",
)


@app.get("/saude", tags=["sistema"])
def saude() -> dict[str, str]:
    """Responde se a API está no ar. Não toca no banco."""
    return {"status": "ok"}


@app.get("/ambiente", tags=["sistema"])
def ambiente() -> dict[str, bool]:
    """Diz às telas se o servidor é de demonstração (mostra a faixa "Dados de demonstração").

    Liga por padrão; só desliga com LABFLOW_DEMONSTRACAO=0 (servidor do laboratório, no futuro).
    """
    return {"demonstracao": os.environ.get("LABFLOW_DEMONSTRACAO", "1") != "0"}


app.include_router(roteador_login)
app.include_router(roteador_admin)
app.include_router(roteador_admin_turnos)
app.include_router(roteador_coletas)
app.include_router(roteador_paginas)
app.include_router(roteador_paginas_nfc)
app.include_router(roteador_paginas_mais)
app.include_router(roteador_navios_tanques)
app.include_router(roteador_pendencias)
app.include_router(roteador_estufas)
app.include_router(roteador_laudos)
app.include_router(roteador_meios)
app.include_router(roteador_aguas)
app.include_router(roteador_fluxo_laminar)
app.include_router(roteador_recebimento)
app.include_router(roteador_material_asseptico)
app.include_router(roteador_laudo)  # antes da esterilização: /esterilizacao/laudos
app.include_router(roteador_esterilizacao)
app.include_router(roteador_relatorio_turno)  # antes do turno: /turno/relatorio
app.include_router(roteador_atividades)  # antes do turno: /turno/atividades
app.include_router(roteador_equipe)  # antes do turno: /turno/equipe e /turno/registros
app.include_router(roteador_turno)
app.include_router(roteador_telas)  # por último: /app/... e o redirecionamento da raiz
