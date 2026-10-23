"""Páginas do laboratório, só leitura: Coletas e Recebimento.

Spec: 07-app-pwa.md (v1.0), "5. Páginas do laboratório"; 08-fluxos.md A11. Tarefas: APP-008 (páginas) e APP-009 (Excel).
Leem SEMPRE pelas views do Power BI (schema bi), para os números baterem com o painel.
"""

from datetime import date
from typing import Any, Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.excel import MIME_XLSX, planilha, resposta_xlsx
from labflow_api.permissoes import exigir

roteador = APIRouter(prefix="/paginas", tags=["páginas"])

POR_PAGINA_MAX = 200


class Pagina(BaseModel):
    total: int
    pagina: int
    por_pagina: int
    linhas: list[dict[str, Any]]


class _Filtro:
    """Monta o WHERE com parâmetros (nunca texto do usuário colado no SQL)."""

    def __init__(self) -> None:
        self.partes: list[str] = []
        self.valores: list[Any] = []

    def add(self, condicao: str, *valores: Any) -> None:
        self.partes.append(condicao)
        self.valores.extend(valores)

    def igual(self, coluna: str, valor: Any) -> None:
        if valor not in (None, ""):
            self.add(f"{coluna} = %s", valor)

    def contem(self, coluna: str, valor: str | None) -> None:
        if valor and valor.strip():
            self.add(f"{coluna} ILIKE %s", f"%{valor.strip()}%")

    def sql(self) -> str:
        return (" WHERE " + " AND ".join(self.partes)) if self.partes else ""


def _paginar(con, base: str, filtro: _Filtro, ordem: str, pagina: int, por_pagina: int) -> Pagina:
    total = con.execute(f"SELECT count(*) FROM ({base}) t{filtro.sql()}", filtro.valores).fetchone()[0]
    cur = con.execute(
        f"SELECT * FROM ({base}) t{filtro.sql()} ORDER BY {ordem} LIMIT %s OFFSET %s",
        [*filtro.valores, por_pagina, (pagina - 1) * por_pagina],
    )
    nomes = [d.name for d in cur.description]
    return Pagina(
        total=total, pagina=pagina, por_pagina=por_pagina, linhas=[dict(zip(nomes, l)) for l in cur.fetchall()]
    )


# ---------------------------------------------------------------- Coletas (bi.coletas)
COLETAS_BASE = """
    SELECT b.coleta_id, b.origem, b.tanque, b.navio, b.data_coleta,
           b.registrado_por AS coletado_por, b.digitado_por, b.registrado_em,
           c.registrado_por AS digitado_por_id
    FROM bi.coletas b JOIN coletas c ON c.id = b.coleta_id
"""


def filtro_coletas(
    pessoa: PessoaLogada,
    data_de: date | None,
    data_ate: date | None,
    origem: str | None,
    tanque: str | None,
    navio: str | None,
    quem: str | None,
) -> _Filtro:
    f = _Filtro()
    if data_de:
        f.add("data_coleta >= %s", data_de)
    if data_ate:
        f.add("data_coleta <= %s", data_ate)
    f.igual("origem", origem)
    f.igual("tanque", tanque.strip().upper() if tanque else None)
    f.contem("navio", navio)
    if quem and quem.strip():
        f.add("(coletado_por ILIKE %s OR digitado_por ILIKE %s)", f"%{quem.strip()}%", f"%{quem.strip()}%")
    if pessoa.cargo == "Coletor":  # 07: o Coletor vê só as próprias coletas
        f.add("digitado_por_id = %s", pessoa.usuario_id)
    return f


class FiltrosColetas:
    """Filtros da página Coletas, iguais na tela e no Excel (08 A11: exporta o que está filtrado)."""

    def __init__(
        self,
        data_de: date | None = None,
        data_ate: date | None = None,
        origem: Literal["Terra", "Navio"] | None = None,
        tanque: str | None = None,
        navio: str | None = Query(default=None, description="Parte do nome, ex.: O.SKY 189"),
        quem: str | None = Query(default=None, description="Parte do nome de quem coletou ou digitou"),
    ) -> None:
        self.data_de, self.data_ate, self.origem = data_de, data_ate, origem
        self.tanque, self.navio, self.quem = tanque, navio, quem

    def montar(self, pessoa: PessoaLogada) -> _Filtro:
        return filtro_coletas(pessoa, self.data_de, self.data_ate, self.origem, self.tanque, self.navio, self.quem)

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Data de", self.data_de), ("Data até", self.data_ate), ("Origem", self.origem),
                ("Tanque", self.tanque), ("Navio", self.navio), ("Quem", self.quem)]


ORDEM_COLETAS = "data_coleta DESC, registrado_em DESC, coleta_id DESC"


@roteador.get("/coletas", response_model=Pagina)
def coletas(
    filtros: FiltrosColetas = Depends(),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    resultado = _paginar(con, COLETAS_BASE, filtros.montar(pessoa), ORDEM_COLETAS, pagina, por_pagina)
    for linha in resultado.linhas:
        linha.pop("digitado_por_id", None)  # o id interno não vai para a tela
    return resultado


# ---------------------------------------------------------------- Recebimento (bi.contagens, origem Recebimento)
RECEBIMENTO_BASE = """
    SELECT load, item, fabrica, numero AS lote, analise, prevista, lido, resultado, alarme,
           lido_por, data_leitura,
           CASE WHEN lido AND alarme THEN 'Não ok' WHEN lido THEN 'Ok' ELSE situacao END AS situacao
    FROM bi.contagens
    WHERE origem = 'Recebimento'
"""



def filtro_recebimento(
    data_de: date | None,
    data_ate: date | None,
    load: str | None,
    lote: int | None,
    fabrica: str | None,
    analise: str | None,
    situacao: str | None,
    quem: str | None,
) -> _Filtro:
    f = _Filtro()
    if data_de:
        f.add("prevista >= %s", data_de)
    if data_ate:
        f.add("prevista <= %s", data_ate)
    f.igual("load", load.strip() if load else None)
    f.igual("lote", lote)
    f.igual("fabrica", fabrica.strip().upper() if fabrica else None)
    f.igual("analise", analise)
    f.igual("situacao", situacao)
    f.contem("lido_por", quem)
    return f


class FiltrosRecebimento:
    """Filtros da página Recebimento, iguais na tela e no Excel."""

    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data prevista da leitura, a partir de"),
        data_ate: date | None = None,
        load: str | None = None,
        lote: int | None = None,
        fabrica: str | None = Query(default=None, description="Sigla, ex.: AQA"),
        analise: Literal["C.T 48h", "B.L 72h", "B.L 120h"] | None = None,
        situacao: Literal["Ok", "Não ok", "Atrasado", "Vence hoje", "No prazo"] | None = None,
        quem: str | None = Query(default=None, description="Parte do nome de quem leu"),
    ) -> None:
        self.data_de, self.data_ate, self.load, self.lote = data_de, data_ate, load, lote
        self.fabrica, self.analise, self.situacao, self.quem = fabrica, analise, situacao, quem

    def montar(self) -> _Filtro:
        return filtro_recebimento(
            self.data_de, self.data_ate, self.load, self.lote, self.fabrica, self.analise, self.situacao, self.quem
        )

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Data prevista de", self.data_de), ("Data prevista até", self.data_ate), ("Load", self.load),
                ("Lote", self.lote), ("Fábrica", self.fabrica), ("Análise", self.analise),
                ("Situação", self.situacao), ("Quem leu", self.quem)]


ORDEM_RECEBIMENTO = "prevista DESC, load, lote, analise"


def _barrar_coletor(pessoa: PessoaLogada) -> None:
    if pessoa.cargo == "Coletor":  # 07: o Coletor só vê as próprias coletas
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seu cargo não permite esta página.")


@roteador.get("/recebimento", response_model=Pagina)
def recebimento(
    filtros: FiltrosRecebimento = Depends(),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    _barrar_coletor(pessoa)
    return _paginar(con, RECEBIMENTO_BASE, filtros.montar(), ORDEM_RECEBIMENTO, pagina, por_pagina)


# ---------------------------------------------------------------- Exportar para Excel (APP-009)
# Mesmos filtros da tela, sem paginação. Livre para todos os cargos que veem a página, sem registro (decisão de 15/10).
LINHAS_MAX_EXCEL = 50_000

COLUNAS_COLETAS = [
    ("data_coleta", "Data da coleta"), ("origem", "Origem"), ("tanque", "Tanque"), ("navio", "Navio"),
    ("coletado_por", "Coletado por"), ("digitado_por", "Digitado por"), ("registrado_em", "Registrado em"),
]
COLUNAS_RECEBIMENTO = [
    ("load", "Load"), ("item", "Item"), ("fabrica", "Fábrica"), ("lote", "Lote"), ("analise", "Análise"),
    ("prevista", "Leitura prevista"), ("resultado", "Resultado"), ("situacao", "Situação"),
    ("lido_por", "Lido por"), ("data_leitura", "Data da leitura"),
]


def _linhas_para_excel(con, base: str, filtro: _Filtro, ordem: str) -> list[dict[str, Any]]:
    cur = con.execute(
        f"SELECT * FROM ({base}) t{filtro.sql()} ORDER BY {ordem} LIMIT %s", [*filtro.valores, LINHAS_MAX_EXCEL + 1]
    )
    nomes = [d.name for d in cur.description]
    linhas = [dict(zip(nomes, l)) for l in cur.fetchall()]
    if len(linhas) > LINHAS_MAX_EXCEL:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Mais de {LINHAS_MAX_EXCEL} linhas: use um filtro menor (por exemplo, um período mais curto).",
        )
    return linhas


@roteador.get("/coletas/excel", response_class=Response, responses={200: {"content": {MIME_XLSX: {}}}})
def coletas_excel(
    filtros: FiltrosColetas = Depends(),
    pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    linhas = _linhas_para_excel(con, COLETAS_BASE, filtros.montar(pessoa), ORDEM_COLETAS)
    arquivo = planilha("Coletas", COLUNAS_COLETAS, linhas, filtros.descricao())
    return resposta_xlsx(arquivo, "coletas")


@roteador.get("/recebimento/excel", response_class=Response, responses={200: {"content": {MIME_XLSX: {}}}})
def recebimento_excel(
    filtros: FiltrosRecebimento = Depends(),
    pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    _barrar_coletor(pessoa)
    linhas = _linhas_para_excel(con, RECEBIMENTO_BASE, filtros.montar(), ORDEM_RECEBIMENTO)
    arquivo = planilha("Recebimento", COLUNAS_RECEBIMENTO, linhas, filtros.descricao())
    return resposta_xlsx(arquivo, "recebimento")


# ---------------------------------------------------------------- Gráfico G2 do Recebimento (APP-020)
# 07 §6: C.T e B.L por load ao longo do tempo, com a linha do limite. Mesmos filtros da página.
# Os limites são os da view vw_contagens (migration 009 do bot: C.T >= 200, B.L >= 50; "<" nunca é Não ok);
# um teste confere que estes números batem com o "alarme" da view.
LIMITES_RECEBIMENTO = {"C.T 48h": 200, "B.L 72h": 50, "B.L 120h": 50}
PONTOS_MAX_GRAFICO = 3000

GRAFICO_RECEBIMENTO_BASE = """
    SELECT load, item, fabrica, numero AS lote, analise, prevista, lido, sinal, valor, resultado, alarme,
           lido_por, data_leitura,
           CASE WHEN lido AND alarme THEN 'Não ok' WHEN lido THEN 'Ok' ELSE situacao END AS situacao
    FROM bi.contagens
    WHERE origem = 'Recebimento'
"""


class PontoG2(BaseModel):
    load: str
    lote: int | None
    analise: str
    data: date
    valor: float
    resultado: str
    nao_ok: bool


class GraficoG2(BaseModel):
    limites: dict[str, float]
    pontos: list[PontoG2]
    cortado: bool  # mais pontos que o máximo: a tela pede um filtro menor


@roteador.get("/recebimento/grafico", response_model=GraficoG2)
def recebimento_grafico(
    filtros: FiltrosRecebimento = Depends(),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> GraficoG2:
    _barrar_coletor(pessoa)
    filtro = filtros.montar()
    filtro.add("lido")
    filtro.add("data_leitura IS NOT NULL")
    linhas = con.execute(
        f"SELECT load, lote, analise, data_leitura, valor, resultado, alarme FROM ({GRAFICO_RECEBIMENTO_BASE}) t"
        f"{filtro.sql()} ORDER BY data_leitura DESC, load, lote LIMIT %s",
        [*filtro.valores, PONTOS_MAX_GRAFICO + 1],
    ).fetchall()
    cortado = len(linhas) > PONTOS_MAX_GRAFICO
    pontos = [
        PontoG2(load=l, lote=lt, analise=a, data=d, valor=float(v), resultado=r, nao_ok=bool(al))
        for l, lt, a, d, v, r, al in reversed(linhas[:PONTOS_MAX_GRAFICO])
    ]
    return GraficoG2(limites=LIMITES_RECEBIMENTO, pontos=pontos, cortado=cortado)
