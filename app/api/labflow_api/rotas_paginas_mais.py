"""Páginas do laboratório, só leitura: Embarque, TAB e Coliformes, Recebimento NFC e Visão geral.

Spec: 07-app-pwa.md (v1.0), "5. Páginas do laboratório"; 08-fluxos.md A11. Tarefa: APP-018 (Navios foi para rotas_navios_tanques.py
na APP-019b).
Mesmo padrão das outras páginas: leem SEMPRE pelas views do Power BI (schema bi), mesmos filtros na tela e no Excel.
São páginas de análise: o Coletor não as vê (07, Permissões).
"""

from datetime import date, timedelta
from typing import Any, Literal
from urllib.parse import quote

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.excel import MIME_XLSX, planilha, resposta_xlsx
from labflow_api.permissoes import exigir
from labflow_api.rotas_paginas import POR_PAGINA_MAX, Pagina, _barrar_coletor, _Filtro, _linhas_para_excel, _paginar
from labflow_api.rotas_pendencias import BLOCOS, PENDENCIAS_SQL

roteador = APIRouter(prefix="/paginas", tags=["páginas"])


def _periodo(f: _Filtro, coluna: str, de: date | None, ate: date | None) -> None:
    if de:
        f.add(f"{coluna} >= %s", de)
    if ate:
        f.add(f"{coluna} <= %s", ate)


# ---------------------------------------------------------------- Embarque (bi.contagens, origem Embarque)
EMBARQUE_BASE = """
    SELECT navio, linha, fase, load, item, fabrica, lote_amostra AS amostra, analise, prevista, resultado,
           CASE WHEN lido AND alarme THEN 'Não ok' WHEN lido THEN 'Ok' ELSE situacao END AS situacao,
           lido_por, data_leitura
    FROM bi.contagens
    WHERE origem = 'Embarque'
"""
ORDEM_EMBARQUE = "prevista DESC, navio, linha, fase, load, amostra, analise"


class FiltrosEmbarque:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data prevista da leitura, a partir de"),
        data_ate: date | None = None,
        navio: str | None = Query(default=None, description="Parte do nome, ex.: D.SKY 123"),
        linha: int | None = None,
        fase: int | None = None,
        load: str | None = None,
        analise: Literal["C.T 48h", "B.L 72h", "B.L 120h"] | None = None,
        situacao: Literal["Ok", "Não ok", "Atrasado", "Vence hoje", "No prazo"] | None = None,
        quem: str | None = Query(default=None, description="Parte do nome de quem leu"),
    ) -> None:
        self.data_de, self.data_ate, self.navio, self.linha, self.fase = data_de, data_ate, navio, linha, fase
        self.load, self.analise, self.situacao, self.quem = load, analise, situacao, quem

    def montar(self) -> _Filtro:
        f = _Filtro()
        _periodo(f, "prevista", self.data_de, self.data_ate)
        f.contem("navio", self.navio)
        f.igual("linha", self.linha)
        f.igual("fase", self.fase)
        f.igual("load", self.load.strip() if self.load else None)
        f.igual("analise", self.analise)
        f.igual("situacao", self.situacao)
        f.contem("lido_por", self.quem)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Prevista de", self.data_de), ("Prevista até", self.data_ate), ("Navio", self.navio),
                ("Linha", self.linha), ("Fase", self.fase), ("Load", self.load), ("Análise", self.analise),
                ("Situação", self.situacao), ("Quem leu", self.quem)]


COLUNAS_EMBARQUE = [
    ("navio", "Navio"), ("linha", "Linha"), ("fase", "Fase"), ("load", "Load"), ("item", "Item"),
    ("fabrica", "Fábrica"), ("amostra", "Amostra"), ("analise", "Análise"), ("prevista", "Leitura prevista"),
    ("resultado", "Resultado"), ("situacao", "Situação"), ("lido_por", "Lido por"), ("data_leitura", "Data da leitura"),
]

# ---------------------------------------------------------------- TAB e Coliformes (bi.testes; inclui Howard)
TESTES_BASE = """
    SELECT teste, origem, load_ou_tanque AS referencia, alvo, fabrica, navio_fase, data_feito, status, resultado,
           howard_percentual, proxima_etapa, situacao, feito_por, resultado_por, data_resultado
    FROM bi.testes
"""
ORDEM_TESTES = "situacao = 'Concluído', data_feito DESC, teste, referencia, alvo"


class FiltrosTestes:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data em que o teste foi feito, a partir de"),
        data_ate: date | None = None,
        teste: Literal["TAB", "Coliformes", "Howard"] | None = None,
        origem: Literal["Recebimento", "Embarque", "Tank farm"] | None = None,
        referencia: str | None = Query(default=None, description="Load ou tanque (parte do texto)"),
        status: Literal["No caldo", "Estriado", "Incubado", "Em confirmação", "Positivo, em confirmação", "Concluído"] | None = None,
        resultado: Literal["Positivo", "Negativo"] | None = None,
        situacao: Literal["Atrasado", "Vence hoje", "No prazo", "Concluído"] | None = None,
        quem: str | None = Query(default=None, description="Parte do nome de quem fez ou deu o resultado"),
    ) -> None:
        self.data_de, self.data_ate, self.teste, self.origem, self.referencia = data_de, data_ate, teste, origem, referencia
        self.status, self.resultado, self.situacao, self.quem = status, resultado, situacao, quem

    def montar(self) -> _Filtro:
        f = _Filtro()
        _periodo(f, "data_feito", self.data_de, self.data_ate)
        f.igual("teste", self.teste)
        f.igual("origem", self.origem)
        f.contem("referencia", self.referencia)
        f.igual("status", self.status)
        f.igual("resultado", self.resultado)
        f.igual("situacao", self.situacao)
        if self.quem and self.quem.strip():
            q = f"%{self.quem.strip()}%"
            f.add("(feito_por ILIKE %s OR resultado_por ILIKE %s)", q, q)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Feito de", self.data_de), ("Feito até", self.data_ate), ("Teste", self.teste), ("Origem", self.origem),
                ("Load ou tanque", self.referencia), ("Status", self.status), ("Resultado", self.resultado),
                ("Situação", self.situacao), ("Quem", self.quem)]


COLUNAS_TESTES = [
    ("teste", "Teste"), ("origem", "Origem"), ("referencia", "Load ou tanque"), ("alvo", "Composta / lote"),
    ("fabrica", "Fábrica"), ("navio_fase", "Navio e fase"), ("data_feito", "Feito em"), ("status", "Status"),
    ("resultado", "Resultado"), ("howard_percentual", "Howard (%)"), ("proxima_etapa", "Próxima etapa"),
    ("situacao", "Situação"), ("feito_por", "Feito por"), ("resultado_por", "Resultado por"),
]

# ---------------------------------------------------------------- Recebimento NFC (bi.recebimento_nfc)
# Sem situação Ok / Não ok: o NFC recebido não usa os limites do concentrado (decisão de 14/10/2026, migration 027).
RECEBIMENTO_NFC_BASE = """
    SELECT load, item, fabrica, lote, amostra, diluicao_texto AS diluicao, data_recebimento, analise, prevista,
           valor_lido, resultado, situacao, lido_por, data_leitura
    FROM bi.recebimento_nfc
"""
ORDEM_RECEBIMENTO_NFC = "data_recebimento DESC, load, lote, amostra, analise"


class FiltrosRecebimentoNfc:
    def __init__(
        self,
        data_de: date | None = Query(default=None, description="Data do recebimento, a partir de"),
        data_ate: date | None = None,
        load: str | None = None,
        lote: int | None = None,
        amostra: Literal["Fresh", "Pasteurizado"] | None = None,
        analise: Literal["C.T 48h", "B.L 72h", "B.L 120h"] | None = None,
        situacao: Literal["Lido", "Atrasado", "Vence hoje", "No prazo"] | None = None,
        quem: str | None = Query(default=None, description="Parte do nome de quem leu"),
    ) -> None:
        self.data_de, self.data_ate, self.load, self.lote = data_de, data_ate, load, lote
        self.amostra, self.analise, self.situacao, self.quem = amostra, analise, situacao, quem

    def montar(self) -> _Filtro:
        f = _Filtro()
        _periodo(f, "data_recebimento", self.data_de, self.data_ate)
        f.igual("load", self.load.strip() if self.load else None)
        f.igual("lote", self.lote)
        f.igual("amostra", self.amostra)
        f.igual("analise", self.analise)
        f.igual("situacao", self.situacao)
        f.contem("lido_por", self.quem)
        return f

    def descricao(self) -> list[tuple[str, Any]]:
        return [("Recebido de", self.data_de), ("Recebido até", self.data_ate), ("Load", self.load), ("Lote", self.lote),
                ("Amostra", self.amostra), ("Análise", self.analise), ("Situação", self.situacao), ("Quem leu", self.quem)]


COLUNAS_RECEBIMENTO_NFC = [
    ("load", "Load"), ("item", "Item"), ("fabrica", "Fábrica"), ("lote", "Lote"), ("amostra", "Amostra"),
    ("diluicao", "Diluição"), ("data_recebimento", "Recebido em"), ("analise", "Análise"), ("prevista", "Leitura prevista"),
    ("valor_lido", "Valor lido"), ("resultado", "Resultado (com diluição)"), ("situacao", "Situação"),
    ("lido_por", "Lido por"), ("data_leitura", "Data da leitura"),
]

# ---------------------------------------------------------------- Rotas de lista e Excel (mesmo molde para todas)
PAGINAS = {
    "embarque": (EMBARQUE_BASE, ORDEM_EMBARQUE, FiltrosEmbarque, "Embarque", COLUNAS_EMBARQUE),
    "testes": (TESTES_BASE, ORDEM_TESTES, FiltrosTestes, "TAB e Coliformes", COLUNAS_TESTES),
    "recebimento-nfc": (RECEBIMENTO_NFC_BASE, ORDEM_RECEBIMENTO_NFC, FiltrosRecebimentoNfc, "Recebimento NFC",
                        COLUNAS_RECEBIMENTO_NFC),
}


def _registrar(caminho: str) -> None:
    base, ordem, Filtros, titulo, colunas = PAGINAS[caminho]

    def lista(
        filtros: Filtros = Depends(),  # type: ignore[valid-type]
        pagina: int = Query(default=1, ge=1),
        por_pagina: int = Query(default=50, ge=1, le=POR_PAGINA_MAX),
        pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
        con: psycopg.Connection = Depends(obter_conexao),
    ) -> Pagina:
        _barrar_coletor(pessoa)
        return _paginar(con, base, filtros.montar(), ordem, pagina, por_pagina)

    def excel(
        filtros: Filtros = Depends(),  # type: ignore[valid-type]
        pessoa: PessoaLogada = Depends(exigir("imprimir_exportar")),
        con: psycopg.Connection = Depends(obter_conexao),
    ) -> Response:
        _barrar_coletor(pessoa)
        linhas = _linhas_para_excel(con, base, filtros.montar(), ordem)
        return resposta_xlsx(planilha(titulo, colunas, linhas, filtros.descricao()), caminho)

    roteador.add_api_route(f"/{caminho}", lista, methods=["GET"], response_model=Pagina, name=f"pagina_{caminho}",
                           summary=f"Página {titulo}")
    roteador.add_api_route(f"/{caminho}/excel", excel, methods=["GET"], response_class=Response,
                           responses={200: {"content": {MIME_XLSX: {}}}}, name=f"excel_{caminho}",
                           summary=f"Excel da página {titulo}")


for _caminho in PAGINAS:
    _registrar(_caminho)


# ---------------------------------------------------------------- Visão geral (números do período e alertas)
class Numero(BaseModel):
    chave: str
    rotulo: str
    valor: int


class PendenciasDoBloco(BaseModel):
    bloco: str
    vence_hoje: int
    atrasados: int


class Alerta(BaseModel):
    pagina: str  # recebimento, embarque ou tanques
    caminho: str  # onde a tela abre o alerta: o tanque, o navio ou a página filtrada
    referencia: str
    analise: str
    resultado: str
    data: date | None


class VisaoGeral(BaseModel):
    data_de: date
    data_ate: date
    numeros: list[Numero]
    pendencias: list[PendenciasDoBloco]
    alertas: list[Alerta]  # os Não ok do período, mais recentes primeiro (até 20)


NUMEROS_SQL = [
    ("coletas", "Coletas", "SELECT count(*) FROM bi.coletas WHERE data_coleta BETWEEN %(de)s AND %(ate)s"),
    ("leituras_tanques", "Leituras de tanque feitas",
     "SELECT count(*) FROM bi.leituras_nfc WHERE lida AND data_coleta BETWEEN %(de)s AND %(ate)s"),
    ("tanques_nao_ok", "Leituras de tanque Não ok",
     "SELECT count(*) FROM bi.leituras_nfc WHERE resultado = 'Não ok' AND data_coleta BETWEEN %(de)s AND %(ate)s"),
    ("drops_concluidos", "Drops concluídos",
     "SELECT count(*) FROM bi.drops WHERE concluido AND prevista BETWEEN %(de)s AND %(ate)s"),
    ("recebimento_lidas", "Leituras de recebimento",
     "SELECT count(*) FROM bi.contagens WHERE origem = 'Recebimento' AND lido AND prevista BETWEEN %(de)s AND %(ate)s"),
    ("recebimento_nao_ok", "Recebimento Não ok",
     "SELECT count(*) FROM bi.contagens WHERE origem = 'Recebimento' AND lido AND alarme AND prevista BETWEEN %(de)s AND %(ate)s"),
    ("embarque_nao_ok", "Embarque Não ok",
     "SELECT count(*) FROM bi.contagens WHERE origem = 'Embarque' AND lido AND alarme AND prevista BETWEEN %(de)s AND %(ate)s"),
    ("testes_positivos", "TAB e Coliformes positivos",
     "SELECT count(*) FROM bi.testes WHERE resultado = 'Positivo' AND data_feito BETWEEN %(de)s AND %(ate)s"),
    ("desvios_abertos", "Desvios abertos (agora)", "SELECT count(*) FROM bi.desvios WHERE status <> 'Concluído'"),
]

ALERTAS_SQL = """
    SELECT * FROM (
        SELECT CASE origem WHEN 'Recebimento' THEN 'recebimento' ELSE 'embarque' END AS pagina,
               CASE WHEN origem = 'Recebimento' THEN 'Load ' || load || ' · lote ' || lote_amostra
                    ELSE coalesce(navio, '') || ' · load ' || load || ' · ' || lote_amostra END AS referencia,
               analise, resultado, data_leitura AS data, load, navio, NULL::bigint AS coleta_id, origem
        FROM bi.contagens WHERE lido AND alarme AND prevista BETWEEN %(de)s AND %(ate)s
        UNION ALL
        SELECT 'tanques',
               CASE WHEN origem = 'Terra' THEN 'Tanque ' || tanque ELSE navio || ' · tanque ' || tanque END,
               analise || ' ' || frasco || ' · ' || etapa, contagem, (lida_em AT TIME ZONE 'America/Sao_Paulo')::date,
               NULL, navio, coleta_id, origem
        FROM bi.leituras_nfc WHERE resultado = 'Não ok' AND data_coleta BETWEEN %(de)s AND %(ate)s
    ) a
    ORDER BY data DESC NULLS LAST, referencia
    LIMIT 20
"""


def _caminho_do_alerta(pagina: str, load: str | None, navio: str | None, coleta_id: int | None, origem: str) -> str:
    if pagina == "tanques":
        return f"/paginas/tanques-terra/{coleta_id}" if origem == "Terra" else f"/paginas/navios/{quote(navio or '')}"
    if pagina == "embarque":
        return f"/paginas/navios/{quote(navio or '')}"
    return f"/paginas/recebimento?load={quote(load or '')}"

DIAS_PADRAO = 30


@roteador.get("/visao-geral", response_model=VisaoGeral)
def visao_geral(
    data_de: date | None = Query(default=None, description="Início do período (padrão: 30 dias atrás)"),
    data_ate: date | None = Query(default=None, description="Fim do período (padrão: hoje)"),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> VisaoGeral:
    _barrar_coletor(pessoa)
    hoje = con.execute("SELECT CURRENT_DATE").fetchone()[0]  # "hoje" do banco (America/Sao_Paulo), como as views
    ate = data_ate or hoje
    de = data_de or (ate - timedelta(days=DIAS_PADRAO - 1))
    if de > ate:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O início do período é depois do fim.")
    periodo = {"de": de, "ate": ate}
    numeros = [Numero(chave=c, rotulo=r, valor=con.execute(sql, periodo).fetchone()[0]) for c, r, sql in NUMEROS_SQL]
    por_bloco = {
        b: (vh, at)
        for b, vh, at in con.execute(
            f"SELECT bloco, count(*) FILTER (WHERE situacao = 'Vence hoje'), count(*) FILTER (WHERE situacao = 'Atrasado') "
            f"FROM ({PENDENCIAS_SQL}) p GROUP BY bloco"
        ).fetchall()
    }
    pendencias = [PendenciasDoBloco(bloco=b, vence_hoje=por_bloco.get(b, (0, 0))[0], atrasados=por_bloco.get(b, (0, 0))[1])
                  for b in BLOCOS]
    alertas = [
        Alerta(pagina=p, caminho=_caminho_do_alerta(p, ld, nv, cid, og), referencia=r or "", analise=a or "",
               resultado=res or "", data=d)
        for p, r, a, res, d, ld, nv, cid, og in con.execute(ALERTAS_SQL, periodo).fetchall()
    ]
    return VisaoGeral(data_de=de, data_ate=ate, numeros=numeros, pendencias=pendencias, alertas=alertas)
