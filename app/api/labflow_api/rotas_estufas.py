"""Temperatura das estufas: uma conferência por estufa no início de cada turno, com duas leituras (Supervisório e Field chart).

Spec: 07-app-pwa.md (v1.0), "7.1 Temperatura das estufas"; 08 A8. Tarefa: APP-027. Tabelas da migration 055.
Cada leitura é Ok ou Não ok; Ok não pede número, Não ok pede a temperatura (°C, uma casa) e aceita uma observação.
Status da estufa: Não ok se qualquer leitura estiver Não ok; Ok se as duas estiverem Ok; senão Pendente.
A diferença (field chart − supervisório) só aparece quando as duas temperaturas foram digitadas.
As faixas de trabalho são confidenciais: ficam só no banco (cadastradas pelo Admin, APP-028).
"""

from datetime import date
from decimal import Decimal
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api import rotas_atividades, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode

roteador = APIRouter(prefix="/estufas", tags=["estufas"])

LEITURAS = ("Supervisório", "Field chart")
TipoLeitura = Literal["Supervisório", "Field chart"]


class Faixa(BaseModel):
    minimo: Decimal
    maximo: Decimal


class LeituraEstufa(BaseModel):
    ok: bool
    temperatura: Decimal | None
    observacao: str | None
    quem: str
    quando: str  # HH:MM


class Estufa(BaseModel):
    id: int
    auxiliar: bool
    faixa: Faixa | None
    supervisorio: LeituraEstufa | None
    field_chart: LeituraEstufa | None
    status: Literal["Ok", "Não ok", "Pendente"]
    diferenca: Decimal | None


class Resumo(BaseModel):
    total: int
    conferidas: int
    nao_ok: int
    pendentes: int


class EstufasDoTurno(BaseModel):
    turno_id: int
    turno: str
    dia: date
    pode_registrar: bool
    resumo: Resumo
    estufas: list[Estufa]


ESTUFAS_SQL = """
SELECT e.id, e.auxiliar,
       (SELECT f.minimo FROM app.faixas_estufa f WHERE f.estufa_id = e.id AND f.vigente_desde <= %(dia)s
          AND (f.vigente_ate IS NULL OR f.vigente_ate >= %(dia)s) ORDER BY f.vigente_desde DESC LIMIT 1),
       (SELECT f.maximo FROM app.faixas_estufa f WHERE f.estufa_id = e.id AND f.vigente_desde <= %(dia)s
          AND (f.vigente_ate IS NULL OR f.vigente_ate >= %(dia)s) ORDER BY f.vigente_desde DESC LIMIT 1)
FROM app.estufas e WHERE e.ativa ORDER BY e.id
"""

LEITURAS_SQL = """
SELECT l.estufa_id, l.leitura, l.ok, l.temperatura, l.observacao, coalesce(u.nome, c.usuario), l.feita_em
FROM app.leituras_estufa l JOIN usuarios u ON u.id = l.feita_por
LEFT JOIN app.credenciais c ON c.usuario_id = l.feita_por
WHERE l.turno_id = %s AND l.dia = %s
"""


def estufas_do_turno(con: psycopg.Connection, turno_id: int, dia: date) -> list[Estufa]:
    leituras: dict[tuple[int, str], LeituraEstufa] = {
        (e, tipo): LeituraEstufa(ok=ok, temperatura=t, observacao=o, quem=q, quando=rotas_turno._hhmm(em))
        for e, tipo, ok, t, o, q, em in con.execute(LEITURAS_SQL, (turno_id, dia))
    }
    estufas = []
    for id_, auxiliar, minimo, maximo in con.execute(ESTUFAS_SQL, {"dia": dia}).fetchall():
        sup, fc = leituras.get((id_, "Supervisório")), leituras.get((id_, "Field chart"))
        dadas = [x for x in (sup, fc) if x]
        situacao = "Não ok" if any(not x.ok for x in dadas) else ("Ok" if len(dadas) == 2 else "Pendente")
        dif = fc.temperatura - sup.temperatura if sup and fc and sup.temperatura is not None and fc.temperatura is not None else None
        estufas.append(
            Estufa(
                id=id_, auxiliar=auxiliar, faixa=None if auxiliar or minimo is None else Faixa(minimo=minimo, maximo=maximo),
                supervisorio=sup, field_chart=fc, status=situacao, diferenca=dif,
            )
        )
    return estufas


def resumo(estufas: list[Estufa]) -> Resumo:
    """Conferida = as duas leituras feitas; pendente = falta alguma (mesmo que a outra já seja Não ok)."""
    conferidas = sum(e.supervisorio is not None and e.field_chart is not None for e in estufas)
    return Resumo(
        total=len(estufas), conferidas=conferidas, nao_ok=sum(e.status == "Não ok" for e in estufas),
        pendentes=len(estufas) - conferidas,
    )


def ocorrencias_do_turno(con: psycopg.Connection, turno_id: int, dia: date) -> list[str]:
    """Estufa Não ok entra nas ocorrências do relatório do turno, com a temperatura anotada (não abre nada sozinho)."""
    texto = []
    for e in estufas_do_turno(con, turno_id, dia):
        for nome, leitura in (("supervisório", e.supervisorio), ("field chart", e.field_chart)):
            if leitura and not leitura.ok:
                graus = f"{leitura.temperatura:.1f}".replace(".", ",")
                obs = f" ({leitura.observacao})" if leitura.observacao else ""
                texto.append(f"Estufa {e.id:02d}: {nome} Não ok, {graus} °C{obs} · {leitura.quem} às {leitura.quando}")
    return texto


def _pagina(con: psycopg.Connection, pessoa: PessoaLogada) -> EstufasDoTurno:
    turno, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    estufas = estufas_do_turno(con, turno.id, dia)
    return EstufasDoTurno(
        turno_id=turno.id, turno=turno.nome, dia=dia, pode_registrar=pode(pessoa.cargo, "registrar_analise"),
        resumo=resumo(estufas), estufas=estufas,
    )


@roteador.get("", response_model=EstufasDoTurno)
def estufas(
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)
) -> EstufasDoTurno:
    return _pagina(con, pessoa)


class Conferencia(BaseModel):
    leitura: TipoLeitura
    ok: bool
    temperatura: Decimal | None = Field(default=None, ge=-20, le=200, decimal_places=1)
    observacao: str | None = Field(default=None, max_length=200)


@roteador.put("/{estufa_id}", response_model=EstufasDoTurno)
def conferir(
    estufa_id: int,
    conferencia: Conferencia,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> EstufasDoTurno:
    """Grava a leitura (Supervisório ou Field chart) da estufa neste turno; conferir de novo atualiza."""
    if con.execute("SELECT 1 FROM app.estufas WHERE id = %s AND ativa", (estufa_id,)).fetchone() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Estufa não encontrada.")
    if not conferencia.ok and conferencia.temperatura is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Não ok pede a temperatura que a leitura está marcando.")
    temperatura = None if conferencia.ok else conferencia.temperatura
    observacao = None if conferencia.ok else ((conferencia.observacao or "").strip() or None)
    turno, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    con.execute(
        """
        INSERT INTO app.leituras_estufa (estufa_id, leitura, ok, temperatura, observacao, turno_id, dia, feita_por, feita_em)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, clock_timestamp())
        ON CONFLICT (estufa_id, leitura, turno_id, dia)
        DO UPDATE SET ok = EXCLUDED.ok, temperatura = EXCLUDED.temperatura, observacao = EXCLUDED.observacao,
                      feita_por = EXCLUDED.feita_por, feita_em = EXCLUDED.feita_em
        """,
        (estufa_id, conferencia.leitura, conferencia.ok, temperatura, observacao, turno.id, dia, pessoa.usuario_id),
    )
    return _pagina(con, pessoa)
