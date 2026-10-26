"""Laudo "Controle de Ciclos de Esterilização": páginas de 35 linhas e o PDF preenchido sobre o modelo da empresa.

Spec: 07-app-pwa.md (v1.0), §7 Esterilização (laudo). Tarefa: APP-035. Tabelas da migration 058.

Uma linha do laudo é um ciclo num dia: vários materiais no mesmo ciclo viram uma linha só ("Meio de cultura / Frascos").
O PDF oficial (confidencial) fica no banco, enviado pelo Admin; a geometria da tabela abaixo é a do modelo SGI da empresa
(A4, 35 linhas). Sem o modelo enviado, o app desenha uma tabela de demonstração com a mesma geometria.
"""

import io
from datetime import date

import psycopg
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from labflow_api.rotas_turno import FUSO

CAPACIDADE = 35  # linhas por página do laudo
NOME_DO_MODELO = "laudo-esterilizacao"

# Geometria do modelo (pontos PDF, origem no canto de cima à esquerda): colunas e linhas da tabela.
LARGURA, ALTURA = A4
COLUNAS_X = (36.0, 92.06, 258.2, 352.03, 395.23, 438.6, 496.3, 577.44)  # Data, Material, Ciclo, Sim, Não, Nome, Visto
TOPO_DAS_LINHAS = 171.26
BASE_DAS_LINHAS = 686.38
ALTURA_DA_LINHA = (BASE_DAS_LINHAS - TOPO_DAS_LINHAS) / CAPACIDADE

ROTULO_DO_TIPO = {"Ponteira": "Ponteiras", "Meio": "Meio de cultura", "Frasco": "Frascos", "Água de diluição": "Água de diluição", "Descarte": "Descarte"}


def rotulo_do_material(tipo: str, meio: str | None, descricao: str | None) -> str:
    if tipo == "Outro":
        return descricao or "Outro"
    return ROTULO_DO_TIPO[tipo]  # o nome do meio (ex.: PDA) fica só no app: no laudo oficial vai "Meio de cultura" (24/10)


def primeiro_nome(nome: str) -> str:
    return nome.split()[0] if nome.split() else nome


LINHAS_SQL = """
SELECT min(e.feita_em), e.dia, (array_agg(trim(e.ciclo) ORDER BY e.feita_em, e.id))[1],
       array_agg(e.tipo ORDER BY e.feita_em, e.id), array_agg(e.meio ORDER BY e.feita_em, e.id),
       array_agg(e.descricao ORDER BY e.feita_em, e.id), bool_and(e.eficiente),
       array_agg(coalesce(u.nome, c.usuario) ORDER BY e.feita_em, e.id)
FROM app.esterilizacoes e JOIN usuarios u ON u.id = e.feita_por LEFT JOIN app.credenciais c ON c.usuario_id = e.feita_por
WHERE e.laudo_id = %s AND e.excluida_em IS NULL
GROUP BY e.dia, lower(trim(e.ciclo)) ORDER BY min(e.feita_em), e.dia
"""


def linhas_da_pagina(con: psycopg.Connection, laudo_id: int) -> list[dict]:
    linhas = []
    for primeira, dia, ciclo, tipos, meios, descricoes, eficiente, nomes in con.execute(LINHAS_SQL, (laudo_id,)):
        materiais = list(dict.fromkeys(rotulo_do_material(t, m, d) for t, m, d in zip(tipos, meios, descricoes)))
        pessoas = list(dict.fromkeys(primeiro_nome(n) for n in nomes))
        linhas.append(
            {
                "data": primeira.astimezone(FUSO).date(), "dia": dia, "ciclo": ciclo, "material": " / ".join(materiais),
                "eficiente": eficiente, "analista": " / ".join(pessoas),
            }
        )
    return linhas


def atribuir_pagina(con: psycopg.Connection, dia: date, ciclo: str) -> int:
    """A página em que a nova esterilização entra: a do mesmo ciclo no dia (se ainda não impressa), senão a primeira com vaga."""
    con.execute("SELECT pg_advisory_xact_lock(58)")  # duas pessoas registrando juntas não enchem a mesma vaga
    existente = con.execute(
        """
        SELECT e.laudo_id FROM app.esterilizacoes e JOIN app.laudos_esterilizacao l ON l.id = e.laudo_id
        WHERE e.excluida_em IS NULL AND e.dia = %s AND lower(trim(e.ciclo)) = lower(trim(%s)) AND l.impresso_em IS NULL
        ORDER BY e.id LIMIT 1
        """,
        (dia, ciclo),
    ).fetchone()
    if existente:
        return existente[0]
    com_vaga = con.execute(
        """
        SELECT l.id FROM app.laudos_esterilizacao l
        WHERE l.impresso_em IS NULL AND (
            SELECT count(*) FROM (
                SELECT 1 FROM app.esterilizacoes e WHERE e.laudo_id = l.id AND e.excluida_em IS NULL
                GROUP BY e.dia, lower(trim(e.ciclo))
            ) x
        ) < %s
        ORDER BY l.id LIMIT 1
        """,
        (CAPACIDADE,),
    ).fetchone()
    if com_vaga:
        return com_vaga[0]
    return con.execute("INSERT INTO app.laudos_esterilizacao DEFAULT VALUES RETURNING id").fetchone()[0]


def _modelo_de_demonstracao() -> bytes:
    """Tabela simples com a geometria do modelo da empresa, para o app funcionar (e ser testado) sem o PDF oficial."""
    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=A4)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(LARGURA / 2, ALTURA - 118, "Controle de Ciclos de Esterilização (modelo de demonstração)")
    c.setFont("Helvetica", 8)
    for x, titulo in zip(COLUNAS_X, ("Data", "Material esterilizado", "Ciclo", "Sim", "Não", "Nome", "Visto")):
        c.drawString(x + 3, ALTURA - 165, titulo)
    c.setLineWidth(0.5)
    for i in range(CAPACIDADE + 1):
        y = ALTURA - (TOPO_DAS_LINHAS + i * ALTURA_DA_LINHA)
        c.line(COLUNAS_X[0], y, COLUNAS_X[-1], y)
    for x in COLUNAS_X:
        c.line(x, ALTURA - (TOPO_DAS_LINHAS - 20), x, ALTURA - BASE_DAS_LINHAS)
    c.line(COLUNAS_X[0], ALTURA - (TOPO_DAS_LINHAS - 20), COLUNAS_X[-1], ALTURA - (TOPO_DAS_LINHAS - 20))
    c.save()
    return saida.getvalue()


def _caber(c: canvas.Canvas, texto: str, largura: float, tamanho: float = 9.0, minimo: float = 5.0, fonte: str = "Helvetica") -> float:
    while tamanho > minimo and c.stringWidth(texto, fonte, tamanho) > largura:
        tamanho -= 0.5
    return tamanho


def _escrever(c: canvas.Canvas, texto: str, coluna: int, linha: int, centro: bool = True) -> None:
    esquerda, direita = COLUNAS_X[coluna], COLUNAS_X[coluna + 1]
    largura = direita - esquerda - 4
    tamanho = _caber(c, texto, largura, min(10.0, ALTURA_DA_LINHA * 0.78), fonte="Times-Roman")  # a letra do papel (25/10)
    c.setFont("Times-Roman", tamanho)
    base = ALTURA - (TOPO_DAS_LINHAS + (linha + 1) * ALTURA_DA_LINHA) + (ALTURA_DA_LINHA - tamanho) / 2 + 0.8
    if centro:
        c.drawCentredString((esquerda + direita) / 2, base, texto)
    else:
        c.drawString(esquerda + 3, base, texto)


def gerar_pdf(linhas: list[dict], modelo: bytes | None) -> bytes:
    """O modelo da empresa (ou o de demonstração) com as linhas escritas nas células. A assinatura (Visto) fica em branco."""
    escritor = PdfWriter(clone_from=io.BytesIO(modelo or _modelo_de_demonstracao()))
    camada = io.BytesIO()
    c = canvas.Canvas(camada, pagesize=A4)
    for i, l in enumerate(linhas[:CAPACIDADE]):
        _escrever(c, l["data"].strftime("%d.%m.%y"), 0, i)
        _escrever(c, l["material"], 1, i)
        _escrever(c, l["ciclo"], 2, i)
        _escrever(c, "OK" if l["eficiente"] else "-", 3, i)
        _escrever(c, "-" if l["eficiente"] else "OK", 4, i)
        _escrever(c, l["analista"], 5, i)
    c.showPage()  # garante a página mesmo sem nenhuma linha escrita
    c.save()
    escritor.pages[0].merge_page(PdfReader(io.BytesIO(camada.getvalue())).pages[0])
    saida = io.BytesIO()
    escritor.write(saida)
    return saida.getvalue()


def so_a_primeira_folha(pdf: bytes) -> bytes:
    """O Word às vezes exporta uma folha a mais, vazia: fica só a primeira (a com a tabela). Folha extra com texto é erro."""
    try:
        leitor = PdfReader(io.BytesIO(pdf))
        extras = leitor.pages[1:]
    except Exception:
        return pdf  # o modelo_valido explica o problema
    if not extras:
        return pdf
    if any((p.extract_text() or "").strip() for p in extras):
        raise ValueError("O modelo deve ter uma página só (a folha com as linhas em branco).")
    escritor = PdfWriter()
    escritor.add_page(leitor.pages[0])
    saida = io.BytesIO()
    escritor.write(saida)
    return saida.getvalue()


def modelo_valido(pdf: bytes) -> None:
    """Confere que o PDF enviado é uma página A4 como o modelo (ValueError com a mensagem para a pessoa)."""
    if not pdf.startswith(b"%PDF"):
        raise ValueError("Esse arquivo não é um PDF.")
    try:
        leitor = PdfReader(io.BytesIO(pdf))
        paginas = len(leitor.pages)
        largura, altura = float(leitor.pages[0].mediabox.width), float(leitor.pages[0].mediabox.height)
    except Exception as e:  # PDF quebrado
        raise ValueError("Não consegui abrir esse PDF.") from e
    if paginas != 1:
        raise ValueError("O modelo deve ter uma página só (a folha com as linhas em branco).")
    if abs(largura - LARGURA) > 6 or abs(altura - ALTURA) > 6:
        raise ValueError("O modelo deve ser A4 em pé, como o laudo da empresa.")

