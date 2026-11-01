"""Laudos das análises e da contra-amostra: TAB, Coliformes, Howard, NFC (tanques e navios), Embarque e o arquivo.

Spec: rumo-do-app.md, "Laudos automáticos"; 11-arquivo-contra-amostras.md. Pedido do Danyllo de 26/10, com os modelos em
PDF (ficam no banco, enviados pelo Admin na aba Laudo; nunca no Git). A geometria de cada tabela foi medida nesses PDFs.
Como os outros laudos: cada linha (um teste, uma coleta, uma amostra, um load arquivado) entra sozinha numa folha e não
muda mais de lugar (app.laudo_linhas, 076); o texto é lido das tabelas do bot na hora de gerar o PDF; Times 11 (o papel);
a folha marcada como impressa ganha o traço que fecha as linhas vazias (laudos.baixar_pdf).
"""

from datetime import date

import psycopg

from labflow_api import laudo_esterilizacao, laudos
from labflow_api.rotas_analise_recebimento import modelo_deitado_valido

DESDE = date(2026, 10, 20)  # o que entra nas folhas na primeira vez (o que veio antes já está no papel)


def _br(d: date | None, ano: bool = True) -> str:
    return d.strftime("%d/%m/%y" if ano else "%d/%m") if d else ""


def _br4(d: date | None) -> str:
    """A data da contra-amostra, como no papel: 05/11/2028."""
    return d.strftime("%d/%m/%Y") if d else ""


def _placas(placas: dict | None, chave: str) -> str:
    """As 3 placas de uma leitura, como no papel: "<1|<1|2"."""
    p = (placas or {}).get(chave)
    if not p:
        return ""
    return "|".join(p.get(str(i), "") for i in (1, 2, 3))


# --- TAB – Método II (IFU 2019): uma folha por dia de análise, 20 linhas --------------------------------------------------

TAB = laudos.Tabela(colunas=(32.7, 224.1, 309.2, 394.3, 479.3, 564.4), topo=197.1, base=483.1, linhas=20)
TAB_DATA = ((113.0, 146.0), (153.0, 176.0), (183.0, 212.0))  # "Data da Análise: __ / __ / __" (dia, mês, ano)
TAB_DATA_Y = (127.0, 141.0)  # a data em cima do traço (27/10: antes flutuava 4 pt acima)
DEMO_TAB = laudos.demonstracao("TAB – Método II (IFU 2019)", TAB, ("Amostra", "Item", "Fábrica", "TAB", "Guaiacol"))

TESTES_SQL = """
SELECT t.id, t.data_feito, t.status, t.resultado, t.percentual, t.campos_positivos, t.criado_em,
       v.id, v.load, v.item, v.fabrica, v.origem, v.rotulo, lista_compacta(v.lotes), co.tanque, n.nome || ' ' || n.viagem,
       co.data_coleta
FROM testes t
LEFT JOIN vw_compostas v ON v.id = t.composta_id
LEFT JOIN coletas co ON co.id = t.coleta_id
LEFT JOIN navios n ON n.id = co.navio_id
WHERE t.tipo = %(tipo)s AND t.teste_pai_id IS NULL
"""


def _br_ano(d: date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def _amostra(linha: tuple) -> str:
    """A amostra como no papel (pedido de 27/10): "43333 (1-5)" (sem "#" nem "lotes"), "D.SKY 123 L2 F3 43413 (A1-A5)" no
    embarque e o tanque com a data da coleta: "Tanque 47, 26/10/2026" ou "O.SKY 189 · 2P, 26/10/2026" (navio e viagem)."""
    composta, load, origem, rotulo, lotes, tanque, navio, coleta = (
        linha[7], linha[8], linha[11], linha[12], linha[13], linha[14], linha[15], linha[16]
    )
    if composta is None:
        return f"{navio} · {tanque}, {_br_ano(coleta)}" if navio else f"Tanque {tanque}, {_br_ano(coleta)}"
    if origem == "embarque":
        navio_fase = (rotulo or "").replace(" linha ", " L").replace(" fase ", " F")
        return f"{navio_fase} {load} (A{lotes.replace(',', ',A').replace('-', '-A')})"
    return f"{load} ({lotes})"


def _testes(con: psycopg.Connection, tipo: str, ids: list[str]) -> dict[str, tuple]:
    if not ids:
        return {}
    return {
        str(r[0]): r
        for r in con.execute(TESTES_SQL + " AND t.id = ANY(%(ids)s)", {"tipo": tipo, "ids": [int(i) for i in ids]}).fetchall()
    }


def _em_ordem(linhas: list[tuple[str, str]], testes: dict[str, tuple]) -> list[tuple[str, str]]:
    """As compostas do mesmo load uma embaixo da outra, na ordem dos lotes; os tanques no fim (27/10)."""
    def chave(linha: tuple[str, str]) -> tuple:
        t = testes.get(linha[0])
        if not t:
            return (2, "", 0, linha[0])
        if t[7] is None:  # tanque
            return (1, str(t[15] or ""), 0, str(t[14] or ""))
        primeiro = int(str(t[13] or "0").split("-")[0].split(",")[0] or 0)
        return (0, str(t[8] or ""), primeiro, linha[0])
    return sorted(linhas, key=chave)


def _preparar_tab(con: psycopg.Connection) -> None:
    itens = [
        (str(i), d.isoformat(), d)
        for i, d in con.execute(
            "SELECT id, data_feito FROM testes WHERE tipo = 'TAB' AND teste_pai_id IS NULL AND data_feito >= %s ORDER BY data_feito, id",
            (DESDE,),
        ).fetchall()
    ]
    laudos.distribuir_linhas(con, "tab", itens, TAB.linhas)


def _resultado_tab(status: str, resultado: str | None) -> str:
    if status == "Em confirmação":
        return "aguardando confirmação"  # a folha fica incompleta até confirmar (rumo, 25/10)
    return {"Positivo": "+", "Negativo": "-"}.get(resultado or "", "")


def _gerar_tab(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = laudos.linhas_da_pagina(con, pagina_id)
    testes = _testes(con, "TAB", [r for r, _ in linhas])
    tabela = laudos.encaixar(TAB, modelo)
    desvio = tabela.topo - TAB.topo  # o cabeçalho anda junto com a tabela do modelo enviado
    celulas = []
    if linhas:
        dia = date.fromisoformat(linhas[0][1])
        for (x0, x1), texto in zip(TAB_DATA, (dia.strftime("%d"), dia.strftime("%m"), dia.strftime("%Y"))):
            celulas.append(laudos.Celula(texto, x0, x1, TAB_DATA_Y[0] + desvio, TAB_DATA_Y[1] + desvio))
    for n, (ref, _) in enumerate(_em_ordem(linhas, testes)):
        t = testes.get(ref)
        if not t:
            continue
        textos = [_amostra(t), t[9] or "", t[10] or "", _resultado_tab(t[2], t[3]), ""]
        celulas += [laudos.TABELA_CELULA(tabela, texto, n, i, centro=i != 0) for i, texto in enumerate(textos)]
    return laudos.preencher(modelo, DEMO_TAB, celulas)


# --- Coliformes em suco: 33 linhas -------------------------------------------------------------------------------------

COLI = laudos.Tabela(colunas=(36.2, 119.7, 276.5, 382.1, 483.1, 568.1), topo=170.4, base=661.8, linhas=33)
DEMO_COLI = laudos.demonstracao("Coliformes em suco", COLI, ("Data / Hora", "Amostra", "Coliformes Totais", "E.coli", "Observação"))


def _preparar_coli(con: psycopg.Connection) -> None:
    itens = [
        (str(i), "", d)
        for i, d in con.execute(
            "SELECT id, data_feito FROM testes WHERE tipo = 'COLIFORMES' AND teste_pai_id IS NULL AND data_feito >= %s ORDER BY data_feito, id",
            (DESDE,),
        ).fetchall()
    ]
    laudos.distribuir_linhas(con, "coliformes", itens, COLI.linhas)


def _gerar_coli(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = laudos.linhas_da_pagina(con, pagina_id)
    testes = _testes(con, "COLIFORMES", [r for r, _ in linhas])
    tabela = laudos.encaixar(COLI, modelo)
    celulas = []
    for n, (ref, _) in enumerate(_em_ordem(linhas, testes)):
        t = testes.get(ref)
        if not t:
            continue
        total = {"Positivo": "Presença", "Negativo": "Ausência"}.get(t[3] or "", "em confirmação" if t[2] == "Em confirmação" else "")
        # 27/10: a data sem a hora, a amostra "43333 (1-5)" e, na Observação, a fábrica e o item ("AQA, 2323")
        observacao = ", ".join(v for v in (t[10], t[9]) if v)
        textos = [_br(t[1]), _amostra(t), total, "-", observacao]  # E. coli "-": o bot não registra (25/10)
        celulas += [laudos.TABELA_CELULA(tabela, texto, n, i, centro=i not in (1, 4)) for i, texto in enumerate(textos)]
    return laudos.preencher(modelo, DEMO_COLI, celulas)


# --- Contagem de bolores (câmara Howard): 5 amostras por folha ----------------------------------------------------------

HOWARD = laudos.Tabela(colunas=(36.0, 559.6), topo=124.5, base=124.5 + 5 * 106.7, linhas=5)
DEMO_HOWARD = laudos.demonstracao("Contagem de bolores (câmara Howard)", HOWARD, ("Amostra / Data / Nº de campos positivos / Howard",))


def _preparar_howard(con: psycopg.Connection) -> None:
    itens = [
        (str(i), "", d)
        for i, d in con.execute(
            "SELECT id, data_feito FROM testes WHERE tipo = 'HOWARD' AND teste_pai_id IS NULL AND data_feito >= %s ORDER BY data_feito, id",
            (DESDE,),
        ).fetchall()
    ]
    laudos.distribuir_linhas(con, "howard", itens, HOWARD.linhas)


# a grade de cada bloco (medida no modelo, 27/10): as 6 linhas e as divisas das 3 grades de 5 x 5 campos (#1, #2, #3)
HOWARD_LINHAS = (152.6, 165.9, 179.35, 192.8, 206.1, 219.55)
HOWARD_GRADES = (
    (36.8, 57.2, 78.4, 99.7, 120.8, 142.0),
    (156.6, 177.4, 198.7, 220.0, 241.0, 262.2),
    (276.6, 297.6, 318.7, 340.0, 361.0, 382.4),
)
HOWARD_TOPO, HOWARD_PASSO = 126.0, 106.7  # a linha de cima do "Amostra:" do 1º bloco e a distância entre os blocos
CAMPOS_LIDOS = 50  # #1 e #2 (o #3 fica em branco, como no papel); Howard % = positivos / 50


def _regua_howard(modelo: bytes | None) -> tuple[float, float]:
    """(onde começa o 1º bloco, escala) no modelo enviado: as linhas que cobrem a largura toda são as do "Amostra:"."""
    ys = laudos.linhas_que_cobrem(modelo, 36.0, 559.6)
    topo = next((y for y in ys if abs(y - HOWARD_TOPO) < 30), None)
    if topo is None:
        return HOWARD_TOPO, 1.0
    seguinte = next((y for y in ys if abs(y - (topo + HOWARD_PASSO)) < 15), None)
    return topo, ((seguinte - topo) / HOWARD_PASSO if seguinte else 1.0)


def _gerar_howard(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = laudos.linhas_da_pagina(con, pagina_id)
    testes = _testes(con, "HOWARD", [r for r, _ in linhas])
    topo, escala = _regua_howard(modelo)

    def y(medida: float, bloco: int) -> float:  # medida do 1º bloco no modelo medido -> no modelo enviado
        return topo + (medida - HOWARD_TOPO + bloco * HOWARD_PASSO) * escala

    celulas = []
    for n, (ref, _) in enumerate(linhas):
        t = testes.get(ref)
        if not t:
            continue
        percentual = t[4]
        campos = t[5] if t[5] is not None else (round(float(percentual) * CAMPOS_LIDOS / 100) if percentual is not None else None)
        celulas += [
            laudos.Celula(_amostra(t), 82.0, 415.0, y(126.0, n), y(140.0, n), centro=False),
            laudos.Celula(_br_ano(t[1]), 444.0, 556.0, y(126.0, n), y(140.0, n), centro=False),
            laudos.Celula("" if campos is None else str(campos), 509.0, 556.0, y(166.0, n), y(180.0, n), centro=False),
            laudos.Celula("" if percentual is None else f"{float(percentual):g}%".replace(".", ","), 441.0, 556.0, y(179.0, n), y(193.0, n), centro=False),
        ]
        if campos is None:
            continue
        # cada campo lido: "-"; os positivos com "+", a partir do 1º campo da grade #1 (como no papel)
        for campo in range(CAMPOS_LIDOS):
            grade, resto = divmod(campo, 25)
            linha, coluna = divmod(resto, 5)
            xs = HOWARD_GRADES[grade]
            celulas.append(laudos.Celula("+" if campo < campos else "-", xs[coluna], xs[coluna + 1],
                                         y(HOWARD_LINHAS[linha], n), y(HOWARD_LINHAS[linha + 1], n)))
    return laudos.preencher(modelo, DEMO_HOWARD, celulas)


# --- Análises Microbiológica de NFC (folha deitada): uma folha por tanque de terra ou por navio, 13 coletas ------------

NFC = laudos.Tabela(
    colunas=(14.2, 65.3, 106.7, 155.9, 211.1, 275.8, 338.6, 405.0, 471.3, 512.7, 567.9, 632.6, 687.9, 754.2, 815.4),
    topo=201.5, base=387.6, linhas=13,
)
DEMO_NFC = laudos.demonstracao(
    "Análises Microbiológica de NFC", NFC,
    ("Coleta", "Análise", "Amostras", "C.T. 48h", "B.L. Prof.", "B.L. Sup.", "Psicr. Prof.", "Psicr. Sup.",
     "Data ST", "CT ST", "B.L. Prof. ST", "B.L. Sup. ST", "Psicr. Prof. ST", "Psicr. Sup. ST"),
    deitada=True,
)

PLACAS_SQL = """
SELECT a.coleta_id, a.frasco, a.data_analise,
       jsonb_object_agg(a.sub_analise || ':' || a.metodo, (SELECT jsonb_object_agg(p.placa::text,
            CASE WHEN p.sinal = '=' THEN trim_scale(p.valor)::text ELSE p.sinal || trim_scale(p.valor)::text END)
            FROM leituras_placas p WHERE p.analise_id = a.id AND p.etapa = 'final')) AS placas
FROM analises a
WHERE a.coleta_id = ANY(%s) AND a.repeticao_de IS NULL
GROUP BY a.coleta_id, a.frasco, a.data_analise
"""


def _preparar_nfc(con: psycopg.Connection) -> None:
    itens = [
        (str(c), chave, d)
        for c, chave, d in con.execute(
            """
            SELECT c.id, CASE WHEN c.origem = 'terra' THEN 'Tanque ' || c.tanque ELSE n.nome || ' ' || n.viagem END, c.data_coleta
            FROM coletas c LEFT JOIN navios n ON n.id = c.navio_id
            WHERE c.data_coleta >= %s AND EXISTS (SELECT 1 FROM analises a WHERE a.coleta_id = c.id AND a.frasco = 'Normal')
            ORDER BY c.data_coleta, c.id
            """,
            (DESDE,),
        ).fetchall()
    ]
    laudos.distribuir_linhas(con, "nfc-tanques", itens, NFC.linhas)


def _gerar_nfc(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = laudos.linhas_da_pagina(con, pagina_id)
    ids = [int(r) for r, _ in linhas]
    coletas = {str(i): (t, d) for i, t, d in con.execute("SELECT id, tanque, data_coleta FROM coletas WHERE id = ANY(%s)", (ids,))}
    frascos = {(str(c), f): (d, p) for c, f, d, p in con.execute(PLACAS_SQL, (ids,))}
    celulas = []
    if linhas:  # "Nº do Tanque": o tanque de terra ou o navio e a viagem (25/10); em cima do traço (27/10)
        celulas.append(laudos.Celula(linhas[0][1].removeprefix("Tanque "), 101.0, 200.0, 114.0, 132.0, centro=False))
    anterior: list[str] = ["", "", ""]  # as datas só quando mudam, como no papel (27/10): coleta, análise e a do Stress
    for n, (ref, _) in enumerate(linhas):
        tanque, coleta = coletas.get(ref, ("", None))
        normal, stress = frascos.get((ref, "Normal"), (None, {})), frascos.get((ref, "Stress"), (None, {}))

        def bloco(f: tuple) -> list[str]:
            # C.T. 48h, B.L. profundidade 120h, B.L. superfície ("-": o bot não registra), Wort profundidade e superfície 240h
            return [_placas(f[1], "CT:Profundidade"), _placas(f[1], "BL:Profundidade"), "-",
                    _placas(f[1], "WORT:Profundidade"), _placas(f[1], "WORT:Superficie")]

        datas = [_br(coleta), _br(normal[0]), _br(stress[0])]
        mostrar = [d if d != a else "" for d, a in zip(datas, anterior)]
        anterior = datas
        textos = [mostrar[0], mostrar[1], tanque, *bloco(normal), mostrar[2], *bloco(stress)]
        celulas += [laudos.TABELA_CELULA(NFC, texto, n, i) for i, texto in enumerate(textos)]
    return laudos.preencher(modelo, DEMO_NFC, celulas)


# --- Análises Microbiológicas – Embarque (folha deitada): uma folha por navio, 13 amostras -------------------------------

EMB = laudos.Tabela(colunas=(21.2, 103.3, 205.1, 306.8, 408.5, 496.1, 581.3, 659.3, 815.4), topo=209.5, base=395.3, linhas=13)
DEMO_EMB = laudos.demonstracao(
    "Análises Microbiológicas – Embarque", EMB,
    ("Data da Análise", "Linha/Fase", "Load", "Número da Amostra", "C.T 48h", "B.L 72h", "B.L 120h", "Observação"), deitada=True,
)


def _preparar_embarque(con: psycopg.Connection) -> None:
    itens = [
        (str(i), str(navio), d)
        for i, navio, d in con.execute(
            """
            SELECT ea.id, e.navio_id, ea.data_embarque FROM embarque_amostras ea JOIN embarques e ON e.id = ea.embarque_id
            WHERE ea.data_embarque >= %s ORDER BY e.navio_id, ea.data_embarque, e.linha, e.fase, ea.numero
            """,
            (DESDE,),
        ).fetchall()
    ]
    laudos.distribuir_linhas(con, "embarque-fcoj", itens, EMB.linhas)


def _gerar_embarque(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = laudos.linhas_da_pagina(con, pagina_id)
    dados = {
        str(r[0]): r
        for r in con.execute(
            """
            SELECT ea.id, ea.data_embarque, e.linha, e.fase, l.numero,
                   ea.numero, n.nome, n.viagem,
                   (SELECT jsonb_object_agg(c.analise, c.resultado) FROM vw_contagens c WHERE c.embarque_amostra_id = ea.id),
                   coalesce(u.nome, cr.usuario), i.codigo,
                   (SELECT string_agg(l2.numero || ' (item ' || i2.codigo || ')', ', ' ORDER BY l2.numero) FROM embarque_loads el
                    JOIN loads l2 ON l2.id = el.load_id JOIN itens i2 ON i2.id = l2.item_id
                    WHERE el.embarque_id = e.id AND el.load_id <> ea.load_id)
            FROM embarque_amostras ea JOIN embarques e ON e.id = ea.embarque_id JOIN navios n ON n.id = e.navio_id
            JOIN loads l ON l.id = ea.load_id JOIN itens i ON i.id = l.item_id
            LEFT JOIN usuarios u ON u.id = ea.registrado_por LEFT JOIN app.credenciais cr ON cr.usuario_id = ea.registrado_por
            WHERE ea.id = ANY(%s)
            """,
            ([int(r) for r, _ in linhas],),
        ).fetchall()
    }
    celulas, analistas = [], []
    primeiro = dados.get(linhas[0][0]) if linhas else None
    if primeiro:  # Navio (o nome) e Embarque (a viagem), decidido em 25/10
        celulas += [laudos.Celula(primeiro[6], 60.0, 395.0, 138.0, 154.0, centro=False),
                    laudos.Celula(primeiro[7], 465.0, 810.0, 138.0, 154.0, centro=False)]
    for n, (ref, _) in enumerate(linhas):
        d = dados.get(ref)
        if not d:
            continue
        cont = d[8] or {}
        # 01/11: no Load, só o load da amostra (o principal); o item e os outros loads da linha e fase vão na Observação
        obs = "; ".join(t for t in (f"Item {d[10]}" if d[10] else "", f"{d[11]}" if d[11] else "") if t)
        textos = [_br(d[1]), f"{d[2]}/{d[3]}", d[4], f"A{d[5]}", cont.get("CT", ""), cont.get("BL72", ""), cont.get("BL120", ""), obs]
        celulas += [laudos.TABELA_CELULA(EMB, texto or "", n, i, centro=i != 7) for i, texto in enumerate(textos)]
        nome = laudo_esterilizacao.primeiro_nome(d[9]) if d[9] else ""
        if nome and nome not in analistas:
            analistas.append(nome)
    if analistas:  # "Analista Responsável": quem registrou as amostras da folha
        celulas.append(laudos.Celula(", ".join(analistas), 140.0, 560.0, 436.0, 452.0, centro=False))
    return laudos.preencher(modelo, DEMO_EMB, celulas)


# --- Contra-amostra – Embarque: uma folha por caixa de navio (28 linhas) e o navio na Observação ------------------------

CA_EMB = laudos.Tabela(colunas=(42.6, 113.6, 375.7, 475.2, 560.1), topo=195.6, base=580.6, linhas=28)
DEMO_CA_EMB = laudos.demonstracao(
    "Controle de Contra Amostra – Embarque", CA_EMB, ("Número da caixa", "Número dos Loads", "Quantidade de Amostra", "Liberada para Descarte")
)

ITENS_ARQUIVO_SQL = """
SELECT i.item || ':' || i.ref_id, i.caixa_tipo, i.caixa, i.navio, i.viagem, i.load, i.lotes, i.tanque, i.quantidade, i.data_ref,
       i.data_descarte, i.descricao
FROM vw_arquivo_itens i
"""


def _preparar_ca_embarque(con: psycopg.Connection) -> None:
    itens = [
        (ref, f"{caixa} {navio} {viagem}", d)
        for ref, caixa, navio, viagem, d in con.execute(
            "SELECT i.item || ':' || i.ref_id, i.caixa, i.navio, i.viagem, i.data_ref FROM vw_arquivo_itens i"
            " WHERE i.caixa_tipo = 'navio' AND i.item IN ('fcoj', 'pote') AND i.caixa IS NOT NULL"
            " ORDER BY i.caixa, i.navio, i.viagem, i.item, i.data_ref, i.ref_id"
        ).fetchall()
    ]
    laudos.distribuir_linhas(con, "contra-embarque", itens, CA_EMB.linhas)


def _ordem_ca(d: tuple | None) -> tuple:
    """Em ordem crescente (27/10): os loads primeiro, pelo número, depois os tanques do navio (1C, 1P, 1S, 2P...)."""
    if d is None:
        return (2, 0, "")
    if d[5]:
        numero = "".join(c for c in d[5] if c.isdigit())
        return (0, int(numero or 0), d[5])
    tanque = str(d[7] or "")
    digitos = "".join(c for c in tanque if c.isdigit())
    return (1, int(digitos or 0), tanque)


def _gerar_ca_embarque(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = laudos.linhas_da_pagina(con, pagina_id)
    dados = {r[0]: r for r in con.execute(ITENS_ARQUIVO_SQL + " WHERE i.item || ':' || i.ref_id = ANY(%s)", ([r for r, _ in linhas],))}
    tabela = laudos.encaixar(CA_EMB, modelo)
    desvio = tabela.base - CA_EMB.base  # a Observação vem logo abaixo da tabela
    celulas = []
    for n, (ref, _) in enumerate(sorted(linhas, key=lambda linha: _ordem_ca(dados.get(linha[0])))):
        d = dados.get(ref)
        if not d:
            continue
        # o pote de NFC do navio não tem load: vai só o tanque ("2P", 27/10), com quantidade 1; o FCOJ, as amostras da linha
        loads = d[5] or str(d[7] or "")
        quantidade = str(d[8] or "") if d[5] else "1"
        celulas += [laudos.TABELA_CELULA(tabela, t, n, i) for i, t in enumerate([str(d[2]), loads, quantidade, _br4(d[10])])]
    if linhas and (d := dados.get(linhas[0][0])):  # Observação: o navio, em letra grande, como no papel
        celulas.append(laudos.Celula(f"{d[3]} {d[4]}", 46.0, 556.0, 604.0 + desvio, 652.0 + desvio, tamanho=28, fonte="Times-Bold", fixo=True))
    return laudos.preencher(modelo, DEMO_CA_EMB, celulas)


# --- Contra-amostra – Recebimento: uma folha corrida, na ordem em que os loads foram arquivados (35 linhas) ------------

CA_REC = laudos.Tabela(colunas=(28.9, 128.2, 262.8, 418.8, 559.6), topo=174.2, base=683.5, linhas=35)
DEMO_CA_REC = laudos.demonstracao(
    "Controle de Contra Amostra Load (Recebimento)", CA_REC, ("Número da Caixa", "Número do Load", "Número dos Lotes", "Liberada para Descarte")
)


def _preparar_ca_recebimento(con: psycopg.Connection) -> None:
    itens = [
        (ref, "", d)
        for ref, d in con.execute(
            "SELECT i.item || ':' || i.ref_id, i.data_ref FROM vw_arquivo_itens i WHERE i.caixa_tipo = 'recebimento'"
            " ORDER BY i.data_ref, i.ref_id"
        ).fetchall()
    ]
    laudos.distribuir_linhas(con, "contra-recebimento", itens, CA_REC.linhas)


def _gerar_ca_recebimento(con: psycopg.Connection, pagina_id: int, modelo: bytes | None) -> bytes:
    linhas = laudos.linhas_da_pagina(con, pagina_id)
    dados = {r[0]: r for r in con.execute(ITENS_ARQUIVO_SQL + " WHERE i.item || ':' || i.ref_id = ANY(%s)", ([r for r, _ in linhas],))}
    tabela = laudos.encaixar(CA_REC, modelo)
    celulas = []
    for n, (ref, _) in enumerate(linhas):
        d = dados.get(ref)
        if d:
            celulas += [laudos.TABELA_CELULA(tabela, t, n, i) for i, t in enumerate([str(d[2]), d[5] or "", (d[6] or "").replace(", ", ","), _br4(d[10])])]
    return laudos.preencher(modelo, DEMO_CA_REC, celulas)


# --- registro -------------------------------------------------------------------------------------------------------------

def _modelo_em_pe(pdf: bytes) -> None:
    laudo_esterilizacao.modelo_valido(pdf)


for _nome, _titulo, _tabela, _gerar, _preparar, _aceitar in (
    ("tab", "TAB – Método II (IFU 2019)", TAB, _gerar_tab, _preparar_tab, _modelo_em_pe),
    ("coliformes", "Coliformes em suco", COLI, _gerar_coli, _preparar_coli, _modelo_em_pe),
    ("howard", "Contagem de bolores (Howard)", HOWARD, _gerar_howard, _preparar_howard, _modelo_em_pe),
    ("nfc-tanques", "Análises de NFC (tanques e navios)", NFC, _gerar_nfc, _preparar_nfc, modelo_deitado_valido),
    ("embarque-fcoj", "Análises do embarque", EMB, _gerar_embarque, _preparar_embarque, modelo_deitado_valido),
    ("contra-embarque", "Contra-amostra do embarque", CA_EMB, _gerar_ca_embarque, _preparar_ca_embarque, _modelo_em_pe),
    ("contra-recebimento", "Contra-amostra do recebimento", CA_REC, _gerar_ca_recebimento, _preparar_ca_recebimento, _modelo_em_pe),
):
    laudos.registrar(
        laudos.Laudo(
            nome=_nome, titulo=_titulo, modelo=_nome, capacidade=_tabela.linhas, contar_sql=laudos.CONTAR_LINHAS,
            # o Howard não leva o traço ao finalizar (pedido de 01/11): os blocos dele são fixos, não linhas vazias
            gerar=_gerar, aceitar_modelo=_aceitar, preparar=_preparar, traco=None if _nome == "howard" else _tabela,
        )
    )

