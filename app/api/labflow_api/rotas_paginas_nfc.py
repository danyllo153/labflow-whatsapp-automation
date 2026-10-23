"""Páginas do laboratório, só leitura: Tanques, Drops e Desvios (NFC, terra e navio).

Spec: 07-app-pwa.md (v1.0), "5. Páginas do laboratório"; 08-fluxos.md A11. Tarefa: APP-017.
Mesmo padrão de Coletas e Recebimento (rotas_paginas.py): leem SEMPRE pelas views do Power BI (schema bi), com os mesmos
filtros na tela e no Excel. São páginas de análise: o Coletor não as vê (07, Permissões).
"""

from datetime import date
from typing import Any, Literal

import psycopg
from fastapi import APIRouter, Depends, Query, Response

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.excel import MIME_XLSX, planilha, resposta_xlsx
from labflow_api.permissoes import exigir
from labflow_api.rotas_paginas import (
    POR_PAGINA_MAX,
    Pagina,
    _barrar_coletor,
    _Filtro,
    _linhas_para_excel,
    _paginar,
)

roteador = APIRouter(prefix="/paginas", tags=["páginas"])

Origem = Literal["Terra", "Navio"]


def _comum(f: _Filtro, origem: str | None, tanque: str | None, navio: str | None) -> None:
    f.igual("origem", origem)
    f.igual("tanque", tanque.strip().upper() if tanque else None)
    f.contem("navio", navio)


def _periodo(f: _Filtro, coluna: str, de: date | None, ate: date | None) -> None:
    if de:
        f.add(f"{coluna} >= %s", de)
    if ate:
        f.add(f"{coluna} <= %s", ate)


# ---------------------------------------------------------------- Tanques (bi.leituras_nfc)
TANQUES_BASE = """
    SELECT origem, tanque, navio, data_coleta, frasco, analise, etapa, prevista, contagem, resultado,
           situacao, lida_por, lida_em, repeticao
    FROM bi.leituras_nfc
"""
ORDEM_TANQUES = "data_coleta DESC, origem, navio, tanque, analise, frasco, etapa DESC"


class FiltrosTanques:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data da coleta, a partir de"),
        data_ate: date | None = None,
        origem: Origem | None = None,
        tanque: str | None = None,
        navio: str | None = Query(default=None, description="Parte do nome, ex.: O.SKY 189"),
        analise: Literal["C.T", "B.L", "Psicrotróficos"] | None = None,
        frasco: Literal["Normal", "Stress"] | None = None,
        etapa: Literal["Pré-leitura", "Leitura final"] | None = None,
        resultado: Literal["Ok", "Não ok", "Pendente"] | None = None,
        situacao: Literal["Lido", "Atrasado", "Vence hoje", "No prazo"] | None = None,
        quem: str | None = Query(default=None, description="Parte do nome de quem leu"),
    ) -> None:
        self.data_de, self.data_ate, self.origem, self.tanque, self.navio = data_de, data_ate, origem, tanque, navio
        self.analise, self.frasco, self.etapa, self.resultado = analise, frasco, etapa, resultado
        self.situacao, self.quem = situacao, quem

    def montar(self) -> _Filtro:
        f = _Filtro()
        _periodo(f, "data_coleta", self.data_de, self.data_ate)
        _comum(f, self.origem, self.tanque, self.navio)
        f.igual("analise", self.analise)
        f.igual("frasco", self.frasco)
        f.igual("etapa", self.etapa)
        f.igual("resultado", self.resultado)
        f.igual("situacao", self.situacao)
        f.contem("lida_por", self.quem)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Coleta de", self.data_de), ("Coleta até", self.data_ate), ("Origem", self.origem),
                ("Tanque", self.tanque), ("Navio", self.navio), ("Análise", self.analise), ("Frasco", self.frasco),
                ("Etapa", self.etapa), ("Resultado", self.resultado), ("Situação", self.situacao),
                ("Quem leu", self.quem)]


COLUNAS_TANQUES = [
    ("data_coleta", "Data da coleta"), ("origem", "Origem"), ("navio", "Navio"), ("tanque", "Tanque"),
    ("analise", "Análise"), ("frasco", "Frasco"), ("etapa", "Etapa"), ("prevista", "Leitura prevista"),
    ("contagem", "Placas"), ("resultado", "Resultado"), ("situacao", "Situação"), ("lida_por", "Lido por"),
    ("lida_em", "Lido em"),
]

# ---------------------------------------------------------------- Drops (bi.drops)
DROPS_BASE = """
    SELECT origem, tanque, navio, data_coleta, drop, prevista, situacao, concluido_por, concluido_em,
           desvio_resultado
    FROM bi.drops
"""
ORDEM_DROPS = "prevista DESC, origem, navio, tanque, drop"


class FiltrosDrops:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data prevista do drop, a partir de"),
        data_ate: date | None = None,
        origem: Origem | None = None,
        tanque: str | None = None,
        navio: str | None = Query(default=None, description="Parte do nome"),
        drop: Literal["D5", "D10", "D15"] | None = None,
        situacao: Literal["Concluído", "Atrasado", "Vence hoje", "No prazo"] | None = None,
        quem: str | None = Query(default=None, description="Parte do nome de quem concluiu"),
    ) -> None:
        self.data_de, self.data_ate, self.origem, self.tanque, self.navio = data_de, data_ate, origem, tanque, navio
        self.drop, self.situacao, self.quem = drop, situacao, quem

    def montar(self) -> _Filtro:
        f = _Filtro()
        _periodo(f, "prevista", self.data_de, self.data_ate)
        _comum(f, self.origem, self.tanque, self.navio)
        f.igual("drop", self.drop)
        f.igual("situacao", self.situacao)
        f.contem("concluido_por", self.quem)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Prevista de", self.data_de), ("Prevista até", self.data_ate), ("Origem", self.origem),
                ("Tanque", self.tanque), ("Navio", self.navio), ("Drop", self.drop), ("Situação", self.situacao),
                ("Quem concluiu", self.quem)]


COLUNAS_DROPS = [
    ("data_coleta", "Data da coleta"), ("origem", "Origem"), ("navio", "Navio"), ("tanque", "Tanque"),
    ("drop", "Drop"), ("prevista", "Prevista"), ("situacao", "Situação"), ("concluido_por", "Concluído por"),
    ("concluido_em", "Concluído em"), ("desvio_resultado", "Desvio"),
]

# ---------------------------------------------------------------- Desvios (bi.desvios: de drop e de tanque)
DESVIOS_BASE = """
    SELECT tipo, origem, tanque, navio, data_coleta, analise, frasco, data_abertura, prazo, status, resultado,
           contagem, temperaturas, aberto_por, resultado_por, data_resultado, situacao
    FROM bi.desvios
"""
ORDEM_DESVIOS = "status = 'Concluído', prazo DESC, data_abertura DESC, tanque"


class FiltrosDesvios:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data de abertura, a partir de"),
        data_ate: date | None = None,
        tipo: Literal["Drop", "Tanque"] | None = None,
        origem: Origem | None = None,
        tanque: str | None = None,
        navio: str | None = Query(default=None, description="Parte do nome"),
        aberto: Literal["Abertos", "Concluídos"] | None = Query(default=None, description="Abertos ou concluídos"),
        situacao: Literal["Atrasado", "Vence hoje", "No prazo", "Concluído"] | None = None,
        quem: str | None = Query(default=None, description="Parte do nome de quem abriu ou deu o resultado"),
    ) -> None:
        self.data_de, self.data_ate, self.tipo, self.origem = data_de, data_ate, tipo, origem
        self.tanque, self.navio, self.aberto, self.situacao, self.quem = tanque, navio, aberto, situacao, quem

    def montar(self) -> _Filtro:
        f = _Filtro()
        _periodo(f, "data_abertura", self.data_de, self.data_ate)
        f.igual("tipo", self.tipo)
        _comum(f, self.origem, self.tanque, self.navio)
        if self.aberto == "Abertos":
            f.add("status <> 'Concluído'")
        elif self.aberto == "Concluídos":
            f.add("status = 'Concluído'")
        f.igual("situacao", self.situacao)
        if self.quem and self.quem.strip():
            q = f"%{self.quem.strip()}%"
            f.add("(aberto_por ILIKE %s OR resultado_por ILIKE %s)", q, q)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Aberto de", self.data_de), ("Aberto até", self.data_ate), ("Tipo", self.tipo),
                ("Origem", self.origem), ("Tanque", self.tanque), ("Navio", self.navio), ("Abertos ou concluídos", self.aberto),
                ("Situação", self.situacao), ("Quem", self.quem)]


COLUNAS_DESVIOS = [
    ("tipo", "Tipo"), ("origem", "Origem"), ("navio", "Navio"), ("tanque", "Tanque"), ("data_coleta", "Data da coleta"),
    ("analise", "Análise"), ("frasco", "Frasco"), ("data_abertura", "Aberto em"), ("prazo", "Prazo"),
    ("status", "Status"), ("resultado", "Resultado"), ("contagem", "Placas"), ("temperaturas", "Cresceu em"),
    ("aberto_por", "Aberto por"), ("resultado_por", "Resultado por"), ("data_resultado", "Data do resultado"),
    ("situacao", "Situação"),
]


# ---------------------------------------------------------------- Rotas (tela e Excel)
@roteador.get("/tanques", response_model=Pagina)
def tanques(
    filtros: FiltrosTanques = Depends(),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    _barrar_coletor(pessoa)
    return _paginar(con, TANQUES_BASE, filtros.montar(), ORDEM_TANQUES, pagina, por_pagina)


@roteador.get("/drops", response_model=Pagina)
def drops(
    filtros: FiltrosDrops = Depends(),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    _barrar_coletor(pessoa)
    return _paginar(con, DROPS_BASE, filtros.montar(), ORDEM_DROPS, pagina, por_pagina)


@roteador.get("/desvios", response_model=Pagina)
def desvios(
    filtros: FiltrosDesvios = Depends(),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    _barrar_coletor(pessoa)
    return _paginar(con, DESVIOS_BASE, filtros.montar(), ORDEM_DESVIOS, pagina, por_pagina)


_XLSX = {"response_class": Response, "responses": {200: {"content": {MIME_XLSX: {}}}}}


@roteador.get("/tanques/excel", **_XLSX)
def tanques_excel(
    filtros: FiltrosTanques = Depends(),
    pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    _barrar_coletor(pessoa)
    linhas = _linhas_para_excel(con, TANQUES_BASE, filtros.montar(), ORDEM_TANQUES)
    return resposta_xlsx(planilha("Tanques", COLUNAS_TANQUES, linhas, filtros.descricao()), "tanques")


@roteador.get("/drops/excel", **_XLSX)
def drops_excel(
    filtros: FiltrosDrops = Depends(),
    pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    _barrar_coletor(pessoa)
    linhas = _linhas_para_excel(con, DROPS_BASE, filtros.montar(), ORDEM_DROPS)
    return resposta_xlsx(planilha("Drops", COLUNAS_DROPS, linhas, filtros.descricao()), "drops")


@roteador.get("/desvios/excel", **_XLSX)
def desvios_excel(
    filtros: FiltrosDesvios = Depends(),
    pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    _barrar_coletor(pessoa)
    linhas = _linhas_para_excel(con, DESVIOS_BASE, filtros.montar(), ORDEM_DESVIOS)
    return resposta_xlsx(planilha("Desvios", COLUNAS_DESVIOS, linhas, filtros.descricao()), "desvios")
