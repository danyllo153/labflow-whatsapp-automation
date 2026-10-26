"""Controle de Incubação e Leitura (LAB/001): um dia de incubação por bloco, com as amostras, os lotes e as leituras.

Spec: rumo-do-app.md, "Laudos automáticos", e 07-app-pwa.md §7.6. Tarefas: APP-040 e APP-050. Migration 065 (lugar de
cada dia na folha) e a 038 do bot (view `bi.incubacao`).

Regras (PB10 e o padrão de escrita do Danyllo, 24/10):
- o dia da incubação é o do plaqueamento: tanque = `data_analise` do comando de análise (o ST leva a data que o analista
  disser, sem somar dia); recebimento e embarque = o dia em que chegam; recebimento NFC = a data do comando; água do
  processo = o dia da coleta; baias e linhas = o dia da análise. TAB e Coliformes não entram;
- a descrição é UM texto por dia, nesta ordem, grupos separados por "; " e ponto no fim:
  REC (recebimento de FCOJ) → embarque de FCOJ → tanques de navio → tanques terra (TQ) → água do processo → baias →
  linhas → NFC (recebimento NFC). Ex.: "REC: 44444 (1-10, 12), 44445 (39-42); O.SKY-123: 43222 (A1-A5);
  O.SKY-123: 1C, 2P, 2S (N); TQ: 44, 45 (N), 46 (ST); Água do processo: MN, C5, C6; Baias: 2,3,4,4,5; Linhas: 1,2,4;
  NFC: 43777 (123).";
  · lotes entre parênteses, números seguidos em faixa; no embarque, depois do ":" vêm os loads com as amostras (A1-A5);
  · tanques: o navio pelo nome e viagem ("O.SKY-123:"), os de terra com "TQ:"; o frasco vai no fim de cada sequência de
    tanques com o mesmo frasco: (N), (ST) ou (N,ST) quando os dois foram feitos no dia;
  · NFC: o load e os lotes, sem fresh/past nem diluição;
  · água do processo por extenso, só os pontos coletados: MN (Manifold), C4, C5, C6 (Câmaras);
  · "Baia:"/"Linha:" no singular com uma amostra e "Baias:"/"Linhas:" com mais; os números podem repetir;
- meios: C.T. em OSA (suco, NFC, tanques e água do processo); B.L. em PDA (todos); PCA só com baia ou linha (a água do
  processo NÃO usa PCA neste laudo); Wort só com tanque (terra ou navio). Meio sem amostra sai "-", e a leitura também;
- leituras: OSA/PCA 48 h (+2 dias), PDA 72 h (+3) e 120 h (+5), Wort 240 h (+10); o lote é o que estava em uso NAQUELE dia;
- o dia entra na folha quando fecha (no dia seguinte), na ordem; o conteúdo é lido na hora de gerar o PDF. Texto que não
  cabe nas 4 linhas continua no bloco de baixo, com a mesma data, os mesmos lotes e as mesmas leituras (o bloco nunca
  ganha linha a mais). Nome e Visto do responsável ficam em branco (à mão).
"""

import dataclasses
import math
import re
from datetime import date, timedelta

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from reportlab.pdfbase.pdfmetrics import stringWidth

from labflow_api import laudos, rotas_turno
from labflow_api.dependencias import PessoaLogada, obter_conexao
from labflow_api.permissoes import exigir
from labflow_api.rotas_meios import lote_em_uso
from labflow_api.rotas_turno import FUSO

roteador = APIRouter(prefix="/incubacao", tags=["incubação"])

NOME = "incubacao"
BLOCOS_POR_FOLHA = 7
LINHAS_POR_BLOCO = 4
FONTE_DA_DESCRICAO = 10.0  # Times 10 em todas as linhas da descrição, sempre (pedido de 26/10); o que não cabe vai para a de baixo
LARGURA_DA_DESCRICAO = 170  # pontos úteis da coluna "Descrição das amostras" (176 menos as margens)
DIAS_PARA_TRAS = 7  # na primeira vez, a folha começa uma semana antes de hoje (o que veio antes já está no papel)
MEIOS = ("OSA", "PDA", "PCA", "Wort")
LEITURAS = (("48h", 2, ("OSA", "PCA")), ("72h", 3, ("PDA",)), ("120h", 5, ("PDA",)), ("240h", 10, ("Wort",)))
PONTOS_DA_AGUA = (("manifold", "MN"), ("camara4", "C4"), ("camara5", "C5"), ("camara6", "C6"))


class DiaDeIncubacao(BaseModel):
    dia: date
    amostras: list[str]  # as linhas da descrição, como saem no laudo
    meios: dict[str, str | None]  # meio -> lote em uso no dia ("-" quando o meio não foi usado; None = sem lote marcado)
    leituras: dict[str, date | None]  # "48h", "72h", "120h", "240h" -> dia da leitura (None = "-")
    na_folha: bool  # o dia já tem lugar numa folha do laudo


def _hoje(con: psycopg.Connection) -> date:
    return rotas_turno._agora(con).astimezone(FUSO).date()


def _numero(texto: str):
    """Ordem natural: "8" antes de "10"."""
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", texto)]


def _faixas(itens: set[str]) -> str:
    """Números seguidos viram faixa: {1, 2, 3, 5} -> "1-3, 5"; {A1, A2, A3} -> "A1-A3". O resto fica como está."""
    ordem = sorted(itens, key=_numero)
    partes: list[str] = []
    i = 0
    while i < len(ordem):
        m = re.fullmatch(r"(\D*)(\d+)", ordem[i])
        j = i
        if m:
            while j + 1 < len(ordem):
                m2 = re.fullmatch(r"(\D*)(\d+)", ordem[j + 1])
                if not m2 or m2.group(1) != m.group(1) or int(m2.group(2)) != int(m.group(2)) + (j + 1 - i):
                    break
                j += 1
        partes.append(ordem[i] if j - i < 2 else f"{ordem[i]}-{ordem[j]}")
        if 0 < j - i < 2:
            partes += ordem[i + 1 : j + 1]
        i = j + 1
    return ", ".join(partes)


def _navio(nome_e_viagem: str) -> str:
    """"O.SKY 123" -> "O.SKY-123" (a viagem é a última palavra; o nome pode ter espaço)."""
    nome, _, viagem = nome_e_viagem.strip().rpartition(" ")
    return f"{nome}-{viagem}" if nome else viagem


def _tanques(frascos_por_tanque: dict[str, set[str]]) -> str:
    """"1C, 2P, 2S (N)" ou "44, 45 (N), 46 (ST)": o frasco no fim de cada sequência de tanques com o mesmo frasco."""
    ordem = sorted(frascos_por_tanque, key=_numero)
    rotulos = [",".join(f for f in ("N", "ST") if f in frascos_por_tanque[t]) for t in ordem]
    partes = []
    for i, tanque in enumerate(ordem):
        fim_da_sequencia = i == len(ordem) - 1 or rotulos[i + 1] != rotulos[i]
        partes.append(f"{tanque} ({rotulos[i]})" if fim_da_sequencia and rotulos[i] else tanque)
    return ", ".join(partes)


def _ponto(ponto: str) -> str:
    """Baia "08" -> "8" (o número como se escreve no papel)."""
    return str(int(ponto)) if ponto.isdigit() else ponto


def _amostras(con: psycopg.Connection, dia: date) -> tuple[str, set[str]]:
    """O texto da descrição do dia, no padrão do laboratório, e os meios usados."""
    meios: set[str] = set()
    recebimento: dict[str, set[str]] = {}
    embarque: dict[str, dict[str, set[str]]] = {}  # navio -> load -> amostras
    navios: dict[str, dict[str, set[str]]] = {}  # navio -> tanque -> frascos
    terra: dict[str, set[str]] = {}
    nfc: dict[str, set[str]] = {}
    for tipo, frasco, origem, alvo, load, analise in con.execute(
        """
        SELECT tipo, frasco, origem, alvo, load, analise FROM bi.incubacao
        WHERE dia_incubacao = %s AND tipo NOT IN ('TAB', 'Coliformes')
        """,
        (dia,),
    ):
        analise = analise or ""
        if tipo == "Tanque":
            meios.add("OSA" if analise.startswith("CT") else "PDA" if analise.startswith("BL") else "Wort")
            if origem == "Terra":
                terra.setdefault(alvo.removeprefix("Tanque "), set()).add(frasco or "")
            else:
                navio, _, tanque = alvo.rpartition(" tanque ")
                navios.setdefault(_navio(navio), {}).setdefault(tanque, set()).add(frasco or "")
            continue
        meios.add("OSA" if analise.startswith("C.T") else "PDA")
        lote = re.search(r"lote (\S+)", alvo)
        if tipo == "Recebimento":
            recebimento.setdefault(load or "?", set()).add(lote.group(1) if lote else "?")
        elif tipo == "Embarque":
            m = re.fullmatch(r"(.*) L\d+ F\d+ (A\d+)", alvo)
            navio, amostra = (m.group(1), m.group(2)) if m else (alvo, "?")
            embarque.setdefault(_navio(navio), {}).setdefault(load or "?", set()).add(amostra)
        else:  # Recebimento NFC
            nfc.setdefault(load or "?", set()).add(lote.group(1) if lote else "?")

    def por_load(grupo: dict[str, set[str]]) -> str:
        return ", ".join(f"{l} ({_faixas(itens)})" for l, itens in sorted(grupo.items(), key=lambda x: _numero(x[0])))

    grupos = []
    if recebimento:
        grupos.append(f"REC: {por_load(recebimento)}")
    for navio, loads in sorted(embarque.items()):
        grupos.append(f"{navio}: {por_load(loads)}")
    for navio, tanques in sorted(navios.items()):
        grupos.append(f"{navio}: {_tanques(tanques)}")
    if terra:
        grupos.append(f"TQ: {_tanques(terra)}")

    pontos = con.execute(
        """
        SELECT bool_or(manifold), bool_or(camara4), bool_or(camara5), bool_or(camara6) FROM app.coletas_agua_processo
        WHERE excluida_em IS NULL AND (coletada_em AT TIME ZONE 'America/Sao_Paulo')::date = %s
        """,
        (dia,),
    ).fetchone()
    coletados = [sigla for (_, sigla), sim in zip(PONTOS_DA_AGUA, pontos) if sim]
    if coletados:
        grupos.append("Água do processo: " + ", ".join(coletados))
        meios.update(("OSA", "PDA"))
    for tipo, singular, plural in (("Baia", "Baia", "Baias"), ("Linha", "Linha", "Linhas")):
        numeros = [
            _ponto(p)
            for (p,) in con.execute(
                "SELECT ponto FROM app.coletas_superficie WHERE excluida_em IS NULL AND tipo = %s AND analisada_em = %s",
                (tipo, dia),
            )
        ]
        if numeros:
            grupos.append(f"{plural if len(numeros) > 1 else singular}: " + ",".join(sorted(numeros, key=_numero)))
            meios.update(("PCA", "PDA"))
    if nfc:
        grupos.append(f"NFC: {por_load(nfc)}")
    return ("; ".join(grupos) + ".") if grupos else "", meios


def _linhas(texto: str, tamanho: float = FONTE_DA_DESCRICAO) -> list[str]:
    """O texto em linhas que cabem na coluna da descrição (medidas na fonte e no tamanho do laudo), quebrando nos
    espaços; uma lista sem espaço que não cabe ("Linhas: 1,2,3,...") quebra depois de uma vírgula."""

    def cabe(t: str) -> bool:
        return stringWidth(t, laudos.FONTE, tamanho) <= LARGURA_DA_DESCRICAO

    pedacos: list[tuple[str, bool]] = []  # (texto, vai colado no anterior)
    for palavra in texto.split():
        partes = [palavra] if cabe(palavra) else re.findall(r"[^,]+,?", palavra)
        pedacos += [(p, i > 0) for i, p in enumerate(partes)]
    linhas: list[str] = []
    atual = ""
    for pedaco, colado in pedacos:
        tentativa = (atual + pedaco if colado else f"{atual} {pedaco}") if atual else pedaco
        if atual and not cabe(tentativa):
            linhas.append(atual)
            atual = pedaco
        else:
            atual = tentativa
    if atual:
        linhas.append(atual)
    return linhas


def montar_dia(con: psycopg.Connection, dia: date, na_folha: bool | None = None) -> DiaDeIncubacao:
    texto, usados = _amostras(con, dia)
    meios = {m: (lote_em_uso(con, m, dia) if m in usados else "-") for m in MEIOS}
    leituras = {rotulo: (dia + timedelta(days=d) if any(m in usados for m in quais) else None) for rotulo, d, quais in LEITURAS}
    if na_folha is None:
        na_folha = con.execute("SELECT 1 FROM app.incubacao_dias WHERE dia = %s", (dia,)).fetchone() is not None
    return DiaDeIncubacao(dia=dia, amostras=_linhas(texto), meios=meios, leituras=leituras, na_folha=na_folha)


def _blocos(con: psycopg.Connection, dia: date) -> int:
    """Quantos blocos o dia precisa: as linhas da descrição em Times 10, 4 por bloco (no máximo uma folha)."""
    return min(BLOCOS_POR_FOLHA, max(1, math.ceil(len(montar_dia(con, dia, True).amostras) / LINHAS_POR_BLOCO)))


def distribuir(con: psycopg.Connection) -> None:
    """Põe nas folhas, na ordem, os dias que já fecharam. Regra de 26/10: a letra da descrição não diminui; o dia ocupa os
    blocos que precisar e, se não couber no resto da folha, vai inteiro para a próxima. Um dia que cresceu depois (amostra
    registrada atrasada) faz o app refazer os lugares das folhas ainda não impressas (075); a folha impressa não muda.
    Trava para duas telas não dividirem um bloco."""
    con.execute("SELECT pg_advisory_xact_lock(60, hashtext(%s))", (NOME,))
    hoje = _hoje(con)
    inicio = con.execute("SELECT min(dia) FROM app.incubacao_dias").fetchone()[0] or hoje - timedelta(days=DIAS_PARA_TRAS)
    novos = [
        d
        for (d,) in con.execute(
            """
            SELECT dia FROM (
                SELECT dia_incubacao AS dia FROM bi.incubacao WHERE tipo NOT IN ('TAB', 'Coliformes')
                UNION SELECT (coletada_em AT TIME ZONE 'America/Sao_Paulo')::date FROM app.coletas_agua_processo WHERE excluida_em IS NULL
                UNION SELECT analisada_em FROM app.coletas_superficie WHERE excluida_em IS NULL
            ) d
            WHERE dia >= %(inicio)s AND dia < %(hoje)s AND dia NOT IN (SELECT dia FROM app.incubacao_dias)
            ORDER BY dia
            """,
            {"inicio": inicio, "hoje": hoje},
        )
    ]
    # o que está nas folhas abertas (não impressas), na ordem das folhas e dos blocos
    abertos = con.execute(
        """
        SELECT d.dia, d.pagina_id, d.bloco, d.blocos FROM app.incubacao_dias d
        JOIN app.paginas_laudo p ON p.id = d.pagina_id AND p.impresso_em IS NULL
        ORDER BY d.pagina_id, d.bloco
        """
    ).fetchall()
    precisa = {dia: _blocos(con, dia) for dia in [a[0] for a in abertos] + novos}
    if not novos and all(precisa[dia] == blocos for dia, _, _, blocos in abertos):
        return
    paginas = list(dict.fromkeys(pagina for _, pagina, _, _ in abertos))  # as folhas abertas, reaproveitadas na ordem
    con.execute("DELETE FROM app.incubacao_dias WHERE dia = ANY(%s)", ([a[0] for a in abertos],))
    pagina_id, usado = None, BLOCOS_POR_FOLHA
    for dia in sorted(precisa):
        blocos = precisa[dia]
        if usado + blocos > BLOCOS_POR_FOLHA:  # não cabe no resto da folha: o dia inteiro vai para a próxima
            pagina_id = paginas.pop(0) if paginas else con.execute(
                "INSERT INTO app.paginas_laudo (laudo) VALUES (%s) RETURNING id", (NOME,)
            ).fetchone()[0]
            usado = 0
        con.execute(
            "INSERT INTO app.incubacao_dias (dia, pagina_id, bloco, blocos) VALUES (%s, %s, %s, %s)", (dia, pagina_id, usado, blocos)
        )
        usado += blocos


@roteador.get("", response_model=DiaDeIncubacao)
def ver_dia(
    dia: date | None = Query(default=None),
    pessoa: PessoaLogada = Depends(exigir("ver_paginas")),
    con: psycopg.Connection = Depends(obter_conexao),
) -> DiaDeIncubacao:
    """O que o laudo traz (ou vai trazer) para um dia: as amostras, os lotes e as datas de leitura."""
    return montar_dia(con, dia or _hoje(con))


# --- laudo (LAB/001): 7 dias por folha, 4 linhas de amostras em cada --------------------------------------------------

# colunas: descrição | OSA | PDA | PCA | Wort | data da incubação | 48h | 72h | 120h | 240h
COLUNAS = (33.8, 210.4, 245.8, 281.3, 316.8, 352.0, 408.9, 458.6, 494.0, 530.4, 564.8)
TABELA = laudos.Tabela(colunas=COLUNAS, topo=163.4, base=645.0, linhas=BLOCOS_POR_FOLHA * LINHAS_POR_BLOCO)
DEMONSTRACAO = laudos.demonstracao(
    "Controle de Incubação e Leitura", TABELA,
    ("Descrição das amostras", "OSA", "PDA", "PCA", "Wort", "Incubação", "48h", "72h", "120h", "240h"),
)


def _celulas_do_dia(dia: DiaDeIncubacao, bloco: int, blocos: int) -> list[laudos.Celula]:
    """O texto corre pelas linhas dos blocos do dia; cada bloco repete a data, os lotes e as leituras (continuação)."""
    cabem = blocos * LINHAS_POR_BLOCO
    # a descrição sai sempre em Times 10 (26/10): o dia já tem os blocos de que precisa (distribuir); só um dia maior que
    # uma folha inteira (mais de 28 linhas) não cabe, e a última linha avisa o que ficou de fora
    tamanho, amostras = FONTE_DA_DESCRICAO, dia.amostras
    if len(amostras) > cabem:
        amostras = amostras[: cabem - 1] + [f"(+{len(amostras) - cabem + 1} linhas: ver o app)"]
    celulas = [
        dataclasses.replace(TABELA.celula(texto, bloco * LINHAS_POR_BLOCO + i, 0, centro=False, tamanho=tamanho), fixo=True)
        for i, texto in enumerate(amostras)
    ]
    textos = [
        *(dia.meios[m] or "" for m in MEIOS),
        dia.dia.strftime("%d/%m/%y"),
        *(d.strftime("%d/%m") if d else "-" for d in dia.leituras.values()),
    ]
    for b in range(bloco, bloco + blocos):
        topo = TABELA.topo + b * LINHAS_POR_BLOCO * TABELA.altura
        base = topo + LINHAS_POR_BLOCO * TABELA.altura
        for i, texto in enumerate(textos, start=1):
            celulas.append(laudos.Celula(texto, COLUNAS[i], COLUNAS[i + 1], topo, base, tamanho=7.5))
    return celulas


def _gerar(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    celulas = []
    for dia, bloco, blocos in con.execute(
        "SELECT dia, bloco, blocos FROM app.incubacao_dias WHERE pagina_id = %s ORDER BY bloco", (pagina_id,)
    ).fetchall():
        celulas += _celulas_do_dia(montar_dia(con, dia, True), bloco, blocos)
    return laudos.preencher(modelo, DEMONSTRACAO, celulas)


laudos.registrar(
    laudos.Laudo(
        nome=NOME, titulo="Controle de incubação e leitura", modelo="incubacao", capacidade=BLOCOS_POR_FOLHA,
        contar_sql="SELECT coalesce(sum(blocos), 0), min(dia), max(dia) FROM app.incubacao_dias WHERE pagina_id = %s",
        gerar=_gerar, preparar=distribuir,
    )
)
