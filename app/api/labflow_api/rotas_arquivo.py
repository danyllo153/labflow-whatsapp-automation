"""Arquivo de contra-amostras: as caixas (navio, recebimento e tanque), o que tem em cada uma, arquivar e descartar.

Spec: docs/specs/lims/11-arquivo-contra-amostras.md; rumo-do-app.md, PB21 (migration 105 do bot). Tudo vem das views do bot
(`vw_arquivo_caixas`, `vw_arquivo_itens`) e as gravações chamam as MESMAS funções do bot (`arquivo_arquivar_recebimento`,
`arquivo_descartar`), com a mesma regra, as mesmas recusas e a prévia antes do Confirmar. O vencido aparece em vermelho;
ninguém é avisado (decisão do Danyllo).
"""

from datetime import date
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
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
    # caixa de navio (PB24, 109 do bot): a data de onde contam o 1 ano do pote e os 2 anos do FCOJ
    ultima_amostra: date | None = None
    inicio_em: date | None = None  # a escolhida à mão ou a automática (última amostra + 5 dias)
    inicio_fixado: bool = False
    # caixa de navio que veio da planilha (carga inicial): o laudo é o PDF pronto que se sobe nela (085, 01/11)
    da_planilha: bool = False
    laudo_pdf: bool = False  # já tem o PDF do laudo


class Arquivo(BaseModel):
    caixas: list[Caixa]
    sugerida_recebimento: int | None
    pode_gravar: bool


# A caixa do recebimento só vai para "Para descartar" quando TODOS os loads dela venceram (pedido do Danyllo, 26/10): um
# load vencido sozinho não avisa nada. A data da caixa passa a ser a do último load a vencer.
CAIXAS_SQL = """
SELECT c.tipo, c.numero, c.familia, c.navio, c.viagem, c.itens_arquivados, c.amostras,
       CASE WHEN c.tipo = 'recebimento' THEN r.ultimo ELSE c.descarte_em END,
       CASE WHEN c.tipo = 'recebimento' AND c.situacao = 'Vencida' AND c.itens_vencidos < c.itens_arquivados THEN 'Em uso'
            ELSE c.situacao END,
       c.itens_vencidos, c.ultima_amostra, c.inicio_em, coalesce(c.inicio_fixado, false),
       cg.id IS NOT NULL, EXISTS (SELECT 1 FROM app.arquivo_laudo_pdf p WHERE p.carga_id = cg.id AND p.trocado_em IS NULL)
FROM vw_arquivo_caixas c
LEFT JOIN arquivo_navios cg ON c.tipo = 'navio' AND cg.caixa = c.numero AND cg.origem = 'carga' AND cg.descartado_em IS NULL
LEFT JOIN LATERAL (SELECT max(i.data_descarte) AS ultimo FROM vw_arquivo_itens i
                   WHERE i.caixa_tipo = 'recebimento' AND i.caixa = c.numero AND i.situacao <> 'Descartado') r ON c.tipo = 'recebimento'
"""


def _caixa(t, n, f, nv, v, i, a, d, s, iv, ua, ini, fixado, planilha, pdf) -> Caixa:
    return Caixa(
        tipo=t, numero=n, familia=f, navio=nv, viagem=v, itens=i, amostras=a, descarte_em=d, situacao=s, itens_vencidos=iv,
        ultima_amostra=ua, inicio_em=ini, inicio_fixado=fixado, da_planilha=planilha, laudo_pdf=pdf,
    )


@roteador.get("", response_model=Arquivo)
def arquivo(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> Arquivo:
    """Todas as caixas, com a situação de cada uma (as vencidas primeiro na tela)."""
    caixas = [
        _caixa(*linha)
        for linha in con.execute(
            CAIXAS_SQL + " ORDER BY CASE c.tipo WHEN 'navio' THEN 1 WHEN 'recebimento' THEN 2 ELSE 3 END, c.numero"
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
        CAIXAS_SQL + " WHERE c.tipo = %s AND c.numero = %s",
        (tipo, numero),
    ).fetchone()
    if not linha:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Caixa não encontrada.")
    cx = _caixa(*linha)
    nv, v = cx.navio, cx.viagem
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


class Achado(BaseModel):
    tipo: str
    caixa: int
    load: str
    navio: str | None = None  # na busca por navio (01/11): "O.WAVE 223"
    lotes: str | None
    data_ref: date | None
    data_descarte: date | None
    situacao: str


@roteador.get("/busca", response_model=list[Achado])
def buscar_load(
    load: str = Query(min_length=1, max_length=40),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[Achado]:
    """Em qual caixa está um load (o que ainda não foi descartado; recebimento e embarque) ou, com letras, um navio
    ("O.WAVE 223", "owave 223" ou só "O.WAVE"): a caixa de cada viagem (01/11)."""
    if any(ch.isalpha() for ch in load):
        termo = "".join(ch for ch in load.upper() if ch.isalnum())
        return [
            Achado(tipo="navio", caixa=c, load="", navio=f"{nv} {vg}", lotes=None, data_ref=None, data_descarte=dd, situacao=si)
            for c, nv, vg, dd, si in con.execute(
                """
                SELECT numero, navio, viagem, descarte_em, situacao FROM vw_arquivo_caixas
                WHERE tipo = 'navio' AND navio IS NOT NULL
                  AND regexp_replace(upper(navio || viagem), '[^A-Z0-9]', '', 'g') LIKE %s
                ORDER BY navio, length(viagem), viagem LIMIT 50
                """,
                (f"%{termo}%",),
            )
        ]
    return [
        Achado(tipo=t, caixa=c, load=lo, lotes=lt, data_ref=dr, data_descarte=dd, situacao=si)
        for t, c, lo, lt, dr, dd, si in con.execute(
            """
            SELECT caixa_tipo, caixa, load, lotes, data_ref, data_descarte, situacao FROM vw_arquivo_itens
            WHERE load ILIKE %s AND situacao <> 'Descartado' AND caixa IS NOT NULL
            ORDER BY data_ref DESC NULLS LAST, caixa LIMIT 50
            """,
            (f"%{load.strip()}%",),
        )
    ]


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
    """Load e lotes do recebimento numa caixa (121 a 153); descarte em 7 dias."""
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


class DataInicial(BaseModel):
    numero: int
    data: date | None = None  # sem data: volta à automática (última amostra + 5 dias)
    previa: bool = True


@roteador.post("/data-inicial", response_model=Gravacao)
def data_inicial(
    pedido: DataInicial, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Gravacao:
    """Caixa de navio (PB24, 109 do bot): fixar a data inicial à mão ou voltar à automática. A prévia mostra o descarte que
    a data vai dar (pote 1 ano, FCOJ 2 anos); a regra e a permissão (Admin e Analista) são da função do bot."""
    r = _chamar(
        con, "SELECT arquivo_data_inicial_navio(%s, %s, %s, %s)", (pessoa.usuario_id, pedido.numero, pedido.data, pedido.previa)
    )
    return _resposta(r, pedido.previa)


# --- o laudo da caixa (01/11): a folha do laudo de contra-amostra onde a caixa está --------------------------------------

LAUDO_DO_TIPO = {"navio": "contra-embarque", "recebimento": "contra-recebimento"}


class LaudoDaCaixa(BaseModel):
    laudo: str  # "contra-embarque" ou "contra-recebimento"
    pagina_id: int
    finalizada: bool


@roteador.get("/{tipo}/{numero}/laudo", response_model=list[LaudoDaCaixa])
def laudo_da_caixa(
    tipo: Tipo,
    numero: int,
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> list[LaudoDaCaixa]:
    """As folhas do laudo de contra-amostra com o que está (ou esteve) nesta caixa: navio no laudo do embarque (uma folha
    por caixa), recebimento na folha corrida. O tanque de terra não tem laudo de contra-amostra."""
    nome = LAUDO_DO_TIPO.get(tipo)
    if nome is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "A caixa do tanque não tem laudo de contra-amostra.")
    from labflow_api import (
        laudos,  # os laudos de contra-amostra moram em laudos_analises (registrados no main)
    )

    laudo = laudos.LAUDOS.get(nome)
    if laudo is not None and laudo.preparar:
        laudo.preparar(con)  # põe nas folhas o que ainda não tem lugar
    return [
        LaudoDaCaixa(laudo=nome, pagina_id=p, finalizada=f)
        for p, f in con.execute(
            """
            SELECT DISTINCT l.pagina_id, p.impresso_em IS NOT NULL FROM app.laudo_linhas l
            JOIN app.paginas_laudo p ON p.id = l.pagina_id AND p.excluida_em IS NULL
            JOIN vw_arquivo_itens i ON i.item || ':' || i.ref_id = l.ref
            WHERE l.laudo = %s AND i.caixa_tipo = %s AND i.caixa = %s
            ORDER BY l.pagina_id
            """,
            (nome, tipo, numero),
        )
    ]



# --- o PDF do laudo da caixa da planilha (085, pedido do Danyllo de 01/11) -------------------------------------------------
# As caixas de navio da carga inicial não têm laudo gerado pelo app: sobe-se o PDF do laudo que já existe e o botão "Laudo"
# da caixa abre esse PDF. Subir outro troca (o antigo fica no banco). O PDF fica só no banco.

TAMANHO_MAXIMO = 10 * 1024 * 1024


def _carga(con: psycopg.Connection, numero: int) -> int:
    linha = con.execute(
        "SELECT id FROM arquivo_navios WHERE caixa = %s AND origem = 'carga' AND descartado_em IS NULL", (numero,)
    ).fetchone()
    if not linha:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"A caixa {numero} não veio da planilha: o laudo dela é a folha do laudo de contra-amostra.",
        )
    return linha[0]


class LaudoEnviado(BaseModel):
    caixa: int
    texto: str


@roteador.put("/navio/{numero}/laudo-pdf", response_model=LaudoEnviado)
async def enviar_laudo_pdf(
    numero: int,
    pedido: Request,
    nome: str = Query(default="", max_length=200),
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> LaudoEnviado:
    """Sobe o PDF do laudo pronto de uma caixa de navio da planilha (Admin e Analista); outro PDF troca o anterior."""
    pdf = await pedido.body()
    if len(pdf) > TAMANHO_MAXIMO:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O PDF passa de 10 MB.")
    if not pdf.startswith(b"%PDF"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O arquivo não é um PDF.")
    carga_id = _carga(con, numero)
    with con.transaction():
        trocou = con.execute(
            "UPDATE app.arquivo_laudo_pdf SET trocado_em = clock_timestamp() WHERE carga_id = %s AND trocado_em IS NULL",
            (carga_id,),
        ).rowcount
        con.execute(
            "INSERT INTO app.arquivo_laudo_pdf (carga_id, pdf, nome_arquivo, enviado_por) VALUES (%s, %s, %s, %s)",
            (carga_id, pdf, nome.strip() or None, pessoa.usuario_id),
        )
    return LaudoEnviado(caixa=numero, texto=f"Laudo da caixa {numero} {'trocado' if trocou else 'guardado'}.")


@roteador.get("/navio/{numero}/laudo-pdf")
def baixar_laudo_pdf(
    numero: int, pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)
) -> Response:
    """O PDF do laudo da caixa da planilha, para abrir na tela."""
    linha = con.execute(
        """
        SELECT p.pdf FROM app.arquivo_laudo_pdf p
        JOIN arquivo_navios an ON an.id = p.carga_id
        WHERE an.caixa = %s AND an.origem = 'carga' AND an.descartado_em IS NULL AND p.trocado_em IS NULL
        """,
        (numero,),
    ).fetchone()
    if not linha:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"A caixa {numero} ainda não tem o PDF do laudo.")
    return Response(
        content=bytes(linha[0]), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="laudo-caixa-{numero}.pdf"'},
    )
