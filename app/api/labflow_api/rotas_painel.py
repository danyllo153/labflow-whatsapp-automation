"""Painel do Início no visual repaginado (APP-055): o gráfico da semana e o cartão das folhas dos laudos no menu.

Spec: 07-app-pwa.md (v1.0), §3 Início e "Visual repaginado". Só leitura, pelas views do Power BI e pelas páginas dos laudos.

- Semana: o que foi CONCLUÍDO em cada um dos últimos 7 dias (hoje incluído), por tipo: TAB e Coliformes (resultado),
  NFC (leituras de tanque e drops concluídos) e C.T/B.L (leituras de recebimento, embarque e NFC recebido).
- Turnos (26/10): a média de análises e de esterilizações por turno (Manhã, Tarde, Madrugada) nos últimos 30 dias, e o
  que o turno de hoje já fez. Análise é o que tem a hora gravada: leitura de C.T/B.L (recebimento, embarque e NFC
  recebido), leitura de tanque, drop concluído e TAB/Coliformes espalhado. Cada uma vai para o turno da hora em que foi
  gravada (o horário padrão de app.turnos); a esterilização já guarda o turno.
- Folhas: de cada laudo, a folha em preenchimento (a mais cheia que ainda não foi impressa) e quantas folhas cheias esperam
  impressão. O menu mostra a que está mais perto de encher, com o atalho para o laudo.
"""

from datetime import date, datetime, time, timedelta

import psycopg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from labflow_api import laudo_asseptico, laudo_esterilizacao, laudos, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/painel", tags=["painel"])

TIPOS = ("TAB", "Coliformes", "NFC", "C.T/B.L")


class DiaDaSemana(BaseModel):
    dia: date
    contagens: dict[str, int]  # tipo -> concluídos no dia


class Semana(BaseModel):
    tipos: list[str]
    dias: list[DiaDaSemana]  # do mais antigo para hoje
    totais: dict[str, int]


SEMANA_SQL = """
WITH dias AS (SELECT generate_series(%(de)s::date, %(ate)s::date, interval '1 day')::date AS dia)
SELECT d.dia,
       (SELECT count(*) FROM bi.testes t WHERE t.teste = 'TAB' AND t.data_resultado = d.dia),
       (SELECT count(*) FROM bi.testes t WHERE t.teste = 'Coliformes' AND t.data_resultado = d.dia),
       (SELECT count(*) FROM bi.leituras_nfc l WHERE l.lida AND (l.lida_em AT TIME ZONE 'America/Sao_Paulo')::date = d.dia)
     + (SELECT count(*) FROM bi.drops r WHERE r.concluido AND (r.concluido_em AT TIME ZONE 'America/Sao_Paulo')::date = d.dia),
       (SELECT count(*) FROM bi.contagens c WHERE c.lido AND c.data_leitura = d.dia)
FROM dias d ORDER BY d.dia
"""


@roteador.get("/semana", response_model=Semana)
def semana(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> Semana:
    hoje = rotas_turno._agora(con).astimezone(FUSO).date()
    dias = [
        DiaDaSemana(dia=d, contagens=dict(zip(TIPOS, valores)))
        for d, *valores in con.execute(SEMANA_SQL, {"de": hoje - timedelta(days=6), "ate": hoje})
    ]
    return Semana(tipos=list(TIPOS), dias=dias, totais={t: sum(d.contagens[t] for d in dias) for t in TIPOS})


DIAS_DA_MEDIA = 30

ANALISES_COM_HORA_SQL = """
SELECT lido_em FROM contagens WHERE lido_em >= %(de)s
UNION ALL SELECT lida_em FROM bi.leituras_nfc WHERE lida AND lida_em >= %(de)s
UNION ALL SELECT concluido_em FROM bi.drops WHERE concluido AND concluido_em >= %(de)s
UNION ALL SELECT espalhado_em FROM bi.testes WHERE espalhado_em >= %(de)s
"""

ESTERILIZACOES_SQL = """
SELECT turno_id, dia, count(*) FROM app.esterilizacoes
WHERE excluida_em IS NULL AND dia >= %(de)s::date
GROUP BY turno_id, dia
"""


class MediaDoTurno(BaseModel):
    turno: str
    inicio: str  # HH:MM
    fim: str
    analises: float  # média por turno nos últimos 30 dias (sem contar hoje)
    esterilizacoes: float
    hoje_analises: int  # o turno de hoje (ou o de agora, se ainda está correndo)
    hoje_esterilizacoes: int
    agora: bool  # é o turno em andamento


class MediasPorTurno(BaseModel):
    dias: int
    turnos: list[MediaDoTurno]


@roteador.get("/turnos", response_model=MediasPorTurno)
def medias_por_turno(
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)
) -> MediasPorTurno:
    turnos = rotas_turno._turnos(con)
    agora = rotas_turno._agora(con)
    turno_de_agora, dia_de_agora = rotas_turno.turno_agora(turnos, agora)
    hoje = agora.astimezone(FUSO).date()
    de = datetime.combine(hoje - timedelta(days=DIAS_DA_MEDIA), time(0), FUSO)
    passado = {t.id: 0 for t in turnos}
    do_dia = {t.id: 0 for t in turnos}
    for (quando,) in con.execute(ANALISES_COM_HORA_SQL, {"de": de}):
        turno, dia = rotas_turno.turno_agora(turnos, quando)
        if dia == hoje or (turno.id == turno_de_agora.id and dia == dia_de_agora):
            do_dia[turno.id] += 1
        elif dia < hoje:
            passado[turno.id] += 1
    est_passado = {t.id: 0 for t in turnos}
    est_do_dia = {t.id: 0 for t in turnos}
    for turno_id, dia, n in con.execute(ESTERILIZACOES_SQL, {"de": de}):
        if turno_id not in passado:
            continue
        if dia == hoje or (turno_id == turno_de_agora.id and dia == dia_de_agora):
            est_do_dia[turno_id] += n
        elif dia < hoje:
            est_passado[turno_id] += n
    return MediasPorTurno(
        dias=DIAS_DA_MEDIA,
        turnos=[
            MediaDoTurno(
                turno=t.nome, inicio=t.inicio.strftime("%H:%M"), fim=t.fim.strftime("%H:%M"),
                analises=round(passado[t.id] / DIAS_DA_MEDIA, 1), esterilizacoes=round(est_passado[t.id] / DIAS_DA_MEDIA, 1),
                hoje_analises=do_dia[t.id], hoje_esterilizacoes=est_do_dia[t.id], agora=t.id == turno_de_agora.id,
            )
            for t in turnos
        ],
    )


class Folha(BaseModel):
    laudo: str
    titulo: str
    caminho: str  # a tela do app onde o laudo está
    linhas: int  # na folha em preenchimento
    capacidade: int
    cheias: int  # folhas cheias esperando impressão


# o laudo -> a tela onde ele fica no app
CAMINHOS = {
    "material-asseptico": "/material-asseptico",
    "agua-processo": "/paginas/agua-processo",
    "superficies-Baia": "/paginas/baias",
    "superficies-Linha": "/paginas/linhas",
    "fluxo-laminar": "/fluxo-laminar",
    "incubacao": "/incubacao",
    "recebimento-fcoj": "/analises/recebimento-fcoj?aba=laudo",
    "esterilizacao": "/esterilizacao",
}


def _caminho(nome: str) -> str:
    return "/meios-lotes" if nome.startswith("meios-") else CAMINHOS.get(nome, "/registros-diarios")


def _resumo(nome: str, titulo: str, contagens: list[int], capacidade: int) -> Folha | None:
    """`contagens`: linhas de cada folha ainda não impressa."""
    if not contagens or not any(contagens):
        return None
    abertas = [n for n in contagens if n < capacidade]
    return Folha(
        laudo=nome, titulo=titulo, caminho=_caminho(nome), linhas=max(abertas) if abertas else capacidade,
        capacidade=capacidade, cheias=sum(1 for n in contagens if n >= capacidade),
    )


@roteador.get("/folhas", response_model=list[Folha])
def folhas(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> list[Folha]:
    """As folhas dos laudos: as cheias primeiro, depois as mais perto de encher."""
    if pode(pessoa.cargo, "registrar_analise"):  # o branco dos dias com análise entra sozinho (25/10, APP-067)
        from labflow_api.rotas_fluxo_laminar import preencher_sozinho

        preencher_sozinho(con, pessoa.usuario_id)
    resultado: list[Folha] = []
    for laudo in laudos.LAUDOS.values():
        contagens = [
            con.execute(laudo.contar_sql, (pagina_id,)).fetchone()[0]
            for (pagina_id,) in con.execute(
                "SELECT id FROM app.paginas_laudo WHERE laudo = %s AND impresso_em IS NULL ORDER BY id", (laudo.nome,)
            )
        ]
        if (folha := _resumo(laudo.nome, laudo.titulo, contagens, laudo.capacidade)) is not None:
            resultado.append(folha)
    material = [
        n for (n,) in con.execute(
            """
            SELECT (SELECT count(*) FROM app.material_asseptico m WHERE m.pagina_id = p.id AND m.excluido_em IS NULL)
            FROM app.paginas_laudo p WHERE p.laudo = %s AND p.impresso_em IS NULL ORDER BY p.id
            """,
            (laudo_asseptico.NOME_DO_MODELO,),
        )
    ]
    if (folha := _resumo("material-asseptico", "Material asséptico", material, laudo_asseptico.DIAS_POR_PAGINA)) is not None:
        resultado.append(folha)
    esterilizacao = [
        n for (n,) in con.execute(
            """
            SELECT (SELECT count(*) FROM (SELECT 1 FROM app.esterilizacoes e WHERE e.laudo_id = l.id AND e.excluida_em IS NULL
                                          GROUP BY e.dia, lower(trim(e.ciclo))) x)
            FROM app.laudos_esterilizacao l WHERE l.impresso_em IS NULL ORDER BY l.id
            """
        )
    ]
    if (folha := _resumo("esterilizacao", "Ciclos de esterilização", esterilizacao, laudo_esterilizacao.CAPACIDADE)) is not None:
        resultado.append(folha)
    resultado.sort(key=lambda f: (-f.cheias, -(f.linhas / f.capacidade)))
    return resultado
