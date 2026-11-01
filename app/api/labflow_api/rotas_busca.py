"""Busca de rastreio do topo (pedido de 01/11): um load, um tanque ou um navio, e tudo o que existe dele.

GET /busca?q=44333 | tanque 85 | D.STAR. Procura em:
- loads do recebimento de FCOJ e de NFC (abre a página do load: lotes, compostas, NFC e arquivo);
- loads do embarque de FCOJ (abre a página do navio);
- tanques terra e de navio (cada coleta abre a página do tanque);
- navios (abre a página do navio: tanques NFC, embarques FCOJ e caixas do arquivo);
- o arquivo de contra-amostras, inclusive o que já foi descartado.
Os nomes das análises (drops, TAB, água) a tela acha sozinha; esta rota só cuida dos dados.
"""

import re

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_paginas import _barrar_coletor

roteador = APIRouter(prefix="/busca", tags=["paginas"])

POR_TIPO = 6  # resultados de cada tipo (o total fica curto para caber embaixo da busca)
PREFIXOS = re.compile(r"^(tanque|tq|load|navio|caixa)\s+", re.IGNORECASE)


class Achado(BaseModel):
    tipo: str  # "Load", "Load NFC", "Embarque", "Tanque", "Navio", "Arquivo"
    titulo: str
    detalhe: str
    caminho: str  # rota da tela (sem o /app)
    situacao: str | None = None


def _data(valor) -> str:
    return valor.strftime("%d/%m/%Y") if valor else "-"


def buscar(con: psycopg.Connection, texto: str) -> list[Achado]:
    q = PREFIXOS.sub("", texto.strip())
    if not q:
        return []
    inicio = q + "%"  # número de load e de tanque: pelo começo (44 acha 44333, não 1442)
    parte = "%" + q + "%"  # nome de navio: em qualquer lugar
    achados: list[Achado] = []

    for load, fabricas, lotes, primeira, situacao in con.execute(
        """
        SELECT load, string_agg(DISTINCT fabrica, ', '), count(DISTINCT numero), min(prevista),
               CASE WHEN bool_or(lido AND alarme) THEN 'Não ok' WHEN bool_and(lido) THEN 'Ok'
                    WHEN bool_or(situacao = 'Atrasado') THEN 'Atrasado' ELSE 'Em andamento' END
        FROM bi.contagens WHERE origem = 'Recebimento' AND load ILIKE %s
        GROUP BY load ORDER BY min(prevista) DESC LIMIT %s
        """,
        (inicio, POR_TIPO),
    ):
        achados.append(Achado(tipo="Load", titulo=f"Load {load}", caminho=f"/paginas/loads/{load}", situacao=situacao,
                              detalhe=f"Recebimento FCOJ · {fabricas or 'sem fábrica'} · {lotes} lote(s) · desde {_data(primeira)}"))

    ja = {a.titulo for a in achados}
    for load, fabrica, lotes, recebido in con.execute(
        """
        SELECT load, string_agg(DISTINCT fabrica, ', '), count(DISTINCT lote), min(data_recebimento)
        FROM bi.recebimento_nfc WHERE load ILIKE %s GROUP BY load ORDER BY min(data_recebimento) DESC LIMIT %s
        """,
        (inicio, POR_TIPO),
    ):
        detalhe = f"Recebimento NFC · {fabrica or 'sem fábrica'} · {lotes} lote(s) · recebido {_data(recebido)}"
        if f"Load {load}" in ja:
            continue  # o mesmo load já aparece: a página dele mostra o NFC junto
        achados.append(Achado(tipo="Load NFC", titulo=f"Load {load}", caminho=f"/paginas/loads/{load}", detalhe=detalhe))

    for load, navio, amostras in con.execute(
        """
        SELECT load, navio, count(DISTINCT lote_amostra) FROM bi.contagens
        WHERE origem = 'Embarque' AND load ILIKE %s GROUP BY load, navio ORDER BY max(prevista) DESC LIMIT %s
        """,
        (inicio, POR_TIPO),
    ):
        achados.append(Achado(tipo="Embarque", titulo=f"Load {load}", caminho=f"/paginas/navios/{navio}",
                              detalhe=f"Embarque FCOJ · navio {navio} · {amostras} amostra(s)"))

    for coleta_id, origem, tanque, navio, data in con.execute(
        """
        SELECT coleta_id, origem, tanque, navio, data_coleta FROM bi.coletas
        WHERE tanque ILIKE %s ORDER BY data_coleta DESC, coleta_id DESC LIMIT %s
        """,
        (inicio, POR_TIPO),
    ):
        onde = "Tanque terra" if origem == "Terra" else f"Tanque do navio {navio}"
        achados.append(Achado(tipo="Tanque", titulo=f"Tanque {tanque}", caminho=f"/paginas/tanques-terra/{coleta_id}",
                              detalhe=f"{onde} · coleta de {_data(data)}"))

    for (navio,) in con.execute(
        """
        SELECT navio FROM (SELECT navio FROM bi.coletas WHERE navio IS NOT NULL
                           UNION SELECT navio FROM bi.contagens WHERE navio IS NOT NULL) n
        WHERE navio ILIKE %s ORDER BY navio LIMIT %s
        """,
        (parte, POR_TIPO),
    ):
        achados.append(Achado(tipo="Navio", titulo=navio, caminho=f"/paginas/navios/{navio}",
                              detalhe="NFC e FCOJ do navio, com as caixas do arquivo"))

    # o arquivo, agrupado: um load (recebimento) ou um navio (embarque) com as caixas e a situação, inclusive o descartado.
    # O de tanque aparece na página de cada tanque.
    for ref, caminho, caixas, itens, situacoes, ultima in con.execute(
        """
        SELECT ref, caminho, string_agg(DISTINCT caixa::text, ', '), count(*), string_agg(DISTINCT situacao, ', '), max(data_ref)
        FROM (SELECT CASE WHEN caixa_tipo = 'navio' THEN navio || ' ' || viagem ELSE 'Load ' || load END AS ref,
                     CASE WHEN caixa_tipo = 'navio' THEN '/paginas/navios/' || navio || ' ' || viagem
                          ELSE '/paginas/loads/' || load END AS caminho,
                     caixa, situacao, data_ref
              FROM vw_arquivo_itens
              WHERE caixa_tipo <> 'tanque' AND (load ILIKE %s OR navio || ' ' || viagem ILIKE %s)) a
        GROUP BY ref, caminho ORDER BY max(data_ref) DESC NULLS LAST LIMIT %s
        """,
        (inicio, parte, POR_TIPO),
    ):
        lugar = f"caixa {caixas}" if caixas else "sem caixa"
        achados.append(Achado(tipo="Arquivo", titulo=f"{ref} no arquivo", caminho=caminho, situacao=situacoes,
                              detalhe=f"{itens} contra-amostra(s) · {lugar} · última de {_data(ultima)}"))
    return achados


@roteador.get("", response_model=list[Achado])
def busca(
    q: str = Query(min_length=1, max_length=40),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[Achado]:
    _barrar_coletor(pessoa)
    return buscar(con, q)
