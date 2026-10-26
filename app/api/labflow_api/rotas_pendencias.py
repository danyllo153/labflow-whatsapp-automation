"""Pendências de hoje: o que vence hoje e o que está atrasado.

Spec: 07-app-pwa.md (v1.0), "3. Início" (cartões Para hoje e Atrasados, lista "Para fazer agora" nos blocos do
relatório do dia); 06-api-e-auth.md, "Primeiros endpoints". Tarefas: APP-010 e APP-014 (número de desvios abertos).
Lê SEMPRE as views do Power BI (schema bi), que já calculam a situação ("Vence hoje", "Atrasado") com o "hoje"
do banco; assim o app, o painel e o relatório do bot contam igual. Exceção: águas e superfícies (APP-037), que
nasceram no app e são lidas do schema app (rotas_aguas.PENDENCIAS_AGUAS_SQL).
"""

from datetime import date
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_aguas import PENDENCIAS_AGUAS_SQL

roteador = APIRouter(tags=["pendências"])

BLOCOS = (
    "FCOJ Recebimento", "FCOJ Embarque", "NFC Tank farm", "NFC Navio", "Recebimento NFC", "Águas e superfícies", "Desvios",
)

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
           -- a próxima ação do teste (24/10): "TAB · para espalhar", "Coliformes · para ler"
           teste || CASE WHEN status = 'No caldo' AND teste = 'Coliformes' THEN ' · para estriar'
                         WHEN status = 'No caldo' THEN ' · para espalhar'
                         WHEN status IN ('Estriado', 'Incubado') THEN ' · para ler'
                         WHEN position('confirma' in status) > 0 THEN ' · para confirmar' ELSE '' END,
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
    -- o que a lista do bot traz além das leituras e dos testes (PB22, migration 106 do bot): o Stress de tanque por fazer
    -- e a composta esperando o Coliformes obrigatório ou o TAB. TAB e Coliformes em andamento já vêm de bi.testes.
    SELECT CASE WHEN p.grupo = 'Tanques' THEN CASE c.origem WHEN 'terra' THEN 'NFC Tank farm' ELSE 'NFC Navio' END
                ELSE CASE v.origem WHEN 'embarque' THEN 'FCOJ Embarque' ELSE 'FCOJ Recebimento' END END,
           CASE p.grupo WHEN 'Tanques' THEN 'Análise Stress' ELSE 'Composta' END,
           CASE WHEN p.grupo <> 'Tanques' THEN p.alvo
                WHEN c.origem = 'terra' THEN 'Tanque ' || c.tanque || ' (coleta ' || to_char(c.data_coleta, 'DD/MM') || ')'
                ELSE n.nome || ' ' || n.viagem || ' · tanque ' || c.tanque || ' (coleta ' || to_char(c.data_coleta, 'DD/MM') || ')' END,
           CASE p.grupo WHEN 'Tanques' THEN 'Stress · para analisar' ELSE p.etapa END,
           p.prevista,
           CASE WHEN p.atrasado THEN 'Atrasado' ELSE 'Vence hoje' END
    FROM vw_pendencias_do_dia p
    LEFT JOIN coletas c ON p.tabela = 'coletas' AND c.id = p.ref_id
    LEFT JOIN navios n ON n.id = c.navio_id
    LEFT JOIN vw_compostas v ON p.tabela = 'compostas' AND v.id = p.ref_id
    WHERE p.grupo IN ('Tanques', 'Compostas')
    UNION ALL
    SELECT 'Recebimento NFC', 'C.T/B.L', 'Load ' || load || ' · lote ' || lote, analise, prevista, situacao
    FROM bi.recebimento_nfc
    UNION ALL
    SELECT 'Desvios', 'Desvio de ' || lower(tipo),
           CASE WHEN origem = 'Terra' THEN 'Tanque ' || tanque ELSE navio || ' · tanque ' || tanque END,
           coalesce(analise, drop, ''), prazo, situacao
    FROM bi.desvios
    UNION ALL
{AGUAS}
) p
WHERE situacao IN ('Vence hoje', 'Atrasado')
""".replace("{AGUAS}", PENDENCIAS_AGUAS_SQL)  # águas e superfícies ficam no schema app (APP-037)


class Pendencia(BaseModel):
    bloco: str
    tipo: str
    referencia: str
    analise: str
    prevista: date | None
    situacao: str  # "Vence hoje" ou "Atrasado"
    grupo: str  # o que se faz junto (24/10): "TAB · para espalhar", "O.SKY 189 · Psicrotróficos Normal · Leitura final"
    item: str  # o que aparece ao abrir o grupo: a composta, o lote, o tanque


def agrupar(bloco: str, tipo: str, referencia: str, analise: str) -> tuple[str, str]:
    """Grupo e item de uma pendência: o Início mostra o número de cada grupo e abre a lista (pedido de 24/10).

    No navio, o grupo é o navio com a análise e o frasco (Normal ou Stress): os tanques ficam dentro.
    """
    prefixo, item = "", referencia
    if bloco == "NFC Navio" and " · tanque " in referencia:
        # navio: só o nome e o frasco (Normal ou Stress); a análise e o tanque ficam dentro (24/10)
        navio, tanque = referencia.split(" · ", 1)
        frasco = next((f for f in ("Normal", "Stress") if f" {f}" in f" {analise}"), None)
        if frasco:
            return f"{navio} · {frasco}", f"{tanque} · {' '.join(analise.replace(frasco, '').split())}"
        return f"{navio} · {'Drops' if tipo == 'Drop' else tipo}", f"{tanque} · {analise}"
    if tipo in ("C.T/B.L", "Leitura de NFC") or analise.startswith(tipo):
        rotulo = analise or tipo
    elif tipo == "Drop":
        rotulo = f"Drop {analise}"
    else:
        rotulo = f"{tipo} · {analise}" if analise and analise != tipo else tipo
    return prefixo + rotulo, item


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
    itens = [
        Pendencia(bloco=b, tipo=t, referencia=r or "", analise=a or "", prevista=p, situacao=s,
                  grupo=(g := agrupar(b, t, r or "", a or ""))[0], item=g[1])
        for b, t, r, a, p, s in linhas
    ]
    abertos = con.execute("SELECT count(*) FROM bi.desvios WHERE status <> 'Concluído'").fetchone()[0]
    return Pendencias(
        vence_hoje=sum(i.situacao == "Vence hoje" for i in itens),
        atrasados=sum(i.situacao == "Atrasado" for i in itens),
        desvios_abertos=abertos,
        itens=itens,
    )
