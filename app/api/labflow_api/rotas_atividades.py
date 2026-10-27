"""Atividades fixas do turno no Início: Feito e Não feito (a lista de verificação de cada turno).

Spec: 07-app-pwa.md (v1.0), "3. Início" ("Para fazer agora" = atividades fixas do turno, com a caixa de Feito); 08 A9.
Tarefa: APP-023. Tabelas da migration 052 (`app.atividades_fixas`, `app.atividades_feitas`).

Regras:
- a lista é a do turno em que a pessoa está (a entrada dela) ou, para quem não entra em turno, a do turno de agora;
- atividade com dia certo ("só às sextas") só aparece nesse dia da semana; a Madrugada conta no dia em que começou;
- "Feito" e "Não feito" gravam quem e quando; tocar de novo no mesmo botão desmarca;
- "Não feito" vira pendência do turno seguinte: aparece em "Pendências herdadas" (com a caixa de Feito) até alguém
  marcar a atividade como feita ou passarem 3 dias;
- (25/10, APP-065) a tela tem só a caixa de Feito: a atividade que ninguém marcou até o fim do turno também passa como
  não feita para o turno seguinte (só para o turno logo depois), até alguém marcá-la;
- (27/10, 081) a atividade opcional aparece em qualquer dia (a pessoa escolhe quando faz) e nunca passa para o turno seguinte.
"""

from datetime import date, timedelta
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
    opcional: bool = False
    estado: Literal["feito", "nao_feito"] | None
    quem: str | None
    quando: str | None  # HH:MM


class Herdada(BaseModel):
    atividade_id: int
    texto: str
    turno: str
    dia: date
    quem: str | None


class Recado(BaseModel):
    """Pendência escrita à mão no relatório do turno anterior (uma linha do campo "Pendências")."""

    texto: str
    turno: str
    dia: date
    por: str | None  # quem encerrou o turno anterior (ou, sem encerramento, quem escreveu por último)


class AtividadesDoTurno(BaseModel):
    turno_id: int
    turno: str
    dia: date
    pode_marcar: bool
    total: int
    feitas: int
    atividades: list[Atividade]
    herdadas: list[Herdada]
    recados: list[Recado]


LISTA_SQL = """
SELECT a.id, a.texto, f.feito, coalesce(u.nome, c.usuario), f.marcado_em, a.opcional
FROM app.atividades_fixas a
LEFT JOIN app.atividades_feitas f
       ON f.atividade_fixa_id = a.id AND f.turno_id = a.turno_id AND f.dia = %(dia)s
LEFT JOIN usuarios u ON u.id = f.marcado_por
LEFT JOIN app.credenciais c ON c.usuario_id = f.marcado_por
WHERE a.turno_id = %(turno)s AND a.ativa
  AND (a.opcional OR a.dias_semana IS NULL OR %(dia_semana)s = ANY (a.dias_semana))
ORDER BY a.opcional, a.ordem
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
    WHERE NOT n.feito AND n.atividade_fixa_id IS NOT NULL AND n.turno_id <> %(turno)s AND NOT a.opcional
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
    for id_, texto, feito, quem, quando, opcional in con.execute(
        LISTA_SQL, {"turno": turno.id, "dia": dia, "dia_semana": dia.isoweekday()}
    ):
        itens.append(
            Atividade(
                id=id_, texto=texto, opcional=opcional, estado=None if feito is None else ("feito" if feito else "nao_feito"),
                quem=quem if feito is not None else None, quando=rotas_turno._hhmm(quando) if feito is not None else None,
            )
        )
    return itens


# As atividades do turno anterior que ninguém marcou (nem Feito nem Não feito) e ninguém fez depois do fim dele.
NAO_MARCADAS_SQL = """
SELECT a.id, a.texto
FROM app.atividades_fixas a
WHERE a.turno_id = %(ant)s AND a.ativa AND NOT a.opcional
  AND (a.dias_semana IS NULL OR %(dia_semana)s = ANY (a.dias_semana))
  AND NOT EXISTS (
      SELECT 1 FROM app.atividades_feitas f WHERE f.atividade_fixa_id = a.id AND f.turno_id = %(ant)s AND f.dia = %(dia_ant)s
  )
  AND NOT EXISTS (
      SELECT 1 FROM app.atividades_feitas r WHERE r.atividade_fixa_id = a.id AND r.feito AND r.marcado_em >= %(fim)s
  )
ORDER BY a.ordem
"""


def _herdadas(con: psycopg.Connection, turno: Turno, dia: date) -> list[Herdada]:
    herdadas = [
        Herdada(atividade_id=i, texto=t, turno=n, dia=d, quem=q)
        for i, t, n, d, q, _ in con.execute(HERDADAS_SQL, {"turno": turno.id, "dias": DIAS_DE_HERANCA})
    ]
    turnos = rotas_turno._turnos(con)
    ant, dia_ant = rotas_turno.turno_agora(turnos, rotas_turno.janela(turno, dia)[0] - timedelta(minutes=1))
    if ant.id == turno.id:
        return herdadas
    ja = {h.atividade_id for h in herdadas}
    for i, t in con.execute(
        NAO_MARCADAS_SQL,
        {"ant": ant.id, "dia_ant": dia_ant, "dia_semana": dia_ant.isoweekday(), "fim": rotas_turno.janela(ant, dia_ant)[1]},
    ):
        if i not in ja:
            herdadas.append(Herdada(atividade_id=i, texto=t, turno=ant.nome, dia=dia_ant, quem=None))
    return herdadas


RECADOS_SQL = """
SELECT r.pendencias_escritas, t.nome, r.dia, coalesce(ue.nome, ce.usuario, ua.nome, ca.usuario)
FROM app.relatorios_turno r JOIN app.turnos t ON t.id = r.turno_id
LEFT JOIN usuarios ue ON ue.id = r.encerrado_por LEFT JOIN app.credenciais ce ON ce.usuario_id = r.encerrado_por
LEFT JOIN usuarios ua ON ua.id = r.atualizado_por LEFT JOIN app.credenciais ca ON ca.usuario_id = r.atualizado_por
WHERE r.turno_id = %s AND r.dia = %s AND r.pendencias_escritas IS NOT NULL
"""


def _recados(con: psycopg.Connection, turno: Turno, dia: date) -> list[Recado]:
    """As linhas escritas à mão no relatório do turno anterior que ainda ninguém marcou como Feito neste turno."""
    turnos = rotas_turno._turnos(con)
    ant, dia_ant = rotas_turno.turno_agora(turnos, rotas_turno.janela(turno, dia)[0] - timedelta(minutes=1))
    linha = con.execute(RECADOS_SQL, (ant.id, dia_ant)).fetchone()
    if linha is None:
        return []
    texto, nome, dia_do_relatorio, por = linha
    feitos = {
        t for (t,) in con.execute(
            "SELECT pendencia_texto FROM app.atividades_feitas WHERE turno_id = %s AND dia = %s AND pendencia_texto IS NOT NULL AND feito",
            (turno.id, dia),
        )
    }
    linhas = [l.strip()[:300] for l in texto.splitlines() if l.strip()]
    return [Recado(texto=l, turno=nome, dia=dia_do_relatorio, por=por) for l in linhas if l not in feitos]


def _resposta(con: psycopg.Connection, pessoa: PessoaLogada, turno: Turno, dia: date) -> AtividadesDoTurno:
    atividades = _lista(con, turno, dia)
    return AtividadesDoTurno(
        turno_id=turno.id, turno=turno.nome, dia=dia, pode_marcar=pode(pessoa.cargo, "registrar_analise"),
        # a opcional não conta no "x de y feitas" do turno: ela é feita no dia que a pessoa escolher
        total=sum(not a.opcional for a in atividades), feitas=sum(a.estado == "feito" and not a.opcional for a in atividades),
        atividades=atividades, herdadas=_herdadas(con, turno, dia), recados=_recados(con, turno, dia),
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
    herdada = atividade_id in {h.atividade_id for h in _herdadas(con, turno, dia)}
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


class MarcacaoRecado(BaseModel):
    texto: str


@roteador.put("/recados/feito", response_model=AtividadesDoTurno)
def marcar_recado(
    marcacao: MarcacaoRecado,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> AtividadesDoTurno:
    """Marca como Feito uma pendência escrita à mão no turno anterior (grava quem e quando)."""
    turno, dia = _turno_da_pessoa(con, pessoa)
    if marcacao.texto not in {r.texto for r in _recados(con, turno, dia)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esse recado não está nas pendências herdadas do seu turno.")
    con.execute(
        """
        INSERT INTO app.atividades_feitas (pendencia_texto, turno_id, dia, feito, marcado_por, marcado_em)
        VALUES (%s, %s, %s, true, %s, clock_timestamp())
        """,
        (marcacao.texto, turno.id, dia, pessoa.usuario_id),
    )
    return _resposta(con, pessoa, turno, dia)
