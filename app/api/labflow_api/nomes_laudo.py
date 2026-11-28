"""Quem vai no laudo, escolhido por folha ou por data (pedido do Danyllo de 27/11; migration 086).

Na Lite (entrada pelo nome, sem senha), o NOME do analista sai em branco nos laudos. Aqui quem lança escolhe quem vai:
- folha inteira (dia vazio): o "Analista Responsável" do recebimento FCOJ, do NFC e do embarque, o Nome do rodapé da
  incubação e o "Analista / Responsável" de cada folha dos meios de cultura;
- cada data da folha: o responsável do branco do dia (fluxo laminar), o analista do material asséptico e o dos ciclos de
  esterilização.
Várias pessoas podem dividir o mesmo turno: cabe mais de um nome. A tela sugere quem marcou entrada no turno nesses dias.
Fora da Lite (a Completa, com senha), sem escolha fica o nome de quem lançou, como sempre foi.

Este módulo não importa os laudos (eles o importam): os PDFs chamam `no_pdf`.
"""

from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api.dependencias import PessoaLogada, e_lite, obter_conexao
from labflow_api.permissoes import exigir

roteador = APIRouter(prefix="/laudos-nomes", tags=["laudos"])

# laudo -> como se escolhe: "folha" (um nome para a folha inteira) ou "dia" (um por data, com o SQL dos dias da folha)
DIAS_DA_FOLHA = {
    "fluxo-laminar": "SELECT DISTINCT dia FROM app.fluxo_laminar WHERE pagina_id = %s ORDER BY 1",
    "material-asseptico": "SELECT DISTINCT dia FROM app.material_asseptico WHERE pagina_id = %s AND excluido_em IS NULL ORDER BY 1",
    "esterilizacao": "SELECT DISTINCT dia FROM app.esterilizacoes WHERE laudo_id = %s AND excluida_em IS NULL ORDER BY 1",
}
POR_FOLHA = ("recebimento-fcoj", "recebimento-nfc", "embarque-fcoj", "incubacao", "meios-OSA", "meios-PDA", "meios-PCA", "meios-Wort")
LAUDOS_COM_NOMES = (*POR_FOLHA, *DIAS_DA_FOLHA)


def _primeiro_nome(nome: str) -> str:
    return nome.split()[0] if nome.split() else nome


def escolhidos(con: psycopg.Connection, laudo: str, pagina_id: int, dia: date | None = None) -> list[str] | None:
    """Os nomes escolhidos (o primeiro nome de cada um, na ordem); None se ninguém escolheu."""
    linha = con.execute(
        """
        SELECT array_agg(coalesce(nullif(trim(u.nome), ''), c.usuario) ORDER BY p.ordem)
        FROM app.nomes_no_laudo n
        CROSS JOIN LATERAL unnest(n.pessoas) WITH ORDINALITY AS p(id, ordem)
        JOIN usuarios u ON u.id = p.id LEFT JOIN app.credenciais c ON c.usuario_id = p.id
        WHERE n.laudo = %s AND n.pagina_id = %s AND n.dia IS NOT DISTINCT FROM %s
        """,
        (laudo, pagina_id, dia),
    ).fetchone()
    if linha is None or not linha[0]:
        return None
    return [_primeiro_nome(n) for n in linha[0]]


def no_pdf(con: psycopg.Connection, laudo: str, pagina_id: int, dia: date | None, automatico: str, juntar: str = " / ") -> str:
    """O que vai no campo NOME do PDF: os escolhidos; sem escolha, em branco na entrada pelo nome ou quem lançou fora dela."""
    nomes = escolhidos(con, laudo, pagina_id, dia)
    if nomes:
        return juntar.join(nomes)
    return "" if e_lite() else automatico


class Pessoa(BaseModel):
    id: int
    nome: str


class Escolha(BaseModel):
    dia: date | None  # None: a folha inteira
    pessoas: list[int]  # escolhidas (vazia: em branco)
    sugeridas: list[int]  # quem marcou entrada no turno nesse dia (ou nos dias da folha)


class NomesDaFolha(BaseModel):
    laudo: str
    pagina_id: int
    por: str  # "folha" ou "dia"
    pode_mudar: bool  # a folha finalizada não muda
    pessoas: list[Pessoa]
    escolhas: list[Escolha]


class PedidoDeNomes(BaseModel):
    dia: date | None = None
    pessoas: list[int] = Field(default_factory=list, max_length=6)


def _folha(con: psycopg.Connection, laudo: str, pagina_id: int) -> tuple[bool, list[date]]:
    """(finalizada, dias da folha). 404 se a folha não é desse laudo."""
    if laudo not in LAUDOS_COM_NOMES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Este laudo não tem nome para escolher.")
    if laudo == "esterilizacao":
        linha = con.execute(
            "SELECT impresso_em FROM app.laudos_esterilizacao WHERE id = %s AND excluida_em IS NULL", (pagina_id,)
        ).fetchone()
    else:
        linha = con.execute(
            "SELECT impresso_em FROM app.paginas_laudo WHERE id = %s AND laudo = %s AND excluida_em IS NULL", (pagina_id, laudo)
        ).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Folha do laudo não encontrada.")
    if laudo in DIAS_DA_FOLHA:
        dias = [d for (d,) in con.execute(DIAS_DA_FOLHA[laudo], (pagina_id,))]
    else:
        from labflow_api import laudos  # aqui dentro: os laudos importam este módulo

        _, de, ate = con.execute(laudos.LAUDOS[laudo].contar_sql, (pagina_id,)).fetchone()
        dias = [d for d in (laudos._dia(de), laudos._dia(ate)) if d is not None]
    return linha[0] is not None, dias


def _sugeridas(con: psycopg.Connection, dias: list[date]) -> list[int]:
    if not dias:
        return []
    return [
        uid
        for (uid,) in con.execute(
            "SELECT usuario_id FROM app.entradas_turno WHERE dia BETWEEN %s AND %s GROUP BY usuario_id ORDER BY min(entrada)",
            (min(dias), max(dias)),
        )
    ]


def _montar(con: psycopg.Connection, laudo: str, pagina_id: int) -> NomesDaFolha:
    finalizada, dias = _folha(con, laudo, pagina_id)
    salvas = {
        dia: list(pessoas)
        for dia, pessoas in con.execute(
            "SELECT dia, pessoas FROM app.nomes_no_laudo WHERE laudo = %s AND pagina_id = %s", (laudo, pagina_id)
        )
    }
    if laudo in DIAS_DA_FOLHA:
        escolhas = [Escolha(dia=d, pessoas=salvas.get(d, []), sugeridas=_sugeridas(con, [d])) for d in dias]
    else:
        escolhas = [Escolha(dia=None, pessoas=salvas.get(None, []), sugeridas=_sugeridas(con, dias))]
    pessoas = [
        Pessoa(id=i, nome=n)
        for i, n in con.execute(
            """
            SELECT u.id, coalesce(nullif(trim(u.nome), ''), c.usuario)
            FROM app.credenciais c JOIN usuarios u ON u.id = c.usuario_id
            WHERE c.acesso_ativo ORDER BY 2
            """
        )
    ]
    return NomesDaFolha(
        laudo=laudo, pagina_id=pagina_id, por="dia" if laudo in DIAS_DA_FOLHA else "folha", pode_mudar=not finalizada,
        pessoas=pessoas, escolhas=escolhas,
    )


@roteador.get("/{laudo}/{pagina_id}", response_model=NomesDaFolha)
def ver(
    laudo: str, pagina_id: int, pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> NomesDaFolha:
    return _montar(con, laudo, pagina_id)


@roteador.put("/{laudo}/{pagina_id}", response_model=NomesDaFolha)
def escolher(
    laudo: str, pagina_id: int, pedido: PedidoDeNomes, pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> NomesDaFolha:
    finalizada, dias = _folha(con, laudo, pagina_id)
    if finalizada:
        raise HTTPException(status.HTTP_409_CONFLICT, "A folha já foi finalizada: os nomes não mudam mais.")
    if laudo in DIAS_DA_FOLHA and pedido.dia not in dias:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Esse dia não está nesta folha.")
    if laudo not in DIAS_DA_FOLHA and pedido.dia is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Neste laudo o nome vale para a folha inteira.")
    pessoas = list(dict.fromkeys(pedido.pessoas))  # sem repetir, na ordem escolhida
    if pessoas:
        ativas = {
            i for (i,) in con.execute(
                "SELECT usuario_id FROM app.credenciais WHERE acesso_ativo AND usuario_id = ANY(%s)", (pessoas,)
            )
        }
        if set(pessoas) - ativas:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha só pessoas da lista.")
        con.execute(
            """
            INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (laudo, pagina_id, dia)
            DO UPDATE SET pessoas = EXCLUDED.pessoas, escolhido_por = EXCLUDED.escolhido_por, escolhido_em = clock_timestamp()
            """,
            (laudo, pagina_id, pedido.dia, pessoas, pessoa.usuario_id),
        )
    else:
        con.execute(
            "DELETE FROM app.nomes_no_laudo WHERE laudo = %s AND pagina_id = %s AND dia IS NOT DISTINCT FROM %s",
            (laudo, pagina_id, pedido.dia),
        )
    return _montar(con, laudo, pagina_id)
