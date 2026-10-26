"""Gráficos de resultado das páginas de dados (pedido de 26/10, no lugar do Dashboard de contagem de registros).

Tendência: cada leitura de C.T/B.L com o valor já multiplicado pela diluição (Recebimento FCOJ, Embarque FCOJ e
Recebimento NFC), com os mesmos filtros e a mesma busca da página. A tela desenha em escala logarítmica, uma série por
análise, e calcula a faixa normal (média dos últimos 30 dias). O alerta de C.T 200 e B.L 50 vale só para o FCOJ
(recebimento e embarque) e é o "alarme" da view bi.contagens (migration 009 do bot); o NFC recebido não tem limite
(decisão de 14/10, migration 027): cada análise terá o seu quando for definido.
TAB positivos no ano: um item por TAB positivo, a tela agrupa por mês e fábrica.
"""

from datetime import date

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_paginas import (
    GRAFICO_RECEBIMENTO_BASE,
    LIMITES_RECEBIMENTO,
    FiltrosRecebimento,
    _barrar_coletor,
    _com_busca,
)
from labflow_api.rotas_paginas_mais import FiltrosEmbarque, FiltrosRecebimentoNfc

roteador = APIRouter(prefix="/paginas", tags=["páginas"])

PONTOS_MAX = 3000


class PontoResultado(BaseModel):
    data: date
    analise: str
    valor: float  # com diluição; no "<" é o próprio número (o "<10" fica no 10)
    menor: bool
    acima: bool  # passou do alerta da análise
    load: str | None
    lote: str | None
    navio: str | None
    lido: str | None
    diluicao: str | None


class GraficoResultado(BaseModel):
    alertas: dict[str, float]  # análise -> valor do alerta (vazio: a análise ainda não tem)
    pontos: list[PontoResultado]
    cortado: bool  # mais pontos que o máximo: a tela pede um filtro menor


EMBARQUE_GRAFICO_BASE = """
    SELECT navio, linha, fase, load, lote_amostra AS amostra, analise, prevista, sinal, valor, alarme,
           lido, lido_por, data_leitura,
           CASE WHEN lido AND alarme THEN 'Não ok' WHEN lido THEN 'Ok' ELSE situacao END AS situacao
    FROM bi.contagens
    WHERE origem = 'Embarque'
"""

NFC_GRAFICO_BASE = """
    SELECT load, lote, amostra, diluicao_texto, data_recebimento, analise, prevista, sinal, valor_lido, valor_final,
           lido, lido_por, situacao
    FROM bi.recebimento_nfc
"""

# por página: base, filtros, as colunas do ponto (data, valor, menor, acima, load, lote, navio, lido, diluição) e os alertas
GRAFICOS = {
    "recebimento": (
        GRAFICO_RECEBIMENTO_BASE, FiltrosRecebimento,
        "data_leitura, valor, sinal = '<', alarme, load, lote::text, NULL, trim_scale(valor)::text, NULL",
        LIMITES_RECEBIMENTO,
    ),
    "embarque": (
        EMBARQUE_GRAFICO_BASE, FiltrosEmbarque,
        "data_leitura, valor, sinal = '<', alarme, load, amostra, navio, trim_scale(valor)::text, NULL",
        LIMITES_RECEBIMENTO,
    ),
    "recebimento-nfc": (
        NFC_GRAFICO_BASE, FiltrosRecebimentoNfc,
        "data_recebimento, valor_final, sinal = '<', false, load, lote::text, NULL, trim_scale(valor_lido)::text, diluicao_texto",
        {},
    ),
}


def _registrar(caminho: str) -> None:
    base, Filtros, colunas, alertas = GRAFICOS[caminho]

    def grafico(
        filtros: Filtros = Depends(),  # type: ignore[valid-type]
        busca: str = Query(default="", max_length=60, description="Texto em qualquer coluna"),
        pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
        con: psycopg.Connection = Depends(obter_conexao),
    ) -> GraficoResultado:
        _barrar_coletor(pessoa)
        filtro = _com_busca(filtros.montar(), busca)  # o gráfico segue o filtro e a busca da página
        filtro.add("lido")
        linhas = con.execute(
            f"SELECT analise, {colunas} FROM ({base}) t{filtro.sql()} ORDER BY 2 DESC LIMIT %s",
            [*filtro.valores, PONTOS_MAX + 1],
        ).fetchall()
        pontos = [
            PontoResultado(analise=a, data=d, valor=float(v), menor=bool(m), acima=bool(ac), load=ld, lote=lt,
                           navio=nv, lido=("<" if m else "") + (li or ""), diluicao=dl)
            for a, d, v, m, ac, ld, lt, nv, li, dl in linhas[:PONTOS_MAX]
            if d is not None and v is not None
        ]
        pontos.reverse()  # do mais antigo ao mais novo
        return GraficoResultado(alertas=alertas, pontos=pontos, cortado=len(linhas) > PONTOS_MAX)

    roteador.add_api_route(f"/{caminho}/resultados", grafico, methods=["GET"], response_model=GraficoResultado,
                           name=f"resultados_{caminho}", summary="Pontos do gráfico de resultado da página")


for _caminho in GRAFICOS:
    _registrar(_caminho)


# ---------------------------------------------------------------- TAB positivos no ano
class TabPositivo(BaseModel):
    data: date
    fabrica: str | None
    origem: str
    referencia: str  # load, navio e fase ou tanque


@roteador.get("/tab/positivos", response_model=list[TabPositivo])
def tab_positivos(
    ano: int = Query(ge=2020, le=2100),
    fabrica: str | None = Query(default=None, description="Sigla, ex.: AQA"),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[TabPositivo]:
    _barrar_coletor(pessoa)
    linhas = con.execute(
        """
        SELECT data_feito, fabrica, origem, coalesce(navio_fase, load_ou_tanque, alvo, '-')
        FROM bi.testes
        WHERE teste = 'TAB' AND positivo AND data_feito >= make_date(%(ano)s, 1, 1) AND data_feito < make_date(%(ano)s + 1, 1, 1)
          AND (%(fabrica)s::text IS NULL OR fabrica = %(fabrica)s)
        ORDER BY data_feito, 4
        """,
        {"ano": ano, "fabrica": fabrica.strip().upper() if fabrica and fabrica.strip() else None},
    ).fetchall()
    return [TabPositivo(data=d, fabrica=f, origem=o, referencia=r) for d, f, o, r in linhas]
