"""Páginas do laboratório, só leitura: Coletas e Recebimento.

Spec: 07-app-pwa.md (v1.0), "5. Páginas do laboratório"; 08-fluxos.md A11. Tarefa: APP-008.
Leem SEMPRE pelas views do Power BI (schema bi), para os números baterem com o painel.
"""

from datetime import date
from typing import Any, Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
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


@roteador.get("/coletas", response_model=Pagina)
def coletas(
    data_de: date | None = None,
    data_ate: date | None = None,
    origem: Literal["Terra", "Navio"] | None = None,
    tanque: str | None = None,
    navio: str | None = Query(default=None, description="Parte do nome, ex.: O.SKY 189"),
    quem: str | None = Query(default=None, description="Parte do nome de quem coletou ou digitou"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    f = filtro_coletas(pessoa, data_de, data_ate, origem, tanque, navio, quem)
    resultado = _paginar(con, COLETAS_BASE, f, "data_coleta DESC, registrado_em DESC, coleta_id DESC", pagina, por_pagina)
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


@roteador.get("/recebimento", response_model=Pagina)
def recebimento(
    data_de: date | None = Query(default=None, description="Data prevista da leitura, a partir de"),
    data_ate: date | None = None,
    load: str | None = None,
    lote: int | None = None,
    fabrica: str | None = Query(default=None, description="Sigla, ex.: AQA"),
    analise: Literal["C.T 48h", "B.L 72h", "B.L 120h"] | None = None,
    situacao: Literal["Ok", "Não ok", "Atrasado", "Vence hoje", "No prazo"] | None = None,
    quem: str | None = Query(default=None, description="Parte do nome de quem leu"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    if pessoa.cargo == "Coletor":  # 07: o Coletor só vê as próprias coletas
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seu cargo não permite esta página.")
    f = filtro_recebimento(data_de, data_ate, load, lote, fabrica, analise, situacao, quem)
    return _paginar(con, RECEBIMENTO_BASE, f, "prevista DESC, load, lote, analise", pagina, por_pagina)
