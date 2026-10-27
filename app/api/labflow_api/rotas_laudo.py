"""Laudo de esterilização: as páginas (cheias ficam "pendentes de imprimir"), o PDF preenchido e o modelo da empresa.

Spec: 07-app-pwa.md (v1.0), §7 Esterilização (laudo). Tarefa: APP-035. Tabelas da migration 058.
Regras (decididas com o Danyllo em 23/10): o número do ciclo é digitado pela pessoa (o app não sugere); a assinatura (Visto)
fica em branco para assinar à mão; o PDF oficial da empresa fica no banco, enviado pelo Admin, e nunca vai para o Git.
"""

from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from labflow_api import laudo_esterilizacao as laudo
from labflow_api import laudos
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/esterilizacao/laudos", tags=["esterilização"])


class Pagina(BaseModel):
    id: int
    numero: int  # 1, 2, 3... na ordem em que as páginas foram abertas
    linhas: int
    capacidade: int
    cheia: bool
    impresso: bool
    impresso_por: str | None
    impresso_em: str | None  # dd/mm HH:MM
    de: date | None
    ate: date | None


class Laudos(BaseModel):
    pode_enviar_modelo: bool
    modelo_enviado: bool
    modelo_enviado_em: str | None
    paginas: list[Pagina]  # as pendentes primeiro, depois as impressas (mais nova primeiro)


PAGINAS_SQL = """
SELECT l.id, row_number() OVER (ORDER BY l.id), l.impresso_em, coalesce(u.nome, c.usuario),
       (SELECT count(*) FROM (SELECT 1 FROM app.esterilizacoes e WHERE e.laudo_id = l.id AND e.excluida_em IS NULL
                              GROUP BY e.dia, lower(trim(e.ciclo))) x),
       (SELECT min(e.feita_em) FROM app.esterilizacoes e WHERE e.laudo_id = l.id AND e.excluida_em IS NULL),
       (SELECT max(e.feita_em) FROM app.esterilizacoes e WHERE e.laudo_id = l.id AND e.excluida_em IS NULL)
FROM app.laudos_esterilizacao l LEFT JOIN usuarios u ON u.id = l.impresso_por LEFT JOIN app.credenciais c ON c.usuario_id = l.impresso_por
WHERE l.excluida_em IS NULL
ORDER BY l.id
"""


def _modelo(con: psycopg.Connection):
    return con.execute("SELECT pdf, enviado_em FROM app.modelos_documento WHERE nome = %s", (laudo.NOME_DO_MODELO,)).fetchone()


def _laudos(con: psycopg.Connection, pessoa: PessoaLogada) -> Laudos:
    paginas = []
    for id_, numero, impresso_em, impresso_por, linhas, de, ate in con.execute(PAGINAS_SQL).fetchall():
        if linhas == 0 and impresso_em is None:
            continue  # página vazia (as linhas foram excluídas): não aparece
        paginas.append(
            Pagina(
                id=id_, numero=numero, linhas=linhas, capacidade=laudo.CAPACIDADE, cheia=linhas >= laudo.CAPACIDADE,
                impresso=impresso_em is not None, impresso_por=impresso_por,
                impresso_em=impresso_em.astimezone(FUSO).strftime("%d/%m %H:%M") if impresso_em else None,
                de=de.astimezone(FUSO).date() if de else None, ate=ate.astimezone(FUSO).date() if ate else None,
            )
        )
    paginas.sort(key=lambda p: (p.impresso, -p.id))
    modelo = con.execute("SELECT enviado_em FROM app.modelos_documento WHERE nome = %s", (laudo.NOME_DO_MODELO,)).fetchone()
    return Laudos(
        pode_enviar_modelo=pode(pessoa.cargo, "configurar_turnos"), modelo_enviado=modelo is not None,
        modelo_enviado_em=modelo[0].astimezone(FUSO).strftime("%d/%m/%Y %H:%M") if modelo else None, paginas=paginas,
    )


@roteador.get("", response_model=Laudos)
def listar(
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Laudos:
    return _laudos(con, pessoa)


MAXIMO_DO_MODELO = 4_000_000


@roteador.put("/modelo", response_model=Laudos)
async def enviar_modelo(
    pedido: Request,
    pessoa: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    """O Admin envia o PDF oficial (a folha com as linhas em branco): o corpo da chamada é o próprio PDF."""
    pdf = await pedido.body()
    if len(pdf) > MAXIMO_DO_MODELO:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O PDF é grande demais (máximo de 4 MB).")
    try:
        pdf = laudo.so_a_primeira_folha(pdf)
        laudo.modelo_valido(pdf)
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


def _existe(con: psycopg.Connection, laudo_id: int) -> None:
    if con.execute("SELECT 1 FROM app.laudos_esterilizacao WHERE id = %s AND excluida_em IS NULL", (laudo_id,)).fetchone() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Página do laudo não encontrada.")


@roteador.get("/{laudo_id}/pdf")
def baixar_pdf(
    laudo_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    """O PDF da página, com as linhas escritas sobre o modelo da empresa (ou o de demonstração)."""
    _existe(con, laudo_id)
    modelo = _modelo(con)
    linhas = laudo.linhas_da_pagina(con, laudo_id)
    pdf = laudo.gerar_pdf(linhas, bytes(modelo[0]) if modelo else None)
    if con.execute("SELECT impresso_em IS NOT NULL FROM app.laudos_esterilizacao WHERE id = %s", (laudo_id,)).fetchone()[0]:
        # laudo finalizado: o traço que fecha as linhas vazias, como em todo documento (26/10)
        risco = laudos.Tabela(laudo.COLUNAS_X, laudo.TOPO_DAS_LINHAS, laudo.BASE_DAS_LINHAS, laudo.CAPACIDADE).traco_das_vazias(len(linhas))
        if risco:
            pdf = laudos.riscar(pdf, [risco])
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="laudo-esterilizacao-{laudo_id}.pdf"'})


@roteador.post("/{laudo_id}/finalizar", response_model=Laudos)
@roteador.post("/{laudo_id}/impresso", response_model=Laudos, include_in_schema=False)  # o nome antigo
def marcar_impresso(
    laudo_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    """Finalizar laudo (antes "marcar como impressa"): vai para o arquivo; as próximas esterilizações abrem uma página nova."""
    _existe(con, laudo_id)
    con.execute(
        "UPDATE app.laudos_esterilizacao SET impresso_por = %s, impresso_em = clock_timestamp() WHERE id = %s AND impresso_em IS NULL",
        (pessoa.usuario_id, laudo_id),
    )
    return _laudos(con, pessoa)


@roteador.post("/{laudo_id}/reabrir", response_model=Laudos)
def reabrir(
    laudo_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    """Editar a página finalizada (27/10): volta a "em preenchimento"; o PDF sai de novo com o que estiver registrado."""
    _existe(con, laudo_id)
    con.execute("UPDATE app.laudos_esterilizacao SET impresso_por = NULL, impresso_em = NULL WHERE id = %s", (laudo_id,))
    return _laudos(con, pessoa)


@roteador.delete("/{laudo_id}", response_model=Laudos)
def excluir(
    laudo_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    """Excluir a página (27/10): as esterilizações dela vão para uma página nova (nada se apaga de verdade, 077)."""
    _existe(con, laudo_id)
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext('esterilizacao'))")
    nova = con.execute("INSERT INTO app.laudos_esterilizacao DEFAULT VALUES RETURNING id").fetchone()[0]
    con.execute("UPDATE app.esterilizacoes SET laudo_id = %s WHERE laudo_id = %s", (nova, laudo_id))
    con.execute(
        "UPDATE app.laudos_esterilizacao SET excluida_em = clock_timestamp(), excluida_por = %(u)s,"
        " impresso_em = coalesce(impresso_em, clock_timestamp()), impresso_por = coalesce(impresso_por, %(u)s) WHERE id = %(l)s",
        {"u": pessoa.usuario_id, "l": laudo_id},
    )
    return _laudos(con, pessoa)
