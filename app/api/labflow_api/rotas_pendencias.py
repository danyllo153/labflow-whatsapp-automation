"""Pendências de hoje: o que vence hoje e o que está atrasado.

Spec: 07-app-pwa.md (v1.0), "3. Início" (cartões Para hoje e Atrasados, lista "Para fazer agora" nos blocos do
relatório do dia); 06-api-e-auth.md, "Primeiros endpoints". Tarefas: APP-010 e APP-014 (número de desvios abertos).
Lê SEMPRE as views do Power BI (schema bi), que já calculam a situação ("Vence hoje", "Atrasado") com o "hoje"
do banco; assim o app, o painel e o relatório do bot contam igual.
"""

from datetime import date
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir

roteador = APIRouter(tags=["pendências"])

BLOCOS = ("FCOJ Recebimento", "FCOJ Embarque", "NFC Tank farm", "NFC Navio", "Recebimento NFC", "Desvios")

# Uma linha por pendência, no mesmo formato para todas as origens. Cada SELECT lê uma view bi.*.
PENDENCIAS_SQL = """
SELECT * FROM (
    SELECT CASE origem WHEN 'Recebimento' THEN 'FCOJ Recebimento' ELSE 'FCOJ Embarque' END AS bloco,
           'C.T/B.L' AS tipo,
           CASE WHEN origem = 'Recebimento' THEN 'Load ' || load || ' · lote ' || lote_amostra
                ELSE trim(coalesce(navio, '') || ' linha ' || coalesce(linha::text, '') || ' fase ' || coalesce(fase::text, ''))
                     || ' · load ' || load || ' · ' || lote_amostra END AS referencia,
           analise, prevista, situacao
    FROM bi.contagens
    UNION ALL
    SELECT CASE origem WHEN 'Recebimento' THEN 'FCOJ Recebimento' WHEN 'Embarque' THEN 'FCOJ Embarque'
                ELSE 'NFC Tank farm' END,
           teste,
           -- "Load 90009 · Composta #18, lote 8": sem o alvo, várias linhas do mesmo load ficavam iguais (APP-014)
           CASE WHEN origem IN ('Recebimento', 'Embarque') AND nullif(load_ou_tanque, '') IS NOT NULL
                THEN 'Load ' || load_ou_tanque || coalesce(' · ' || nullif(alvo, ''), '')
                ELSE coalesce(nullif(alvo, ''), load_ou_tanque) END,
           teste,
           proxima_etapa,
           situacao
    FROM bi.testes
    UNION ALL
    SELECT CASE origem WHEN 'Terra' THEN 'NFC Tank farm' ELSE 'NFC Navio' END,
           'Drop',
           CASE WHEN origem = 'Terra' THEN 'Tanque ' || tanque ELSE navio || ' · tanque ' || tanque END
             || ' (coleta ' || to_char(data_coleta, 'DD/MM') || ')',
           drop, prevista, situacao
    FROM bi.drops
    UNION ALL
    SELECT CASE origem WHEN 'Terra' THEN 'NFC Tank farm' ELSE 'NFC Navio' END,
           'Leitura de NFC',
           CASE WHEN origem = 'Terra' THEN 'Tanque ' || tanque ELSE navio || ' · tanque ' || tanque END
             || ' (coleta ' || to_char(data_coleta, 'DD/MM') || ')',
           analise || ' ' || frasco || ' · ' || etapa, prevista, situacao
    FROM bi.leituras_nfc
    UNION ALL
    SELECT 'Recebimento NFC', 'C.T/B.L', 'Load ' || load || ' · lote ' || lote, analise, prevista, situacao
    FROM bi.recebimento_nfc
    UNION ALL
    SELECT 'Desvios', 'Desvio de ' || lower(tipo),
           CASE WHEN origem = 'Terra' THEN 'Tanque ' || tanque ELSE navio || ' · tanque ' || tanque END,
           coalesce(analise, drop, ''), prazo, situacao
    FROM bi.desvios
) p
WHERE situacao IN ('Vence hoje', 'Atrasado')
"""


class Pendencia(BaseModel):
    bloco: str
    tipo: str
    referencia: str
    analise: str
    prevista: date | None
    situacao: str  # "Vence hoje" ou "Atrasado"


class Pendencias(BaseModel):
    vence_hoje: int
    atrasados: int
    desvios_abertos: int  # todos os desvios ainda não concluídos (cartão "Desvios abertos" do Início, APP-014)
    itens: list[Pendencia]


@roteador.get("/pendencias-hoje", response_model=Pendencias)
def pendencias_hoje(
    bloco: Literal[BLOCOS] | None = Query(default=None, description="Só um bloco do relatório do dia"),  # type: ignore[valid-type]
    situacao: Literal["Vence hoje", "Atrasado"] | None = None,
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pendencias:
    if pessoa.cargo == "Coletor":
        # 07: o Coletor vê só as pendências de coleta; coleta não tem prazo nestas views, então não há o que mostrar.
        return Pendencias(vence_hoje=0, atrasados=0, desvios_abertos=0, itens=[])
    sql, valores = PENDENCIAS_SQL, []
    if bloco:
        sql += " AND bloco = %s"
        valores.append(bloco)
    if situacao:
        sql += " AND situacao = %s"
        valores.append(situacao)
    ordem_blocos = ", ".join(f"'{b}'" for b in BLOCOS)
    sql += f" ORDER BY array_position(ARRAY[{ordem_blocos}]::text[], bloco), situacao = 'Vence hoje', prevista, referencia"
    linhas = con.execute(sql, valores).fetchall()
    itens = [Pendencia(bloco=b, tipo=t, referencia=r or "", analise=a or "", prevista=p, situacao=s)
             for b, t, r, a, p, s in linhas]
    abertos = con.execute("SELECT count(*) FROM bi.desvios WHERE status <> 'Concluído'").fetchone()[0]
    return Pendencias(
        vence_hoje=sum(i.situacao == "Vence hoje" for i in itens),
        atrasados=sum(i.situacao == "Atrasado" for i in itens),
        desvios_abertos=abertos,
        itens=itens,
    )
