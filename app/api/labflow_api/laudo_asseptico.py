"""Laudo "Controle de Material Asséptico": páginas de 9 dias e o PDF preenchido sobre o modelo da empresa.

Spec: 07-app-pwa.md (v1.0), §7.2 Material asséptico. Tarefa: APP-041. Tabelas da migration 059.

Cada dia ocupa 4 linhas (ponteira/pipeta, água de diluição, placa de Petri, meio de cultura); C.T., B.L. e o analista
ficam uma vez por dia; os ciclos e lotes vão na linha de cada material. O Visto fica em branco (assinatura à mão).
A geometria abaixo foi medida no PDF oficial (LAB/001, exportado do Word em 24/10): 9 dias de 4 linhas por folha.
"""

import io
from datetime import date

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from labflow_api.laudo_esterilizacao import _caber

DIAS_POR_PAGINA = 9
NOME_DO_MODELO = "material-asseptico"
MATERIAIS = ("ponteira / pipeta", "água de diluição", "placa de Petri", "meio de cultura")

LARGURA, ALTURA = A4
COLUNAS_X = (35.52, 84.5, 217.2, 273.4, 327.9, 384.6, 441.2, 560.26)  # Data, Material, C.T., B.L., Nome, Visto, Ciclo
TOPO_DOS_DIAS = 161.18
BASE_DOS_DIAS = 685.06
ALTURA_DA_LINHA = (BASE_DOS_DIAS - TOPO_DOS_DIAS) / (DIAS_POR_PAGINA * 4)  # 4 linhas por dia


def _y(linha: float) -> float:
    return ALTURA - (TOPO_DOS_DIAS + linha * ALTURA_DA_LINHA)


def modelo_de_demonstracao() -> bytes:
    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=A4)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(LARGURA / 2, ALTURA - 110, "Controle de Material Asséptico (modelo de demonstração)")
    c.setFont("Helvetica", 8)
    for x, titulo in zip(COLUNAS_X, ("Data análise", "Material", "C.T.", "B.L.", "Nome", "Visto", "Ciclo de esterilização")):
        c.drawString(x + 3, ALTURA - 142, titulo)
    c.setLineWidth(0.5)
    total = DIAS_POR_PAGINA * 4
    for i in range(total + 1):
        y = _y(i)
        esquerda = COLUNAS_X[0] if i % 4 == 0 else COLUNAS_X[1]
        c.line(esquerda, y, COLUNAS_X[-1], y)
    c.line(COLUNAS_X[0], ALTURA - (TOPO_DOS_DIAS - 16), COLUNAS_X[-1], ALTURA - (TOPO_DOS_DIAS - 16))
    for x in COLUNAS_X:
        c.line(x, ALTURA - (TOPO_DOS_DIAS - 16), x, _y(total))
    c.save()
    return saida.getvalue()


def _escrever(c: canvas.Canvas, texto: str, coluna: int, topo: float, altura: float, centro: bool = True) -> None:
    esquerda, direita = COLUNAS_X[coluna], COLUNAS_X[coluna + 1]
    tamanho = _caber(c, texto, direita - esquerda - 4, 8.5)
    c.setFont("Helvetica", tamanho)
    base = topo - altura / 2 - tamanho / 3
    if centro:
        c.drawCentredString((esquerda + direita) / 2, base, texto)
    else:
        c.drawString(esquerda + 3, base, texto)


def gerar_pdf(dias: list[dict], modelo: bytes | None) -> bytes:
    """`dias`: dia, ponteiras, agua_diluicao, placas, meios, ct, bl, analista. Escreve sobre o modelo (ou o de demonstração)."""
    escritor = PdfWriter(clone_from=io.BytesIO(modelo or modelo_de_demonstracao()))
    camada = io.BytesIO()
    c = canvas.Canvas(camada, pagesize=A4)
    sem_modelo = modelo is None
    for n, d in enumerate(dias[:DIAS_POR_PAGINA]):
        topo_do_dia = _y(n * 4)
        bloco = 4 * ALTURA_DA_LINHA
        _escrever(c, d["dia"].strftime("%d.%m.%y"), 0, topo_do_dia, bloco)
        _escrever(c, d["ct"], 2, topo_do_dia, bloco)
        _escrever(c, d["bl"], 3, topo_do_dia, bloco)
        _escrever(c, d["analista"], 4, topo_do_dia, bloco)
        for i, (material, chave) in enumerate(zip(MATERIAIS, ("ponteiras", "agua_diluicao", "placas", "meios"))):
            topo = _y(n * 4 + i)
            if sem_modelo:  # no modelo oficial o nome do material já vem impresso
                _escrever(c, material, 1, topo, ALTURA_DA_LINHA, centro=False)
            _escrever(c, d[chave] or "-", 6, topo, ALTURA_DA_LINHA, centro=False)
    c.showPage()  # garante a página mesmo sem nenhuma linha escrita
    c.save()
    escritor.pages[0].merge_page(PdfReader(io.BytesIO(camada.getvalue())).pages[0])
    saida = io.BytesIO()
    escritor.write(saida)
    return saida.getvalue()


def dia_valido(dia: date, hoje: date) -> bool:
    return 0 <= (hoje - dia).days <= 7
