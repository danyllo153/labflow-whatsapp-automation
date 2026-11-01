"""Motor dos laudos de rastreio: páginas (pendente de imprimir → impressa → arquivo), modelo oficial e o PDF preenchido.

Spec: 07-app-pwa.md (v1.0), "Laudos automáticos" (rumo-do-app.md). Tarefa: APP-044. Tabela `app.paginas_laudo`
(migrations 059 e 060) e `app.modelos_documento` (058).

Cada laudo se registra aqui (`registrar`) com a tabela das linhas, quantas cabem por página, o nome do modelo e a função
que monta o PDF. As rotas são as mesmas para todos: GET /laudos/{laudo}, PUT /laudos/{laudo}/modelo,
GET /laudos/{laudo}/{pagina}/pdf, POST /laudos/{laudo}/{pagina}/finalizar (antes "impresso"), POST .../reabrir (editar
a folha finalizada) e DELETE /laudos/{laudo}/{pagina} (a folha sai e as linhas vão para uma folha nova, 077). O PDF oficial da empresa fica no banco
(enviado pelo Admin), nunca no Git; sem ele, o laudo sai numa tabela de demonstração com a mesma geometria.
"""

import calendar
import hashlib
import io
import re
import statistics
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from labflow_api import laudo_esterilizacao
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

LARGURA, ALTURA = A4

# A letra dos laudos (pedido do Danyllo, 25 e 26/10, com o laudo do fluxo laminar preenchido como referência): a do papel,
# Times 11 (medida no PDF original: Times New Roman 11,04 nas linhas). Se o texto não cabe na célula, diminui até caber;
# numa linha baixa, começa do que a altura da linha comporta.
FONTE = "Times-Roman"
TAMANHO = 11.0


def tamanho_inicial(pedido: float, altura_da_linha: float) -> float:
    return max(pedido, min(TAMANHO, altura_da_linha * 0.85))


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
    tamanho: float = 8.5  # o mínimo pedido; sai em Times 11 quando a linha comporta
    fonte: str = FONTE
    fixo: bool = False  # True: sai exatamente no tamanho pedido (ex.: a descrição da incubação, já quebrada nessa medida)


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

    def celula(self, texto: str, linha: int, coluna: int, centro: bool = True, tamanho: float = 8.5, fonte: str = FONTE) -> Celula:
        topo = self.topo + linha * self.altura
        return Celula(texto, self.colunas[coluna], self.colunas[coluna + 1], topo, topo + self.altura, centro, tamanho, fonte)

    def traco_das_vazias(self, usadas: int) -> tuple[float, float, float, float] | None:
        """O traço que fecha a folha (como no papel): do canto de baixo à esquerda até o de cima à direita das linhas vazias."""
        if usadas >= self.linhas:
            return None
        return (self.colunas[0], self.base, self.colunas[-1], self.topo + usadas * self.altura)


def _desenhar(c: canvas.Canvas, cel: Celula, altura: float = ALTURA) -> None:
    inicio = cel.tamanho if cel.fixo else tamanho_inicial(cel.tamanho, cel.base - cel.topo)
    tamanho = laudo_esterilizacao._caber(c, cel.texto, cel.x1 - cel.x0 - 4, inicio, fonte=cel.fonte)
    c.setFont(cel.fonte, tamanho)
    base = altura - (cel.topo + cel.base) / 2 - tamanho / 3  # altura da folha: A4 em pé ou deitado
    if cel.centro:
        c.drawCentredString((cel.x0 + cel.x1) / 2, base, cel.texto)
    else:
        c.drawString(cel.x0 + 3, base, cel.texto)


def _desenhar_deitada(c: canvas.Canvas, cel: Celula, escala: float, altura_da_folha: float) -> None:
    """Célula de uma tabela deitada na folha (modelo digitalizado): as medidas vêm em pixels da imagem, com o x da
    tabela descendo a folha; o texto sai girado para ler com a folha deitada."""
    largura = (cel.x1 - cel.x0) * escala - 4
    tamanho = laudo_esterilizacao._caber(c, cel.texto, largura, tamanho_inicial(cel.tamanho, (cel.base - cel.topo) * escala), fonte=cel.fonte)
    c.saveState()
    centro_y = altura_da_folha - (cel.x0 + cel.x1) / 2 * escala  # ao longo da tabela = de cima para baixo na folha
    centro_x = (cel.topo + cel.base) / 2 * escala  # linhas da tabela = da direita para a esquerda na folha
    c.translate(centro_x - tamanho / 3, centro_y)
    c.rotate(-90)
    c.setFont(cel.fonte, tamanho)
    if cel.centro:
        c.drawCentredString(0, 0, cel.texto)
    else:
        c.drawString(-largura / 2, 0, cel.texto)
    c.restoreState()


def preencher(
    modelo: bytes | None, demonstracao: Callable[[], bytes], celulas: list[Celula], deitada: dict | None = None,
    riscos: list[tuple[float, float, float, float]] | None = None, brancos: list[tuple[float, float, float, float]] | None = None,
) -> bytes:
    """O modelo (ou o de demonstração) com o texto nas células. `deitada`: {"escala", "altura"} para modelo girado.
    `riscos`: linhas (x0, y0, x1, y1, origem em cima à esquerda), como o traço que fecha as linhas vazias da folha.
    `brancos`: retângulos (x0, y0, x1, y1) pintados de branco antes do texto, para cobrir o que o papel já traz impresso
    numa linha vazia (o "-" das observações da físico-química da água, 27/10)."""
    escritor = PdfWriter(clone_from=io.BytesIO(modelo or demonstracao()))
    folha = escritor.pages[0]
    camada = io.BytesIO()
    c = canvas.Canvas(camada, pagesize=(float(folha.mediabox.width), float(folha.mediabox.height)))
    c.setFillColorRGB(1, 1, 1)
    for x0, y0, x1, y1 in brancos or []:
        c.rect(x0, float(folha.mediabox.height) - y1, x1 - x0, y1 - y0, stroke=0, fill=1)
    c.setFillColorRGB(0, 0, 0)
    for cel in celulas:
        if not cel.texto:
            continue
        if deitada:
            _desenhar_deitada(c, cel, deitada["escala"], deitada["altura"])
        else:
            _desenhar(c, cel, float(folha.mediabox.height))
    altura = float(folha.mediabox.height)
    c.setLineWidth(0.8)
    for x0, y0, x1, y1 in riscos or []:
        c.line(x0, altura - y0, x1, altura - y1)
    c.showPage()
    c.save()
    folha.merge_page(PdfReader(io.BytesIO(camada.getvalue())).pages[0])
    saida = io.BytesIO()
    escritor.write(saida)
    return saida.getvalue()


def finalizada(con: psycopg.Connection, pagina_id: int) -> bool:
    linha = con.execute("SELECT impresso_em IS NOT NULL FROM app.paginas_laudo WHERE id = %s", (pagina_id,)).fetchone()
    return bool(linha and linha[0])


def riscar(pdf: bytes, riscos: list[tuple[float, float, float, float]]) -> bytes:
    """Linhas por cima de um PDF pronto (origem em cima à esquerda), como o traço que fecha as linhas vazias da folha."""
    escritor = PdfWriter(clone_from=io.BytesIO(pdf))
    folha = escritor.pages[0]
    largura, altura = float(folha.mediabox.width), float(folha.mediabox.height)
    camada = io.BytesIO()
    c = canvas.Canvas(camada, pagesize=(largura, altura))
    c.setLineWidth(0.8)
    for x0, y0, x1, y1 in riscos:
        c.line(x0, altura - y0, x1, altura - y1)
    c.showPage()
    c.save()
    folha.merge_page(PdfReader(io.BytesIO(camada.getvalue())).pages[0])
    saida = io.BytesIO()
    escritor.write(saida)
    return saida.getvalue()


# --- encaixar a tabela nas linhas do modelo enviado (27/10) -------------------------------------------------------------
# A geometria de cada laudo foi medida num PDF-modelo, mas o PDF que o Admin envia pode ter saído de outro programa (o Word
# do laboratório desenha as linhas um pouco mais altas que o LibreOffice) e o texto "descia" e cruzava as linhas. Por isso,
# antes de escrever, o app procura no próprio modelo as linhas horizontais da tabela (as que cobrem a largura dela) e usa a
# sequência de linhas igualmente espaçadas mais perto da medida. Modelo digitalizado (imagem, sem linhas): fica a medida.


def _mult(a: list[float], b: list[float]) -> list[float]:
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


def _ponto(m: list[float], x: float, y: float) -> tuple[float, float]:
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def linhas_horizontais(pdf: bytes) -> list[tuple[float, float, float]]:
    """(x0, x1, y) de cada traço horizontal da 1ª folha (y medido do alto da folha): retângulos finos e segmentos."""
    folha = PdfReader(io.BytesIO(pdf)).pages[0]
    altura = float(folha.mediabox.height)
    m, pilha, atual, saida = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], [], None, []
    for ops, op in ContentStream(folha.get_contents(), folha.pdf).operations:
        if op == b"q":
            pilha.append(m[:])
        elif op == b"Q":
            m = pilha.pop() if pilha else [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
        elif op == b"cm":
            m = _mult([float(v) for v in ops], m)
        elif op == b"re":
            x, y, w, h = (float(v) for v in ops)
            (ax, ay), (bx, by) = _ponto(m, x, y), _ponto(m, x + w, y + h)
            if abs(by - ay) < 2.5 and abs(bx - ax) > 3:
                saida.append((min(ax, bx), max(ax, bx), altura - (ay + by) / 2))
        elif op == b"m":
            atual = _ponto(m, float(ops[0]), float(ops[1]))
        elif op == b"l" and atual is not None:
            p = _ponto(m, float(ops[0]), float(ops[1]))
            if abs(p[1] - atual[1]) < 0.5 and abs(p[0] - atual[0]) > 3:
                saida.append((min(p[0], atual[0]), max(p[0], atual[0]), altura - p[1]))
            atual = p
    return saida


def linhas_que_cobrem(modelo: bytes | None, esquerda: float, direita: float) -> list[float]:
    """O y das linhas horizontais do modelo que cobrem a faixa [esquerda, direita] (as duplas viram uma), de cima para baixo."""
    if not modelo:
        return []
    try:
        tracos = linhas_horizontais(modelo)
    except Exception:
        return []
    cobertura: dict[float, float] = {}
    for x0, x1, y in tracos:
        a, b = max(x0, esquerda), min(x1, direita)
        if b > a:
            cobertura[round(y * 2) / 2] = cobertura.get(round(y * 2) / 2, 0) + (b - a)
    ys: list[float] = []
    for y in sorted(y for y, c in cobertura.items() if c >= 0.6 * (direita - esquerda)):
        if ys and y - ys[-1] < 2:  # linha dupla (o Word desenha a borda de cada célula): uma só
            continue
        ys.append(y)
    return ys


_ENCAIXES: dict[tuple[str, Tabela], Tabela] = {}


def encaixar(tabela: Tabela, modelo: bytes | None) -> Tabela:
    """A tabela com o topo e a base das linhas do modelo enviado (ou como foi medida, se o modelo não tem as linhas)."""
    if not modelo:
        return tabela
    chave = (hashlib.sha1(modelo).hexdigest(), tabela)
    if chave not in _ENCAIXES:
        _ENCAIXES[chave] = _encaixar(tabela, modelo)
    return _ENCAIXES[chave]


def _encaixar(tabela: Tabela, modelo: bytes) -> Tabela:
    ys = linhas_que_cobrem(modelo, tabela.colunas[0], tabela.colunas[-1])
    melhor, erro = tabela, 30.0
    for i, topo in enumerate(ys):
        seq = ys[i : i + tabela.linhas + 1]
        if len(seq) < tabela.linhas + 1 or abs(topo - tabela.topo) >= erro:
            continue
        passos = [b - a for a, b in zip(seq, seq[1:])]
        mediana = statistics.median(passos)
        if mediana > 4 and all(abs(p - mediana) <= 0.2 * mediana for p in passos):
            melhor, erro = Tabela(tabela.colunas, seq[0], seq[-1], tabela.linhas), abs(topo - tabela.topo)
    return melhor


def linhas_verticais(pdf: bytes) -> list[tuple[float, float, float]]:
    """(x, topo, base) de cada traço vertical da 1ª folha (y medido do alto da folha): retângulos finos e segmentos."""
    folha = PdfReader(io.BytesIO(pdf)).pages[0]
    altura = float(folha.mediabox.height)
    m, pilha, atual, saida = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0], [], None, []
    for ops, op in ContentStream(folha.get_contents(), folha.pdf).operations:
        if op == b"q":
            pilha.append(m[:])
        elif op == b"Q":
            m = pilha.pop() if pilha else [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
        elif op == b"cm":
            m = _mult([float(v) for v in ops], m)
        elif op == b"re":
            x, y, w, h = (float(v) for v in ops)
            (ax, ay), (bx, by) = _ponto(m, x, y), _ponto(m, x + w, y + h)
            if abs(bx - ax) < 2.5 and abs(by - ay) > 3:
                saida.append(((ax + bx) / 2, altura - max(ay, by), altura - min(ay, by)))
        elif op == b"m":
            atual = _ponto(m, float(ops[0]), float(ops[1]))
        elif op == b"l" and atual is not None:
            p = _ponto(m, float(ops[0]), float(ops[1]))
            if abs(p[0] - atual[0]) < 0.5 and abs(p[1] - atual[1]) > 3:
                saida.append((p[0], altura - max(p[1], atual[1]), altura - min(p[1], atual[1])))
            atual = p
    return saida


def encaixar_colunas(tabela: Tabela, modelo: bytes | None) -> Tabela:
    """A tabela encaixada nas linhas do modelo (`encaixar`) e, além disso, cada divisa das colunas na linha vertical do
    modelo mais perto (até 12 pt) que desce pela metade da tabela ou mais (27/10: no microbiológico da água de consumo o
    ponto de coleta saía por cima da borda)."""
    tabela = encaixar(tabela, modelo)
    if not modelo:
        return tabela
    try:
        verticais = linhas_verticais(modelo)
    except Exception:
        return tabela
    altura = tabela.base - tabela.topo
    candidatas = [x for x, t, b in verticais if min(b, tabela.base) - max(t, tabela.topo) >= 0.5 * altura]
    colunas = []
    for c in tabela.colunas:
        perto = min(candidatas, key=lambda x: abs(x - c), default=None)
        colunas.append(perto if perto is not None and abs(perto - c) <= 12 else c)
    return Tabela(tuple(colunas), tabela.topo, tabela.base, tabela.linhas)


# --- textos do modelo (27/10) --------------------------------------------------------------------------------------------
# O cabeçalho dos laudos semanais da água ("Data/ Hora da Coleta: ___/___/______ __:__   Responsável pela Coleta: ____")
# não é tabela: o app procura essas frases no modelo enviado e escreve cada parte (dia, mês, ano, hora, minuto, nome) no
# espaço dela, entre as barras e os dois-pontos do papel. A posição de cada letra sai do começo do trecho de texto (pypdf)
# mais a largura das letras em Times (a letra dos modelos do laboratório).


@dataclass(frozen=True)
class Letra:
    letra: str
    x0: float
    x1: float
    y: float  # a linha de base, medida do alto da folha
    tamanho: float


def letras_do_modelo(pdf: bytes) -> list[list[Letra]]:
    """As linhas de texto da 1ª folha (de cima para baixo), cada uma com as letras da esquerda para a direita."""
    from reportlab.pdfbase.pdfmetrics import stringWidth

    folha = PdfReader(io.BytesIO(pdf)).pages[0]
    altura = float(folha.mediabox.height)
    trechos: list[tuple[str, float, float, float]] = []

    def visitar(texto, cm, tm, _fonte, tamanho):
        if not texto or not texto.strip("\n") or not tamanho:
            return
        m = _mult([float(v) for v in tm], [float(v) for v in cm])
        x, y = m[4], m[5]
        trechos.append((texto.replace("\n", ""), x, altura - y, float(tamanho) * (m[2] ** 2 + m[3] ** 2) ** 0.5))

    folha.extract_text(visitor_text=visitar)
    linhas: dict[float, list[Letra]] = {}
    for texto, x, y, tamanho in trechos:
        if tamanho <= 0:
            continue
        chave = next((k for k in linhas if abs(k - y) < 1.5), y)
        for i, letra in enumerate(texto):
            x0 = x + stringWidth(texto[:i], "Times-Roman", tamanho)
            linhas.setdefault(chave, []).append(Letra(letra, x0, x0 + stringWidth(letra, "Times-Roman", tamanho), y, tamanho))
    return [sorted(linhas[k], key=lambda le: le.x0) for k in sorted(linhas)]


def achar(linha: list[Letra], frase: str, depois: float = -1.0) -> tuple[Letra, Letra] | None:
    """A primeira e a última letra da frase na linha (sem contar espaços), começando depois de x = `depois`."""
    letras = [le for le in linha if not le.letra.isspace() and le.x0 > depois]
    alvo = "".join(frase.split())
    texto = "".join(le.letra for le in letras)
    i = texto.find(alvo)
    return (letras[i], letras[i + len(alvo) - 1]) if i >= 0 else None


def TABELA_CELULA(tabela: Tabela, texto: str, linha: int, coluna: int, centro: bool = True) -> Celula:  # noqa: N802
    """A célula de uma tabela, com o texto à esquerda quando não é centralizado (Times 11, o papel)."""
    return tabela.celula(texto, linha, coluna, centro=centro)


CONTAR_LINHAS = "SELECT count(*), min(dia), max(dia) FROM app.laudo_linhas WHERE pagina_id = %s"


def distribuir_linhas(con: psycopg.Connection, nome: str, itens: list[tuple[str, str, date | None]], capacidade: int) -> None:
    """Põe nas folhas (app.laudo_linhas, 076), na ordem dada, as linhas que ainda não têm lugar: (ref, chave, dia). Uma folha
    não mistura chaves (o dia do TAB, o tanque do NFC, o navio do embarque, a caixa da contra-amostra); cheia ou impressa,
    abre outra. Trava para duas telas não dividirem uma vaga."""
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext(%s))", (nome,))
    ja = {r for (r,) in con.execute("SELECT ref FROM app.laudo_linhas WHERE laudo = %s", (nome,))}
    for ref, chave, dia in itens:
        if ref in ja:
            continue
        pagina = con.execute(
            """
            SELECT p.id FROM app.paginas_laudo p
            WHERE p.laudo = %(n)s AND p.impresso_em IS NULL AND p.excluida_em IS NULL
              AND NOT EXISTS (SELECT 1 FROM app.laudo_linhas l WHERE l.pagina_id = p.id AND l.chave <> %(c)s)
              AND (SELECT count(*) FROM app.laudo_linhas l WHERE l.pagina_id = p.id) < %(cap)s
            ORDER BY p.id LIMIT 1
            """,
            {"n": nome, "c": chave, "cap": capacidade},
        ).fetchone()
        pagina_id = pagina[0] if pagina else con.execute(
            "INSERT INTO app.paginas_laudo (laudo) VALUES (%s) RETURNING id", (nome,)
        ).fetchone()[0]
        con.execute(
            "INSERT INTO app.laudo_linhas (laudo, ref, chave, dia, pagina_id) VALUES (%s, %s, %s, %s, %s)",
            (nome, ref, chave, dia, pagina_id),
        )
        ja.add(ref)


def linhas_da_pagina(con: psycopg.Connection, pagina_id: int) -> list[tuple[str, str]]:
    """(ref, chave) das linhas de uma folha, na ordem em que entraram."""
    return con.execute(
        "SELECT ref, chave FROM app.laudo_linhas WHERE pagina_id = %s ORDER BY incluido_em, ref", (pagina_id,)
    ).fetchall()


def demonstracao(titulo: str, tabela: Tabela, cabecalhos: tuple[str, ...], deitada: bool = False) -> Callable[[], bytes]:
    """Modelo de demonstração: título, os nomes das colunas e a grade, na mesma geometria do oficial (A4 em pé ou deitada)."""

    def _gerar() -> bytes:
        LARGURA, ALTURA = (A4[1], A4[0]) if deitada else A4  # noqa: N806 (a folha desta demonstração)
        saida = io.BytesIO()
        c = canvas.Canvas(saida, pagesize=(LARGURA, ALTURA))
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
    # o mesmo, quando a linha nova leva o nome de quem abriu (o branco do dia, 01/11): (conexão, usuario_id)
    preparar_por: Callable[[psycopg.Connection, int], object] | None = None
    # a folha marcada como impressa sai com o traço que fecha as linhas vazias (regra de todo documento, 26/10): a tabela do
    # papel e quantas linhas dela cada unidade do contar_sql ocupa (a incubação conta blocos de 4 linhas)
    traco: "Tabela | None" = None
    linhas_por_unidade: int = 1
    # folha com mais de uma tabela (os blocos dos laudos semanais da água): os traços da folha finalizada, um por bloco
    riscos: Callable[[psycopg.Connection, int, bytes | None], list[tuple[float, float, float, float]]] | None = None


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
        "SELECT id FROM app.paginas_laudo WHERE laudo = %s AND impresso_em IS NULL AND excluida_em IS NULL ORDER BY id", (nome,)
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


# --- prazo de guarda (01/11): o rodapé de cada modelo diz por quanto tempo a folha finalizada fica guardada ("...arquivado
# junto ao Responsável pela Correta Aplicação por um período mínimo de 1 mês"). O app lê do próprio PDF enviado (fica no
# banco, nunca no Git): passado o prazo, a folha sai da lista e o Admin pode apagar as vencidas de uma vez.

NUMEROS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "três": 3, "quatro": 4, "cinco": 5, "seis": 6, "doze": 12}
PRAZO_RE = re.compile(
    r"per[ií]odo\s+m[ií]nimo\s+de\s+(\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|doze)\s*(?:\([^)]*\)\s*)?(dias?|m[eê]s(?:es)?|anos?)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Guarda:
    quantidade: int
    unidade: str  # "dia", "mes" ou "ano"

    @property
    def texto(self) -> str:
        nomes = {"dia": ("dia", "dias"), "mes": ("mês", "meses"), "ano": ("ano", "anos")}[self.unidade]
        return f"{self.quantidade} {nomes[self.quantidade != 1]}"

    def vence(self, finalizada: datetime) -> datetime:
        if self.unidade == "dia":
            return finalizada + timedelta(days=self.quantidade)
        meses = self.quantidade * (12 if self.unidade == "ano" else 1)
        ano, mes = divmod(finalizada.month - 1 + meses, 12)
        ano += finalizada.year
        return finalizada.replace(year=ano, month=mes + 1, day=min(finalizada.day, calendar.monthrange(ano, mes + 1)[1]))


_GUARDAS: dict[str, Guarda | None] = {}


def guarda_do_texto(texto: str) -> Guarda | None:
    achado = PRAZO_RE.search(" ".join(texto.split()))
    if not achado:
        return None
    numero, unidade = achado.group(1).lower(), achado.group(2).lower()
    quantidade = int(numero) if numero.isdigit() else NUMEROS[numero]
    return Guarda(quantidade, "dia" if unidade.startswith("dia") else "ano" if unidade.startswith("ano") else "mes")


def guarda_do_modelo(pdf: bytes | None) -> Guarda | None:
    """O prazo de guarda escrito no rodapé do modelo; None sem modelo ou sem a frase (aí nada vence)."""
    if not pdf:
        return None
    chave = hashlib.sha256(pdf).hexdigest()
    if chave not in _GUARDAS:
        try:
            texto = " ".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf)).pages)
        except Exception:  # PDF que o pypdf não lê: sem prazo
            texto = ""
        _GUARDAS[chave] = guarda_do_texto(texto)
    return _GUARDAS[chave]


def vencidas(con: psycopg.Connection, folhas: list[tuple[int, datetime | None]], guarda: Guarda | None) -> set[int]:
    """As folhas finalizadas cujo prazo de guarda já passou."""
    if guarda is None:
        return set()
    agora = con.execute("SELECT clock_timestamp()").fetchone()[0]
    return {i for i, finalizada in folhas if finalizada is not None and guarda.vence(finalizada) <= agora}


class Laudos(BaseModel):
    titulo: str
    guarda: str | None = None  # o prazo de guarda do rodapé do modelo ("1 mês"); None se o modelo não diz
    vencidas: int = 0  # folhas finalizadas que passaram do prazo: saem da lista; o Admin apaga de uma vez
    pode_enviar_modelo: bool
    modelo_enviado: bool
    modelo_enviado_em: str | None
    paginas: list[Pagina]  # as pendentes primeiro, depois as impressas (mais nova primeiro)


def _listar(con: psycopg.Connection, pessoa: PessoaLogada, laudo: Laudo) -> Laudos:
    if laudo.preparar:
        laudo.preparar(con)
    if laudo.preparar_por:
        laudo.preparar_por(con, pessoa.usuario_id)
    paginas = []
    folhas = con.execute(
        """
        SELECT p.id, p.impresso_em, coalesce(u.nome, c.usuario) FROM app.paginas_laudo p
        LEFT JOIN usuarios u ON u.id = p.impresso_por LEFT JOIN app.credenciais c ON c.usuario_id = p.impresso_por
        WHERE p.laudo = %s AND p.excluida_em IS NULL ORDER BY p.id
        """,
        (laudo.nome,),
    ).fetchall()
    guarda = guarda_do_modelo(modelo_do_banco(con, laudo.modelo))
    fora = vencidas(con, [(i, em) for i, em, _ in folhas], guarda)
    for n, (pagina_id, impresso_em, por) in enumerate(folhas, start=1):
        if pagina_id in fora:
            continue  # passou do prazo de guarda do modelo (01/11): sai da lista
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
        guarda=guarda.texto if guarda else None, vencidas=len(fora),
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
    if con.execute(
        "SELECT 1 FROM app.paginas_laudo WHERE id = %s AND laudo = %s AND excluida_em IS NULL", (pagina_id, laudo.nome)
    ).fetchone() is None:
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
    modelo = modelo_do_banco(con, laudo.modelo)
    pdf = laudo.gerar(con, pagina_id, modelo)
    if laudo.traco is not None or laudo.riscos is not None:
        impressa = con.execute("SELECT impresso_em IS NOT NULL FROM app.paginas_laudo WHERE id = %s", (pagina_id,)).fetchone()[0]
        if impressa and laudo.riscos is not None:
            riscos = laudo.riscos(con, pagina_id, modelo)
            if riscos:
                pdf = riscar(pdf, riscos)
        elif impressa:
            usadas = con.execute(laudo.contar_sql, (pagina_id,)).fetchone()[0] * laudo.linhas_por_unidade
            risco = encaixar(laudo.traco, modelo).traco_das_vazias(usadas)
            if risco:
                pdf = riscar(pdf, [risco])
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{nome}-{pagina_id}.pdf"'})


@roteador.post("/{nome}/{pagina_id}/finalizar", response_model=Laudos)
@roteador.post("/{nome}/{pagina_id}/impresso", response_model=Laudos, include_in_schema=False)  # o nome antigo
def marcar_impresso(
    nome: str,
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    laudo = _laudo(nome)
    _da_pagina(con, laudo, pagina_id)
    finalizar(con, pagina_id, pessoa.usuario_id)
    return _listar(con, pessoa, laudo)


def finalizar(con: psycopg.Connection, pagina_id: int, usuario_id: int) -> None:
    """Finalizar laudo (antes "marcar como impressa"): a folha não recebe mais linhas e sai com o traço das vazias."""
    con.execute(
        "UPDATE app.paginas_laudo SET impresso_por = %s, impresso_em = clock_timestamp() WHERE id = %s AND impresso_em IS NULL",
        (usuario_id, pagina_id),
    )


def reabrir(con: psycopg.Connection, pagina_id: int) -> None:
    """Editar a folha finalizada (27/10): volta a "em preenchimento", sem o traço; os registros podem ser corrigidos (o PDF
    é sempre montado na hora com o que está no banco) e a folha é finalizada de novo."""
    con.execute("UPDATE app.paginas_laudo SET impresso_por = NULL, impresso_em = NULL WHERE id = %s", (pagina_id,))


# as tabelas que apontam para a folha (o registro, como a coleta de água, ou só o lugar da linha, como no TAB): lidas do
# catálogo, para o excluir valer para todo laudo, inclusive os que vierem depois
TABELAS_DA_FOLHA_SQL = """
SELECT n.nspname || '.' || t.relname, a.attname
FROM pg_constraint k
JOIN pg_class t ON t.oid = k.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
WHERE k.contype = 'f' AND k.confrelid = 'app.paginas_laudo'::regclass
"""


def excluir(con: psycopg.Connection, nome: str, pagina_id: int, usuario_id: int) -> None:
    """Refazer a folha (27/10; antes "excluir"): as linhas vão para uma folha nova, que sai de novo para imprimir, e a folha
    antiga, vazia, sai do banco (01/11; antes ficava guardada como excluída, 077). Trava como a distribuição das linhas."""
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext(%s))", (nome,))
    reabrir(con, pagina_id)  # a incubação não deixa mexer em linha de folha finalizada (075)
    nova = con.execute("INSERT INTO app.paginas_laudo (laudo) VALUES (%s) RETURNING id", (nome,)).fetchone()[0]
    for tabela, coluna in con.execute(TABELAS_DA_FOLHA_SQL).fetchall():
        con.execute(f"UPDATE {tabela} SET {coluna} = %s WHERE {coluna} = %s", (nova, pagina_id))  # nomes do catálogo
    con.execute("DELETE FROM app.paginas_laudo WHERE id = %s", (pagina_id,))  # vazia: sai do banco (01/11, 082)


def apagar(con: psycopg.Connection, nome: str, pagina_id: int) -> int:
    """Apagar a folha de vez (01/11, 082): a folha sai do banco e o que estava nela fica "fora do laudo" (pagina_id NULL),
    sem voltar para uma folha nova; os registros continuam nas páginas de análise. Devolve quantas linhas saíram."""
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext(%s))", (nome,))
    reabrir(con, pagina_id)  # a incubação não deixa mexer em linha de folha finalizada (075)
    linhas = 0
    for tabela, coluna in con.execute(TABELAS_DA_FOLHA_SQL).fetchall():
        linhas += con.execute(f"UPDATE {tabela} SET {coluna} = NULL WHERE {coluna} = %s", (pagina_id,)).rowcount  # nomes do catálogo
    con.execute("DELETE FROM app.paginas_laudo WHERE id = %s", (pagina_id,))
    return linhas


@roteador.post("/{nome}/apagar-vencidas", response_model=Laudos)
def apagar_vencidas(
    nome: str, pessoa: PessoaLogada = Depends(exigir("gerenciar_pessoas")), con: psycopg.Connection = Depends(obter_conexao)
) -> Laudos:
    """Só o Admin (01/11): apaga de vez as folhas que passaram do prazo de guarda do modelo."""
    laudo = _laudo(nome)
    folhas = con.execute(
        "SELECT id, impresso_em FROM app.paginas_laudo WHERE laudo = %s AND excluida_em IS NULL", (laudo.nome,)
    ).fetchall()
    for pagina_id in sorted(vencidas(con, folhas, guarda_do_modelo(modelo_do_banco(con, laudo.modelo)))):
        apagar(con, laudo.nome, pagina_id)
    return _listar(con, pessoa, laudo)


@roteador.post("/{nome}/{pagina_id}/apagar", response_model=Laudos)
def apagar_pagina(
    nome: str,
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    """Só o Admin (01/11): a folha sai de vez; o que estava nela não volta para nenhuma folha."""
    laudo = _laudo(nome)
    _da_pagina(con, laudo, pagina_id)
    apagar(con, laudo.nome, pagina_id)
    return _listar(con, pessoa, laudo)


@roteador.post("/{nome}/{pagina_id}/reabrir", response_model=Laudos)
def reabrir_pagina(
    nome: str,
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    laudo = _laudo(nome)
    _da_pagina(con, laudo, pagina_id)
    reabrir(con, pagina_id)
    return _listar(con, pessoa, laudo)


@roteador.delete("/{nome}/{pagina_id}", response_model=Laudos)
def excluir_pagina(
    nome: str,
    pagina_id: int,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Laudos:
    laudo = _laudo(nome)
    _da_pagina(con, laudo, pagina_id)
    excluir(con, laudo.nome, pagina_id, pessoa.usuario_id)
    return _listar(con, pessoa, laudo)
