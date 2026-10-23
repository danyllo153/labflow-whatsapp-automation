"""Relatório do turno: uma página por turno e dia, a mesma para todos, com o automático e o escrito à mão.

Spec: 07-app-pwa.md (v1.0), "4. Relatório do turno"; 08 A9 e A10. Tarefa: APP-024 (o encerrar é a APP-025).
Tabela `app.relatorios_turno` (migration 052): só o que é escrito à mão; o resto é calculado na hora pelas views bi.*.

Como um registro cai no turno: pela hora em que foi gravado, dentro do horário padrão do turno (a Madrugada conta no dia
em que começou). Só coletas, leituras de NFC e drops guardam a hora (PB1); C.T/B.L, TAB, Coliformes e Howard guardam só
a data, então aparecem em uma linha "do dia", sem separar por turno.
"Adiantado": registrado antes da data prevista (placas `<1` e drops adiantados pelo Admin); fica numa linha separada e
não conta como feito no turno em que foi digitado.
"""

from datetime import date, datetime, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from labflow_api import rotas_atividades, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_pendencias import BLOCOS, PENDENCIAS_SQL
from labflow_api.rotas_turno import FUSO, Turno

roteador = APIRouter(prefix="/turno/relatorio", tags=["turno"])

LIMITE_ADIANTADOS = 50


class Analista(BaseModel):
    nome: str
    entrada: str
    saida: str | None
    corrigido: bool


class PorPessoa(BaseModel):
    quem: str
    n: int


class GrupoFeito(BaseModel):
    tipo: str
    total: int
    por_pessoa: list[PorPessoa]


class AtividadeFeita(BaseModel):
    texto: str
    quem: str | None
    quando: str | None


class Adiantado(BaseModel):
    tipo: str
    referencia: str
    prevista: date
    quem: str | None


class Adiantados(BaseModel):
    total: int
    itens: list[Adiantado]


class PendentesBloco(BaseModel):
    bloco: str
    vence_hoje: int
    atrasados: int


class Pendentes(BaseModel):
    vence_hoje: int
    atrasados: int
    desvios_abertos: int
    por_bloco: list[PendentesBloco]


class DoDia(BaseModel):
    contagens_lidas: int  # C.T/B.L lidos no dia
    testes_com_resultado: int  # TAB, Coliformes e Howard com resultado no dia


class Escritos(BaseModel):
    pendencias_escritas: str | None
    esterilizacoes_pendentes: str | None
    ocorrencias: str | None


class Vizinho(BaseModel):
    turno_id: int
    turno: str
    dia: date


class Encerramento(BaseModel):
    encerrado: bool
    por: str | None
    quando: str | None  # HH:MM
    automatico: bool


class RelatorioTurno(BaseModel):
    turno_id: int
    turno: str
    dia: date
    inicio: str
    fim: str
    em_andamento: bool
    anterior: Vizinho
    proximo: Vizinho | None
    analistas: list[Analista]
    analistas_extras: str | None
    feito: list[GrupoFeito]
    atividades_feitas: list[AtividadeFeita]
    atividades_nao_feitas: list[str]
    adiantados: Adiantados
    pendentes: Pendentes
    do_dia: DoDia
    escritos: Escritos
    encerramento: Encerramento
    atualizado_por: str | None
    pode_editar: bool


FEITO_SQL = {
    "Coletas": """
        SELECT coalesce(nullif(registrado_por, ''), 'Sem nome'), count(*) FROM bi.coletas
        WHERE registrado_em >= %(de)s AND registrado_em < %(ate)s GROUP BY 1 ORDER BY 2 DESC, 1""",
    "Leituras de NFC": """
        SELECT coalesce(nullif(lida_por, ''), 'Sem nome'), count(*) FROM bi.leituras_nfc
        WHERE lida_em >= %(de)s AND lida_em < %(ate)s
          AND (prevista IS NULL OR (lida_em AT TIME ZONE 'America/Sao_Paulo')::date >= prevista)
        GROUP BY 1 ORDER BY 2 DESC, 1""",
    "Drops concluídos": """
        SELECT coalesce(nullif(concluido_por, ''), 'Sem nome'), count(*) FROM bi.drops
        WHERE concluido_em >= %(de)s AND concluido_em < %(ate)s
          AND (prevista IS NULL OR (concluido_em AT TIME ZONE 'America/Sao_Paulo')::date >= prevista)
        GROUP BY 1 ORDER BY 2 DESC, 1""",
}

ADIANTADOS_SQL = """
SELECT * FROM (
    SELECT 'Leitura de NFC' AS tipo,
           CASE WHEN origem = 'Terra' THEN 'Tanque ' || tanque ELSE navio || ' · tanque ' || tanque END
             || ' (coleta ' || to_char(data_coleta, 'DD/MM') || ') · ' || analise || ' ' || frasco AS referencia,
           prevista, lida_por AS quem, lida_em AS quando
    FROM bi.leituras_nfc
    WHERE lida_em >= %(de)s AND lida_em < %(ate)s AND (lida_em AT TIME ZONE 'America/Sao_Paulo')::date < prevista
    UNION ALL
    SELECT 'Drop ' || drop,
           CASE WHEN origem = 'Terra' THEN 'Tanque ' || tanque ELSE navio || ' · tanque ' || tanque END
             || ' (coleta ' || to_char(data_coleta, 'DD/MM') || ')',
           prevista, concluido_por, concluido_em
    FROM bi.drops
    WHERE concluido_em >= %(de)s AND concluido_em < %(ate)s AND (concluido_em AT TIME ZONE 'America/Sao_Paulo')::date < prevista
) a ORDER BY quando
"""

DO_DIA_SQL = """
SELECT (SELECT count(*) FROM bi.contagens WHERE data_leitura = %(dia)s),
       (SELECT count(*) FROM bi.testes WHERE data_resultado = %(dia)s)
"""

ESCRITOS_SQL = """
SELECT r.pendencias_escritas, r.esterilizacoes_pendentes, r.ocorrencias, r.analistas_extras,
       r.encerrado_em, r.encerramento_automatico, coalesce(ue.nome, ce.usuario),
       coalesce(ua.nome, ca.usuario)
FROM app.relatorios_turno r
LEFT JOIN usuarios ue ON ue.id = r.encerrado_por LEFT JOIN app.credenciais ce ON ce.usuario_id = r.encerrado_por
LEFT JOIN usuarios ua ON ua.id = r.atualizado_por LEFT JOIN app.credenciais ca ON ca.usuario_id = r.atualizado_por
WHERE r.turno_id = %s AND r.dia = %s
"""


def _janela_do(turnos: list[Turno], turno_id: int | None, dia: date | None, padrao: tuple[Turno, date]):
    if turno_id is None or dia is None:
        return padrao
    turno = next((t for t in turnos if t.id == turno_id), None)
    if turno is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turno não encontrado.")
    return turno, dia


def _vizinho(turnos: list[Turno], instante: datetime) -> Vizinho:
    turno, dia = rotas_turno.turno_agora(turnos, instante)
    return Vizinho(turno_id=turno.id, turno=turno.nome, dia=dia)



def _montar(con: psycopg.Connection, pessoa: PessoaLogada, turno: Turno, dia: date) -> RelatorioTurno:
    turnos = rotas_turno._turnos(con)
    agora = rotas_turno._agora(con)
    comeco, fim = rotas_turno.janela(turno, dia)
    if comeco > agora:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"O turno {turno.nome} de {dia:%d/%m} ainda não começou.")
    janela = {"de": comeco, "ate": fim, "dia": dia, "turno": turno.id}

    analistas = [
        Analista(nome=nome, entrada=rotas_turno._hhmm(e), saida=rotas_turno._hhmm(s), corrigido=corrigida)
        for nome, e, s, corrigida in con.execute(
            """
            SELECT coalesce(u.nome, c.usuario), e.entrada, e.saida, e.motivo_correcao IS NOT NULL
            FROM app.entradas_turno e JOIN usuarios u ON u.id = e.usuario_id
            LEFT JOIN app.credenciais c ON c.usuario_id = e.usuario_id
            WHERE e.turno_id = %s AND e.dia = %s ORDER BY e.entrada
            """,
            (turno.id, dia),
        )
    ]

    feito = []
    for tipo, sql in FEITO_SQL.items():
        pessoas = [PorPessoa(quem=q, n=n) for q, n in con.execute(sql, janela)]
        feito.append(GrupoFeito(tipo=tipo, total=sum(p.n for p in pessoas), por_pessoa=pessoas))

    lista = rotas_atividades._lista(con, turno, dia)
    feitas = [AtividadeFeita(texto=a.texto, quem=a.quem, quando=a.quando) for a in lista if a.estado == "feito"]
    nao_feitas = [a.texto for a in lista if a.estado != "feito"]
    feito.append(GrupoFeito(tipo="Atividades do turno", total=len(feitas), por_pessoa=[]))

    adiantados = con.execute(ADIANTADOS_SQL, janela).fetchall()

    pend = con.execute(
        f"SELECT bloco, situacao, count(*) FROM ({PENDENCIAS_SQL}) q GROUP BY bloco, situacao"
    ).fetchall()
    por_bloco: dict[str, PendentesBloco] = {}
    for bloco, situacao, n in pend:
        b = por_bloco.setdefault(bloco, PendentesBloco(bloco=bloco, vence_hoje=0, atrasados=0))
        if situacao == "Atrasado":
            b.atrasados += n
        else:
            b.vence_hoje += n
    ordem = {b: i for i, b in enumerate(BLOCOS)}
    blocos = sorted(por_bloco.values(), key=lambda b: ordem.get(b.bloco, 99))
    pendentes = Pendentes(
        vence_hoje=sum(b.vence_hoje for b in blocos), atrasados=sum(b.atrasados for b in blocos),
        desvios_abertos=con.execute("SELECT count(*) FROM bi.desvios WHERE status <> 'Concluído'").fetchone()[0],
        por_bloco=blocos,
    )

    contagens, testes = con.execute(DO_DIA_SQL, {"dia": dia}).fetchone()
    registro = con.execute(ESCRITOS_SQL, (turno.id, dia)).fetchone()
    pend_esc, est_pend, ocorrencias, extras, enc_em, enc_auto, enc_por, atualizado_por = registro or (None,) * 8
    encerrado = enc_em is not None

    return RelatorioTurno(
        turno_id=turno.id, turno=turno.nome, dia=dia, inicio=rotas_turno._hhmm(turno.inicio), fim=rotas_turno._hhmm(turno.fim),
        em_andamento=comeco <= agora < fim,
        anterior=_vizinho(turnos, comeco - timedelta(minutes=1)),
        proximo=_vizinho(turnos, fim) if fim <= agora else None,
        analistas=analistas, analistas_extras=extras, feito=feito,
        atividades_feitas=feitas, atividades_nao_feitas=nao_feitas,
        adiantados=Adiantados(
            total=len(adiantados),
            itens=[Adiantado(tipo=t, referencia=r, prevista=p, quem=q) for t, r, p, q, _ in adiantados[:LIMITE_ADIANTADOS]],
        ),
        pendentes=pendentes, do_dia=DoDia(contagens_lidas=contagens, testes_com_resultado=testes),
        escritos=Escritos(pendencias_escritas=pend_esc, esterilizacoes_pendentes=est_pend, ocorrencias=ocorrencias),
        encerramento=Encerramento(
            encerrado=encerrado, por=enc_por, quando=rotas_turno._hhmm(enc_em) if enc_em else None, automatico=bool(enc_auto)
        ),
        atualizado_por=atualizado_por,
        pode_editar=pode(pessoa.cargo, "registrar_analise") and not encerrado,
    )


@roteador.get("", response_model=RelatorioTurno)
def relatorio(
    turno_id: int | None = Query(default=None),
    dia: date | None = Query(default=None),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> RelatorioTurno:
    turnos = rotas_turno._turnos(con)
    turno, dia_escolhido = _janela_do(turnos, turno_id, dia, rotas_atividades._turno_da_pessoa(con, pessoa))
    return _montar(con, pessoa, turno, dia_escolhido)


class Escrito(BaseModel):
    turno_id: int
    dia: date
    pendencias_escritas: str | None = Field(default=None, max_length=4000)
    esterilizacoes_pendentes: str | None = Field(default=None, max_length=2000)
    ocorrencias: str | None = Field(default=None, max_length=4000)
    analistas_extras: str | None = Field(default=None, max_length=500)


CAMPOS = ("pendencias_escritas", "esterilizacoes_pendentes", "ocorrencias", "analistas_extras")


def relatorio_encerrado(con: psycopg.Connection, turno_id: int, dia: date) -> bool:
    linha = con.execute(
        "SELECT encerrado_em IS NOT NULL FROM app.relatorios_turno WHERE turno_id = %s AND dia = %s", (turno_id, dia)
    ).fetchone()
    return bool(linha and linha[0])


@roteador.put("", response_model=RelatorioTurno)
def escrever(
    pedido: Escrito,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> RelatorioTurno:
    """Grava os campos escritos à mão que vieram no pedido (os que não vieram ficam como estão)."""
    turnos = rotas_turno._turnos(con)
    turno = next((t for t in turnos if t.id == pedido.turno_id), None)
    if turno is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turno não encontrado.")
    if rotas_turno.janela(turno, pedido.dia)[0] > rotas_turno._agora(con):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Esse turno ainda não começou.")
    if relatorio_encerrado(con, turno.id, pedido.dia):
        raise HTTPException(status.HTTP_409_CONFLICT, "O relatório está encerrado: só leitura. O Admin pode reabrir.")
    enviados = {c: (getattr(pedido, c) or "").strip() or None for c in CAMPOS if c in pedido.model_fields_set}
    if enviados:
        colunas = ", ".join(enviados)
        marcas = ", ".join(f"%({c})s" for c in enviados)
        atualiza = ", ".join(f"{c} = EXCLUDED.{c}" for c in enviados)
        con.execute(
            f"""
            INSERT INTO app.relatorios_turno (turno_id, dia, {colunas}, atualizado_por, atualizado_em)
            VALUES (%(turno)s, %(dia)s, {marcas}, %(quem)s, now())
            ON CONFLICT (turno_id, dia) DO UPDATE SET {atualiza}, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()
            """,
            {**enviados, "turno": turno.id, "dia": pedido.dia, "quem": pessoa.usuario_id},
        )
    return _montar(con, pessoa, turno, pedido.dia)
