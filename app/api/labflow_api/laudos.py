"""Motor dos laudos de rastreio: páginas (pendente de imprimir → impressa → arquivo), modelo oficial e o PDF preenchido.

Spec: 07-app-pwa.md (v1.0), "Laudos automáticos" (rumo-do-app.md). Tarefa: APP-044. Tabela `app.paginas_laudo`
(migrations 059 e 060) e `app.modelos_documento` (058).

Cada laudo se registra aqui (`registrar`) com a tabela das linhas, quantas cabem por página, o nome do modelo e a função
que monta o PDF. As rotas são as mesmas para todos: GET /laudos/{laudo}, PUT /laudos/{laudo}/modelo,
GET /laudos/{laudo}/{pagina}/pdf e POST /laudos/{laudo}/{pagina}/impresso. O PDF oficial da empresa fica no banco
(enviado pelo Admin), nunca no Git; sem ele, o laudo sai numa tabela de demonstração com a mesma geometria.
"""

import io
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from labflow_api import laudo_esterilizacao
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

LARGURA, ALTURA = A4


# --- escrever nas células ------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Celula:
    """Texto numa célula do modelo (pontos PDF, origem no canto de cima à esquerda da folha)."""

    texto: str
    x0: float
    x1: float
    topo: float
    base: float
    centro: bool = True
    tamanho: float = 8.5


@dataclass(frozen=True)
class Tabela:
    """Geometria de uma tabela de linhas iguais: as colunas (x de cada divisa) e a faixa das linhas."""

    colunas: tuple[float, ...]
    topo: float
    base: float
    linhas: int

    @property
    def altura(self) -> float:
        return (self.base - self.topo) / self.linhas

    def celula(self, texto: str, linha: int, coluna: int, centro: bool = True, tamanho: float = 8.5) -> Celula:
        topo = self.topo + linha * self.altura
        return Celula(texto, self.colunas[coluna], self.colunas[coluna + 1], topo, topo + self.altura, centro, tamanho)


def _desenhar(c: canvas.Canvas, cel: Celula) -> None:
    tamanho = laudo_esterilizacao._caber(c, cel.texto, cel.x1 - cel.x0 - 4, cel.tamanho)
    c.setFont("Helvetica", tamanho)
    base = ALTURA - (cel.topo + cel.base) / 2 - tamanho / 3
    if cel.centro:
        c.drawCentredString((cel.x0 + cel.x1) / 2, base, cel.texto)
    else:
        c.drawString(cel.x0 + 3, base, cel.texto)


def _desenhar_deitada(c: canvas.Canvas, cel: Celula, escala: float, altura_da_folha: float) -> None:
    """Célula de uma tabela deitada na folha (modelo digitalizado): as medidas vêm em pixels da imagem, com o x da
    tabela descendo a folha; o texto sai girado para ler com a folha deitada."""
    largura = (cel.x1 - cel.x0) * escala - 4
    tamanho = laudo_esterilizacao._caber(c, cel.texto, largura, cel.tamanho)
    c.saveState()
    centro_y = altura_da_folha - (cel.x0 + cel.x1) / 2 * escala  # ao longo da tabela = de cima para baixo na folha
    centro_x = (cel.topo + cel.base) / 2 * escala  # linhas da tabela = da direita para a esquerda na folha
    c.translate(centro_x - tamanho / 3, centro_y)
    c.rotate(-90)
    c.setFont("Helvetica", tamanho)
    if cel.centro:
        c.drawCentredString(0, 0, cel.texto)
    else:
        c.drawString(-largura / 2, 0, cel.texto)
    c.restoreState()


def preencher(modelo: bytes | None, demonstracao: Callable[[], bytes], celulas: list[Celula], deitada: dict | None = None) -> bytes:
    """O modelo (ou o de demonstração) com o texto nas células. `deitada`: {"escala", "altura"} para modelo girado."""
    escritor = PdfWriter(clone_from=io.BytesIO(modelo or demonstracao()))
    folha = escritor.pages[0]
    camada = io.BytesIO()
    c = canvas.Canvas(camada, pagesize=(float(folha.mediabox.width), float(folha.mediabox.height)))
    for cel in celulas:
        if not cel.texto:
            continue
        if deitada:
            _desenhar_deitada(c, cel, deitada["escala"], deitada["altura"])
        else:
            _desenhar(c, cel)
    c.showPage()
    c.save()
    folha.merge_page(PdfReader(io.BytesIO(camada.getvalue())).pages[0])
    saida = io.BytesIO()
    escritor.write(saida)
    return saida.getvalue()


def demonstracao(titulo: str, tabela: Tabela, cabecalhos: tuple[str, ...]) -> Callable[[], bytes]:
    """Modelo de demonstração: título, os nomes das colunas e a grade, na mesma geometria do oficial."""

    def _gerar() -> bytes:
        saida = io.BytesIO()
        c = canvas.Canvas(saida, pagesize=A4)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(LARGURA / 2, ALTURA - tabela.topo + 40, f"{titulo} (modelo de demonstração)")
        c.setFont("Helvetica", 7)
        for x0, x1, nome in zip(tabela.colunas, tabela.colunas[1:], cabecalhos):
            c.drawCentredString((x0 + x1) / 2, ALTURA - tabela.topo + 6, nome)
        c.setLineWidth(0.5)
        for i in range(tabela.linhas + 1):
            y = ALTURA - (tabela.topo + i * tabela.altura)
            c.line(tabela.colunas[0], y, tabela.colunas[-1], y)
        c.line(tabela.colunas[0], ALTURA - tabela.topo + 18, tabela.colunas[-1], ALTURA - tabela.topo + 18)
        for x in tabela.colunas:
            c.line(x, ALTURA - tabela.topo + 18, x, ALTURA - tabela.base)
        c.showPage()
        c.save()
        return saida.getvalue()

    return _gerar


# --- registro dos laudos e as páginas --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Laudo:
    nome: str  # o mesmo de app.paginas_laudo.laudo (ex.: "meios-OSA")
    titulo: str
    modelo: str  # nome em app.modelos_documento (vários laudos podem dividir o mesmo modelo)
    capacidade: int  # linhas por página
    contar_sql: str  # quantas linhas a página tem: "SELECT count(*), min(data), max(data) FROM ... WHERE pagina_id = %s"
    gerar: Callable[[psycopg.Connection, int, bytes | None], bytes]  # (conexão, página, modelo) -> PDF
    aceitar_modelo: Callable[[bytes], None] = field(default=laudo_esterilizacao.modelo_valido)
    # laudo cujas linhas vêm de outras tabelas (ex.: incubação, que lê o bot): põe as novas nas páginas antes de mostrar
    preparar: Callable[[psycopg.Connection], None] | None = None


LAUDOS: dict[str, Laudo] = {}


def registrar(laudo: Laudo) -> None:
    LAUDOS[laudo.nome] = laudo


def _laudo(nome: str) -> Laudo:
    if nome not in LAUDOS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Laudo não encontrado.")
    return LAUDOS[nome]


def pagina_com_vaga(con: psycopg.Connection, nome: str) -> int:
    """A primeira página não impressa com vaga; sem nenhuma, abre outra. Trava para duas pessoas não encherem a mesma vaga."""
    laudo = _laudo(nome)
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext(%s))", (nome,))
    for (pagina_id,) in con.execute(
        "SELECT id FROM app.paginas_laudo WHERE laudo = %s AND impresso_em IS NULL ORDER BY id", (nome,)
    ).fetchall():
        if con.execute(laudo.contar_sql, (pagina_id,)).fetchone()[0] < laudo.capacidade:
            return pagina_id
    return con.execute("INSERT INTO app.paginas_laudo (laudo) VALUES (%s) RETURNING id", (nome,)).fetchone()[0]


class Pagina(BaseModel):
    id: int
    numero: int
    linhas: int
    capacidade: int
    cheia: bool
    impresso: bool
    impresso_por: str | None
    impresso_em: str | None
    de: date | None
    ate: date | None


class Laudos(BaseModel):
    titulo: str
    pode_enviar_modelo: bool
    modelo_enviado: bool
    modelo_enviado_em: str | None
    paginas: list[Pagina]  # as pendentes primeiro, depois as impressas (mais nova primeiro)


def _listar(con: psycopg.Connection, pessoa: PessoaLogada, laudo: Laudo) -> Laudos:
    if laudo.preparar:
        laudo.preparar(con)
    paginas = []
    for n, (pagina_id, impresso_em, por) in enumerate(
        con.execute(
            """
            SELECT p.id, p.impresso_em, coalesce(u.nome, c.usuario) FROM app.paginas_laudo p
            LEFT JOIN usuarios u ON u.id = p.impresso_por LEFT JOIN app.credenciais c ON c.usuario_id = p.impresso_por
            WHERE p.laudo = %s ORDER BY p.id
            """,
            (laudo.nome,),
        ).fetchall(),
        start=1,
    ):
        linhas, de, ate = con.execute(laudo.contar_sql, (pagina_id,)).fetchone()
        if linhas == 0 and impresso_em is None:
            continue  # página que ficou vazia (linhas excluídas): não aparece
        paginas.append(
            Pagina(
                id=pagina_id, numero=n, linhas=linhas, capacidade=laudo.capacidade, cheia=linhas >= laudo.capacidade,
                impresso=impresso_em is not None, impresso_por=por,
                impresso_em=impresso_em.astimezone(FUSO).strftime("%d/%m %H:%M") if impresso_em else None,
                de=_dia(de), ate=_dia(ate),
            )
        )
    paginas.sort(key=lambda p: (p.impresso, -p.id))
    modelo = con.execute("SELECT enviado_em FROM app.modelos_documento WHERE nome = %s", (laudo.modelo,)).fetchone()
    return Laudos(
        titulo=laudo.titulo, pode_enviar_modelo=pode(pessoa.cargo, "configurar_turnos"), modelo_enviado=modelo is not None,
        modelo_enviado_em=modelo[0].astimezone(FUSO).strftime("%d/%m/%Y %H:%M") if modelo else None, paginas=paginas,
    )


def _dia(valor) -> date | None:
    """Data de uma linha: timestamptz vira o dia em America/Sao_Paulo; date fica como está."""
    if valor is None:
        return None
    if hasattr(valor, "hour"):
        return valor.astimezone(FUSO).date()
    return valor


def modelo_do_banco(con: psycopg.Connection, nome_do_modelo: str) -> bytes | None:
    linha = con.execute("SELECT pdf FROM app.modelos_documento WHERE nome = %s", (nome_do_modelo,)).fetchone()
    return bytes(linha[0]) if linha else None


roteador = APIRouter(prefix="/laudos", tags=["laudos"])


@roteador.get("/{nome}", response_model=Laudos)
def listar(
    nome: str, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Laudos:
    return _listar(con, pessoa, _laudo(nome))


@roteador.put("/{nome}/modelo", response_model=Laudos)
async def enviar_modelo(
    nome: str,
    pedido: Request,
    pessoa: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    """O Admin envia o PDF oficial em branco (o do Word pode vir com uma folha extra vazia: fica só a primeira)."""
    laudo = _laudo(nome)
    pdf = await pedido.body()
    try:
        pdf = laudo_esterilizacao.so_a_primeira_folha(pdf)
        laudo.aceitar_modelo(pdf)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    con.execute(
        """
        INSERT INTO app.modelos_documento (nome, pdf, enviado_por, enviado_em) VALUES (%s, %s, %s, clock_timestamp())
        ON CONFLICT (nome) DO UPDATE SET pdf = EXCLUDED.pdf, enviado_por = EXCLUDED.enviado_por, enviado_em = EXCLUDED.enviado_em
        """,
        (laudo.modelo, pdf, pessoa.usuario_id),
    )
    return _listar(con, pessoa, laudo)


def _da_pagina(con: psycopg.Connection, laudo: Laudo, pagina_id: int) -> None:
    if con.execute("SELECT 1 FROM app.paginas_laudo WHERE id = %s AND laudo = %s", (pagina_id, laudo.nome)).fetchone() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Página do laudo não encontrada.")


@roteador.get("/{nome}/{pagina_id}/pdf")
def baixar_pdf(
    nome: str,
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    laudo = _laudo(nome)
    _da_pagina(con, laudo, pagina_id)
    pdf = laudo.gerar(con, pagina_id, modelo_do_banco(con, laudo.modelo))
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{nome}-{pagina_id}.pdf"'})


@roteador.post("/{nome}/{pagina_id}/impresso", response_model=Laudos)
def marcar_impresso(
    nome: str,
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    laudo = _laudo(nome)
    _da_pagina(con, laudo, pagina_id)
    con.execute(
        "UPDATE app.paginas_laudo SET impresso_por = %s, impresso_em = clock_timestamp() WHERE id = %s AND impresso_em IS NULL",
        (pessoa.usuario_id, pagina_id),
    )
    return _listar(con, pessoa, laudo)
