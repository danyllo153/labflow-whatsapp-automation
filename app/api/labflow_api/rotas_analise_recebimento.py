"""Recebimento FCOJ como um "app" de análise (Fase E, passo E2): painel, registrar, resultados e laudo numa página só.

Spec: rumo-do-app.md, "Fase E"; 07-app-pwa.md §5.2. Tarefa: APP-057. As gravações passam pelas funções do banco da 040 do
bot (PB11): `registrar_recebimento` e `lancar_contagem`, as mesmas que o bot chama, com a mesma prévia ("o que vai ser
criado", mostrada antes do Confirmar), as mesmas recusas e o mesmo alarme. Permissão de chamar: migration 068.
"""

import re
from datetime import date, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

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


# --- laudo (APP-059): uma linha por load, na ordem do recebimento ------------------------------------------------------
# Geometria provisória (A4 em pé, 25 loads por folha) até medir o modelo oficial, que o Admin envia na aba Laudo.

NOME_DO_LAUDO = "recebimento-fcoj"
DIAS_PARA_TRAS = 7  # na primeira vez, a folha começa com os loads da última semana
TABELA = laudos.Tabela(colunas=(28.0, 78.0, 128.0, 168.0, 205.0, 300.0, 365.0, 430.0, 495.0, 567.0), topo=150.0, base=760.0, linhas=25)
DEMONSTRACAO = laudos.demonstracao(
    "Recebimento de FCOJ", TABELA, ("Recebido", "Load", "Item", "Fábrica", "Lotes", "C.T 48h", "B.L 72h", "B.L 120h", "Analista")
)


def _resumo(por_lote: dict[int, str | None]) -> str:
    """{1: "<1", 2: "<1", 3: "210"} -> "<1 (1-2); 210 (3)"; todos iguais -> só o valor; sem leitura -> vazio."""
    if not por_lote or any(v is None for v in por_lote.values()):
        lidos = {l: v for l, v in por_lote.items() if v is not None}
        if not lidos:
            return ""
        por_lote = lidos
    valores: dict[str, list[int]] = {}
    for lote, valor in sorted(por_lote.items()):
        valores.setdefault(valor, []).append(lote)
    if len(valores) == 1:
        return next(iter(valores))
    return "; ".join(f"{v} ({_faixas(l)})" for v, l in valores.items())


def distribuir_loads(con: psycopg.Connection) -> None:
    """Põe nas folhas, na ordem do recebimento, os loads que ainda não têm lugar. Trava para duas telas não dividirem uma vaga."""
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext(%s))", (NOME_DO_LAUDO,))
    inicio = con.execute(
        "SELECT min(r.data_recebimento) FROM app.recebimento_laudo x JOIN recebimento_lotes r ON r.load_id = x.load_id"
    ).fetchone()[0] or _hoje(con) - timedelta(days=DIAS_PARA_TRAS)
    novos = [
        load_id
        for (load_id,) in con.execute(
            """
            SELECT l.id FROM loads l JOIN itens i ON i.id = l.item_id JOIN recebimento_lotes r ON r.load_id = l.id
            WHERE i.codigo <> '129' AND NOT EXISTS (SELECT 1 FROM app.recebimento_laudo x WHERE x.load_id = l.id)
            GROUP BY l.id HAVING min(r.data_recebimento) >= %s ORDER BY min(r.data_recebimento), l.id
            """,
            (inicio,),
        )
    ]
    for load_id in novos:
        con.execute(
            "INSERT INTO app.recebimento_laudo (load_id, pagina_id) VALUES (%s, %s)", (load_id, laudos.pagina_com_vaga(con, NOME_DO_LAUDO))
        )


def _gerar_laudo(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    celulas = []
    for n, (recebido, load, item, fab, lotes, leituras, quem) in enumerate(
        con.execute(
            """
            SELECT min(r.data_recebimento), l.numero, i.codigo, f.nome, array_agg(r.lote ORDER BY r.lote),
                   (SELECT jsonb_agg(jsonb_build_object('lote', r2.lote, 'analise', c.analise, 'sinal', c.sinal, 'valor', c.valor))
                    FROM contagens c JOIN recebimento_lotes r2 ON r2.id = c.recebimento_lote_id WHERE r2.load_id = l.id),
                   (SELECT coalesce(u.nome, cr.usuario) FROM recebimento_lotes r3 LEFT JOIN usuarios u ON u.id = r3.registrado_por
                    LEFT JOIN app.credenciais cr ON cr.usuario_id = r3.registrado_por WHERE r3.load_id = l.id ORDER BY r3.id LIMIT 1)
            FROM app.recebimento_laudo x JOIN loads l ON l.id = x.load_id JOIN itens i ON i.id = l.item_id
            LEFT JOIN fabricas f ON f.id = l.fabrica_id JOIN recebimento_lotes r ON r.load_id = l.id
            WHERE x.pagina_id = %s GROUP BY x.load_id, l.id, l.numero, i.codigo, f.nome ORDER BY min(r.data_recebimento), l.id
            """,
            (pagina_id,),
        )
    ):
        resultados = []
        for cod in ANALISES:
            por_lote: dict[int, str | None] = {lote: None for lote in lotes}
            for c in leituras or []:
                if c["analise"] == cod:
                    por_lote[c["lote"]] = _texto(c)
            resultados.append(_resumo(por_lote))
        textos = [recebido.strftime("%d.%m.%y"), load, item, fab or "", _faixas(lotes), *resultados,
                  laudo_esterilizacao.primeiro_nome(quem) if quem else ""]
        for i, texto in enumerate(textos):
            celulas.append(TABELA.celula(texto, n, i, tamanho=8))
    return laudos.preencher(modelo, DEMONSTRACAO, celulas)


laudos.registrar(
    laudos.Laudo(
        nome=NOME_DO_LAUDO, titulo="Recebimento de FCOJ", modelo=NOME_DO_LAUDO, capacidade=TABELA.linhas,
        contar_sql="""
            SELECT count(*), min(d), max(d) FROM (
                SELECT (SELECT min(r.data_recebimento) FROM recebimento_lotes r WHERE r.load_id = x.load_id) AS d
                FROM app.recebimento_laudo x WHERE x.pagina_id = %s) t
        """,
        gerar=_gerar_laudo, preparar=distribuir_loads,
    )
)
