"""Arquivo de contra-amostras: as caixas (navio, recebimento e tanque), o que tem em cada uma, arquivar e descartar.

Spec: docs/specs/lims/11-arquivo-contra-amostras.md; rumo-do-app.md, PB21 (migration 105 do bot). Tudo vem das views do bot
(`vw_arquivo_caixas`, `vw_arquivo_itens`) e as gravações chamam as MESMAS funções do bot (`arquivo_arquivar_recebimento`,
`arquivo_descartar`), com a mesma regra, as mesmas recusas e a prévia antes do Confirmar. O vencido aparece em vermelho;
ninguém é avisado (decisão do Danyllo).
"""

from datetime import date
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_analise_recebimento import _chamar, _lotes
from labflow_api.rotas_apps_analise import Gravacao, _resposta

roteador = APIRouter(prefix="/arquivo", tags=["arquivo de contra-amostras"])

Tipo = Literal["navio", "recebimento", "tanque"]


class Caixa(BaseModel):
    tipo: Tipo
    numero: int
    familia: str | None
    navio: str | None
    viagem: str | None
    itens: int
    amostras: int
    descarte_em: date | None
    situacao: str  # Disponível / Em uso / Vencida
    itens_vencidos: int


class Arquivo(BaseModel):
    caixas: list[Caixa]
    sugerida_recebimento: int | None
    pode_gravar: bool


@roteador.get("", response_model=Arquivo)
def arquivo(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> Arquivo:
    """Todas as caixas, com a situação de cada uma (as vencidas primeiro na tela)."""
    caixas = [
        Caixa(tipo=t, numero=n, familia=f, navio=nv, viagem=v, itens=i, amostras=a, descarte_em=d, situacao=s, itens_vencidos=iv)
        for t, n, f, nv, v, i, a, d, s, iv in con.execute(
            """
            SELECT tipo, numero, familia, navio, viagem, itens_arquivados, amostras, descarte_em, situacao, itens_vencidos
            FROM vw_arquivo_caixas ORDER BY CASE tipo WHEN 'navio' THEN 1 WHEN 'recebimento' THEN 2 ELSE 3 END, numero
            """
        ).fetchall()
    ]
    sugerida = con.execute("SELECT arquivo_caixa_recebimento_sugerida()").fetchone()[0]
    return Arquivo(caixas=caixas, sugerida_recebimento=sugerida, pode_gravar=pode(pessoa.cargo, "registrar_analise"))


class Item(BaseModel):
    item: str  # bag / pote / fcoj / carga / recebimento
    descricao: str
    navio: str | None
    viagem: str | None
    tanque: str | None
    load: str | None
    lotes: str | None
    quantidade: int | None
    data_ref: date | None
    data_descarte: date | None
    situacao: str  # Arquivado / Vencido / Descartado
    descartado_em: str | None


class ConteudoDaCaixa(BaseModel):
    caixa: Caixa
    itens: list[Item]


@roteador.get("/{tipo}/{numero}", response_model=ConteudoDaCaixa)
def caixa(
    tipo: Tipo, numero: int, descartados: bool = False,
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao),
) -> ConteudoDaCaixa:
    """O que tem numa caixa (o vencido primeiro); com `descartados`, também o histórico do que já saiu."""
    linha = con.execute(
        """
        SELECT tipo, numero, familia, navio, viagem, itens_arquivados, amostras, descarte_em, situacao, itens_vencidos
        FROM vw_arquivo_caixas WHERE tipo = %s AND numero = %s
        """,
        (tipo, numero),
    ).fetchone()
    if not linha:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Caixa não encontrada.")
    t, n, f, nv, v, i, a, d, s, iv = linha
    cx = Caixa(tipo=t, numero=n, familia=f, navio=nv, viagem=v, itens=i, amostras=a, descarte_em=d, situacao=s, itens_vencidos=iv)
    # caixa de navio: só os itens do navio e viagem que ocupa a caixa agora (a mesma conta da view das caixas)
    itens = [
        Item(item=it, descricao=de, navio=na, viagem=vi, tanque=ta, load=lo, lotes=lt, quantidade=q, data_ref=dr,
             data_descarte=dd, situacao=si, descartado_em=em.strftime("%d/%m/%Y") if em else None)
        for it, de, na, vi, ta, lo, lt, q, dr, dd, si, em in con.execute(
            """
            SELECT i.item, i.descricao, i.navio, i.viagem, i.tanque, i.load, i.lotes, i.quantidade, i.data_ref, i.data_descarte,
                   i.situacao, i.descartado_em AT TIME ZONE 'America/Sao_Paulo'
            FROM vw_arquivo_itens i
            WHERE i.caixa_tipo = %(t)s AND i.caixa = %(n)s AND (%(todos)s OR i.situacao <> 'Descartado')
              AND (%(t)s <> 'navio' OR i.situacao = 'Descartado' OR %(navio)s::text IS NULL
                   OR (arquivo_nome_navio(i.navio) = %(navio)s AND arquivo_viagem(i.viagem) = %(viagem)s))
            ORDER BY CASE i.situacao WHEN 'Vencido' THEN 1 WHEN 'Arquivado' THEN 2 ELSE 3 END, i.data_ref DESC NULLS LAST, i.descricao
            LIMIT 500
            """,
            {"t": tipo, "n": numero, "todos": descartados, "navio": nv, "viagem": v},
        )
    ]
    return ConteudoDaCaixa(caixa=cx, itens=itens)


class Arquivar(BaseModel):
    load: str = Field(min_length=1, max_length=20)
    item: str = Field(default="", max_length=20)
    lotes: str = Field(max_length=200)  # "1-12, 14"
    caixa: int
    data: date | None = None
    previa: bool = True


@roteador.post("/arquivar", response_model=Gravacao)
def arquivar(
    pedido: Arquivar, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    """Load e lotes do recebimento numa caixa (121 a 145); descarte em 7 dias."""
    r = _chamar(
        con, "SELECT arquivo_arquivar_recebimento(%s, %s, %s, %s, %s, %s, %s)",
        (pessoa.usuario_id, pedido.load.strip(), pedido.item.strip(), _lotes(pedido.lotes), pedido.caixa, pedido.data, pedido.previa),
    )
    return _resposta(r, pedido.previa)


class Descartar(BaseModel):
    tipo: Tipo
    numero: int
    previa: bool = True


@roteador.post("/descartar", response_model=Gravacao)
def descartar(
    pedido: Descartar, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    """Navio: a caixa inteira, depois da maior data. Recebimento e tanque: o que já venceu."""
    r = _chamar(con, "SELECT arquivo_descartar(%s, %s, %s, %s)", (pessoa.usuario_id, pedido.tipo, pedido.numero, pedido.previa))
    return _resposta(r, pedido.previa)
