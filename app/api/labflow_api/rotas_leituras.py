"""Leituras e análises pendentes (os dois blocos do Turno) e a leitura dos drops (aba Leituras).

Pedido do Danyllo de 27/10. LEITURA é ler a placa que já está na estufa (C.T, B.L, Wort, o TAB e o Coliformes para ler ou
confirmar, a leitura do drop); ANÁLISE é pôr para incubar (no caldo, espalhar, estriar, o Stress e o Normal do tanque, o
drop no dia dele). Cada bloco mostra, por origem, só o número de cada coisa ("Recebimento concentrado: 30 placas de C.T
48h"), e cada número leva à tela de digitar ou de fazer aquilo.

Lê as views do Power BI (bi.*) e as tabelas do app (águas). O drop é análise no dia dele (D5, D10, D15 depois da coleta) e
leitura 5 dias depois; a leitura fica em app.leituras_drop (078); o positivo abre o desvio pela função abrir_desvio_drop.
"""

from datetime import date, timedelta

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api import rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api import rotas_agua_consumo
from labflow_api.rotas_aguas import PENDENCIAS_AGUAS_SQL
from labflow_api.rotas_analise_recebimento import _chamar
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/leituras", tags=["leituras"])

DIAS_ATE_LER_O_DROP = 5
PLACAS_POR_LEITURA_DE_TANQUE = 3  # triplicata: "<1|<1|2" no laudo


class Item(BaseModel):
    rotulo: str  # "C.T 48h", "Wort 240h", "para espalhar", "Stress"
    quantidade: int
    unidade: str  # "placas", "tanques", "compostas", "coletas"
    atrasadas: int
    caminho: str  # a tela de digitar (aba Leituras) ou de fazer (o app da análise)


class Grupo(BaseModel):
    grupo: str  # "Recebimento concentrado", "Tanques terra", "D.STAR 900 (navio)"...
    detalhe: str = ""  # "4 tanques" no navio
    itens: list[Item]


class Pendentes(BaseModel):
    leituras: list[Grupo]
    analises: list[Grupo]


def _rotulo_tanque(analise: str, etapa: str) -> str:
    """A leitura do tanque pelo nome do papel: C.T 48h, B.L 72h (pré) e 120h, Wort 120h (pré) e 240h."""
    pre = etapa.lower().startswith("pr")
    if analise.startswith("C.T"):
        return "C.T 48h"
    if analise.startswith("B.L"):
        return "B.L 72h" if pre else "B.L 120h"
    return "Wort 120h" if pre else "Wort 240h"


ORDEM_TANQUE = ["C.T 48h", "B.L 72h", "B.L 120h", "Wort 120h", "Wort 240h"]
EM_DIA = "('Vence hoje', 'Atrasado')"


def _somar(linhas, unidade: str, caminho, ordem: list[str] | None = None, fator: int = 1) -> list[Item]:
    """(rótulo, quantidade, atrasadas) -> itens somados por rótulo, na ordem do papel."""
    soma: dict[str, list[int]] = {}
    for rotulo, n, atrasadas in linhas:
        s = soma.setdefault(rotulo, [0, 0])
        s[0] += n
        s[1] += atrasadas
    chaves = sorted(soma, key=lambda r: (ordem.index(r) if ordem and r in ordem else 99, r))
    return [Item(rotulo=r, quantidade=soma[r][0] * fator, unidade=unidade, atrasadas=soma[r][1] * fator, caminho=caminho(r)) for r in chaves]


def _codigo(analise: str) -> str:
    return {"C.T 48h": "CT", "B.L 72h": "BL72", "B.L 120h": "BL120"}.get(analise, "")


def leituras_pendentes(con: psycopg.Connection, hoje: date) -> list[Grupo]:
    grupos: list[Grupo] = []

    # concentrado: recebimento e embarque (bi.contagens), uma placa por lote e análise
    for origem, nome, aba in (("Recebimento", "Recebimento concentrado", "recebimento"), ("Embarque", "Embarque FCOJ", "embarque")):
        linhas = con.execute(
            f"SELECT analise, count(*), count(*) FILTER (WHERE situacao = 'Atrasado') FROM bi.contagens"
            f" WHERE origem = %s AND NOT lido AND situacao IN {EM_DIA} GROUP BY analise",
            (origem,),
        ).fetchall()
        if linhas:
            grupos.append(Grupo(grupo=nome, itens=_somar(linhas, "placas", lambda r, a=aba: f"/leituras?aba={a}&analise={_codigo(r)}",
                                                          ["C.T 48h", "B.L 72h", "B.L 120h"])))

    linhas = con.execute(
        f"SELECT analise, count(*), count(*) FILTER (WHERE situacao = 'Atrasado') FROM bi.recebimento_nfc"
        f" WHERE situacao IN {EM_DIA} GROUP BY analise"
    ).fetchall()
    if linhas:
        grupos.append(Grupo(grupo="Recebimento NFC", itens=_somar(linhas, "placas", lambda r: "/leituras?aba=recebimento-nfc",
                                                                   ["C.T 48h", "B.L 72h", "B.L 120h"])))

    # tanques: cada leitura são 3 placas; terra junto, cada navio no seu grupo (nome e viagem, quantos tanques)
    tanques = con.execute(
        f"""
        SELECT origem, coalesce(navio, ''), analise, etapa, count(*), count(*) FILTER (WHERE situacao = 'Atrasado'),
               count(DISTINCT tanque)
        FROM bi.leituras_nfc WHERE NOT lida AND situacao IN {EM_DIA}
        GROUP BY 1, 2, 3, 4
        """
    ).fetchall()
    terra = [(_rotulo_tanque(a, e), n, at) for o, _, a, e, n, at, _ in tanques if o == "Terra"]
    if terra:
        grupos.append(Grupo(grupo="Tanques terra", itens=_somar(terra, "placas", lambda r: f"/leituras?aba=tanques-terra&leitura={r}",
                                                                 ORDEM_TANQUE, PLACAS_POR_LEITURA_DE_TANQUE)))
    for navio in sorted({nv for o, nv, *_ in tanques if o == "Navio"}):
        doNavio = [(_rotulo_tanque(a, e), n, at) for o, nv, a, e, n, at, _ in tanques if o == "Navio" and nv == navio]
        qtd = con.execute(
            f"SELECT count(DISTINCT tanque) FROM bi.leituras_nfc WHERE origem = 'Navio' AND navio = %s AND NOT lida AND situacao IN {EM_DIA}",
            (navio,),
        ).fetchone()[0]
        grupos.append(Grupo(
            grupo=navio, detalhe=f"{qtd} {'tanque' if qtd == 1 else 'tanques'}",
            itens=_somar(doNavio, "placas", lambda r, nv=navio: f"/leituras?aba=tanques-navio&navio={nv}&leitura={r}",
                         ORDEM_TANQUE, PLACAS_POR_LEITURA_DE_TANQUE),
        ))

    drops = con.execute(
        """
        SELECT 'Drop D' || d.dia, count(*), count(*) FILTER (WHERE d.data_prevista + %(n)s < %(hoje)s)
        FROM drops d
        WHERE d.status = 'Concluído' AND d.data_prevista + %(n)s <= %(hoje)s AND d.data_prevista >= %(hoje)s - 60
          AND NOT EXISTS (SELECT 1 FROM app.leituras_drop l WHERE l.drop_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM desvios_drop x WHERE x.drop_id = d.id)
        GROUP BY d.dia ORDER BY d.dia
        """,
        {"n": DIAS_ATE_LER_O_DROP, "hoje": hoje},
    ).fetchall()
    if drops:
        grupos.append(Grupo(grupo="Drops", itens=_somar(drops, "tanques", lambda r: "/leituras?aba=drops")))

    # águas e superfícies (o schema do app): água do processo, CIP baia e CIP linha
    aguas = con.execute(
        f"SELECT tipo, analise, count(*), count(*) FILTER (WHERE situacao = 'Atrasado')"
        f" FROM ({PENDENCIAS_AGUAS_SQL}) p (bloco, tipo, referencia, analise, prevista, situacao)"
        f" WHERE situacao IN {EM_DIA} GROUP BY 1, 2"
    ).fetchall()
    for tipo, nome, aba in (("Água do processo", "Água do processo", "agua-processo"), ("Baia", "CIP baia", "cip-baia"),
                            ("Linha", "CIP linha de embarque", "cip-linha")):
        doTipo = [(a, n, at) for t, a, n, at in aguas if t == tipo]
        if doTipo:
            grupos.append(Grupo(grupo=nome, itens=_somar(doTipo, "coletas", lambda r, a=aba: f"/leituras?aba={a}",
                                                         ["C.T 48h", "B.L 72h", "B.L 120h"])))

    # água de consumo (079): o bag em 24 h, o C.T em 48 h, o B.L em 120 h; pH e cloro do semanal na hora
    consumo = [(f"{rotulo} · {etapa}", n, at) for rotulo, etapa, n, at in rotas_agua_consumo.pendencias(con)]
    if consumo:
        grupos.append(Grupo(grupo="Água de consumo", itens=_somar(consumo, "coletas", lambda r: "/leituras?aba=agua-consumo")))

    # TAB e Coliformes: ler (incubado/estriado) e confirmar no PCA
    testes = con.execute(
        f"""
        SELECT teste, CASE WHEN position('confirma' in status) > 0 THEN 'confirmar no PCA' ELSE 'para ler' END,
               count(*), count(*) FILTER (WHERE situacao = 'Atrasado')
        FROM bi.testes
        WHERE situacao IN {EM_DIA} AND teste IN ('TAB', 'Coliformes')
          AND (status IN ('Incubado', 'Estriado') OR position('confirma' in status) > 0)
        GROUP BY 1, 2
        """
    ).fetchall()
    for teste, aba in (("TAB", "tab"), ("Coliformes", "coliformes")):
        doTeste = [(r, n, at) for t, r, n, at in testes if t == teste]
        if doTeste:
            grupos.append(Grupo(grupo=teste, itens=_somar(doTeste, "compostas", lambda r, a=aba: f"/leituras?aba={a}")))
    return grupos


def analises_pendentes(con: psycopg.Connection, hoje: date) -> list[Grupo]:
    grupos: list[Grupo] = []
    tanques = con.execute(
        """
        SELECT c.origem, 'Stress', count(*), count(*) FILTER (WHERE p.atrasado)
        FROM vw_pendencias_do_dia p JOIN coletas c ON c.id = p.ref_id
        WHERE p.grupo = 'Tanques' AND p.tabela = 'coletas'
        GROUP BY 1
        UNION ALL
        SELECT c.origem, 'Normal', count(*), count(*) FILTER (WHERE c.data_coleta < %(hoje)s)
        FROM coletas c
        WHERE c.data_coleta BETWEEN %(hoje)s - 30 AND %(hoje)s
          AND NOT EXISTS (SELECT 1 FROM analises a WHERE a.coleta_id = c.id AND a.frasco = 'Normal')
        GROUP BY 1
        """,
        {"hoje": hoje},
    ).fetchall()
    for origem, nome, caminho in (("terra", "Tanques terra", "/analises/tanques-terra?aba=analise"),
                                  ("navio", "Tanques navio", "/analises/tanques-navio?aba=analise")):
        doGrupo = [(r, n, at) for o, r, n, at in tanques if o == origem]
        if doGrupo:
            grupos.append(Grupo(grupo=nome, itens=_somar(doGrupo, "tanques", lambda r, c=caminho: c, ["Normal", "Stress"])))

    drops = con.execute(
        """
        SELECT 'Drop D' || d.dia, count(*), count(*) FILTER (WHERE d.data_prevista < %(hoje)s)
        FROM drops d WHERE d.status = 'Pendente' AND d.data_prevista <= %(hoje)s
        GROUP BY d.dia ORDER BY d.dia
        """,
        {"hoje": hoje},
    ).fetchall()
    if drops:
        grupos.append(Grupo(grupo="Drops", itens=_somar(drops, "tanques", lambda r: "/analises/drops")))

    testes = con.execute(
        f"""
        SELECT teste, count(*), count(*) FILTER (WHERE situacao = 'Atrasado')
        FROM bi.testes WHERE status = 'No caldo' AND situacao IN {EM_DIA} AND teste IN ('TAB', 'Coliformes')
        GROUP BY 1
        """
    ).fetchall()
    for teste, rotulo, caminho in (("TAB", "para espalhar", "/analises/tab"), ("Coliformes", "para estriar", "/analises/coliformes")):
        doTeste = [(rotulo, n, at) for t, n, at in testes if t == teste]
        if doTeste:
            grupos.append(Grupo(grupo=teste, itens=_somar(doTeste, "compostas", lambda r, c=caminho: c)))

    compostas = con.execute(
        "SELECT p.etapa, count(*), count(*) FILTER (WHERE p.atrasado) FROM vw_pendencias_do_dia p WHERE p.grupo = 'Compostas' GROUP BY 1"
    ).fetchall()
    if compostas:
        grupos.append(Grupo(grupo="Compostas", itens=_somar(compostas, "compostas", lambda r: "/analises/recebimento-fcoj?aba=registrar")))
    return grupos


def _hoje(con: psycopg.Connection) -> date:
    return rotas_turno._agora(con).astimezone(FUSO).date()


@roteador.get("/pendentes", response_model=Pendentes)
def pendentes(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> Pendentes:
    if pessoa.cargo == "Coletor":  # o Coletor não lê nem analisa (07)
        return Pendentes(leituras=[], analises=[])
    hoje = _hoje(con)
    return Pendentes(leituras=leituras_pendentes(con, hoje), analises=analises_pendentes(con, hoje))


# --- leitura dos drops ------------------------------------------------------------------------------------------------


class DropParaLer(BaseModel):
    drop_id: int
    drop: str  # "D5"
    origem: str  # "Terra" ou "Navio"
    tanque: str
    navio: str | None
    data_coleta: date
    incubado_em: date  # o dia do drop
    ler_em: date  # 5 dias depois
    atrasado: bool


class DropsParaLer(BaseModel):
    pode_registrar: bool
    drops: list[DropParaLer]


DROPS_PARA_LER_SQL = """
SELECT d.id, 'D' || d.dia, CASE c.origem WHEN 'terra' THEN 'Terra' ELSE 'Navio' END, c.tanque,
       nullif(trim(coalesce(n.nome, '') || ' ' || coalesce(n.viagem, '')), ''), c.data_coleta, d.data_prevista
FROM drops d JOIN coletas c ON c.id = d.coleta_id LEFT JOIN navios n ON n.id = c.navio_id
WHERE d.status = 'Concluído' AND d.data_prevista + %(n)s <= %(hoje)s AND d.data_prevista >= %(hoje)s - 60
  AND NOT EXISTS (SELECT 1 FROM app.leituras_drop l WHERE l.drop_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM desvios_drop x WHERE x.drop_id = d.id)
ORDER BY d.data_prevista, d.dia, c.origem, n.nome, c.tanque
"""


def _drops_para_ler(con: psycopg.Connection, pessoa: PessoaLogada) -> DropsParaLer:
    hoje = _hoje(con)
    drops = [
        DropParaLer(
            drop_id=i, drop=dd, origem=o, tanque=t, navio=nv, data_coleta=dc, incubado_em=dp,
            ler_em=dp + timedelta(days=DIAS_ATE_LER_O_DROP), atrasado=dp + timedelta(days=DIAS_ATE_LER_O_DROP) < hoje,
        )
        for i, dd, o, t, nv, dc, dp in con.execute(DROPS_PARA_LER_SQL, {"n": DIAS_ATE_LER_O_DROP, "hoje": hoje}).fetchall()
    ]
    return DropsParaLer(pode_registrar=pode(pessoa.cargo, "registrar_analise"), drops=drops)


@roteador.get("/drops", response_model=DropsParaLer)
def drops_para_ler(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> DropsParaLer:
    return _drops_para_ler(con, pessoa)


class PedidoNegativos(BaseModel):
    drop_ids: list[int] = Field(min_length=1, max_length=200)


@roteador.post("/drops/negativos", response_model=DropsParaLer)
def drops_negativos(
    pedido: PedidoNegativos, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> DropsParaLer:
    """Os drops marcados, todos negativos de uma vez (o que a pessoa conferiu na prévia)."""
    validos = {i for (i,) in con.execute("SELECT id FROM drops WHERE id = ANY(%s) AND status = 'Concluído'", (pedido.drop_ids,))}
    if validos != set(pedido.drop_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Algum drop não está para ler (ainda não foi incubado).")
    for drop_id in pedido.drop_ids:
        con.execute(
            "INSERT INTO app.leituras_drop (drop_id, resultado, lido_por) VALUES (%s, 'Negativo', %s) ON CONFLICT (drop_id) DO NOTHING",
            (drop_id, pessoa.usuario_id),
        )
    return _drops_para_ler(con, pessoa)


class Positivo(BaseModel):
    desvio_id: int
    texto: str


@roteador.post("/drops/{drop_id}/positivo", response_model=Positivo)
def drop_positivo(
    drop_id: int, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Positivo:
    """Drop positivo: grava a leitura e abre o desvio (abrir_desvio_drop); a tela leva para Desvios."""
    r = _chamar(con, "SELECT abrir_desvio_drop(%s, %s)", (pessoa.usuario_id, drop_id))
    con.execute(
        "INSERT INTO app.leituras_drop (drop_id, resultado, lido_por) VALUES (%s, 'Positivo', %s) ON CONFLICT (drop_id) DO NOTHING",
        (drop_id, pessoa.usuario_id),
    )
    return Positivo(desvio_id=r["desvio_id"], texto=r["texto"])
