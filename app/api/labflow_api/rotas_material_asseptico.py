"""Controle de Material Asséptico: o que foi usado em cada dia de análise (ciclos e lotes), C.T./B.L. e o laudo.

Spec: 07-app-pwa.md (v1.0), §7.2 Material asséptico. Tarefa: APP-041. Tabelas da migration 059.

Regras (decididas com o Danyllo em 24/10):
- um registro por dia de análise; quem grava fica como responsável pelo preenchimento;
- o app SUGERE: os ciclos do dia anterior registrado mais os ciclos esterilizados depois dele (ponteira, água de
  diluição, meio) e os lotes de placa anotados por último; o analista confirma, tira ou acrescenta livremente
  (análises fora do roteiro usam outro meio, outra placa ou água para diluir algo);
- os lotes das placas (P pequenas, G grandes para tanques de NFC) são anotação livre: não têm cadastro nem laudo;
- C.T. e B.L. começam em "<1";
- o laudo tem 9 dias por página: cheia = pendente de imprimir; o Visto é à mão.
"""

from datetime import date, timedelta

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field

from labflow_api import laudo_asseptico as laudo
from labflow_api import laudo_esterilizacao, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/material-asseptico", tags=["material asséptico"])

CAMPOS = ("ponteiras", "agua_diluicao", "placas", "meios")
TIPO_DO_CAMPO = {"ponteiras": "Ponteira", "agua_diluicao": "Água de diluição", "meios": "Meio"}
DIAS_SEM_REGISTRO_ANTERIOR = 7


class Uso(BaseModel):
    ponteiras: str | None
    agua_diluicao: str | None
    placas: str | None
    meios: str | None


class Registro(Uso):
    ct: str
    bl: str
    quem: str
    quando: str  # dd/mm HH:MM


class DiaDoMaterial(BaseModel):
    dia: date
    pode_preencher: bool
    registro: Registro | None
    sugestao: Uso
    recentes: list[date]  # dias já preenchidos (os últimos 10), para conferir


def _hoje(con: psycopg.Connection) -> date:
    return rotas_turno._agora(con).astimezone(FUSO).date()


def _juntar(*listas: str | None) -> str | None:
    vistos: list[str] = []
    for texto in listas:
        for item in (texto or "").replace(";", ",").split(","):
            item = item.strip()
            if item and item.lower() not in {v.lower() for v in vistos}:
                vistos.append(item)
    return ", ".join(vistos) or None


def _sugestao(con: psycopg.Connection, dia: date) -> Uso:
    anterior = con.execute(
        "SELECT dia, ponteiras, agua_diluicao, placas, meios FROM app.material_asseptico WHERE dia < %s ORDER BY dia DESC LIMIT 1",
        (dia,),
    ).fetchone()
    desde = anterior[0] if anterior else dia - timedelta(days=DIAS_SEM_REGISTRO_ANTERIOR)
    novos: dict[str, list[str]] = {campo: [] for campo in TIPO_DO_CAMPO}
    for tipo, ciclo in con.execute(
        """
        SELECT tipo, trim(ciclo) FROM app.esterilizacoes
        WHERE excluida_em IS NULL AND eficiente
          AND (feita_em AT TIME ZONE 'America/Sao_Paulo')::date > %s AND (feita_em AT TIME ZONE 'America/Sao_Paulo')::date <= %s
        ORDER BY feita_em
        """,
        (desde, dia),
    ):
        for campo, t in TIPO_DO_CAMPO.items():
            if t == tipo:
                novos[campo].append(ciclo)
    antes = dict(zip(CAMPOS, anterior[1:])) if anterior else dict.fromkeys(CAMPOS)
    return Uso(
        ponteiras=_juntar(antes["ponteiras"], ", ".join(novos["ponteiras"])),
        agua_diluicao=_juntar(antes["agua_diluicao"], ", ".join(novos["agua_diluicao"])),
        placas=_juntar(antes["placas"]),
        meios=_juntar(antes["meios"], ", ".join(novos["meios"])),
    )


REGISTRO_SQL = """
SELECT m.ponteiras, m.agua_diluicao, m.placas, m.meios, m.ct, m.bl, coalesce(u.nome, c.usuario), m.preenchido_em
FROM app.material_asseptico m JOIN usuarios u ON u.id = m.preenchido_por LEFT JOIN app.credenciais c ON c.usuario_id = m.preenchido_por
WHERE m.dia = %s
"""


def _dia(con: psycopg.Connection, pessoa: PessoaLogada, dia: date) -> DiaDoMaterial:
    linha = con.execute(REGISTRO_SQL, (dia,)).fetchone()
    registro = None
    if linha:
        p, a, pl, m, ct, bl, quem, quando = linha
        registro = Registro(
            ponteiras=p, agua_diluicao=a, placas=pl, meios=m, ct=ct, bl=bl, quem=quem,
            quando=quando.astimezone(FUSO).strftime("%d/%m %H:%M"),
        )
    recentes = [d for (d,) in con.execute("SELECT dia FROM app.material_asseptico ORDER BY dia DESC LIMIT 10")]
    return DiaDoMaterial(
        dia=dia, pode_preencher=pode(pessoa.cargo, "registrar_analise"), registro=registro,
        sugestao=_sugestao(con, dia), recentes=recentes,
    )


def _conferir_dia(con: psycopg.Connection, dia: date) -> None:
    if not laudo.dia_valido(dia, _hoje(con)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha hoje ou um dos 7 dias anteriores.")


@roteador.get("", response_model=DiaDoMaterial)
def ver_dia(
    dia: date | None = Query(default=None),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> DiaDoMaterial:
    return _dia(con, pessoa, dia or _hoje(con))


class Preenchimento(BaseModel):
    ponteiras: str | None = Field(default=None, max_length=200)
    agua_diluicao: str | None = Field(default=None, max_length=200)
    placas: str | None = Field(default=None, max_length=200)
    meios: str | None = Field(default=None, max_length=200)
    ct: str = Field(default="<1", max_length=10)
    bl: str = Field(default="<1", max_length=10)


def _pagina_com_vaga(con: psycopg.Connection) -> int:
    con.execute("SELECT pg_advisory_xact_lock(59)")
    linha = con.execute(
        """
        SELECT p.id FROM app.paginas_laudo p
        WHERE p.laudo = %s AND p.impresso_em IS NULL
          AND (SELECT count(*) FROM app.material_asseptico m WHERE m.pagina_id = p.id) < %s
        ORDER BY p.id LIMIT 1
        """,
        (laudo.NOME_DO_MODELO, laudo.DIAS_POR_PAGINA),
    ).fetchone()
    if linha:
        return linha[0]
    return con.execute("INSERT INTO app.paginas_laudo (laudo) VALUES (%s) RETURNING id", (laudo.NOME_DO_MODELO,)).fetchone()[0]


@roteador.put("/{dia}", response_model=DiaDoMaterial)
def preencher(
    dia: date,
    pedido: Preenchimento,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> DiaDoMaterial:
    """Grava (ou corrige) o dia; quem grava passa a ser o responsável pelo preenchimento."""
    _conferir_dia(con, dia)
    valores = {campo: _juntar(getattr(pedido, campo)) for campo in CAMPOS}
    ct, bl = pedido.ct.strip() or "<1", pedido.bl.strip() or "<1"
    existe = con.execute("SELECT 1 FROM app.material_asseptico WHERE dia = %s", (dia,)).fetchone()
    if existe:
        con.execute(
            """
            UPDATE app.material_asseptico SET ponteiras = %(ponteiras)s, agua_diluicao = %(agua_diluicao)s, placas = %(placas)s,
                   meios = %(meios)s, ct = %(ct)s, bl = %(bl)s, preenchido_por = %(quem)s, preenchido_em = clock_timestamp()
            WHERE dia = %(dia)s
            """,
            {**valores, "ct": ct, "bl": bl, "quem": pessoa.usuario_id, "dia": dia},
        )
    else:
        con.execute(
            """
            INSERT INTO app.material_asseptico (dia, ponteiras, agua_diluicao, placas, meios, ct, bl, preenchido_por, preenchido_em, pagina_id)
            VALUES (%(dia)s, %(ponteiras)s, %(agua_diluicao)s, %(placas)s, %(meios)s, %(ct)s, %(bl)s, %(quem)s, clock_timestamp(), %(pagina)s)
            """,
            {**valores, "ct": ct, "bl": bl, "quem": pessoa.usuario_id, "dia": dia, "pagina": _pagina_com_vaga(con)},
        )
    return _dia(con, pessoa, dia)


# --- laudo ---------------------------------------------------------------------------------------------------------


class Pagina(BaseModel):
    id: int
    numero: int
    linhas: int  # dias preenchidos na página
    capacidade: int
    cheia: bool
    impresso: bool
    impresso_por: str | None
    impresso_em: str | None
    de: date | None
    ate: date | None


class Laudos(BaseModel):
    pode_enviar_modelo: bool
    modelo_enviado: bool
    modelo_enviado_em: str | None
    paginas: list[Pagina]


PAGINAS_SQL = """
SELECT p.id, row_number() OVER (ORDER BY p.id), p.impresso_em, coalesce(u.nome, c.usuario),
       (SELECT count(*) FROM app.material_asseptico m WHERE m.pagina_id = p.id),
       (SELECT min(dia) FROM app.material_asseptico m WHERE m.pagina_id = p.id),
       (SELECT max(dia) FROM app.material_asseptico m WHERE m.pagina_id = p.id)
FROM app.paginas_laudo p LEFT JOIN usuarios u ON u.id = p.impresso_por LEFT JOIN app.credenciais c ON c.usuario_id = p.impresso_por
WHERE p.laudo = %s ORDER BY p.id
"""


def _laudos(con: psycopg.Connection, pessoa: PessoaLogada) -> Laudos:
    paginas = [
        Pagina(
            id=i, numero=n, linhas=q, capacidade=laudo.DIAS_POR_PAGINA, cheia=q >= laudo.DIAS_POR_PAGINA,
            impresso=em is not None, impresso_por=por, impresso_em=em.astimezone(FUSO).strftime("%d/%m %H:%M") if em else None,
            de=de, ate=ate,
        )
        for i, n, em, por, q, de, ate in con.execute(PAGINAS_SQL, (laudo.NOME_DO_MODELO,)).fetchall()
        if q > 0 or em is not None
    ]
    paginas.sort(key=lambda p: (p.impresso, -p.id))
    modelo = con.execute("SELECT enviado_em FROM app.modelos_documento WHERE nome = %s", (laudo.NOME_DO_MODELO,)).fetchone()
    return Laudos(
        pode_enviar_modelo=pode(pessoa.cargo, "configurar_turnos"), modelo_enviado=modelo is not None,
        modelo_enviado_em=modelo[0].astimezone(FUSO).strftime("%d/%m/%Y %H:%M") if modelo else None, paginas=paginas,
    )


@roteador.get("/laudos", response_model=Laudos)
def listar_laudos(
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Laudos:
    return _laudos(con, pessoa)


@roteador.put("/laudos/modelo", response_model=Laudos)
async def enviar_modelo(
    pedido: Request,
    pessoa: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    """O Admin envia o PDF oficial em branco (exportado do Word); fica no banco, nunca no Git."""
    pdf = await pedido.body()
    try:
        pdf = laudo_esterilizacao.so_a_primeira_folha(pdf)
        laudo_esterilizacao.modelo_valido(pdf)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    con.execute(
        """
        INSERT INTO app.modelos_documento (nome, pdf, enviado_por, enviado_em) VALUES (%s, %s, %s, clock_timestamp())
        ON CONFLICT (nome) DO UPDATE SET pdf = EXCLUDED.pdf, enviado_por = EXCLUDED.enviado_por, enviado_em = EXCLUDED.enviado_em
        """,
        (laudo.NOME_DO_MODELO, pdf, pessoa.usuario_id),
    )
    return _laudos(con, pessoa)


def _da_pagina(con: psycopg.Connection, pagina_id: int) -> None:
    if con.execute("SELECT 1 FROM app.paginas_laudo WHERE id = %s AND laudo = %s", (pagina_id, laudo.NOME_DO_MODELO)).fetchone() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Página do laudo não encontrada.")


@roteador.get("/laudos/{pagina_id}/pdf")
def baixar_pdf(
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    _da_pagina(con, pagina_id)
    dias = [
        {"dia": d, "ponteiras": p, "agua_diluicao": a, "placas": pl, "meios": m, "ct": ct, "bl": bl,
         "analista": laudo_esterilizacao.primeiro_nome(quem)}
        for d, p, a, pl, m, ct, bl, quem in con.execute(
            """
            SELECT m.dia, m.ponteiras, m.agua_diluicao, m.placas, m.meios, m.ct, m.bl, coalesce(u.nome, c.usuario)
            FROM app.material_asseptico m JOIN usuarios u ON u.id = m.preenchido_por
            LEFT JOIN app.credenciais c ON c.usuario_id = m.preenchido_por
            WHERE m.pagina_id = %s ORDER BY m.dia
            """,
            (pagina_id,),
        )
    ]
    modelo = con.execute("SELECT pdf FROM app.modelos_documento WHERE nome = %s", (laudo.NOME_DO_MODELO,)).fetchone()
    pdf = laudo.gerar_pdf(dias, bytes(modelo[0]) if modelo else None)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="material-asseptico-{pagina_id}.pdf"'})


@roteador.post("/laudos/{pagina_id}/impresso", response_model=Laudos)
def marcar_impresso(
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    _da_pagina(con, pagina_id)
    con.execute(
        "UPDATE app.paginas_laudo SET impresso_por = %s, impresso_em = clock_timestamp() WHERE id = %s AND impresso_em IS NULL",
        (pessoa.usuario_id, pagina_id),
    )
    return _laudos(con, pessoa)
