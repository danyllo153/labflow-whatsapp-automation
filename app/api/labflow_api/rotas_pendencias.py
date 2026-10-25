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
    -- Stress do tanque ainda por fazer (25/10): coleta com o frasco Normal analisado e sem o Stress (plaqueado 24 h depois)
    SELECT CASE c.origem WHEN 'terra' THEN 'NFC Tank farm' ELSE 'NFC Navio' END,
           'Análise Stress',
           CASE WHEN c.origem = 'terra' THEN 'Tanque ' || c.tanque ELSE n.nome || ' ' || n.viagem || ' · tanque ' || c.tanque END
             || ' (coleta ' || to_char(c.data_coleta, 'DD/MM') || ')',
           'Stress · para analisar', s.prevista,
           CASE WHEN s.prevista < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Atrasado' ELSE 'Vence hoje' END
    FROM coletas c
    LEFT JOIN navios n ON n.id = c.navio_id
    JOIN LATERAL (SELECT min(a.data_analise) + 1 AS prevista FROM analises a
                  WHERE a.coleta_id = c.id AND a.frasco = 'Normal' AND a.repeticao_de IS NULL) s ON s.prevista IS NOT NULL
    WHERE c.data_coleta >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 20
      AND s.prevista <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND NOT EXISTS (SELECT 1 FROM analises a WHERE a.coleta_id = c.id AND a.frasco = 'Stress')
    UNION ALL
    -- composta esperando o Coliformes obrigatório (migration 104 do bot): a primeira do load, toda da COL e do embarque
    SELECT CASE v.origem WHEN 'embarque' THEN 'FCOJ Embarque' ELSE 'FCOJ Recebimento' END,
           'Coliformes',
           CASE WHEN v.origem = 'embarque' THEN v.rotulo || ' · load ' || v.load ELSE 'Load ' || v.load END
             || ' · Composta #' || v.composta_id,
           'Coliformes · para fazer (obrigatório)', (v.criada_em AT TIME ZONE 'America/Sao_Paulo')::date,
           CASE WHEN (v.criada_em AT TIME ZONE 'America/Sao_Paulo')::date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
                THEN 'Atrasado' ELSE 'Vence hoje' END
    FROM vw_coliformes_pendentes v
    WHERE v.obrigatorio
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
