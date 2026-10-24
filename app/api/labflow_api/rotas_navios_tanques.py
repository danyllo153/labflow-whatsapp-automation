"""Tanques terra e Navios: um tanque (ou navio) por linha, com status, e a página de cada um.

Pedido do Danyllo (23/10/2026, APP-019b): separar tanques de terra de navios; a página Navios lista TODOS os navios
(NFC e concentrado FCOJ, ligados pelo mesmo cadastro de navio e viagem) com o status, e tocar num navio mostra os tanques
NFC dele e o concentrado (linha e fase), que leva ao Embarque FCOJ. Tanques terra: um tanque por coleta, e tocar abre as
leituras, drops, desvios e TAB daquele tanque.

Status (regra aprovada em 23/10): **Concluído** = nada pendente (leituras lidas, drops concluídos, nenhum desvio aberto,
C.T/B.L do embarque lidos, TAB, Coliformes e Howard concluídos); **Atrasado** = alguma coisa passou do prazo;
**Em andamento** = o resto. Tudo lido pelas views do Power BI (schema bi). O Coletor não vê (páginas de análise).
"""

from datetime import date
from typing import Any, Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.excel import MIME_XLSX, planilha, resposta_xlsx
from labflow_api.permissoes import exigir
from labflow_api.rotas_paginas import POR_PAGINA_MAX, Pagina, _barrar_coletor, _Filtro, _linhas_para_excel, _paginar

roteador = APIRouter(prefix="/paginas", tags=["páginas"])

Status = Literal["Concluído", "Atrasado", "Em andamento"]


def _status(atrasados: str, pendentes: str) -> str:
    """CASE do status: 'atrasados' e 'pendentes' são expressões SQL que somam o que está atrasado e o que falta."""
    return (f"CASE WHEN ({atrasados}) > 0 THEN 'Atrasado' WHEN ({pendentes}) = 0 THEN 'Concluído' "
            f"ELSE 'Em andamento' END")


# ---------------------------------------------------------------- Uma linha por coleta (tanque de terra ou de navio)
POR_COLETA = """
    WITH c AS (SELECT coleta_id, origem, tanque, navio, data_coleta FROM bi.coletas),
    l AS (SELECT coleta_id, count(*) AS leituras, count(*) FILTER (WHERE lida) AS lidas,
                 count(*) FILTER (WHERE NOT lida) AS pendentes, count(*) FILTER (WHERE situacao = 'Atrasado') AS atrasadas,
                 count(*) FILTER (WHERE resultado = 'Não ok') AS nao_ok
          FROM bi.leituras_nfc GROUP BY coleta_id),
    d AS (SELECT coleta_id, count(*) AS drops, count(*) FILTER (WHERE NOT concluido) AS drops_pendentes,
                 count(*) FILTER (WHERE situacao = 'Atrasado') AS drops_atrasados
          FROM bi.drops GROUP BY coleta_id),
    v AS (SELECT c.coleta_id, count(*) FILTER (WHERE x.status <> 'Concluído') AS desvios_abertos,
                 count(*) FILTER (WHERE x.situacao = 'Atrasado') AS desvios_atrasados
          FROM c JOIN bi.desvios x ON x.origem = c.origem AND x.tanque = c.tanque AND x.data_coleta = c.data_coleta
                                   AND x.navio IS NOT DISTINCT FROM c.navio
          GROUP BY c.coleta_id),
    t AS (SELECT c.coleta_id, count(*) FILTER (WHERE s.situacao <> 'Concluído') AS testes_abertos,
                 count(*) FILTER (WHERE s.situacao = 'Atrasado') AS testes_atrasados
          FROM c JOIN bi.testes s ON s.origem = 'Tank farm' AND s.tanque = c.tanque AND s.data_coleta = c.data_coleta
          WHERE c.origem = 'Terra' GROUP BY c.coleta_id)
    SELECT c.coleta_id, c.origem, c.tanque, c.navio, c.data_coleta,
           coalesce(l.leituras, 0) AS leituras, coalesce(l.lidas, 0) AS lidas, coalesce(l.pendentes, 0) AS pendentes,
           coalesce(l.atrasadas, 0) AS atrasadas, coalesce(l.nao_ok, 0) AS nao_ok,
           coalesce(d.drops, 0) AS drops, coalesce(d.drops_pendentes, 0) AS drops_pendentes,
           coalesce(v.desvios_abertos, 0) AS desvios_abertos, coalesce(t.testes_abertos, 0) AS testes_abertos,
           """ + _status(
    "coalesce(l.atrasadas, 0) + coalesce(d.drops_atrasados, 0) + coalesce(v.desvios_atrasados, 0)"
    " + coalesce(t.testes_atrasados, 0)",
    "coalesce(l.pendentes, 0) + coalesce(d.drops_pendentes, 0) + coalesce(v.desvios_abertos, 0)"
    " + coalesce(t.testes_abertos, 0)",
) + """ AS status
    FROM c LEFT JOIN l USING (coleta_id) LEFT JOIN d USING (coleta_id) LEFT JOIN v USING (coleta_id)
           LEFT JOIN t USING (coleta_id)
"""

TANQUES_TERRA_BASE = f"SELECT * FROM ({POR_COLETA}) x WHERE origem = 'Terra'"
ORDEM_TANQUES_TERRA = "data_coleta DESC, tanque"


class FiltrosTanquesTerra:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data da coleta, a partir de"),
        data_ate: date | None = None,
        tanque: str | None = None,
        status: Status | None = None,
    ) -> None:
        self.data_de, self.data_ate, self.tanque, self.status = data_de, data_ate, tanque, status

    def montar(self) -> _Filtro:
        f = _Filtro()
        if self.data_de:
            f.add("data_coleta >= %s", self.data_de)
        if self.data_ate:
            f.add("data_coleta <= %s", self.data_ate)
        f.igual("tanque", self.tanque.strip().upper() if self.tanque else None)
        f.igual("status", self.status)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Coleta de", self.data_de), ("Coleta até", self.data_ate), ("Tanque", self.tanque), ("Status", self.status)]


COLUNAS_TANQUES_TERRA = [
    ("tanque", "Tanque"), ("data_coleta", "Data da coleta"), ("leituras", "Leituras"), ("lidas", "Lidas"),
    ("pendentes", "Pendentes"), ("atrasadas", "Atrasadas"), ("nao_ok", "Não ok"), ("drops_pendentes", "Drops pendentes"),
    ("desvios_abertos", "Desvios abertos"), ("testes_abertos", "TAB aberto"), ("status", "Status"),
]


@roteador.get("/tanques-terra", response_model=Pagina)
def tanques_terra(
    filtros: FiltrosTanquesTerra = Depends(),
    busca: str = Query(default="", max_length=60, description="Texto em qualquer coluna"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    _barrar_coletor(pessoa)
    return _paginar(con, TANQUES_TERRA_BASE, filtros.montar(), ORDEM_TANQUES_TERRA, pagina, por_pagina, busca)


@roteador.get("/tanques-terra/excel", response_class=Response, responses={200: {"content": {MIME_XLSX: {}}}})
def tanques_terra_excel(
    filtros: FiltrosTanquesTerra = Depends(),
    busca: str = Query(default="", max_length=60, description="Texto em qualquer coluna"),
    pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    _barrar_coletor(pessoa)
    linhas = _linhas_para_excel(con, TANQUES_TERRA_BASE, filtros.montar(), ORDEM_TANQUES_TERRA, busca)
    return resposta_xlsx(planilha("Tanques terra", COLUNAS_TANQUES_TERRA, linhas, filtros.descricao()), "tanques-terra")


def _linhas(con: psycopg.Connection, sql: str, valores: list[Any]) -> list[dict[str, Any]]:
    cur = con.execute(sql, valores)
    nomes = [d.name for d in cur.description]
    return [dict(zip(nomes, l)) for l in cur.fetchall()]


class DetalheTanque(BaseModel):
    resumo: dict[str, Any]
    leituras: list[dict[str, Any]]
    drops: list[dict[str, Any]]
    desvios: list[dict[str, Any]]
    testes: list[dict[str, Any]]


def _detalhe_da_coleta(con: psycopg.Connection, coleta_id: int) -> DetalheTanque:
    resumo = _linhas(con, f"SELECT * FROM ({POR_COLETA}) x WHERE coleta_id = %s", [coleta_id])
    if not resumo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coleta não encontrada.")
    r = resumo[0]
    leituras = _linhas(
        con,
        "SELECT analise, metodo, frasco, etapa, prevista, contagem, resultado, situacao, lida_por, lida_em, repeticao "
        "FROM bi.leituras_nfc WHERE coleta_id = %s ORDER BY analise, metodo, frasco, etapa DESC",
        [coleta_id],
    )
    drops = _linhas(
        con,
        "SELECT drop, prevista, situacao, concluido_por, concluido_em, desvio_resultado FROM bi.drops "
        "WHERE coleta_id = %s ORDER BY prevista",
        [coleta_id],
    )
    desvios = _linhas(
        con,
        "SELECT tipo, analise, frasco, data_abertura, prazo, status, resultado, contagem, temperaturas, aberto_por "
        "FROM bi.desvios WHERE origem = %s AND tanque = %s AND data_coleta = %s AND navio IS NOT DISTINCT FROM %s "
        "ORDER BY data_abertura",
        [r["origem"], r["tanque"], r["data_coleta"], r["navio"]],
    )
    testes = _linhas(
        con,
        "SELECT teste, data_feito, status, resultado, proxima_etapa, situacao, feito_por FROM bi.testes "
        "WHERE origem = 'Tank farm' AND tanque = %s AND data_coleta = %s AND %s = 'Terra' ORDER BY data_feito",
        [r["tanque"], r["data_coleta"], r["origem"]],
    )
    return DetalheTanque(resumo=r, leituras=leituras, drops=drops, desvios=desvios, testes=testes)


@roteador.get("/tanques-terra/{coleta_id}", response_model=DetalheTanque)
def tanque_terra(
    coleta_id: int,
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> DetalheTanque:
    """Um tanque (uma coleta): leituras com o método, drops, desvios e TAB. Serve também aos tanques de navio."""
    _barrar_coletor(pessoa)
    return _detalhe_da_coleta(con, coleta_id)


# ---------------------------------------------------------------- Navios: NFC e concentrado (FCOJ) juntos
# Concentrado: uma linha por embarque (navio, linha, fase), com C.T/B.L das amostras e TAB, Coliformes e Howard.
POR_EMBARQUE = """
    WITH a AS (SELECT navio, linha, fase, count(*) AS leituras, count(*) FILTER (WHERE lido) AS lidas,
                      count(*) FILTER (WHERE NOT lido) AS pendentes, count(*) FILTER (WHERE situacao = 'Atrasado') AS atrasadas,
                      count(*) FILTER (WHERE lido AND alarme) AS nao_ok, count(DISTINCT lote_amostra) AS amostras,
                      min(prevista) AS primeira, max(prevista) AS ultima
               FROM bi.contagens WHERE origem = 'Embarque' GROUP BY navio, linha, fase),
    t AS (SELECT embarque, count(*) FILTER (WHERE situacao <> 'Concluído') AS testes_abertos,
                 count(*) FILTER (WHERE situacao = 'Atrasado') AS testes_atrasados,
                 count(*) FILTER (WHERE resultado = 'Positivo') AS positivos
          FROM bi.testes WHERE origem = 'Embarque' GROUP BY embarque)
    SELECT a.navio, a.linha, a.fase, a.amostras, a.leituras, a.lidas, a.pendentes, a.atrasadas, a.nao_ok,
           coalesce(t.testes_abertos, 0) AS testes_abertos, coalesce(t.positivos, 0) AS positivos, a.primeira, a.ultima,
           """ + _status("a.atrasadas + coalesce(t.testes_atrasados, 0)", "a.pendentes + coalesce(t.testes_abertos, 0)") + """ AS status
    FROM a LEFT JOIN t ON t.embarque = a.navio || ' linha ' || a.linha || ' fase ' || a.fase
"""

NAVIOS_BASE = f"""
    WITH nfc AS (SELECT * FROM ({POR_COLETA}) x WHERE origem = 'Navio'),
    n AS (SELECT navio, count(DISTINCT tanque) AS tanques, sum(leituras) AS leituras, sum(lidas) AS lidas,
                 sum(pendentes) AS pendentes, sum(nao_ok) AS nao_ok, sum(desvios_abertos) AS desvios_abertos,
                 sum(drops_pendentes) AS drops_pendentes,
                 count(*) FILTER (WHERE status = 'Atrasado') AS atrasados, count(*) FILTER (WHERE status <> 'Concluído') AS abertos,
                 min(data_coleta) AS primeira, max(data_coleta) AS ultima
          FROM nfc GROUP BY navio),
    f AS (SELECT navio, count(*) AS embarques, sum(amostras) AS amostras, sum(leituras) AS leituras, sum(pendentes) AS pendentes,
                 sum(nao_ok) AS nao_ok, sum(testes_abertos) AS testes_abertos,
                 count(*) FILTER (WHERE status = 'Atrasado') AS atrasados, count(*) FILTER (WHERE status <> 'Concluído') AS abertos,
                 min(primeira) AS primeira, max(ultima) AS ultima
          FROM ({POR_EMBARQUE}) e GROUP BY navio)
    SELECT coalesce(n.navio, f.navio) AS navio,
           CASE WHEN n.navio IS NOT NULL AND f.navio IS NOT NULL THEN 'NFC e FCOJ'
                WHEN n.navio IS NOT NULL THEN 'NFC' ELSE 'FCOJ' END AS produto,
           coalesce(n.tanques, 0) AS tanques_nfc, coalesce(n.pendentes, 0)::int AS pendentes_nfc,
           coalesce(f.embarques, 0) AS embarques_fcoj, coalesce(f.pendentes, 0)::int AS pendentes_fcoj,
           (coalesce(n.nao_ok, 0) + coalesce(f.nao_ok, 0))::int AS nao_ok,
           coalesce(n.desvios_abertos, 0)::int AS desvios_abertos, coalesce(f.testes_abertos, 0)::int AS testes_abertos,
           least(n.primeira, f.primeira) AS primeira_data, greatest(n.ultima, f.ultima) AS ultima_data,
           """ + _status("coalesce(n.atrasados, 0) + coalesce(f.atrasados, 0)",
                         "coalesce(n.abertos, 0) + coalesce(f.abertos, 0)") + """ AS status
    FROM n FULL JOIN f ON f.navio = n.navio
"""
ORDEM_NAVIOS = "status = 'Concluído', ultima_data DESC NULLS LAST, navio"


class FiltrosNavios:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Última data (coleta ou leitura prevista) a partir de"),
        data_ate: date | None = None,
        navio: str | None = Query(default=None, description="Parte do nome"),
        produto: Literal["NFC", "FCOJ"] | None = Query(default=None, description="Só navios com NFC ou só com FCOJ"),
        status: Status | None = None,
    ) -> None:
        self.data_de, self.data_ate, self.navio, self.produto, self.status = data_de, data_ate, navio, produto, status

    def montar(self) -> _Filtro:
        f = _Filtro()
        if self.data_de:
            f.add("ultima_data >= %s", self.data_de)
        if self.data_ate:
            f.add("ultima_data <= %s", self.data_ate)
        f.contem("navio", self.navio)
        if self.produto:
            f.add("produto LIKE %s", f"%{self.produto}%")
        f.igual("status", self.status)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Última data de", self.data_de), ("Última data até", self.data_ate), ("Navio", self.navio),
                ("Produto", self.produto), ("Status", self.status)]


COLUNAS_NAVIOS = [
    ("navio", "Navio e viagem"), ("produto", "Produto"), ("tanques_nfc", "Tanques NFC"), ("pendentes_nfc", "Pendentes NFC"),
    ("embarques_fcoj", "Embarques FCOJ"), ("pendentes_fcoj", "Pendentes FCOJ"), ("nao_ok", "Não ok"),
    ("desvios_abertos", "Desvios abertos"), ("testes_abertos", "TAB/Coliformes/Howard abertos"),
    ("primeira_data", "Primeira data"), ("ultima_data", "Última data"), ("status", "Status"),
]


@roteador.get("/navios", response_model=Pagina)
def navios(
    filtros: FiltrosNavios = Depends(),
    busca: str = Query(default="", max_length=60, description="Texto em qualquer coluna"),
    pagina: int = Query(default=1, ge=1),
    por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Pagina:
    _barrar_coletor(pessoa)
    return _paginar(con, NAVIOS_BASE, filtros.montar(), ORDEM_NAVIOS, pagina, por_pagina, busca)


@roteador.get("/navios/excel", response_class=Response, responses={200: {"content": {MIME_XLSX: {}}}})
def navios_excel(
    filtros: FiltrosNavios = Depends(),
    busca: str = Query(default="", max_length=60, description="Texto em qualquer coluna"),
    pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Response:
    _barrar_coletor(pessoa)
    linhas = _linhas_para_excel(con, NAVIOS_BASE, filtros.montar(), ORDEM_NAVIOS, busca)
    return resposta_xlsx(planilha("Navios", COLUNAS_NAVIOS, linhas, filtros.descricao()), "navios")


class DetalheNavio(BaseModel):
    resumo: dict[str, Any]
    tanques: list[dict[str, Any]]  # tanques NFC do navio (uma linha por coleta, como em Tanques terra)
    embarques: list[dict[str, Any]]  # concentrado FCOJ: uma linha por linha e fase


@roteador.get("/navios/{navio}", response_model=DetalheNavio)
def navio(
    navio: str,
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> DetalheNavio:
    _barrar_coletor(pessoa)
    resumo = _linhas(con, f"SELECT * FROM ({NAVIOS_BASE}) x WHERE navio = %s", [navio])
    if not resumo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Navio não encontrado.")
    tanques = _linhas(
        con, f"SELECT * FROM ({POR_COLETA}) x WHERE origem = 'Navio' AND navio = %s ORDER BY data_coleta, tanque", [navio]
    )
    embarques = _linhas(con, f"SELECT * FROM ({POR_EMBARQUE}) e WHERE navio = %s ORDER BY linha, fase", [navio])
    return DetalheNavio(resumo=resumo[0], tanques=tanques, embarques=embarques)
