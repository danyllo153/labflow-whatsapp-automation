"""Coletas: ver uma coleta, corrigir, excluir (arquiva) e, para o Admin, recuperar a excluída.

Spec: 07-app-pwa.md (v1.0), "Regras que valem para todas as telas" (excluir não apaga; coleta não pede motivo), "Permissões" e 08 A11.
Tarefa: APP-029. Tudo passa pelas funções do banco do bot (PB4, migrations 033 e 034; liberadas ao app pela 056): a regra e a
permissão (Admin e Operador em qualquer coleta; o Coletor só na própria, sem análise, drop concluído nem TAB) moram lá, e
toda alteração vai para `historico_alteracoes`. A API só repassa e traduz a recusa em português.
"""

import json
from datetime import date, datetime
from typing import Any

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api import rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_admin import _recusa_do_banco

roteador = APIRouter(prefix="/coletas", tags=["coletas"])


class Navio(BaseModel):
    id: int
    nome: str


class ColetaDetalhe(BaseModel):
    coleta_id: int
    origem: str
    tanque: str
    navio_id: int | None
    navio: str | None
    data_coleta: date
    coletado_por: str | None
    digitado_por: str | None
    registrado_em: datetime
    com_analise: bool
    com_drop_concluido: bool
    com_tab: bool
    navios: list[Navio]  # para escolher o navio ao corrigir (só coleta de navio)


DETALHE_SQL = """
SELECT b.coleta_id, b.origem, b.tanque, c.navio_id, b.navio, b.data_coleta, b.registrado_por, b.digitado_por, b.registrado_em,
       c.registrado_por,
       EXISTS (SELECT 1 FROM analises WHERE coleta_id = b.coleta_id),
       EXISTS (SELECT 1 FROM drops WHERE coleta_id = b.coleta_id AND status = 'Concluído'),
       EXISTS (SELECT 1 FROM testes WHERE coleta_id = b.coleta_id)
FROM bi.coletas b JOIN coletas c ON c.id = b.coleta_id
WHERE b.coleta_id = %s
"""


def _detalhe(con: psycopg.Connection, pessoa: PessoaLogada, coleta_id: int) -> ColetaDetalhe:
    linha = con.execute(DETALHE_SQL, (coleta_id,)).fetchone()
    if linha is None or (pessoa.cargo == "Coletor" and linha[9] != pessoa.usuario_id):  # 07: o Coletor só vê as próprias
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coleta não encontrada.")
    i, origem, tanque, navio_id, navio, data, coletou, digitou, em, _, analise, drop, tab = linha
    navios = (
        [Navio(id=n, nome=nome) for n, nome in con.execute("SELECT id, nome || coalesce(' ' || viagem, '') FROM navios ORDER BY id DESC LIMIT 50")]
        if origem == "Navio"
        else []
    )
    return ColetaDetalhe(
        coleta_id=i, origem=origem, tanque=tanque, navio_id=navio_id, navio=navio, data_coleta=data, coletado_por=coletou,
        digitado_por=digitou, registrado_em=em, com_analise=analise, com_drop_concluido=drop, com_tab=tab, navios=navios,
    )


class Excluida(BaseModel):
    id: int  # do registro excluído (é o que o recuperar pede)
    coleta_id: int
    origem: str | None
    tanque: str | None
    data_coleta: str | None
    motivo: str | None
    excluida_por: str | None
    excluida_em: datetime


@roteador.get("/excluidas", response_model=list[Excluida])
def excluidas(
    admin: PessoaLogada = Depends(exigir("configurar_turnos")), con: psycopg.Connection = Depends(obter_conexao)
) -> list[Excluida]:
    """O Admin vê as coletas excluídas (arquivadas) que ainda não foram recuperadas."""
    return [
        Excluida(
            id=i, coleta_id=reg, origem=d.get("origem"), tanque=d.get("tanque"), data_coleta=d.get("data_coleta"),
            motivo=motivo, excluida_por=quem, excluida_em=em,
        )
        for i, reg, d, motivo, quem, em in (
            (i, reg, (dados.get("coleta") or {}) if isinstance(dados, dict) else {}, motivo, quem, em)
            for i, reg, dados, motivo, quem, em in con.execute(
                """
                SELECT r.id, r.registro_id, r.dados, r.motivo, coalesce(u.nome, c.usuario), r.excluido_em
                FROM registros_excluidos r LEFT JOIN usuarios u ON u.id = r.excluido_por
                LEFT JOIN app.credenciais c ON c.usuario_id = r.excluido_por
                WHERE r.tabela = 'coletas' AND r.recuperado_em IS NULL ORDER BY r.excluido_em DESC LIMIT 100
                """
            )
        )
    ]


class Recuperacao(BaseModel):
    motivo: str = Field(max_length=300)


@roteador.post("/excluidas/{registro_id}/recuperar", response_model=ColetaDetalhe)
def recuperar(
    registro_id: int,
    pedido: Recuperacao,
    admin: PessoaLogada = Depends(exigir("configurar_turnos")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> ColetaDetalhe:
    """Só o Admin, com motivo: a coleta volta com os mesmos números (e os drops e o arquivo junto)."""
    try:
        with con.transaction():
            coleta = con.execute("SELECT id FROM recuperar_coleta(%s, %s, %s)", (registro_id, pedido.motivo, admin.usuario_id)).fetchone()
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None
    return _detalhe(con, admin, coleta[0])


@roteador.post("/excluidas/{registro_id}/apagar", status_code=status.HTTP_204_NO_CONTENT)
def apagar_de_vez(
    registro_id: int,
    pedido: Recuperacao,
    admin: PessoaLogada = Depends(exigir("gerenciar_pessoas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> None:
    """Só o Admin, com motivo (27/10): a coleta sai da lixeira de vez; o rastro fica no histórico de alterações (081)."""
    try:
        with con.transaction():
            con.execute("SELECT apagar_coleta_excluida(%s, %s, %s)", (registro_id, admin.usuario_id, pedido.motivo))
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None


@roteador.get("/{coleta_id}", response_model=ColetaDetalhe)
def coleta(
    coleta_id: int,
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> ColetaDetalhe:
    return _detalhe(con, pessoa, coleta_id)


class Correcao(BaseModel):
    tanque: str | None = Field(default=None, max_length=40)
    data_coleta: date | None = None
    navio_id: int | None = None
    coletado_por: str | None = Field(default=None, max_length=40)


@roteador.put("/{coleta_id}", response_model=ColetaDetalhe)
def corrigir(
    coleta_id: int,
    correcao: Correcao,
    pessoa: PessoaLogada = Depends(exigir("corrigir_registro")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> ColetaDetalhe:
    """Corrige só o que veio no pedido (tanque, data, navio, quem coletou). Coleta não pede motivo."""
    campos: dict[str, Any] = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in correcao.model_dump(exclude_unset=True).items()}
    _detalhe(con, pessoa, coleta_id)  # 404 se não existe (ou, para o Coletor, se não é dele)
    try:
        with con.transaction():
            con.execute("SELECT corrigir_coleta(%s, %s::jsonb, %s)", (coleta_id, json.dumps(campos), pessoa.usuario_id))
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None
    return _detalhe(con, pessoa, coleta_id)


class Exclusao(BaseModel):
    motivo: str | None = Field(default=None, max_length=300)  # coleta não pede motivo (decidido em 16/10)


class Excluida201(BaseModel):
    coleta_id: int
    avisos: str


@roteador.post("/{coleta_id}/excluir", response_model=Excluida201)
def excluir(
    coleta_id: int,
    pedido: Exclusao,
    pessoa: PessoaLogada = Depends(exigir("excluir_registro")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Excluida201:
    """Arquiva a coleta (com os drops e o arquivo); o Admin recupera. Recusa se já tem análise, drop concluído ou TAB."""
    _detalhe(con, pessoa, coleta_id)
    try:
        with con.transaction():
            con.execute("SELECT id FROM excluir_coleta(%s, %s, %s)", (coleta_id, pessoa.usuario_id, pedido.motivo))
    except psycopg.errors.RaiseException as erro:
        raise _recusa_do_banco(erro) from None
    return Excluida201(coleta_id=coleta_id, avisos="A coleta saiu das páginas e ficou guardada: o Admin pode recuperar.")
