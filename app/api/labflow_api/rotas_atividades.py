"""Atividades fixas do turno no Início: Feito e Não feito (a lista de verificação de cada turno).

Spec: 07-app-pwa.md (v1.0), "3. Início" ("Para fazer agora" = atividades fixas do turno, com a caixa de Feito); 08 A9.
Tarefa: APP-023. Tabelas da migration 052 (`app.atividades_fixas`, `app.atividades_feitas`).

Regras:
- a lista é a do turno em que a pessoa está (a entrada dela) ou, para quem não entra em turno, a do turno de agora;
- atividade com dia certo ("só às sextas") só aparece nesse dia da semana; a Madrugada conta no dia em que começou;
- "Feito" e "Não feito" gravam quem e quando; tocar de novo no mesmo botão desmarca;
- "Não feito" vira pendência do turno seguinte: aparece em "Pendências herdadas" (com a caixa de Feito) até alguém
  marcar a atividade como feita ou passarem 3 dias.
"""

from datetime import date
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from labflow_api import rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import Turno

roteador = APIRouter(prefix="/turno/atividades", tags=["turno"])

DIAS_DE_HERANCA = 3


class Atividade(BaseModel):
    id: int
    texto: str
    estado: Literal["feito", "nao_feito"] | None
    quem: str | None
    quando: str | None  # HH:MM


class Herdada(BaseModel):
    atividade_id: int
    texto: str
    turno: str
    dia: date
    quem: str | None


class AtividadesDoTurno(BaseModel):
    turno_id: int
    turno: str
    dia: date
    pode_marcar: bool
    total: int
    feitas: int
    atividades: list[Atividade]
    herdadas: list[Herdada]


LISTA_SQL = """
SELECT a.id, a.texto, f.feito, coalesce(u.nome, c.usuario), f.marcado_em
FROM app.atividades_fixas a
LEFT JOIN app.atividades_feitas f
       ON f.atividade_fixa_id = a.id AND f.turno_id = a.turno_id AND f.dia = %(dia)s
LEFT JOIN usuarios u ON u.id = f.marcado_por
LEFT JOIN app.credenciais c ON c.usuario_id = f.marcado_por
WHERE a.turno_id = %(turno)s AND a.ativa
  AND (a.dias_semana IS NULL OR %(dia_semana)s = ANY (a.dias_semana))
ORDER BY a.ordem
"""

# O "Não feito" mais recente de cada atividade (de outro turno) que ninguém marcou como feita depois.
HERDADAS_SQL = """
SELECT * FROM (
    SELECT DISTINCT ON (n.atividade_fixa_id) n.atividade_fixa_id, a.texto, t.nome, n.dia, coalesce(u.nome, c.usuario), n.marcado_em
    FROM app.atividades_feitas n
    JOIN app.atividades_fixas a ON a.id = n.atividade_fixa_id
    JOIN app.turnos t ON t.id = n.turno_id
    LEFT JOIN usuarios u ON u.id = n.marcado_por
    LEFT JOIN app.credenciais c ON c.usuario_id = n.marcado_por
    WHERE NOT n.feito AND n.atividade_fixa_id IS NOT NULL AND n.turno_id <> %(turno)s
      AND n.marcado_em > now() - make_interval(days => %(dias)s)
      AND NOT EXISTS (
          SELECT 1 FROM app.atividades_feitas r
          WHERE r.atividade_fixa_id = n.atividade_fixa_id AND r.feito AND r.marcado_em > n.marcado_em
      )
    ORDER BY n.atividade_fixa_id, n.marcado_em DESC
) h ORDER BY h.marcado_em
"""


def _turno_da_pessoa(con: psycopg.Connection, pessoa: PessoaLogada) -> tuple[Turno, date]:
    """O turno em que a pessoa está; sem entrada (Admin, Consultor), o turno de agora."""
    turnos = rotas_turno._turnos(con)
    agora = rotas_turno._agora(con)
    entrada = rotas_turno._fechar_esquecida(con, pessoa.usuario_id, turnos, agora)
    if entrada:
        return next(t for t in turnos if t.id == entrada.turno_id), entrada.dia
    return rotas_turno.turno_agora(turnos, agora)


def _lista(con: psycopg.Connection, turno: Turno, dia: date) -> list[Atividade]:
    itens = []
    for id_, texto, feito, quem, quando in con.execute(
        LISTA_SQL, {"turno": turno.id, "dia": dia, "dia_semana": dia.isoweekday()}
    ):
        itens.append(
            Atividade(
                id=id_, texto=texto, estado=None if feito is None else ("feito" if feito else "nao_feito"),
                quem=quem if feito is not None else None, quando=rotas_turno._hhmm(quando) if feito is not None else None,
            )
        )
    return itens


def _herdadas(con: psycopg.Connection, turno: Turno) -> list[Herdada]:
    return [
        Herdada(atividade_id=i, texto=t, turno=n, dia=d, quem=q)
        for i, t, n, d, q, _ in con.execute(HERDADAS_SQL, {"turno": turno.id, "dias": DIAS_DE_HERANCA})
    ]


def _resposta(con: psycopg.Connection, pessoa: PessoaLogada, turno: Turno, dia: date) -> AtividadesDoTurno:
    atividades = _lista(con, turno, dia)
    return AtividadesDoTurno(
        turno_id=turno.id, turno=turno.nome, dia=dia, pode_marcar=pode(pessoa.cargo, "registrar_analise"),
        total=len(atividades), feitas=sum(a.estado == "feito" for a in atividades),
        atividades=atividades, herdadas=_herdadas(con, turno),
    )


@roteador.get("", response_model=AtividadesDoTurno)
def atividades_do_turno(
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)
) -> AtividadesDoTurno:
    turno, dia = _turno_da_pessoa(con, pessoa)
    return _resposta(con, pessoa, turno, dia)


class Marcacao(BaseModel):
    feito: bool | None  # true = Feito, false = Não feito, null = desmarcar


@roteador.put("/{atividade_id}", response_model=AtividadesDoTurno)
def marcar(
    atividade_id: int,
    marcacao: Marcacao,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> AtividadesDoTurno:
    turno, dia = _turno_da_pessoa(con, pessoa)
    do_turno = {a.id for a in _lista(con, turno, dia)}
    herdada = atividade_id in {h.atividade_id for h in _herdadas(con, turno)}
    if atividade_id not in do_turno and not herdada:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Essa atividade não é do seu turno de hoje.")
    if atividade_id not in do_turno and marcacao.feito is not True:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Uma pendência herdada só se marca como Feito.")
    if marcacao.feito is None:
        con.execute(
            "DELETE FROM app.atividades_feitas WHERE atividade_fixa_id = %s AND turno_id = %s AND dia = %s",
            (atividade_id, turno.id, dia),
        )
    else:
        con.execute(
            """
            INSERT INTO app.atividades_feitas (atividade_fixa_id, turno_id, dia, feito, marcado_por, marcado_em)
            VALUES (%s, %s, %s, %s, %s, clock_timestamp())
            ON CONFLICT (atividade_fixa_id, turno_id, dia) WHERE atividade_fixa_id IS NOT NULL
            DO UPDATE SET feito = EXCLUDED.feito, marcado_por = EXCLUDED.marcado_por, marcado_em = clock_timestamp()
            """,
            (atividade_id, turno.id, dia, marcacao.feito, pessoa.usuario_id),
        )
    return _resposta(con, pessoa, turno, dia)
