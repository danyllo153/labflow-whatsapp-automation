"""Esterilização: ponteira, meio, frasco, descarte e outro, com o número do ciclo (e o gráfico G4 por tipo e turno).

Spec: 07-app-pwa.md (v1.0), "7. Esterilização" e "6. Gráficos"; 08 A8. Tarefa: APP-026. Tabela `app.esterilizacoes` (migration 054).
Sem resultado da fita: o ok/não ok sai da nota da autoclave, e a anotação no Word continua como rastreio oficial.
Corrigir e excluir pedem motivo, e excluir não apaga (fica guardado). A lista é a do turno da pessoa.
"""

from datetime import date, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from labflow_api import laudo_esterilizacao, rotas_atividades, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode

roteador = APIRouter(prefix="/esterilizacao", tags=["esterilização"])

TIPOS = ("Ponteira", "Meio", "Frasco", "Água de diluição", "Descarte", "Outro")  # Água de diluição: migration 059
Tipo = Literal["Ponteira", "Meio", "Frasco", "Água de diluição", "Descarte", "Outro"]


class Item(BaseModel):
    id: int
    tipo: str
    ciclo: str
    meio: str | None
    descricao: str | None
    eficiente: bool  # Sim por padrão; Não se a fita ou a nota da autoclave não confirmou
    pagina_impressa: bool  # a página do laudo em que esta linha está já foi impressa
    quem: str
    quando: str  # HH:MM
    corrigida: bool
    motivo_correcao: str | None
    antes: str | None


class EsterilizacoesDoTurno(BaseModel):
    turno_id: int
    turno: str
    dia: date
    tipos: list[str]
    pode_registrar: bool
    itens: list[Item]


ITENS_SQL = """
SELECT e.id, e.tipo, e.ciclo, e.meio, e.descricao, e.eficiente, coalesce(l.impresso_em IS NOT NULL, false),
       coalesce(u.nome, c.usuario), e.feita_em, e.corrigida_em IS NOT NULL, e.motivo_correcao, e.antes
FROM app.esterilizacoes e JOIN usuarios u ON u.id = e.feita_por
LEFT JOIN app.laudos_esterilizacao l ON l.id = e.laudo_id
LEFT JOIN app.credenciais c ON c.usuario_id = e.feita_por
WHERE e.turno_id = %s AND e.dia = %s AND e.excluida_em IS NULL
ORDER BY e.feita_em DESC, e.id DESC
"""


def itens_do_turno(con: psycopg.Connection, turno_id: int, dia: date) -> list[Item]:
    return [
        Item(
            id=i, tipo=t, ciclo=c, meio=m, descricao=d, eficiente=ef, pagina_impressa=imp, quem=q,
            quando=rotas_turno._hhmm(em), corrigida=corr, motivo_correcao=mot, antes=a,
        )
        for i, t, c, m, d, ef, imp, q, em, corr, mot, a in con.execute(ITENS_SQL, (turno_id, dia))
    ]


def _pagina(con: psycopg.Connection, pessoa: PessoaLogada) -> EsterilizacoesDoTurno:
    turno, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    return EsterilizacoesDoTurno(
        turno_id=turno.id, turno=turno.nome, dia=dia, tipos=list(TIPOS),
        pode_registrar=pode(pessoa.cargo, "registrar_analise"), itens=itens_do_turno(con, turno.id, dia),
    )


@roteador.get("", response_model=EsterilizacoesDoTurno)
def esterilizacoes(
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)
) -> EsterilizacoesDoTurno:
    return _pagina(con, pessoa)


class Registro(BaseModel):
    tipo: Tipo
    ciclo: str = Field(max_length=20)
    meio: str | None = Field(default=None, max_length=60)  # só no tipo Meio (ex.: PDA)
    descricao: str | None = Field(default=None, max_length=120)  # obrigatória no tipo Outro


def _limpar(r: Registro) -> tuple[str, str, str | None, str | None]:
    ciclo = r.ciclo.strip()
    if not ciclo:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Informe o número do ciclo.")
    meio = (r.meio or "").strip() or None if r.tipo == "Meio" else None
    descricao = (r.descricao or "").strip() or None if r.tipo == "Outro" else None
    if r.tipo == "Outro" and descricao is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Descreva o que foi esterilizado (tipo Outro).")
    return r.tipo, ciclo, meio, descricao


@roteador.post("", response_model=EsterilizacoesDoTurno, status_code=status.HTTP_201_CREATED)
def registrar(
    registro: Registro,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> EsterilizacoesDoTurno:
    tipo, ciclo, meio, descricao = _limpar(registro)
    turno, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    pagina = laudo_esterilizacao.atribuir_pagina(con, dia, ciclo)
    con.execute(
        """
        INSERT INTO app.esterilizacoes (tipo, ciclo, meio, descricao, turno_id, dia, feita_por, feita_em, laudo_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, clock_timestamp(), %s)
        """,
        (tipo, ciclo, meio, descricao, turno.id, dia, pessoa.usuario_id, pagina),
    )
    return _pagina(con, pessoa)


def _do_turno(con: psycopg.Connection, pessoa: PessoaLogada, item_id: int):
    turno, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    linha = con.execute(
        "SELECT tipo, ciclo, meio, descricao FROM app.esterilizacoes WHERE id = %s AND turno_id = %s AND dia = %s AND excluida_em IS NULL",
        (item_id, turno.id, dia),
    ).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esterilização não encontrada neste turno.")
    return linha


def _resumo(tipo: str, ciclo: str, meio: str | None, descricao: str | None) -> str:
    return f"{tipo}{f' ({meio})' if meio else ''}{f' ({descricao})' if descricao else ''}, ciclo {ciclo}"


class CicloExistente(BaseModel):
    tipo: str
    quem: str
    quando: str  # HH:MM


@roteador.get("/ciclo", response_model=list[CicloExistente])
def ciclo_existente(
    ciclo: str = Query(max_length=20),
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[CicloExistente]:
    """O que já foi registrado neste ciclo no dia do turno: a tela avisa ("adicionar junto?") sem bloquear nem sugerir número."""
    _, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    return [
        CicloExistente(tipo=t, quem=q, quando=rotas_turno._hhmm(em))
        for t, q, em in con.execute(
            """
            SELECT e.tipo, coalesce(u.nome, c.usuario), e.feita_em FROM app.esterilizacoes e JOIN usuarios u ON u.id = e.feita_por
            LEFT JOIN app.credenciais c ON c.usuario_id = e.feita_por
            WHERE e.excluida_em IS NULL AND e.dia = %s AND lower(trim(e.ciclo)) = lower(trim(%s)) ORDER BY e.feita_em
            """,
            (dia, ciclo),
        )
    ]


class Eficiencia(BaseModel):
    eficiente: bool
    motivo: str | None = Field(default=None, max_length=300)  # obrigatório ao marcar Não


@roteador.put("/{item_id}/eficiente", response_model=EsterilizacoesDoTurno)
def eficiencia(
    item_id: int,
    pedido: Eficiencia,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> EsterilizacoesDoTurno:
    """Sim ou Não do "Esterilização eficiente" (fita e nota da autoclave); vale para o ciclo todo (todos os materiais dele)."""
    motivo = (pedido.motivo or "").strip()
    if not pedido.eficiente and len(motivo) < 5:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o motivo de marcar Não eficiente.")
    _, ciclo, *_ = _do_turno(con, pessoa, item_id)
    _, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    con.execute(
        """
        UPDATE app.esterilizacoes
           SET eficiente = %s, antes = %s, corrigida_por = %s, corrigida_em = clock_timestamp(), motivo_correcao = %s
         WHERE excluida_em IS NULL AND dia = %s AND lower(trim(ciclo)) = lower(trim(%s)) AND eficiente <> %s
        """,
        (
            pedido.eficiente, f"Eficiente: {'Não' if pedido.eficiente else 'Sim'}", pessoa.usuario_id,
            motivo or "Eficiente confirmado (Sim)", dia, ciclo, pedido.eficiente,
        ),
    )
    return _pagina(con, pessoa)


class Correcao(Registro):
    motivo: str = Field(max_length=300)


@roteador.put("/{item_id}", response_model=EsterilizacoesDoTurno)
def corrigir(
    item_id: int,
    correcao: Correcao,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> EsterilizacoesDoTurno:
    """Corrige tipo, ciclo, meio ou descrição; pede motivo e guarda o que estava escrito antes."""
    if len(correcao.motivo.strip()) < 5:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o motivo da correção.")
    atual = _do_turno(con, pessoa, item_id)
    antes = _resumo(*atual)
    tipo, ciclo, meio, descricao = _limpar(correcao)
    _, dia = rotas_atividades._turno_da_pessoa(con, pessoa)
    pagina = None if ciclo.lower() == atual[1].strip().lower() else laudo_esterilizacao.atribuir_pagina(con, dia, ciclo)
    con.execute(
        """
        UPDATE app.esterilizacoes
           SET tipo = %s, ciclo = %s, meio = %s, descricao = %s, antes = %s,
               corrigida_por = %s, corrigida_em = clock_timestamp(), motivo_correcao = %s,
               laudo_id = coalesce(%s, laudo_id)
         WHERE id = %s
        """,
        (tipo, ciclo, meio, descricao, antes, pessoa.usuario_id, correcao.motivo.strip(), pagina, item_id),
    )
    return _pagina(con, pessoa)


class Exclusao(BaseModel):
    motivo: str = Field(max_length=300)


@roteador.post("/{item_id}/excluir", response_model=EsterilizacoesDoTurno)
def excluir(
    item_id: int,
    exclusao: Exclusao,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> EsterilizacoesDoTurno:
    """Tira da lista, mas não apaga: fica guardado com quem, quando e o motivo."""
    if len(exclusao.motivo.strip()) < 5:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o motivo da exclusão.")
    _do_turno(con, pessoa, item_id)
    con.execute(
        "UPDATE app.esterilizacoes SET excluida_por = %s, excluida_em = clock_timestamp(), motivo_exclusao = %s WHERE id = %s",
        (pessoa.usuario_id, exclusao.motivo.strip(), item_id),
    )
    return _pagina(con, pessoa)


class Barra(BaseModel):
    turno: str
    tipo: str
    total: int


class GraficoG4(BaseModel):
    de: date
    ate: date
    total: int
    barras: list[Barra]  # todos os turnos e tipos, com zero quando não houve


@roteador.get("/grafico", response_model=GraficoG4)
def grafico(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> GraficoG4:
    """G4 (07 §6): esterilizações por tipo e turno na semana (padrão: os últimos 7 dias, hoje incluído)."""
    hoje = rotas_turno._agora(con).astimezone(rotas_turno.FUSO).date()
    ate = ate or hoje
    de = de or ate - timedelta(days=6)
    if de > ate or (ate - de).days > 92:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha um período de até 3 meses.")
    contados = {
        (nome, tipo): n
        for nome, tipo, n in con.execute(
            """
            SELECT t.nome, e.tipo, count(*) FROM app.esterilizacoes e JOIN app.turnos t ON t.id = e.turno_id
            WHERE e.excluida_em IS NULL AND e.dia BETWEEN %s AND %s GROUP BY t.nome, e.tipo
            """,
            (de, ate),
        )
    }
    turnos = [t.nome for t in rotas_turno._turnos(con)]
    barras = [Barra(turno=t, tipo=tipo, total=contados.get((t, tipo), 0)) for t in turnos for tipo in TIPOS]
    return GraficoG4(de=de, ate=ate, total=sum(b.total for b in barras), barras=barras)
