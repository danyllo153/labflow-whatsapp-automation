"""Águas (aba Páginas): água do processo (Manifold, Câmaras 4, 5 e 6) e limpeza de superfícies (baias e linhas).

Spec: 07-app-pwa.md (v1.0), §5.1 Águas. Tarefa: APP-037. Tabelas das migrations 061 e 062.

Regras (decididas com o Danyllo em 23 e 24/10; meios e tempos do método de análises microbiológicas):
- água do processo: uma coleta (data e hora) com os pontos coletados; C.T. (PCA, 48 h) e B.L. (PDA, 120 h) de cada
  ponto; ponto não coletado sai "-" no laudo; a observação é livre (ex.: "Esterilizando");
- baias (CIP dos mangotes do recebimento) e linhas (CIP das linhas de embarque): uma coleta por ponto, com o dia em que
  foi plaqueada ("Análise dd.mm.aa"), C.T. 48 h, B.L. 72 h e 120 h; uma folha do laudo para baias e outra para linhas;
- o resultado é texto ("<1", número); vazio = ainda não lido, e vira pendência no Início na data prevista;
- quem coleta: Admin, Analista e Coletor; quem lança o resultado: Admin e Analista; excluir guarda o motivo.
"""

import io
import re
from datetime import date, datetime, time, timedelta
from typing import Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from labflow_api import laudo_esterilizacao, laudos, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir, pode
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/aguas", tags=["águas"])

PONTOS = ("manifold", "camara4", "camara5", "camara6")
NOME_DO_PONTO = {"manifold": "Manifold", "camara4": "Câmara 4", "camara5": "Câmara 5", "camara6": "Câmara 6"}
Ponto = Literal["manifold", "camara4", "camara5", "camara6"]
DIAS_PARA_TRAS = 30


def resultado(valor: str | None) -> str | None:
    """'< 1' vira '<1'; vazio é "ainda não lido"."""
    texto = re.sub(r"\s+", "", valor or "")
    if not texto:
        return None
    if len(texto) > 10 or not re.fullmatch(r"[<>]?\d+([.,]\d+)?|-", texto):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Resultado inválido: {valor.strip()}. Use <1 ou um número.")
    return texto


def _hoje(con: psycopg.Connection) -> date:
    return rotas_turno._agora(con).astimezone(FUSO).date()


def _quando(con: psycopg.Connection, dia: date, hora: str) -> datetime:
    if not re.fullmatch(rotas_turno.HORARIO, hora):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Hora no formato HH:MM.")
    quando = datetime.combine(dia, time.fromisoformat(hora), FUSO)
    agora = rotas_turno._agora(con)
    if quando > agora + timedelta(minutes=5) or (agora.astimezone(FUSO).date() - dia).days > DIAS_PARA_TRAS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"A coleta deve ser de hoje ou dos últimos {DIAS_PARA_TRAS} dias.")
    return quando


def _situacao(faltas: list[tuple[str, date]], hoje: date) -> str:
    if not faltas:
        return "Concluída"
    etapa, prevista = faltas[0]
    if prevista < hoje:
        return f"Atrasado: {etapa}"
    if prevista == hoje:
        return f"Vence hoje: {etapa}"
    return f"Aguardando {etapa} ({prevista:%d/%m})"


# --- água do processo -------------------------------------------------------------------------------------------------


class Leitura(BaseModel):
    coletado: bool
    ct: str | None
    bl: str | None


class ColetaAgua(BaseModel):
    id: int
    dia: date
    hora: str
    pontos: dict[str, Leitura]
    observacao: str | None
    quem: str
    resultado_por: str | None
    situacao: str


class AguaDoProcesso(BaseModel):
    pode_coletar: bool
    pode_lancar: bool
    coletas: list[ColetaAgua]  # a mais nova primeiro


AGUA_SQL = """
SELECT c.id, c.coletada_em, c.manifold, c.camara4, c.camara5, c.camara6,
       c.ct_manifold, c.bl_manifold, c.ct_camara4, c.bl_camara4, c.ct_camara5, c.bl_camara5, c.ct_camara6, c.bl_camara6,
       c.observacao, coalesce(u.nome, cu.usuario), coalesce(r.nome, cr.usuario)
FROM app.coletas_agua_processo c JOIN usuarios u ON u.id = c.coletada_por LEFT JOIN app.credenciais cu ON cu.usuario_id = c.coletada_por
LEFT JOIN usuarios r ON r.id = c.resultado_por LEFT JOIN app.credenciais cr ON cr.usuario_id = c.resultado_por
WHERE c.excluida_em IS NULL
"""


def _coleta_agua(linha, hoje: date) -> ColetaAgua:
    id_, em, m, c4, c5, c6, ctm, blm, ct4, bl4, ct5, bl5, ct6, bl6, obs, quem, por = linha
    coletado = dict(zip(PONTOS, (m, c4, c5, c6)))
    valores = {"manifold": (ctm, blm), "camara4": (ct4, bl4), "camara5": (ct5, bl5), "camara6": (ct6, bl6)}
    pontos = {p: Leitura(coletado=coletado[p], ct=valores[p][0], bl=valores[p][1]) for p in PONTOS}
    dia = em.astimezone(FUSO).date()
    faltas = []
    if any(l.coletado and l.ct is None for l in pontos.values()):
        faltas.append(("C.T 48h", dia + timedelta(days=2)))
    if any(l.coletado and l.bl is None for l in pontos.values()):
        faltas.append(("B.L 120h", dia + timedelta(days=5)))
    return ColetaAgua(
        id=id_, dia=dia, hora=rotas_turno._hhmm(em), pontos=pontos, observacao=obs, quem=quem, resultado_por=por,
        situacao=_situacao(faltas, hoje),
    )


def _agua(con: psycopg.Connection, pessoa: PessoaLogada, de: date | None = None) -> AguaDoProcesso:
    hoje = _hoje(con)
    de = de or hoje - timedelta(days=DIAS_PARA_TRAS)
    linhas = con.execute(AGUA_SQL + " AND c.coletada_em >= %s ORDER BY c.coletada_em DESC", (datetime.combine(de, time.min, FUSO),)).fetchall()
    return AguaDoProcesso(
        pode_coletar=pode(pessoa.cargo, "registrar_coleta"), pode_lancar=pode(pessoa.cargo, "registrar_analise"),
        coletas=[_coleta_agua(l, hoje) for l in linhas],
    )


@roteador.get("/processo", response_model=AguaDoProcesso)
def ver_agua(
    de: date | None = Query(default=None),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> AguaDoProcesso:
    return _agua(con, pessoa, de)


class NovaColetaAgua(BaseModel):
    dia: date
    hora: str
    pontos: list[Ponto]
    observacao: str | None = Field(default=None, max_length=60)


def _obs(texto: str | None) -> str | None:
    return " ".join((texto or "").split()) or None


@roteador.post("/processo", response_model=AguaDoProcesso, status_code=status.HTTP_201_CREATED)
def coletar_agua(
    pedido: NovaColetaAgua, pessoa: PessoaLogada = Depends(exigir("registrar_coleta")), con: psycopg.Connection = Depends(obter_conexao)
) -> AguaDoProcesso:
    if not pedido.pontos:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Marque os pontos coletados.")
    quando = _quando(con, pedido.dia, pedido.hora)
    marcados = {p: p in pedido.pontos for p in PONTOS}
    con.execute(
        """
        INSERT INTO app.coletas_agua_processo (coletada_em, manifold, camara4, camara5, camara6, observacao, coletada_por, pagina_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (quando, marcados["manifold"], marcados["camara4"], marcados["camara5"], marcados["camara6"], _obs(pedido.observacao),
         pessoa.usuario_id, laudos.pagina_com_vaga(con, "agua-processo")),
    )
    return _agua(con, pessoa)


class ResultadosAgua(BaseModel):
    ct: dict[Ponto, str] = Field(default_factory=dict)
    bl: dict[Ponto, str] = Field(default_factory=dict)


@roteador.put("/processo/{coleta_id}/resultados", response_model=AguaDoProcesso)
def lancar_agua(
    coleta_id: int, pedido: ResultadosAgua, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> AguaDoProcesso:
    """Lança (ou corrige) C.T. e B.L. dos pontos coletados; vazio apaga a leitura."""
    linha = con.execute(
        "SELECT manifold, camara4, camara5, camara6 FROM app.coletas_agua_processo WHERE id = %s AND excluida_em IS NULL", (coleta_id,)
    ).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coleta não encontrada.")
    coletado = dict(zip(PONTOS, linha))
    mudancas = {}
    for tipo, valores in (("ct", pedido.ct), ("bl", pedido.bl)):
        for ponto, valor in valores.items():
            if not coletado[ponto]:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{NOME_DO_PONTO[ponto]} não foi coletado nessa coleta.")
            mudancas[f"{tipo}_{ponto}"] = resultado(valor)
    if mudancas:
        colunas = ", ".join(f"{c} = %({c})s" for c in mudancas)
        con.execute(
            f"UPDATE app.coletas_agua_processo SET {colunas}, resultado_por = %(quem)s, resultado_em = clock_timestamp() WHERE id = %(id)s",
            {**mudancas, "quem": pessoa.usuario_id, "id": coleta_id},
        )
    return _agua(con, pessoa)


class Exclusao(BaseModel):
    motivo: str = Field(max_length=300)


def _excluir(con: psycopg.Connection, tabela: str, coleta_id: int, pessoa: PessoaLogada, motivo: str) -> None:
    if len(motivo.strip()) < 5:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Escreva o motivo da exclusão.")
    feito = con.execute(
        f"UPDATE app.{tabela} SET excluida_por = %s, excluida_em = clock_timestamp(), motivo_exclusao = %s WHERE id = %s AND excluida_em IS NULL",
        (pessoa.usuario_id, motivo.strip(), coleta_id),
    ).rowcount
    if not feito:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coleta não encontrada.")


@roteador.post("/processo/{coleta_id}/excluir", response_model=AguaDoProcesso)
def excluir_agua(
    coleta_id: int, pedido: Exclusao, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> AguaDoProcesso:
    _excluir(con, "coletas_agua_processo", coleta_id, pessoa, pedido.motivo)
    return _agua(con, pessoa)


# --- baias e linhas (limpeza de superfícies) ---------------------------------------------------------------------------

TipoSuperficie = Literal["Baia", "Linha"]


class ColetaSuperficie(BaseModel):
    id: int
    tipo: str
    ponto: str
    dia: date
    hora: str
    analisada_em: date
    ct_48: str | None
    bl_72: str | None
    bl_120: str | None
    observacao: str | None
    quem: str
    resultado_por: str | None
    situacao: str


class Superficies(BaseModel):
    tipo: str
    pode_coletar: bool
    pode_lancar: bool
    coletas: list[ColetaSuperficie]


SUPERFICIE_SQL = """
SELECT c.id, c.tipo, c.ponto, c.coletada_em, c.analisada_em, c.ct_48, c.bl_72, c.bl_120, c.observacao,
       coalesce(u.nome, cu.usuario), coalesce(r.nome, cr.usuario)
FROM app.coletas_superficie c JOIN usuarios u ON u.id = c.coletada_por LEFT JOIN app.credenciais cu ON cu.usuario_id = c.coletada_por
LEFT JOIN usuarios r ON r.id = c.resultado_por LEFT JOIN app.credenciais cr ON cr.usuario_id = c.resultado_por
WHERE c.excluida_em IS NULL
"""


def _coleta_superficie(linha, hoje: date) -> ColetaSuperficie:
    id_, tipo, ponto, em, analise, ct, bl72, bl120, obs, quem, por = linha
    faltas = [(e, analise + timedelta(days=d)) for e, d, v in (("C.T 48h", 2, ct), ("B.L 72h", 3, bl72), ("B.L 120h", 5, bl120)) if v is None]
    return ColetaSuperficie(
        id=id_, tipo=tipo, ponto=ponto, dia=em.astimezone(FUSO).date(), hora=rotas_turno._hhmm(em), analisada_em=analise,
        ct_48=ct, bl_72=bl72, bl_120=bl120, observacao=obs, quem=quem, resultado_por=por, situacao=_situacao(faltas, hoje),
    )


def _superficies(con: psycopg.Connection, pessoa: PessoaLogada, tipo: str, de: date | None = None) -> Superficies:
    hoje = _hoje(con)
    de = de or hoje - timedelta(days=DIAS_PARA_TRAS)
    linhas = con.execute(
        SUPERFICIE_SQL + " AND c.tipo = %s AND c.coletada_em >= %s ORDER BY c.coletada_em DESC, c.id DESC",
        (tipo, datetime.combine(de, time.min, FUSO)),
    ).fetchall()
    return Superficies(
        tipo=tipo, pode_coletar=pode(pessoa.cargo, "registrar_coleta"), pode_lancar=pode(pessoa.cargo, "registrar_analise"),
        coletas=[_coleta_superficie(l, hoje) for l in linhas],
    )


@roteador.get("/superficies", response_model=Superficies)
def ver_superficies(
    tipo: TipoSuperficie,
    de: date | None = Query(default=None),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> Superficies:
    return _superficies(con, pessoa, tipo, de)


class NovaColetaSuperficie(BaseModel):
    tipo: TipoSuperficie
    pontos: list[str] = Field(min_length=1, max_length=20)  # uma coleta por ponto (ex.: ["08", "10"])
    dia: date
    hora: str
    analisada_em: date | None = None  # padrão: o dia da coleta
    observacao: str | None = Field(default=None, max_length=60)


@roteador.post("/superficies", response_model=Superficies, status_code=status.HTTP_201_CREATED)
def coletar_superficie(
    pedido: NovaColetaSuperficie, pessoa: PessoaLogada = Depends(exigir("registrar_coleta")), con: psycopg.Connection = Depends(obter_conexao)
) -> Superficies:
    quando = _quando(con, pedido.dia, pedido.hora)
    analise = pedido.analisada_em or pedido.dia
    if analise < pedido.dia or (analise - pedido.dia).days > 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "O dia da análise deve ser o da coleta ou até 3 dias depois.")
    pontos = [p.strip().upper().removeprefix(pedido.tipo.upper()).strip() for p in pedido.pontos if p.strip()]
    if not pontos or any(len(p) > 10 or not p for p in pontos):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Informe o número da {pedido.tipo.lower()}.")
    for ponto in pontos:
        con.execute(
            """
            INSERT INTO app.coletas_superficie (tipo, ponto, coletada_em, analisada_em, observacao, coletada_por, pagina_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (pedido.tipo, ponto.zfill(2) if ponto.isdigit() and pedido.tipo == "Baia" else ponto, quando, analise,
             _obs(pedido.observacao), pessoa.usuario_id, laudos.pagina_com_vaga(con, f"superficies-{pedido.tipo}")),
        )
    return _superficies(con, pessoa, pedido.tipo)


class ResultadosSuperficie(BaseModel):
    ct_48: str | None = None
    bl_72: str | None = None
    bl_120: str | None = None


@roteador.put("/superficies/{coleta_id}/resultados", response_model=Superficies)
def lancar_superficie(
    coleta_id: int, pedido: ResultadosSuperficie, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Superficies:
    """Lança só o que veio no pedido (o que não veio fica como estava); texto vazio apaga a leitura."""
    linha = con.execute("SELECT tipo FROM app.coletas_superficie WHERE id = %s AND excluida_em IS NULL", (coleta_id,)).fetchone()
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coleta não encontrada.")
    mudancas = {c: resultado(getattr(pedido, c)) for c in ("ct_48", "bl_72", "bl_120") if c in pedido.model_fields_set}
    if mudancas:
        colunas = ", ".join(f"{c} = %({c})s" for c in mudancas)
        con.execute(
            f"UPDATE app.coletas_superficie SET {colunas}, resultado_por = %(quem)s, resultado_em = clock_timestamp() WHERE id = %(id)s",
            {**mudancas, "quem": pessoa.usuario_id, "id": coleta_id},
        )
    return _superficies(con, pessoa, linha[0])


@roteador.post("/superficies/{coleta_id}/excluir", response_model=Superficies)
def excluir_superficie(
    coleta_id: int, pedido: Exclusao, pessoa: PessoaLogada = Depends(exigir("registrar_analise")), con: psycopg.Connection = Depends(obter_conexao)
) -> Superficies:
    linha = con.execute("SELECT tipo FROM app.coletas_superficie WHERE id = %s", (coleta_id,)).fetchone()
    _excluir(con, "coletas_superficie", coleta_id, pessoa, pedido.motivo)
    return _superficies(con, pessoa, linha[0])


# --- pendências do Início (as leituras que faltam) ----------------------------------------------------------------------

# Mesmo formato do PENDENCIAS_SQL (rotas_pendencias): bloco, tipo, referência, análise, prevista, situação.
PENDENCIAS_AGUAS_SQL = """
    SELECT 'Águas e superfícies', 'Água do processo',
           'Coleta ' || to_char(c.coletada_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'), e.etapa, e.prevista,
           CASE WHEN e.prevista < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Atrasado'
                WHEN e.prevista = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Vence hoje' ELSE 'No prazo' END
    FROM app.coletas_agua_processo c
    CROSS JOIN LATERAL (VALUES
        ('C.T 48h', (c.coletada_em AT TIME ZONE 'America/Sao_Paulo')::date + 2,
         (c.manifold AND c.ct_manifold IS NULL) OR (c.camara4 AND c.ct_camara4 IS NULL)
         OR (c.camara5 AND c.ct_camara5 IS NULL) OR (c.camara6 AND c.ct_camara6 IS NULL)),
        ('B.L 120h', (c.coletada_em AT TIME ZONE 'America/Sao_Paulo')::date + 5,
         (c.manifold AND c.bl_manifold IS NULL) OR (c.camara4 AND c.bl_camara4 IS NULL)
         OR (c.camara5 AND c.bl_camara5 IS NULL) OR (c.camara6 AND c.bl_camara6 IS NULL))
    ) e(etapa, prevista, falta)
    WHERE c.excluida_em IS NULL AND e.falta
    UNION ALL
    SELECT 'Águas e superfícies', s.tipo, s.tipo || ' ' || s.ponto || ' (coleta ' || to_char(s.coletada_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') || ')',
           e.etapa, e.prevista,
           CASE WHEN e.prevista < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Atrasado'
                WHEN e.prevista = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'Vence hoje' ELSE 'No prazo' END
    FROM app.coletas_superficie s
    CROSS JOIN LATERAL (VALUES ('C.T 48h', s.analisada_em + 2, s.ct_48 IS NULL), ('B.L 72h', s.analisada_em + 3, s.bl_72 IS NULL),
                               ('B.L 120h', s.analisada_em + 5, s.bl_120 IS NULL)) e(etapa, prevista, falta)
    WHERE s.excluida_em IS NULL AND e.falta
"""


# --- laudos ----------------------------------------------------------------------------------------------------------

# Água do processo: o modelo é uma folha DIGITALIZADA (imagem 2480 x 3504 a 300 dpi) com a tabela deitada. As medidas
# abaixo são em pixels da imagem: COLUNAS_AGUA ao longo da tabela (de cima para baixo na folha) e LINHAS_AGUA as
# divisas das linhas (da direita para a esquerda na folha, a primeira logo abaixo do cabeçalho).
COLUNAS_AGUA = (41, 233, 453, 676, 906, 1131, 1355, 1578, 1802, 2025, 2248, 2556, 2780, 3002, 3225)
LINHAS_AGUA = (1536, 1480, 1424, 1368, 1311, 1255, 1198, 1142, 1086, 1029, 973, 916, 860, 804, 747, 691, 634, 578, 521, 465, 408, 352, 304, 248)
ESCALA_AGUA = 595.2 / 2480
ALTURA_AGUA = 841.68
CAPACIDADE_AGUA = len(LINHAS_AGUA) - 1


def _demo_agua() -> bytes:
    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=(595.2, ALTURA_AGUA))
    e = ESCALA_AGUA
    c.setLineWidth(0.5)
    for y in COLUNAS_AGUA:
        c.line(LINHAS_AGUA[-1] * e, ALTURA_AGUA - y * e, 1640 * e, ALTURA_AGUA - y * e)
    for x in LINHAS_AGUA + (1640,):
        c.line(x * e, ALTURA_AGUA - COLUNAS_AGUA[0] * e, x * e, ALTURA_AGUA - COLUNAS_AGUA[-1] * e)
    cab = ("Data", "Hora", "Manifold C.T.", "Manifold B.L.", "Câm. 4 C.T.", "Câm. 4 B.L.", "Câm. 5 C.T.", "Câm. 5 B.L.",
           "Câm. 6 C.T.", "Câm. 6 B.L.", "Observação", "Analista", "RCA Visto", "RCA Data")
    for y0, y1, nome in zip(COLUNAS_AGUA, COLUNAS_AGUA[1:], cab):
        c.saveState()
        c.translate(1590 * e, ALTURA_AGUA - (y0 + y1) / 2 * e)
        c.rotate(-90)
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(0, 0, nome)
        c.restoreState()
    c.saveState()
    c.translate(1900 * e, ALTURA_AGUA / 2)
    c.rotate(-90)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(0, 0, "Análise Microbiológica da Água do Processo (modelo de demonstração)")
    c.restoreState()
    c.showPage()
    c.save()
    return saida.getvalue()


def _gerar_agua(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = con.execute(AGUA_SQL + " AND c.pagina_id = %s ORDER BY c.coletada_em, c.id", (pagina_id,)).fetchall()
    celulas = []
    for n, linha in enumerate(linhas[:CAPACIDADE_AGUA]):
        col = _coleta_agua(linha, date.max)
        topo, base = LINHAS_AGUA[n + 1], LINHAS_AGUA[n]
        textos = [col.dia.strftime("%d.%m.%y"), col.hora]
        for p in PONTOS:
            l = col.pontos[p]
            textos += [(l.ct or "") if l.coletado else "-", (l.bl or "") if l.coletado else "-"]
        textos += [col.observacao or "-", laudo_esterilizacao.primeiro_nome(col.quem)]
        for i, texto in enumerate(textos):
            celulas.append(laudos.Celula(texto, COLUNAS_AGUA[i], COLUNAS_AGUA[i + 1], topo, base, tamanho=8))
    return laudos.preencher(modelo, _demo_agua, celulas, deitada={"escala": ESCALA_AGUA, "altura": ALTURA_AGUA})


def _aceitar_agua(pdf: bytes) -> None:
    laudo_esterilizacao.modelo_valido(pdf)  # A4 de uma página (a digitalização vem em pé, com a tabela deitada)


laudos.registrar(
    laudos.Laudo(
        nome="agua-processo", titulo="Análise microbiológica da água do processo", modelo="agua-processo",
        capacidade=CAPACIDADE_AGUA,
        contar_sql="SELECT count(*), min(coletada_em), max(coletada_em) FROM app.coletas_agua_processo WHERE pagina_id = %s AND excluida_em IS NULL",
        gerar=_gerar_agua, aceitar_modelo=_aceitar_agua,
    )
)

# Limpeza de superfícies (LAB/001): medido no PDF oficial; 31 linhas por folha.
TABELA_SUPERFICIE = laudos.Tabela(colunas=(36.2, 92.8, 149.4, 298.3, 348.0, 390.4, 433.0, 559.2), topo=179.54, base=587.26, linhas=31)
DEMO_SUPERFICIE = laudos.demonstracao(
    "Laudo de Análise Microbiológica – Limpeza de Superfícies", TABELA_SUPERFICIE,
    ("Data coleta", "Hora", "Ponto da coleta", "C.T. 48h", "B.L. 72h", "B.L. 120h", "Observação"),
)


def _gerar_superficie(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    celulas = []
    linhas = con.execute(SUPERFICIE_SQL + " AND c.pagina_id = %s ORDER BY c.coletada_em, c.id", (pagina_id,)).fetchall()
    for n, linha in enumerate(linhas[: TABELA_SUPERFICIE.linhas]):
        col = _coleta_superficie(linha, date.max)
        obs = f"Análise {col.analisada_em:%d.%m.%y}" + (f" · {col.observacao}" if col.observacao else "")
        for i, texto in enumerate((col.dia.strftime("%d.%m.%y"), col.hora, f"{col.tipo} {col.ponto}", col.ct_48 or "", col.bl_72 or "", col.bl_120 or "", obs)):
            celulas.append(TABELA_SUPERFICIE.celula(texto, n, i, tamanho=9))
    return laudos.preencher(modelo, DEMO_SUPERFICIE, celulas)


for _tipo in ("Baia", "Linha"):
    laudos.registrar(
        laudos.Laudo(
            nome=f"superficies-{_tipo}", titulo=f"Limpeza de superfícies · {'baias' if _tipo == 'Baia' else 'linhas'}",
            modelo="limpeza-superficies", capacidade=TABELA_SUPERFICIE.linhas,
            contar_sql="SELECT count(*), min(coletada_em), max(coletada_em) FROM app.coletas_superficie WHERE pagina_id = %s AND excluida_em IS NULL",
            gerar=_gerar_superficie,
        )
    )
