"""Gráficos de resultado das páginas de dados (pedido de 26/10, no lugar do Dashboard de contagem de registros).

Tendência: cada leitura com o valor já multiplicado pela diluição, com os mesmos filtros e a mesma busca da página. A tela
desenha uma série por análise e calcula a faixa normal (média dos últimos 30 dias). A linha de cada série:
- Recebimento FCOJ e Embarque: o **alerta** de C.T 200 e B.L 50, o "alarme" da view bi.contagens (migration 009 do bot);
- Tanques: o **limite** da `limites_nfc` em vigor no dia (a mesma regra do Não ok da função de leitura, migration 042);
- Howard: o limite da `limites_howard` em vigor no dia, em %, escala comum;
- Recebimento NFC, Água do processo, Baias e Linhas: sem linha por enquanto (cada análise terá o seu limite quando for
  definido; os valores ficam no banco, fora do Git).
Positivos no ano (TAB e Coliformes): um item por teste positivo, a tela agrupa por mês e fábrica.
"""

from datetime import date
from typing import Literal

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
    _Filtro,
)
from labflow_api.rotas_paginas_mais import FiltrosEmbarque, FiltrosRecebimentoNfc, FiltrosTestes
from labflow_api.rotas_paginas_nfc import FiltrosTanques

roteador = APIRouter(prefix="/paginas", tags=["páginas"])

PONTOS_MAX = 3000


class PontoResultado(BaseModel):
    data: date
    analise: str  # a série do gráfico
    valor: float  # com diluição; no "<" é o próprio número (o "<10" fica no 10)
    menor: bool
    acima: bool  # passou da linha (alerta ou limite) da série
    load: str | None
    lote: str | None
    navio: str | None
    lido: str | None
    diluicao: str | None
    ref: str | None = None  # o que identifica o ponto quando não é load (tanque, ponto da água, composta)


class GraficoResultado(BaseModel):
    alertas: dict[str, float]  # série -> valor da linha (vazio: a série ainda não tem)
    rotulo_limite: Literal["Alerta", "Limite"] = "Alerta"
    escala: Literal["log", "linear"] = "log"
    unidade: str = "UFC/mL (com diluição)"
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

# o limite da limites_nfc em vigor no dia da análise, como na função de leitura (042)
TANQUES_GRAFICO_BASE = """
    SELECT t.*, (SELECT l.limite_max FROM limites_nfc l
                 WHERE l.sub_analise = CASE t.analise WHEN 'C.T' THEN 'CT' WHEN 'B.L' THEN 'BL' ELSE 'WORT' END
                   AND l.metodo = t.metodo AND l.etapa = CASE t.etapa WHEN 'Pré-leitura' THEN 'pre' ELSE 'final' END
                   AND l.vigente_de <= coalesce(t.data_analise, t.data_coleta)
                   AND (l.vigente_ate IS NULL OR l.vigente_ate >= coalesce(t.data_analise, t.data_coleta))
                 ORDER BY l.vigente_de DESC LIMIT 1) AS limite
    FROM bi.leituras_nfc t
"""

HOWARD_GRAFICO_BASE = """
    SELECT teste, origem, load_ou_tanque AS referencia, alvo, fabrica, navio_fase, data_feito, status, resultado,
           howard_percentual, situacao, feito_por, resultado_por, limite_howard(data_feito) AS limite
    FROM bi.testes
"""

# o texto lançado ("<1", "3") vira número; o que não é número ("-", vazio) fica de fora
_NUMERO = r"'^[<>]?\s*[0-9]+([.,][0-9]+)?$'"
_VALOR = "replace(regexp_replace(txt, '[<>\\s]', '', 'g'), ',', '.')::numeric"

AGUA_GRAFICO_BASE = f"""
    SELECT x.serie, (c.coletada_em AT TIME ZONE 'America/Sao_Paulo')::date AS data, x.txt, x.ponto
    FROM app.coletas_agua_processo c
    CROSS JOIN LATERAL (VALUES ('C.T', c.ct_manifold, 'Manifold'), ('B.L', c.bl_manifold, 'Manifold'),
                               ('C.T', c.ct_camara4, 'Câmara 4'), ('B.L', c.bl_camara4, 'Câmara 4'),
                               ('C.T', c.ct_camara5, 'Câmara 5'), ('B.L', c.bl_camara5, 'Câmara 5'),
                               ('C.T', c.ct_camara6, 'Câmara 6'), ('B.L', c.bl_camara6, 'Câmara 6')) x(serie, txt, ponto)
    WHERE c.excluida_em IS NULL AND x.txt ~ {_NUMERO}
"""

SUPERFICIE_GRAFICO_BASE = f"""
    SELECT x.serie, (c.coletada_em AT TIME ZONE 'America/Sao_Paulo')::date AS data, x.txt, c.ponto, c.tipo
    FROM app.coletas_superficie c
    CROSS JOIN LATERAL (VALUES ('C.T 48h', c.ct_48), ('B.L 72h', c.bl_72), ('B.L 120h', c.bl_120)) x(serie, txt)
    WHERE c.excluida_em IS NULL AND x.txt ~ {_NUMERO}
"""

# por página: base, filtros da página (None: só os últimos 90 dias), o que é "lido", as colunas do ponto
# (série, data, valor, menor, acima, load, lote, navio, lido, diluição, ref, limite), os alertas fixos (None: o limite da
# linha), e o rótulo, a escala e a unidade do gráfico
_COLUNAS_TEXTO = f"serie, data, {_VALOR}, txt LIKE '<%%', false, NULL, NULL, NULL, txt, NULL"
GRAFICOS: dict[str, tuple] = {
    "recebimento": (
        GRAFICO_RECEBIMENTO_BASE, FiltrosRecebimento, "lido",
        "analise, data_leitura, valor, sinal = '<', alarme, load, lote::text, NULL, trim_scale(valor)::text, NULL, NULL, NULL",
        LIMITES_RECEBIMENTO, "Alerta", "log", "UFC/mL",
    ),
    "embarque": (
        EMBARQUE_GRAFICO_BASE, FiltrosEmbarque, "lido",
        "analise, data_leitura, valor, sinal = '<', alarme, load, amostra, navio, trim_scale(valor)::text, NULL, NULL, NULL",
        LIMITES_RECEBIMENTO, "Alerta", "log", "UFC/mL",
    ),
    "recebimento-nfc": (
        NFC_GRAFICO_BASE, FiltrosRecebimentoNfc, "lido",
        "analise, data_recebimento, valor_final, sinal = '<', false, load, lote::text, NULL, trim_scale(valor_lido)::text, "
        "diluicao_texto, NULL, NULL",
        {}, "Alerta", "log", "UFC/mL (com diluição)",
    ),
    "tanques": (
        TANQUES_GRAFICO_BASE, FiltrosTanques, "lida AND maior IS NOT NULL",
        "analise || CASE etapa WHEN 'Pré-leitura' THEN ' pré' ELSE '' END || CASE WHEN metodo = 'Superficie' THEN ' sup.' ELSE '' END, "
        "data_coleta, greatest(maior, 1), maior = 0, limite IS NOT NULL AND maior > limite, NULL, frasco, navio, contagem, NULL, "
        "'Tanque ' || tanque, limite",
        None, "Limite", "log", "Maior placa (UFC)",
    ),
    "howard": (
        HOWARD_GRAFICO_BASE, FiltrosTestes, "teste = 'Howard' AND howard_percentual IS NOT NULL",
        "'Howard', data_feito, howard_percentual, false, limite IS NOT NULL AND howard_percentual > limite, NULL, alvo, NULL, "
        "trim_scale(howard_percentual)::text || '%%', NULL, coalesce(navio_fase, referencia), limite",
        None, "Limite", "linear", "Howard (%)",
    ),
    "agua-processo": (AGUA_GRAFICO_BASE, None, "true", _COLUNAS_TEXTO.replace("txt, NULL", "txt, NULL, ponto, NULL"),
                      {}, "Alerta", "log", "Resultado (UFC)"),
    "baias": (SUPERFICIE_GRAFICO_BASE, None, "tipo = 'Baia'", _COLUNAS_TEXTO.replace("txt, NULL", "txt, NULL, 'Baia ' || ponto, NULL"),
              {}, "Alerta", "log", "Resultado (UFC)"),
    "linhas": (SUPERFICIE_GRAFICO_BASE, None, "tipo = 'Linha'", _COLUNAS_TEXTO.replace("txt, NULL", "txt, NULL, 'Linha ' || ponto, NULL"),
               {}, "Alerta", "log", "Resultado (UFC)"),
}


def _sem_filtro() -> _Filtro:
    """Águas e superfícies não têm página de filtros: o gráfico mostra os últimos 90 dias."""
    f = _Filtro()
    f.add("data > current_date - 90")
    return f


def _registrar(caminho: str) -> None:
    base, Filtros, lido, colunas, alertas_fixos, rotulo, escala, unidade = GRAFICOS[caminho]

    def montar(con: psycopg.Connection, filtro: _Filtro) -> GraficoResultado:
        filtro.add(lido)
        linhas = con.execute(
            f"SELECT {colunas} FROM ({base}) t{filtro.sql()} ORDER BY 2 DESC LIMIT %s",
            [*filtro.valores, PONTOS_MAX + 1],
        ).fetchall()
        pontos, alertas = [], dict(alertas_fixos or {})
        for a, d, v, m, ac, ld, lt, nv, li, dl, rf, lim in linhas[:PONTOS_MAX]:
            if d is None or v is None:
                continue
            pontos.append(PontoResultado(analise=a, data=d, valor=float(v), menor=bool(m), acima=bool(ac), load=ld, lote=lt,
                                         navio=nv, lido=("<" if m and li and not li.startswith("<") else "") + (li or ""),
                                         diluicao=dl, ref=rf))
            if alertas_fixos is None and lim is not None and a not in alertas:
                alertas[a] = float(lim)  # o limite em vigor na leitura mais nova da série
        pontos.reverse()  # do mais antigo ao mais novo
        return GraficoResultado(alertas=alertas, rotulo_limite=rotulo, escala=escala, unidade=unidade, pontos=pontos,
                                cortado=len(linhas) > PONTOS_MAX)

    if Filtros is None:
        def grafico_sem_filtro(
            pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
            con: psycopg.Connection = Depends(obter_conexao),
        ) -> GraficoResultado:
            _barrar_coletor(pessoa)
            return montar(con, _sem_filtro())

        rota = grafico_sem_filtro
    else:
        def grafico(
            filtros: Filtros = Depends(),  # type: ignore[valid-type]
            busca: str = Query(default="", max_length=60, description="Texto em qualquer coluna"),
            pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
            con: psycopg.Connection = Depends(obter_conexao),
        ) -> GraficoResultado:
            _barrar_coletor(pessoa)
            return montar(con, _com_busca(filtros.montar(), busca))  # o gráfico segue o filtro e a busca da página

        rota = grafico

    roteador.add_api_route(f"/{caminho}/resultados", rota, methods=["GET"], response_model=GraficoResultado,
                           name=f"resultados_{caminho}", summary="Pontos do gráfico de resultado da página")


for _caminho in GRAFICOS:
    _registrar(_caminho)


# ---------------------------------------------------------------- TAB e Coliformes positivos no ano
class TestePositivo(BaseModel):
    data: date
    fabrica: str | None
    origem: str
    referencia: str  # load, navio e fase ou tanque


def _positivos(con: psycopg.Connection, teste: str, ano: int, fabrica: str | None) -> list[TestePositivo]:
    linhas = con.execute(
        """
        SELECT data_feito, fabrica, origem, coalesce(navio_fase, load_ou_tanque, alvo, '-')
        FROM bi.testes
        WHERE teste = %(teste)s AND positivo
          AND data_feito >= make_date(%(ano)s, 1, 1) AND data_feito < make_date(%(ano)s + 1, 1, 1)
          AND (%(fabrica)s::text IS NULL OR fabrica = %(fabrica)s)
        ORDER BY data_feito, 4
        """,
        {"teste": teste, "ano": ano, "fabrica": fabrica.strip().upper() if fabrica and fabrica.strip() else None},
    ).fetchall()
    return [TestePositivo(data=d, fabrica=f, origem=o, referencia=r) for d, f, o, r in linhas]


@roteador.get("/testes/positivos", response_model=list[TestePositivo])
def testes_positivos(
    ano: int = Query(ge=2020, le=2100),
    teste: Literal["TAB", "Coliformes"] = "TAB",
    fabrica: str | None = Query(default=None, description="Sigla, ex.: AQA"),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[TestePositivo]:
    _barrar_coletor(pessoa)
    return _positivos(con, teste, ano, fabrica)


@roteador.get("/tab/positivos", response_model=list[TestePositivo])
def tab_positivos(
    ano: int = Query(ge=2020, le=2100),
    fabrica: str | None = Query(default=None, description="Sigla, ex.: AQA"),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[TestePositivo]:
    """O mesmo de /testes/positivos?teste=TAB (o endereço do primeiro gráfico, de 26/10)."""
    _barrar_coletor(pessoa)
    return _positivos(con, "TAB", ano, fabrica)
