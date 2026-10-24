"""Recebimento FCOJ como um "app" de análise (Fase E, passo E2): painel, registrar, resultados e laudo numa página só.

Spec: rumo-do-app.md, "Fase E"; 07-app-pwa.md §5.2. Tarefa: APP-057. As gravações passam pelas funções do banco da 040 do
bot (PB11): `registrar_recebimento` e `lancar_contagem`, as mesmas que o bot chama, com a mesma prévia ("o que vai ser
criado", mostrada antes do Confirmar), as mesmas recusas e o mesmo alarme. Permissão de chamar: migration 068.
"""

import io
import re
from datetime import date, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from labflow_api import laudo_esterilizacao, laudos, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_admin import _recusa_do_banco
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/analises/recebimento-fcoj", tags=["recebimento FCOJ (app)"])

ANALISES = {"CT": "C.T 48h", "BL72": "B.L 72h", "BL120": "B.L 120h"}
PRAZO = {"CT": 2, "BL72": 3, "BL120": 5}  # dias depois do recebimento (o plaqueamento é no dia em que chega)
LIMITE = {"CT": 200, "BL72": 50, "BL120": 50}  # o mesmo alarme do bot (040); "<" nunca é alarme


def _hoje(con: psycopg.Connection) -> date:
    return rotas_turno._agora(con).astimezone(FUSO).date()


def _faixas(numeros: list[int]) -> str:
    """[1, 2, 3, 5] -> "1-3, 5"."""
    partes, inicio = [], None
    ordem = sorted(set(numeros))
    for i, n in enumerate(ordem):
        inicio = n if inicio is None else inicio
        if i == len(ordem) - 1 or ordem[i + 1] != n + 1:
            partes.append(str(n) if n == inicio else f"{inicio}-{n}")
            inicio = None
    return ", ".join(partes)


def _lotes(texto: str) -> list[int]:
    """"1-10, 12" -> [1..10, 12]. Recusa o que não for número ou faixa."""
    lotes: list[int] = []
    for parte in re.split(r"[,;\s]+", texto.strip()):
        if not parte:
            continue
        m = re.fullmatch(r"(\d{1,4})(?:\s*(?:-|a)\s*(\d{1,4}))?", parte)
        if not m:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'Lote "{parte}" não entendido. Use números e faixas, ex.: 1-10, 12.')
        de, ate = int(m.group(1)), int(m.group(2) or m.group(1))
        if ate < de or ate - de > 200:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'Faixa "{parte}" inválida.')
        lotes += range(de, ate + 1)
    if not lotes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Diga os lotes (ex.: 1-10, 12).")
    return lotes


def _resultado(texto: str) -> tuple[str, float]:
    """"<1" -> ("<", 1); "210" -> ("=", 210); "1,5" -> ("=", 1.5)."""
    m = re.fullmatch(r"([<>=]?)\s*(\d+(?:[.,]\d+)?)", texto.strip())
    if not m:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'Resultado "{texto.strip()}" inválido. Use <1, um número ou >300.')
    return m.group(1) or "=", float(m.group(2).replace(",", "."))


def _chamar(con: psycopg.Connection, sql: str, valores: tuple) -> dict:
    try:
        with con.transaction():
            return con.execute(sql, valores).fetchone()[0]
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None


# --- painel ----------------------------------------------------------------------------------------------------------


class GrupoDeHoje(BaseModel):
    analise: str  # "C.T 48h"
    situacao: Literal["Atrasado", "Para hoje"]
    n: int
    loads: str  # "L 43669 (7-11), L 43747 (16)"


class FabricaNaoOk(BaseModel):
    fabrica: str
    nao_ok: int
    lidos: int


class Painel(BaseModel):
    atrasados: int
    para_hoje: int
    nao_ok_semana: int
    hoje: list[GrupoDeHoje]
    fabricas: list[FabricaNaoOk]
    pode_registrar: bool


PENDENTES_SQL = """
SELECT r.id, l.numero, r.lote, a.cod, r.data_recebimento + a.dias AS prevista
FROM recebimento_lotes r JOIN loads l ON l.id = r.load_id JOIN itens i ON i.id = l.item_id
CROSS JOIN (VALUES ('CT', 2), ('BL72', 3), ('BL120', 5)) AS a(cod, dias)
WHERE i.codigo <> '129' AND r.data_recebimento + a.dias <= %(hoje)s  -- sem janela: a mesma conta do Início
  AND NOT EXISTS (SELECT 1 FROM contagens c WHERE c.recebimento_lote_id = r.id AND c.analise = a.cod)
"""


@roteador.get("/painel", response_model=Painel)
def painel(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> Painel:
    """O essencial: o que está atrasado e o que vence hoje (por análise, com os loads e lotes) e o não ok por fábrica."""
    hoje = _hoje(con)
    grupos: dict[tuple[str, str], dict[str, list[int]]] = {}
    for _, load, lote, cod, prevista in con.execute(PENDENTES_SQL, {"hoje": hoje}):
        situacao = "Atrasado" if prevista < hoje else "Para hoje"
        grupos.setdefault((cod, situacao), {}).setdefault(load, []).append(lote)
    hoje_lista = [
        GrupoDeHoje(
            analise=ANALISES[cod], situacao=situacao, n=sum(len(v) for v in loads.values()),
            loads=", ".join(f"L {load} ({_faixas(lotes)})" for load, lotes in sorted(loads.items())),
        )
        for (cod, situacao), loads in sorted(grupos.items(), key=lambda g: (g[0][1] != "Atrasado", list(ANALISES).index(g[0][0])))
    ]
    fabricas = [
        FabricaNaoOk(fabrica=f, nao_ok=n, lidos=t)
        for f, n, t in con.execute(
            """
            SELECT coalesce(f.nome, '?'),
                   count(*) FILTER (WHERE c.sinal <> '<' AND c.valor >= CASE c.analise WHEN 'CT' THEN 200 ELSE 50 END), count(*)
            FROM contagens c JOIN recebimento_lotes r ON r.id = c.recebimento_lote_id JOIN loads l ON l.id = r.load_id
            LEFT JOIN fabricas f ON f.id = l.fabrica_id
            WHERE (c.lido_em AT TIME ZONE 'America/Sao_Paulo')::date >= %s
            GROUP BY 1 ORDER BY 2 DESC, 3 DESC
            """,
            (hoje - timedelta(days=30),),
        )
    ]
    nao_ok_semana = con.execute(
        """
        SELECT count(*) FROM contagens c WHERE c.recebimento_lote_id IS NOT NULL
          AND c.sinal <> '<' AND c.valor >= CASE c.analise WHEN 'CT' THEN 200 ELSE 50 END
          AND (c.lido_em AT TIME ZONE 'America/Sao_Paulo')::date >= %s
        """,
        (hoje - timedelta(days=7),),
    ).fetchone()[0]
    return Painel(
        atrasados=sum(g.n for g in hoje_lista if g.situacao == "Atrasado"),
        para_hoje=sum(g.n for g in hoje_lista if g.situacao == "Para hoje"),
        nao_ok_semana=nao_ok_semana, hoje=hoje_lista, fabricas=fabricas,
        pode_registrar=pessoa.cargo in ("Admin", "Analista"),
    )


# --- resultados ------------------------------------------------------------------------------------------------------


class Leitura(BaseModel):
    resultado: str | None  # "<1", "210"; nulo = ainda não lido
    nao_ok: bool
    prevista: date


class LoteDoRecebimento(BaseModel):
    id: int  # recebimento_lote_id
    load: str
    item: str
    fabrica: str | None
    lote: int
    recebido_em: date
    ct: Leitura
    bl72: Leitura
    bl120: Leitura
    situacao: Literal["Não ok", "Atrasado", "Para hoje", "No prazo", "Ok"]


class Resultados(BaseModel):
    lotes: list[LoteDoRecebimento]
    total: int


RESULTADOS_SQL = """
SELECT r.id, l.numero, i.codigo, f.nome, r.lote, r.data_recebimento,
       (SELECT jsonb_object_agg(c.analise, jsonb_build_object('sinal', c.sinal, 'valor', c.valor))
        FROM contagens c WHERE c.recebimento_lote_id = r.id)
FROM recebimento_lotes r JOIN loads l ON l.id = r.load_id JOIN itens i ON i.id = l.item_id LEFT JOIN fabricas f ON f.id = l.fabrica_id
WHERE i.codigo <> '129' AND r.data_recebimento >= %(desde)s
  AND (%(busca)s = '' OR l.numero ILIKE %(parecido)s OR f.nome ILIKE %(parecido)s OR i.codigo = %(busca)s)
  AND (%(fabrica)s = '' OR f.nome = %(fabrica)s)
ORDER BY r.data_recebimento DESC, l.numero, r.lote
LIMIT 400
"""


def _texto(c: dict | None) -> str | None:
    if not c:
        return None
    valor = float(c["valor"])
    numero = str(int(valor)) if valor == int(valor) else str(valor).replace(".", ",")
    return ("" if c["sinal"] == "=" else c["sinal"]) + numero


@roteador.get("/resultados", response_model=Resultados)
def resultados(
    busca: str = Query(default="", max_length=30),
    fabrica: str = Query(default="", max_length=10),
    so_pendentes: bool = Query(default=False),
    dias: int = Query(default=30, ge=1, le=365),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Resultados:
    """Um lote por linha, com o C.T 48h e o B.L 72h e 120h; a busca acha load, fábrica ou item (ex.: "43669", "AQA")."""
    hoje = _hoje(con)
    termo = busca.strip()
    lotes = []
    for id_, load, item, fab, lote, recebido, contagens in con.execute(
        RESULTADOS_SQL,
        {"desde": hoje - timedelta(days=dias), "busca": termo, "parecido": f"%{termo}%", "fabrica": fabrica.strip().upper()},
    ):
        contagens = contagens or {}
        leituras = {}
        for cod in ANALISES:
            c = contagens.get(cod)
            nao_ok = bool(c) and c["sinal"] != "<" and float(c["valor"]) >= LIMITE[cod]
            leituras[cod] = Leitura(resultado=_texto(c), nao_ok=nao_ok, prevista=recebido + timedelta(days=PRAZO[cod]))
        pendentes = [l.prevista for l in leituras.values() if l.resultado is None]
        if any(l.nao_ok for l in leituras.values()):
            situacao = "Não ok"
        elif pendentes and min(pendentes) < hoje:
            situacao = "Atrasado"
        elif pendentes and min(pendentes) == hoje:
            situacao = "Para hoje"
        elif pendentes:
            situacao = "No prazo"
        else:
            situacao = "Ok"
        if so_pendentes and situacao in ("Ok", "No prazo"):
            continue
        lotes.append(
            LoteDoRecebimento(
                id=id_, load=load, item=item, fabrica=fab, lote=lote, recebido_em=recebido,
                ct=leituras["CT"], bl72=leituras["BL72"], bl120=leituras["BL120"], situacao=situacao,
            )
        )
    return Resultados(lotes=lotes, total=len(lotes))


# --- registrar e lançar (as funções da 040) ---------------------------------------------------------------------------


class Registro(BaseModel):
    load: str = Field(max_length=10)
    item: str = Field(max_length=10)
    fabrica: str = Field(max_length=10)
    lotes: str = Field(max_length=200)  # "1-10, 12"
    data: date
    previa: bool = True  # primeiro a prévia ("o que vai ser criado"); depois o Confirmar manda previa = false


class Resposta(BaseModel):
    ok: bool
    previa: bool
    texto: str  # o texto pronto da função, o mesmo que o bot mostra antes do "sim"
    novos: list[int] = []
    repetidos: list[int] = []
    gravados: int = 0
    alarmes: int = 0


@roteador.post("/registrar", response_model=Resposta)
def registrar(
    pedido: Registro, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Resposta:
    if pedido.data > _hoje(con):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A data do recebimento não pode ser depois de hoje.")
    r = _chamar(
        con, "SELECT registrar_recebimento(%s, %s, %s, %s, %s, %s, false, %s)",
        (pessoa.usuario_id, pedido.load, pedido.item, pedido.fabrica, _lotes(pedido.lotes), pedido.data, pedido.previa),
    )
    return Resposta(ok=r["ok"], previa=r["previa"], texto=r["texto"], novos=r.get("novos", []), repetidos=r.get("repetidos", []),
                    gravados=len(r.get("novos", [])) if not r["previa"] else 0)


class ItemLancado(BaseModel):
    recebimento_lote_id: int
    resultado: str = Field(max_length=12)


class Lancamento(BaseModel):
    analise: Literal["CT", "BL72", "BL120"]
    itens: list[ItemLancado] = Field(min_length=1, max_length=200)
    previa: bool = True


@roteador.post("/lancar", response_model=Resposta)
def lancar(
    pedido: Lancamento, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Resposta:
    itens = []
    for i in pedido.itens:
        sinal, valor = _resultado(i.resultado)
        itens.append({"recebimento_lote_id": i.recebimento_lote_id, "sinal": sinal, "valor": valor})
    r = _chamar(con, "SELECT lancar_contagem(%s, %s, %s, %s)", (pessoa.usuario_id, pedido.analise, Jsonb(itens), pedido.previa))
    return Resposta(ok=r["ok"], previa=r["previa"], texto=r["texto"], gravados=r.get("gravados", 0), alarmes=r.get("alarmes", 0))


# --- compostas (a função criar_compostas da 043, PB13; permissão na 069) ----------------------------------------------


def recomendar_compostas(lotes: list[int]) -> list[list[int]]:
    """Divide os lotes em compostas de ~5 (pedido do Danyllo, 24/10): até 6 numa composta vale, 7 não.

    O número de compostas é o maior entre "6 por composta" (arredondado para cima) e "5 por composta" (arredondado):
    20 -> 5+5+5+5; 6 -> 6; 7 -> 3+4; 8 -> 4+4; 12 -> 6+6; 18 -> 4+4+5+5. As maiores ficam no fim, na ordem dos lotes.
    """
    ordem = sorted(set(lotes))
    n = len(ordem)
    if n == 0:
        return []
    k = max(-(-n // 6), int(n / 5 + 0.5), 1)
    base, sobra = divmod(n, k)
    tamanhos = [base] * (k - sobra) + [base + 1] * sobra
    grupos, i = [], 0
    for t in tamanhos:
        grupos.append(ordem[i : i + t])
        i += t
    return grupos


def _grupos(texto: str) -> list[list[int]]:
    """"(1-5)(6-10)" ou "1-5; 6-10" -> [[1..5], [6..10]]."""
    partes = re.findall(r"\(([^)]*)\)", texto) or [p for p in re.split(r"[;/|]", texto) if p.strip()]
    if not partes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Diga os lotes de cada composta, ex.: (1-5)(6-10).")
    return [_lotes(p) for p in partes]


def _texto_grupos(grupos: list[list[int]]) -> str:
    return "".join(f"({_faixas(g)})" for g in grupos)


class CompostaExistente(BaseModel):
    id: int
    lotes: str  # "1-5"


class LoadSemComposta(BaseModel):
    load: str
    item: str
    fabrica: str | None
    recebido_em: date
    livres: str  # lotes ainda fora de composta: "1-20"
    n_livres: int
    compostas: list[CompostaExistente]
    recomendado: str  # "(1-5)(6-10)(11-15)(16-20)"


@roteador.get("/compostas", response_model=list[LoadSemComposta])
def loads_sem_composta(
    busca: str = Query(default="", max_length=30),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[LoadSemComposta]:
    """Os loads com lote ainda fora de composta (os últimos 60 dias, ou o load buscado), com a composição recomendada."""
    termo = busca.strip()
    linhas = con.execute(
        """
        SELECT l.numero, i.codigo, f.nome, max(r.data_recebimento),
               array_agg(r.lote ORDER BY r.lote) FILTER (WHERE cl.composta_id IS NULL),
               (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'lotes', (
                         SELECT array_agg(r2.lote ORDER BY r2.lote) FROM composta_lotes cl2
                         JOIN recebimento_lotes r2 ON r2.id = cl2.recebimento_lote_id WHERE cl2.composta_id = c.id)) ORDER BY c.id), '[]')
                FROM compostas c WHERE c.load_id = l.id)
        FROM loads l JOIN itens i ON i.id = l.item_id LEFT JOIN fabricas f ON f.id = l.fabrica_id
        JOIN recebimento_lotes r ON r.load_id = l.id LEFT JOIN composta_lotes cl ON cl.recebimento_lote_id = r.id
        WHERE i.codigo <> '129' AND (%(busca)s <> '' AND l.numero = %(busca)s
                                     OR %(busca)s = '' AND r.data_recebimento >= %(desde)s)
        GROUP BY l.id, l.numero, i.codigo, f.nome
        HAVING %(busca)s <> '' OR count(*) FILTER (WHERE cl.composta_id IS NULL) > 0
        ORDER BY max(r.data_recebimento) DESC, l.numero
        LIMIT 100
        """,
        {"busca": termo, "desde": _hoje(con) - timedelta(days=60)},
    ).fetchall()
    return [
        LoadSemComposta(
            load=load, item=item, fabrica=fab, recebido_em=recebido, livres=_faixas(livres or []), n_livres=len(livres or []),
            compostas=[CompostaExistente(id=c["id"], lotes=_faixas(c["lotes"] or [])) for c in compostas],
            recomendado=_texto_grupos(recomendar_compostas(livres or [])),
        )
        for load, item, fab, recebido, livres, compostas in linhas
    ]


class PedidoDeCompostas(BaseModel):
    load: str = Field(max_length=10)
    item: str = Field(max_length=10)
    grupos: str = Field(max_length=300)  # "(1-5)(6-10)"
    previa: bool = True


class RespostaCompostas(BaseModel):
    ok: bool
    previa: bool
    texto: str
    criadas: int = 0


@roteador.post("/compostas", response_model=RespostaCompostas)
def criar_compostas(
    pedido: PedidoDeCompostas, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> RespostaCompostas:
    grupos = _grupos(pedido.grupos)
    r = _chamar(con, "SELECT criar_compostas(%s, %s, %s, %s, %s)", (pessoa.usuario_id, pedido.load, pedido.item, Jsonb(grupos), pedido.previa))
    return RespostaCompostas(ok=r["ok"], previa=r["previa"], texto=r["texto"], criadas=r.get("criadas", 0))


# --- laudo (APP-059): "Laudo de Análises Microbiológicas – Recebimento", A4 deitado, uma linha por lote --------------
# Como no papel (fotos de 24/10): Load, Fábrica e Item só na primeira linha do load na folha; a data muda quando o lote
# chegou em outro dia; na Observação, "* 33, 34, 37, 38" = os lotes que faltam na sequência do load (saem quando chegam).
# Analista Responsável = quem registrou os lotes da folha; o Visto é à mão. Geometria medida no PDF do modelo (LAB/001,
# revisão 7, enviado pelo Danyllo em 24/10; o PDF fica fora do Git, no banco).

NOME_DO_LAUDO = "recebimento-fcoj"
DIAS_PARA_TRAS = 7  # na primeira vez, a folha começa com os lotes da última semana
LARGURA_DEITADA, ALTURA_DEITADA = 841.89, 595.28
TABELA = laudos.Tabela(
    colunas=(21.0, 91.8, 182.2, 272.7, 347.1, 432.2, 495.9, 566.9, 644.9, 815.2), topo=179.3, base=393.8, linhas=15
)
CABECALHO, SUBCABECALHO = 137.3, 165.0  # topo da tabela e a linha de baixo de "C.T." e "B.L." (onde começam 48h, 72h e 120h)
COLUNAS_DO_PAPEL = ("Load", "Fábrica", "Item", "Lote", "Data da Análise", "48h", "72h", "120h", "Observação")
LINHA_DO_ANALISTA = (136.5, 562.6, 438.5, 451.5)  # x0, x1, topo e base do traço "Analista Responsável"


def _demonstracao() -> bytes:
    """Folha deitada com o título, os cabeçalhos, as 15 linhas e o rodapé, na geometria do papel (sem dado da empresa)."""
    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=(LARGURA_DEITADA, ALTURA_DEITADA))
    y = lambda topo: ALTURA_DEITADA - topo  # noqa: E731
    col = TABELA.colunas
    c.setFont("Helvetica-BoldOblique", 11)
    c.drawCentredString(LARGURA_DEITADA / 2, y(121), "Laudo de Análises Microbiológicas – Recebimento (modelo de demonstração)")
    c.setLineWidth(0.6)
    c.rect(col[0], y(TABELA.base), col[-1] - col[0], TABELA.base - CABECALHO)
    c.line(col[5], y(SUBCABECALHO), col[8], y(SUBCABECALHO))
    for x in col[1:-1]:
        c.line(x, y(SUBCABECALHO if x == col[7] else CABECALHO), x, y(TABELA.base))
    for i in range(TABELA.linhas):
        c.line(col[0], y(TABELA.topo + i * TABELA.altura), col[-1], y(TABELA.topo + i * TABELA.altura))
    c.setFont("Helvetica", 9)
    for x0, x1, nome in zip(col, col[1:], COLUNAS_DO_PAPEL):
        c.drawCentredString((x0 + x1) / 2, y(176 if nome in ("48h", "72h", "120h") else 150), nome)
    c.drawCentredString((col[5] + col[6]) / 2, y(150), "C.T. (UFC/ml)")
    c.drawCentredString((col[6] + col[8]) / 2, y(150), "B.L. (UFC/ml)")
    c.drawString(26.6, y(419), "C.T. = Contagem Total e B.L. = Bolores e Leveduras")
    c.drawString(26.6, y(448), "Analista Responsável:")
    c.line(LINHA_DO_ANALISTA[0], y(450), LINHA_DO_ANALISTA[1], y(450))
    c.drawString(565.6, y(448), "Visto:")
    c.line(598.0, y(450), 808.2, y(450))
    c.drawString(26.6, y(476), "Responsável pela Correta Aplicação:")
    c.line(207.0, y(478), 807.4, y(478))
    c.showPage()
    c.save()
    return saida.getvalue()


def modelo_deitado_valido(pdf: bytes) -> None:
    """O modelo do recebimento é uma página A4 deitada (ValueError com a mensagem para a pessoa)."""
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
    if abs(largura - LARGURA_DEITADA) > 6 or abs(altura - ALTURA_DEITADA) > 6:
        raise ValueError("O modelo do recebimento deve ser A4 deitado, como o laudo da empresa.")


def lotes_que_faltam(lotes: list[int]) -> list[int]:
    """Os buracos na sequência dos lotes recebidos do load: [23..32, 35, 36, 39, 40] -> [33, 34, 37, 38]."""
    tem = set(lotes)
    return [n for n in range(min(tem), max(tem) + 1) if n not in tem] if tem else []


def distribuir_lotes(con: psycopg.Connection) -> None:
    """Põe nas folhas, na ordem do recebimento, os lotes que ainda não têm linha. Trava para duas telas não dividirem uma vaga."""
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext(%s))", (NOME_DO_LAUDO,))
    inicio = con.execute(
        "SELECT min(r.data_recebimento) FROM app.recebimento_laudo x JOIN recebimento_lotes r ON r.id = x.recebimento_lote_id"
    ).fetchone()[0] or _hoje(con) - timedelta(days=DIAS_PARA_TRAS)
    for (lote_id,) in con.execute(
        """
        SELECT r.id FROM recebimento_lotes r JOIN loads l ON l.id = r.load_id JOIN itens i ON i.id = l.item_id
        WHERE i.codigo <> '129' AND r.data_recebimento >= %s
          AND NOT EXISTS (SELECT 1 FROM app.recebimento_laudo x WHERE x.recebimento_lote_id = r.id)
        ORDER BY r.data_recebimento, r.id
        """,
        (inicio,),
    ).fetchall():
        con.execute(
            "INSERT INTO app.recebimento_laudo (recebimento_lote_id, pagina_id) VALUES (%s, %s)",
            (lote_id, laudos.pagina_com_vaga(con, NOME_DO_LAUDO)),
        )


def _gerar_laudo(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = con.execute(
        """
        SELECT l.id, l.numero, f.nome, i.codigo, r.lote, r.data_recebimento,
               (SELECT jsonb_object_agg(c.analise, jsonb_build_object('sinal', c.sinal, 'valor', c.valor))
                FROM contagens c WHERE c.recebimento_lote_id = r.id),
               (SELECT array_agg(r2.lote) FROM recebimento_lotes r2 WHERE r2.load_id = l.id),
               coalesce(u.nome, cr.usuario)
        FROM app.recebimento_laudo x JOIN recebimento_lotes r ON r.id = x.recebimento_lote_id
        JOIN loads l ON l.id = r.load_id JOIN itens i ON i.id = l.item_id LEFT JOIN fabricas f ON f.id = l.fabrica_id
        LEFT JOIN usuarios u ON u.id = r.registrado_por LEFT JOIN app.credenciais cr ON cr.usuario_id = r.registrado_por
        WHERE x.pagina_id = %s ORDER BY x.incluido_em, r.data_recebimento, l.numero, r.lote
        """,
        (pagina_id,),
    ).fetchall()
    celulas, anterior, analistas = [], (None, None), []
    for n, (load_id, load, fab, item, lote, recebido, leituras, todos, quem) in enumerate(linhas):
        primeira = load_id != anterior[0]
        leituras = leituras or {}
        faltam = lotes_que_faltam(todos or []) if primeira else []
        textos = [
            load if primeira else "", (fab or "") if primeira else "", item if primeira else "", str(lote),
            recebido.strftime("%d.%m.%y") if primeira or recebido != anterior[1] else "",
            *(_texto(leituras.get(cod)) or "" for cod in ANALISES),
            ("* " + ", ".join(map(str, faltam))) if faltam else "",
        ]
        for i, texto in enumerate(textos):
            celulas.append(TABELA.celula(texto, n, i, centro=i != 8, tamanho=8.5))
        anterior = (load_id, recebido)
        nome = laudo_esterilizacao.primeiro_nome(quem) if quem else ""
        if nome and nome not in analistas:
            analistas.append(nome)
    if analistas:
        x0, x1, topo, base = LINHA_DO_ANALISTA
        celulas.append(laudos.Celula(", ".join(analistas), x0, x1, topo, base, centro=False, tamanho=10))
    return laudos.preencher(modelo, _demonstracao, celulas)


laudos.registrar(
    laudos.Laudo(
        nome=NOME_DO_LAUDO, titulo="Recebimento de FCOJ", modelo=NOME_DO_LAUDO, capacidade=TABELA.linhas,
        contar_sql="""
            SELECT count(*), min(r.data_recebimento), max(r.data_recebimento)
            FROM app.recebimento_laudo x JOIN recebimento_lotes r ON r.id = x.recebimento_lote_id WHERE x.pagina_id = %s
        """,
        gerar=_gerar_laudo, aceitar_modelo=modelo_deitado_valido, preparar=distribuir_lotes,
    )
)
