"""Controle de Meio de Cultura / Fluxo Laminar: o branco do dia (capela e cada meio em uso) e o laudo.

Spec: 07-app-pwa.md (v1.0), §7.5 Branco do dia. Tarefa: APP-038. Tabela da migration 063.

Regras (decididas com o Danyllo em 24/10): um dia de análise por linha; tudo começa em "<1"; Wort e PCA ficam com "-"
nos dias sem análise que use esses meios (Wort = tanques de NFC; PCA = águas, baias e linhas): o app sugere, o
analista confirma ou troca. Quem salva é o responsável. Vale a versão de 2024 do modelo (LAB/001, capela em UFC/50 cm²).

Desde 25/10 (APP-067, pedido do Danyllo) o branco é AUTOMÁTICO: todo dia que teve análise (plaqueamento de recebimento,
concentrado, embarque, tanques, NFC, águas, baias ou linhas) já entra preenchido com a sugestão (capela e OSA/PDA "<1";
Wort e PCA "<1" ou "-" conforme o dia), sem o analista registrar; ele só corrige se algo crescer. O app preenche os dias
anteriores (até 7 dias, o dia de hoje fica para amanhã, quando já se sabe tudo o que foi plaqueado) na primeira vez que
alguém do laboratório abre o app; o responsável é essa pessoa.
"""

from datetime import date, timedelta

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from labflow_api import laudo_asseptico, laudo_esterilizacao, laudos, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/fluxo-laminar", tags=["fluxo laminar"])

CAMPOS = ("capela_ct", "capela_bl", "osa", "pda", "wort", "pca")
DUAS_PLACAS = "<1|<1"  # a capela tem duas placas por meio (direita e esquerda), como no papel (pedido de 25/10)


class Valores(BaseModel):
    capela_ct: str
    capela_bl: str
    osa: str
    pda: str
    wort: str
    pca: str


class Registro(Valores):
    quem: str
    quando: str


class DiaDoFluxo(BaseModel):
    dia: date
    pode_preencher: bool
    registro: Registro | None
    sugestao: Valores
    motivo_wort: str  # por que o app sugeriu "<1" ou "-"
    motivo_pca: str
    recentes: list[date]


def _hoje(con: psycopg.Connection) -> date:
    return rotas_turno._agora(con).astimezone(FUSO).date()


def _sugestao(con: psycopg.Connection, dia: date) -> tuple[Valores, str, str]:
    tanques = con.execute(
        "SELECT count(DISTINCT coleta_id) FROM bi.leituras_nfc WHERE data_coleta = %s AND analise ILIKE 'Psicrotr%%'", (dia,)
    ).fetchone()[0]
    aguas = con.execute(
        """
        SELECT (SELECT count(*) FROM app.coletas_agua_processo WHERE excluida_em IS NULL
                  AND (coletada_em AT TIME ZONE 'America/Sao_Paulo')::date = %(dia)s)
             + (SELECT count(*) FROM app.coletas_superficie WHERE excluida_em IS NULL AND analisada_em = %(dia)s)
        """,
        {"dia": dia},
    ).fetchone()[0]
    valores = Valores(capela_ct=DUAS_PLACAS, capela_bl=DUAS_PLACAS, osa="<1", pda="<1", wort="<1" if tanques else "-", pca="<1" if aguas else "-")
    motivo_wort = f"{tanques} tanque(s) de NFC no dia" if tanques else "nenhum tanque de NFC no dia"
    motivo_pca = f"{aguas} coleta(s) de água, baia ou linha no dia" if aguas else "nenhuma água, baia ou linha no dia"
    return valores, motivo_wort, motivo_pca


def _houve_analise(con: psycopg.Connection, dia: date) -> bool:
    """O dia teve plaqueamento (fora TAB e Coliformes, que não usam a capela) ou água, baia ou linha."""
    return con.execute(
        """
        SELECT EXISTS (SELECT 1 FROM bi.incubacao WHERE dia_incubacao = %(dia)s AND tipo NOT IN ('TAB', 'Coliformes'))
            OR EXISTS (SELECT 1 FROM app.coletas_agua_processo WHERE excluida_em IS NULL
                         AND (coletada_em AT TIME ZONE 'America/Sao_Paulo')::date = %(dia)s)
            OR EXISTS (SELECT 1 FROM app.coletas_superficie WHERE excluida_em IS NULL AND analisada_em = %(dia)s)
        """,
        {"dia": dia},
    ).fetchone()[0]


def preencher_sozinho(con: psycopg.Connection, quem: int) -> int:
    """Preenche o branco dos 7 dias anteriores que tiveram análise e ainda não têm branco. Devolve quantos preencheu."""
    hoje = _hoje(con)
    feitos = {d for (d,) in con.execute("SELECT dia FROM app.fluxo_laminar WHERE dia BETWEEN %s AND %s", (hoje - timedelta(days=7), hoje))}
    preenchidos = 0
    for atras in range(7, 0, -1):  # do mais antigo para o mais novo: as linhas do laudo ficam na ordem dos dias
        dia = hoje - timedelta(days=atras)
        if dia in feitos or not _houve_analise(con, dia):
            continue
        valores, _, _ = _sugestao(con, dia)
        con.execute(
            """
            INSERT INTO app.fluxo_laminar (dia, capela_ct, capela_bl, osa, pda, wort, pca, preenchido_por, preenchido_em, pagina_id)
            VALUES (%(dia)s, %(capela_ct)s, %(capela_bl)s, %(osa)s, %(pda)s, %(wort)s, %(pca)s, %(quem)s, clock_timestamp(), %(pagina)s)
            ON CONFLICT (dia) DO NOTHING
            """,
            {**valores.model_dump(), "quem": quem, "dia": dia, "pagina": laudos.pagina_com_vaga(con, "fluxo-laminar")},
        )
        preenchidos += 1
    return preenchidos


def _dia(con: psycopg.Connection, pessoa: PessoaLogada, dia: date) -> DiaDoFluxo:
    linha = con.execute(
        """
        SELECT f.capela_ct, f.capela_bl, f.osa, f.pda, f.wort, f.pca, coalesce(u.nome, c.usuario), f.preenchido_em
        FROM app.fluxo_laminar f JOIN usuarios u ON u.id = f.preenchido_por LEFT JOIN app.credenciais c ON c.usuario_id = f.preenchido_por
        WHERE f.dia = %s
        """,
        (dia,),
    ).fetchone()
    registro = None
    if linha:
        registro = Registro(**dict(zip(CAMPOS, linha[:6])), quem=linha[6], quando=linha[7].astimezone(FUSO).strftime("%d/%m %H:%M"))
    sugestao, mw, mp = _sugestao(con, dia)
    recentes = [d for (d,) in con.execute("SELECT dia FROM app.fluxo_laminar ORDER BY dia DESC LIMIT 10")]
    return DiaDoFluxo(
        dia=dia, pode_preencher=pode(pessoa.cargo, "registrar_analise"), registro=registro, sugestao=sugestao,
        motivo_wort=mw, motivo_pca=mp, recentes=recentes,
    )


@roteador.get("", response_model=DiaDoFluxo)
def ver(
    dia: date | None = Query(default=None),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> DiaDoFluxo:
    if pode(pessoa.cargo, "registrar_analise"):
        preencher_sozinho(con, pessoa.usuario_id)
    return _dia(con, pessoa, dia or _hoje(con))


class Preenchimento(BaseModel):
    capela_ct: str = Field(default="<1|<1", max_length=10)
    capela_bl: str = Field(default="<1|<1", max_length=10)
    osa: str = Field(default="<1", max_length=10)
    pda: str = Field(default="<1", max_length=10)
    wort: str = Field(default="-", max_length=10)
    pca: str = Field(default="-", max_length=10)


@roteador.put("/{dia}", response_model=DiaDoFluxo)
def preencher(
    dia: date, pedido: Preenchimento, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> DiaDoFluxo:
    if not laudo_asseptico.dia_valido(dia, _hoje(con)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha hoje ou um dos 7 dias anteriores.")
    valores = {c: ("".join(getattr(pedido, c).split()) or ("-" if c in ("wort", "pca") else "<1")) for c in CAMPOS}
    if con.execute("SELECT 1 FROM app.fluxo_laminar WHERE dia = %s", (dia,)).fetchone():
        con.execute(
            """
            UPDATE app.fluxo_laminar SET capela_ct = %(capela_ct)s, capela_bl = %(capela_bl)s, osa = %(osa)s, pda = %(pda)s,
                   wort = %(wort)s, pca = %(pca)s, preenchido_por = %(quem)s, preenchido_em = clock_timestamp() WHERE dia = %(dia)s
            """,
            {**valores, "quem": pessoa.usuario_id, "dia": dia},
        )
    else:
        con.execute(
            """
            INSERT INTO app.fluxo_laminar (dia, capela_ct, capela_bl, osa, pda, wort, pca, preenchido_por, preenchido_em, pagina_id)
            VALUES (%(dia)s, %(capela_ct)s, %(capela_bl)s, %(osa)s, %(pda)s, %(wort)s, %(pca)s, %(quem)s, clock_timestamp(), %(pagina)s)
            """,
            {**valores, "quem": pessoa.usuario_id, "dia": dia, "pagina": laudos.pagina_com_vaga(con, "fluxo-laminar")},
        )
    return _dia(con, pessoa, dia)


# --- laudo (LAB/001, versão de 2024): 39 dias por folha ------------------------------------------------------------------

TABELA = laudos.Tabela(
    colunas=(28.9, 101.1, 160.0, 223.7, 278.2, 331.9, 389.6, 447.5, 514.3, 584.5), topo=173.66, base=693.58, linhas=39
)
DEMONSTRACAO = laudos.demonstracao(
    "Controle de Meio de Cultura / Fluxo Laminar", TABELA, ("Data", "Capela C.T.", "Capela B.L.", "OSA", "PDA", "Wort", "PCA", "Nome", "Visto")
)


# Quando cada placa pode ser lida, em dias depois do plaqueamento (o método: OSA/PCA 48 h, PDA 72 h e 120 h, Wort 240 h); a
# capela segue o meio da contagem (C.T. no OSA, B.L. no PDA). Antes disso a célula fica em branco: "<1" ainda não é resultado.
LIDO_EM = {"capela_ct": 2, "capela_bl": 5, "osa": 2, "pda": 5, "wort": 10, "pca": 2}


def _no_laudo(campo: str, valor: str, dia: date, hoje: date) -> str:
    if valor == "-":
        return valor
    if hoje < dia + timedelta(days=LIDO_EM[campo]):
        return ""
    if campo.startswith("capela") and valor == "<1":
        return DUAS_PLACAS  # linhas gravadas antes de 25/10, com uma placa só
    return valor


def _gerar(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    """A folha como o papel (25/10): Times 10, data dd.mm.aaaa, capela "<1|<1", o meio só depois de lido e, na folha
    marcada como impressa, o traço que fecha as linhas vazias."""
    hoje = _hoje(con)
    celulas = []
    linhas = con.execute(
        """
        SELECT f.dia, f.capela_ct, f.capela_bl, f.osa, f.pda, f.wort, f.pca, coalesce(u.nome, c.usuario)
        FROM app.fluxo_laminar f JOIN usuarios u ON u.id = f.preenchido_por LEFT JOIN app.credenciais c ON c.usuario_id = f.preenchido_por
        WHERE f.pagina_id = %s ORDER BY f.dia
        """,
        (pagina_id,),
    ).fetchall()
    for n, (dia, *valores, quem) in enumerate(linhas):
        textos = [dia.strftime("%d.%m.%Y"), *(_no_laudo(c, v, dia, hoje) for c, v in zip(CAMPOS, valores)),
                  laudo_esterilizacao.primeiro_nome(quem)]
        for i, texto in enumerate(textos):
            celulas.append(TABELA.celula(texto, n, i, tamanho=10))
    impressa = con.execute("SELECT impresso_em IS NOT NULL FROM app.paginas_laudo WHERE id = %s", (pagina_id,)).fetchone()[0]
    traco = TABELA.traco_das_vazias(len(linhas)) if impressa else None
    return laudos.preencher(modelo, DEMONSTRACAO, celulas, riscos=[traco] if traco else None)


laudos.registrar(
    laudos.Laudo(
        nome="fluxo-laminar", titulo="Controle de meio de cultura e fluxo laminar", modelo="fluxo-laminar", capacidade=TABELA.linhas,
        contar_sql="SELECT count(*), min(dia), max(dia) FROM app.fluxo_laminar WHERE pagina_id = %s",
        gerar=_gerar,
    )
)
