"""Meios de cultura e lotes: recebimento e aceitação de cada lote, o lote EM USO de cada meio e o laudo LAB/090.

Spec: 07-app-pwa.md (v1.0), §7.4 Meios e lotes. Tarefa: APP-036. Tabelas da migration 060.

Regras (decididas com o Danyllo em 23 e 24/10):
- cada meio (OSA, PDA, PCA, Wort) tem UM lote em uso, escolhido com um toque; trocar fecha o período do anterior;
- o lote em uso não é sempre o mais novo, e um lote antigo pode voltar a ser usado (escolher do histórico);
- o laudo de incubação usa o lote que estava em uso NAQUELE dia (`lote_em_uso`), então trocar hoje não muda o passado;
- o laudo "Controle de Qualidade e Aceitação de Meios de Cultura" tem uma folha por meio, 33 linhas; o bloco
  Analista / Responsável fica em branco (assinatura à mão);
- o histórico em papel entra uma vez por um CSV que o Admin envia (os números reais nunca vão para o Git).
"""

import csv
import io
from datetime import date, datetime, time, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from labflow_api import laudos, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/meios", tags=["meios e lotes"])

MEIOS = ("OSA", "PDA", "PCA", "Wort")
Meio = Literal["OSA", "PDA", "PCA", "Wort"]
MODELO = "meios-cultura"
LINHAS_POR_FOLHA = 33
TABELA = laudos.Tabela(colunas=(41.1, 119.1, 197.1, 289.2, 381.3, 445.1, 572.7), topo=192.55, base=650.2, linhas=LINHAS_POR_FOLHA)


class Periodo(BaseModel):
    desde: str  # dd/mm/aaaa
    ate: str | None  # nulo: ainda em uso


class Lote(BaseModel):
    id: int
    lote: str
    recebido_em: date
    conservacao: str
    ph: str
    observacao: str | None
    quem: str
    em_uso: bool
    usos: list[Periodo]


class EmUso(BaseModel):
    lote_id: int
    lote: str
    desde: str  # dd/mm/aaaa HH:MM
    quem: str


class DoMeio(BaseModel):
    meio: str
    em_uso: EmUso | None
    lotes: list[Lote]  # o mais novo primeiro


class MeiosELotes(BaseModel):
    pode_registrar: bool
    pode_importar: bool
    meios: list[DoMeio]


def _quando(valor: datetime, hora: bool = False) -> str:
    return valor.astimezone(FUSO).strftime("%d/%m/%Y %H:%M" if hora else "%d/%m/%Y")


def lote_em_uso(con: psycopg.Connection, meio: str, dia: date) -> str | None:
    """O lote do meio NAQUELE dia, sozinho (decidido em 24/10): o que estava marcado em uso no dia (o último que passou a
    ser usado até o fim do dia e não tinha saído antes dele); sem marcação que cubra o dia (ex.: antes da carga do
    histórico), o último lote recebido até o dia. Trocar o lote em uso muda o laudo a partir daquele dia."""
    comeco = datetime.combine(dia, time.min, FUSO)
    fim = comeco + timedelta(days=1)
    linha = con.execute(
        """
        SELECT l.lote FROM app.uso_lote_meio u JOIN app.lotes_meio l ON l.id = u.lote_meio_id
        WHERE u.meio = %s AND u.desde < %s AND (u.ate IS NULL OR u.ate > %s) AND u.ate IS DISTINCT FROM u.desde
        ORDER BY u.desde DESC LIMIT 1
        """,
        (meio, fim, comeco),
    ).fetchone()
    if linha is None:
        linha = con.execute(
            """
            SELECT lote FROM app.lotes_meio WHERE meio = %s AND excluido_em IS NULL AND recebido_em <= %s
            ORDER BY recebido_em DESC, id DESC LIMIT 1
            """,
            (meio, dia),
        ).fetchone()
    return linha[0] if linha else None


def _tudo(con: psycopg.Connection, pessoa: PessoaLogada) -> MeiosELotes:
    usos: dict[int, list[Periodo]] = {}
    for lote_id, desde, ate in con.execute(
        "SELECT lote_meio_id, desde, ate FROM app.uso_lote_meio WHERE ate IS DISTINCT FROM desde ORDER BY desde DESC"
    ):  # período vazio = marcação anulada pela correção da data
        usos.setdefault(lote_id, []).append(Periodo(desde=_quando(desde), ate=_quando(ate) if ate else None))
    em_uso = {
        meio: EmUso(lote_id=i, lote=lote, desde=_quando(desde, hora=True), quem=quem)
        for meio, i, lote, desde, quem in con.execute(
            """
            SELECT u.meio, l.id, l.lote, u.desde, coalesce(us.nome, c.usuario)
            FROM app.uso_lote_meio u JOIN app.lotes_meio l ON l.id = u.lote_meio_id
            JOIN usuarios us ON us.id = u.marcado_por LEFT JOIN app.credenciais c ON c.usuario_id = u.marcado_por
            WHERE u.ate IS NULL
            """
        )
    }
    por_meio: dict[str, list[Lote]] = {m: [] for m in MEIOS}
    for i, meio, lote, recebido, conservacao, ph, obs, quem in con.execute(
        """
        SELECT l.id, l.meio, l.lote, l.recebido_em, l.conservacao, l.ph, l.observacao, coalesce(u.nome, c.usuario)
        FROM app.lotes_meio l JOIN usuarios u ON u.id = l.cadastrado_por LEFT JOIN app.credenciais c ON c.usuario_id = l.cadastrado_por
        WHERE l.excluido_em IS NULL ORDER BY l.recebido_em DESC, l.id DESC
        """
    ):
        por_meio[meio].append(
            Lote(
                id=i, lote=lote, recebido_em=recebido, conservacao=conservacao, ph=ph, observacao=obs, quem=quem,
                em_uso=meio in em_uso and em_uso[meio].lote_id == i, usos=usos.get(i, []),
            )
        )
    return MeiosELotes(
        pode_registrar=pode(pessoa.cargo, "registrar_analise"), pode_importar=pode(pessoa.cargo, "configurar_turnos"),
        meios=[DoMeio(meio=m, em_uso=em_uso.get(m), lotes=por_meio[m]) for m in MEIOS],
    )


@roteador.get("", response_model=MeiosELotes)
def ver(pessoa: PessoaLogada = Depends(exigir("ver_paginas")), con: psycopg.Connection = Depends(obter_conexao)) -> MeiosELotes:
    return _tudo(con, pessoa)


class NovoLote(BaseModel):
    meio: Meio
    lote: str = Field(max_length=30)
    recebido_em: date
    conservacao: str = Field(default="OK", max_length=20)
    ph: str = Field(default="OK", max_length=20)
    observacao: str | None = Field(default=None, max_length=200)
    usar: bool = False  # já passa a ser o lote em uso


def _inserir(con: psycopg.Connection, quem: int, meio: str, lote: str, recebido: date, conservacao: str, ph: str, obs: str | None) -> int | None:
    """Grava o recebimento do lote na folha do meio; devolve None se ele já estava cadastrado (mesmo lote e data)."""
    if con.execute(
        "SELECT 1 FROM app.lotes_meio WHERE meio = %s AND lower(trim(lote)) = lower(trim(%s)) AND recebido_em = %s AND excluido_em IS NULL",
        (meio, lote, recebido),
    ).fetchone():
        return None
    return con.execute(
        """
        INSERT INTO app.lotes_meio (meio, lote, recebido_em, conservacao, ph, observacao, cadastrado_por, cadastrado_em, pagina_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, clock_timestamp(), %s) RETURNING id
        """,
        (meio, lote, recebido, conservacao, ph, obs, quem, laudos.pagina_com_vaga(con, f"meios-{meio}")),
    ).fetchone()[0]


def _usar(con: psycopg.Connection, quem: int, lote_id: int) -> None:
    meio = con.execute("SELECT meio FROM app.lotes_meio WHERE id = %s AND excluido_em IS NULL", (lote_id,)).fetchone()
    if meio is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lote não encontrado.")
    atual = con.execute("SELECT lote_meio_id FROM app.uso_lote_meio WHERE meio = %s AND ate IS NULL", meio).fetchone()
    if atual and atual[0] == lote_id:
        return  # já está em uso
    con.execute("UPDATE app.uso_lote_meio SET ate = clock_timestamp() WHERE meio = %s AND ate IS NULL", meio)
    con.execute(
        "INSERT INTO app.uso_lote_meio (meio, lote_meio_id, desde, marcado_por) VALUES (%s, %s, clock_timestamp(), %s)",
        (meio[0], lote_id, quem),
    )


def _texto(valor: str | None, padrao: str | None = None) -> str | None:
    limpo = " ".join((valor or "").split())
    return limpo or padrao


@roteador.post("", response_model=MeiosELotes, status_code=status.HTTP_201_CREATED)
def cadastrar(
    pedido: NovoLote, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> MeiosELotes:
    lote = _texto(pedido.lote)
    if not lote:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Informe o número do lote.")
    hoje = datetime.now(FUSO).date()
    if pedido.recebido_em > hoje:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A data do recebimento não pode ser no futuro.")
    novo = _inserir(
        con, pessoa.usuario_id, pedido.meio, lote, pedido.recebido_em,
        _texto(pedido.conservacao, "OK"), _texto(pedido.ph, "OK"), _texto(pedido.observacao),
    )
    if novo is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"O lote {lote} de {pedido.meio} recebido nesse dia já está cadastrado.")
    if pedido.usar:
        _usar(con, pessoa.usuario_id, novo)
    return _tudo(con, pessoa)


@roteador.post("/{lote_id}/usar", response_model=MeiosELotes)
def usar(
    lote_id: int, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> MeiosELotes:
    """Passa a usar este lote (o anterior do mesmo meio sai de uso agora). Vale também para voltar a um lote antigo."""
    _usar(con, pessoa.usuario_id, lote_id)
    return _tudo(con, pessoa)


class Exclusao(BaseModel):
    motivo: str = Field(max_length=300)


class EmUsoDesde(BaseModel):
    desde: date


@roteador.put("/{meio}/em-uso-desde", response_model=MeiosELotes)
def corrigir_em_uso_desde(
    meio: str,
    pedido: EmUsoDesde,
    pessoa: PessoaLogada = Depends(exigir("registrar_analise")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> MeiosELotes:
    """O lote em uso já era usado antes de ser marcado no app: a data de início volta para o dia certo, e os laudos
    daqueles dias (incubação) passam a mostrar este lote. As marcações de outros lotes do mesmo meio que ficarem dentro do
    período corrigido são anuladas (o período delas vira vazio; nada é apagado), e a que estava aberta antes termina no
    novo início. Não pode passar de hoje."""
    atual = con.execute("SELECT id FROM app.uso_lote_meio WHERE meio = %s AND ate IS NULL", (meio,)).fetchone()
    if atual is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nenhum lote em uso neste meio.")
    hoje = rotas_turno._agora(con).astimezone(FUSO).date()
    if pedido.desde > hoje:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A data não pode ser depois de hoje.")
    novo = datetime.combine(pedido.desde, time.min, FUSO)
    # marcações que começaram depois do novo início: ficam sem período (ate = desde)
    con.execute(
        "UPDATE app.uso_lote_meio SET ate = desde WHERE meio = %s AND id <> %s AND desde >= %s AND ate IS DISTINCT FROM desde",
        (meio, atual[0], novo),
    )
    # a que começou antes e ainda valia depois do novo início: termina nele
    con.execute(
        "UPDATE app.uso_lote_meio SET ate = %s WHERE meio = %s AND id <> %s AND desde < %s AND ate > %s",
        (novo, meio, atual[0], novo, novo),
    )
    con.execute("UPDATE app.uso_lote_meio SET desde = %s WHERE id = %s", (novo, atual[0]))
    return _tudo(con, pessoa)


@roteador.post("/{lote_id}/excluir", response_model=MeiosELotes)
def excluir(
    lote_id: int, pedido: Exclusao, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> MeiosELotes:
    """Cadastro errado: sai da lista e do laudo, mas fica guardado. Lote que já foi usado não se exclui."""
    if len(pedido.motivo.strip()) < 5:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o motivo da exclusão.")
    if con.execute("SELECT 1 FROM app.uso_lote_meio WHERE lote_meio_id = %s", (lote_id,)).fetchone():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Esse lote já foi usado: ele fica no histórico.")
    feito = con.execute(
        "UPDATE app.lotes_meio SET excluido_por = %s, excluido_em = clock_timestamp(), motivo_exclusao = %s WHERE id = %s AND excluido_em IS NULL",
        (pessoa.usuario_id, pedido.motivo.strip(), lote_id),
    ).rowcount
    if not feito:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lote não encontrado.")
    return _tudo(con, pessoa)


class Importacao(BaseModel):
    importados: int
    ja_existiam: int
    erros: list[str]


def _data_do_csv(texto: str) -> date:
    texto = texto.strip()
    for formato in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%d.%m.%y", "%d/%m/%y"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    raise ValueError(f"data inválida: {texto}")


@roteador.put("/importar", response_model=Importacao)
async def importar(
    pedido: Request, pessoa: PessoaLogada = Depends(exigir("configurar_turnos")), con: psycopg.Connection = Depends(obter_conexao)
) -> Importacao:
    """Carga do histórico em papel (uma vez): CSV `meio;lote;recebido_em;conservacao;ph;observacao;em_uso`.

    Linhas já cadastradas (mesmo meio, lote e data) são puladas; `em_uso` = "sim" marca o lote em uso do meio.
    """
    bruto = (await pedido.body()).decode("utf-8-sig", errors="replace")
    if len(bruto) > 200_000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Arquivo grande demais.")
    separador = ";" if bruto.count(";") >= bruto.count(",") else ","
    linhas = [l for l in csv.reader(io.StringIO(bruto), delimiter=separador) if any(c.strip() for c in l)]
    if linhas and linhas[0] and linhas[0][0].strip().lower() == "meio":
        linhas = linhas[1:]  # cabeçalho
    validas, erros = [], []
    for n, l in enumerate(linhas, start=1):
        l = (l + [""] * 7)[:7]
        meio = next((m for m in MEIOS if m.lower() == l[0].strip().lower()), None)
        try:
            if meio is None:
                raise ValueError(f"meio desconhecido: {l[0].strip() or '(vazio)'}")
            if not l[1].strip():
                raise ValueError("lote vazio")
            validas.append((meio, l[1].strip(), _data_do_csv(l[2]), _texto(l[3], "OK"), _texto(l[4], "OK"), _texto(l[5]) if l[5].strip() not in ("-", "") else None, l[6].strip().lower() in ("sim", "s", "x", "1")))
        except ValueError as e:
            erros.append(f"linha {n}: {e}")
    if erros:
        return Importacao(importados=0, ja_existiam=0, erros=erros)  # nada é gravado se alguma linha estiver errada
    importados = ja = 0
    for meio, lote, recebido, conservacao, ph, obs, em_uso in sorted(validas, key=lambda v: (v[0], v[2])):
        novo = _inserir(con, pessoa.usuario_id, meio, lote, recebido, conservacao, ph, obs)
        if novo is None:
            ja += 1
            continue
        importados += 1
        if em_uso:
            _usar(con, pessoa.usuario_id, novo)
    return Importacao(importados=importados, ja_existiam=ja, erros=[])


# --- laudo LAB/090: uma folha por meio --------------------------------------------------------------------------------


def _gerar(meio: str):
    def gerar(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
        celulas = []
        for n, (recebido, lote, conservacao, ph, obs) in enumerate(
            con.execute(
                """
                SELECT recebido_em, lote, conservacao, ph, observacao FROM app.lotes_meio
                WHERE pagina_id = %s AND excluido_em IS NULL ORDER BY recebido_em, id
                """,
                (pagina_id,),
            )
        ):
            for coluna, texto in enumerate((recebido.strftime("%d.%m.%Y"), meio.upper() if meio == "Wort" else meio, lote, conservacao, ph, obs or "-")):
                celulas.append(TABELA.celula(texto, n, coluna, tamanho=9))
        return laudos.preencher(modelo, DEMONSTRACAO, celulas)

    return gerar


DEMONSTRACAO = laudos.demonstracao(
    "Controle de Qualidade e Aceitação de Meios de Cultura", TABELA,
    ("Data receb.", "Meio de cultura", "Número do lote", "Estado conservação", "pH", "Observação"),
)

for _meio in MEIOS:
    laudos.registrar(
        laudos.Laudo(
            nome=f"meios-{_meio}", titulo=f"Meios de cultura · {_meio}", modelo=MODELO, capacidade=LINHAS_POR_FOLHA,
            contar_sql="SELECT count(*), min(recebido_em), max(recebido_em) FROM app.lotes_meio WHERE pagina_id = %s AND excluido_em IS NULL",
            gerar=_gerar(_meio), traco=TABELA,
        )
    )
