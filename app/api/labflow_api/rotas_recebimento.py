"""Corrigir e excluir recebimento (FCOJ) pelo app, pelas funções do banco criadas pela sessão do bot (PB4, migration 036).

Spec: 07-app-pwa.md (v1.0), §5 Páginas (Recebimento). Tarefa: APP-045. Permissão de chamar as funções: migration 064.
As regras moram nas funções (um lugar só, para o app e o bot): quem pode (Admin e Analista), lote com leitura ou teste,
número já usado, item 129 (NFC). O app só repassa o pedido e mostra a recusa como veio. Excluir ARQUIVA o lote.
"""

from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_admin import _recusa_do_banco

roteador = APIRouter(prefix="/recebimento-fcoj", tags=["recebimento"])

ITEM_NFC = "129"


class LoteRecebido(BaseModel):
    id: int
    lote: int
    data_recebimento: date


class LoadRecebido(BaseModel):
    id: int
    numero: str
    item: str
    fabrica: str | None
    lotes: list[LoteRecebido]


def _loads(con: psycopg.Connection, numero: str) -> list[LoadRecebido]:
    loads = []
    for id_, num, item, fabrica in con.execute(
        """
        SELECT l.id, l.numero, i.codigo, f.nome FROM loads l JOIN itens i ON i.id = l.item_id LEFT JOIN fabricas f ON f.id = l.fabrica_id
        WHERE l.numero = %s AND i.codigo <> %s ORDER BY i.codigo
        """,
        (numero, ITEM_NFC),
    ).fetchall():
        lotes = [
            LoteRecebido(id=i, lote=lo, data_recebimento=d)
            for i, lo, d in con.execute("SELECT id, lote, data_recebimento FROM recebimento_lotes WHERE load_id = %s ORDER BY lote", (id_,))
        ]
        loads.append(LoadRecebido(id=id_, numero=num, item=item, fabrica=fabrica, lotes=lotes))
    return loads


@roteador.get("/load", response_model=list[LoadRecebido])
def buscar(
    numero: str = Query(min_length=1, max_length=10),
    pessoa: PessoaLogada = Depends(exigir("corrigir_registro")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[LoadRecebido]:
    """Os loads de FCOJ com esse número (pode haver mais de um item) e os lotes de cada um."""
    return _loads(con, numero.strip())


class CorrecaoLote(BaseModel):
    lote: int | None = Field(default=None, ge=1, le=9999)
    data_recebimento: date | None = None
    motivo: str | None = Field(default=None, max_length=300)


def _chamar(con: psycopg.Connection, sql: str, valores: tuple) -> None:
    try:
        with con.transaction():
            con.execute(sql, valores)
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None


def _numero_do_load(con: psycopg.Connection, tabela: str, id_: int) -> str:
    sql = "SELECT l.numero FROM recebimento_lotes r JOIN loads l ON l.id = r.load_id WHERE r.id = %s" if tabela == "lote" else "SELECT numero FROM loads WHERE id = %s"
    linha = con.execute(sql, (id_,)).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lote do recebimento não encontrado." if tabela == "lote" else "Load não encontrado.")
    return linha[0]


@roteador.put("/lotes/{lote_id}", response_model=list[LoadRecebido])
def corrigir_lote(
    lote_id: int, pedido: CorrecaoLote, pessoa: PessoaLogada = Depends(exigir("corrigir_registro")), con: psycopg.Connection = Depends(obter_conexao)
) -> list[LoadRecebido]:
    campos = {}
    if pedido.lote is not None:
        campos["lote"] = str(pedido.lote)
    if pedido.data_recebimento is not None:
        campos["data_recebimento"] = pedido.data_recebimento.isoformat()
    numero = _numero_do_load(con, "lote", lote_id)
    _chamar(con, "SELECT corrigir_recebimento(%s, %s, %s, %s)", (lote_id, Jsonb(campos), pessoa.usuario_id, (pedido.motivo or "").strip() or None))
    return _loads(con, numero)


class CorrecaoLoad(BaseModel):
    numero: str | None = Field(default=None, max_length=10)
    item: str | None = Field(default=None, max_length=10)
    fabrica: str | None = Field(default=None, max_length=10)
    motivo: str | None = Field(default=None, max_length=300)


@roteador.put("/loads/{load_id}", response_model=list[LoadRecebido])
def corrigir_load(
    load_id: int, pedido: CorrecaoLoad, pessoa: PessoaLogada = Depends(exigir("corrigir_registro")), con: psycopg.Connection = Depends(obter_conexao)
) -> list[LoadRecebido]:
    """Corrige número, item ou fábrica do load (vale para todos os lotes dele)."""
    campos = {c: v.strip() for c in ("numero", "item", "fabrica") if (v := getattr(pedido, c)) is not None and v.strip()}
    _numero_do_load(con, "load", load_id)
    _chamar(con, "SELECT corrigir_load(%s, %s, %s, %s)", (load_id, Jsonb(campos), pessoa.usuario_id, (pedido.motivo or "").strip() or None))
    return _loads(con, con.execute("SELECT numero FROM loads WHERE id = %s", (load_id,)).fetchone()[0])


class Exclusao(BaseModel):
    motivo: str | None = Field(default=None, max_length=300)


@roteador.post("/lotes/{lote_id}/excluir", response_model=list[LoadRecebido])
def excluir_lote(
    lote_id: int, pedido: Exclusao, pessoa: PessoaLogada = Depends(exigir("excluir_registro")), con: psycopg.Connection = Depends(obter_conexao)
) -> list[LoadRecebido]:
    """Arquiva o lote (um Admin recupera); lote com leitura, composta ou teste o banco não deixa excluir."""
    numero = _numero_do_load(con, "lote", lote_id)
    _chamar(con, "SELECT excluir_recebimento(%s, %s, %s)", (lote_id, pessoa.usuario_id, (pedido.motivo or "").strip() or None))
    return _loads(con, numero)
