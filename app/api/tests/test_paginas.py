"""APP-008: páginas Coletas e Recebimento, só leitura, pelas views do Power BI (07 v1.0, "5."; 08 A11).

Os números são conferidos contra as próprias views bi.* no banco de teste (dados fictícios do demo.sql).
"""

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        uid = criar_pessoa(usuario=f"{cargo.lower()}.teste", cargo=cargo)
        assert cliente.post("/login", json={"usuario": f"{cargo.lower()}.teste", "senha": SENHA}).status_code == 200
        return uid

    return _logar


def _conta(conexao, sql, *params):
    return conexao.execute(sql, params).fetchone()[0]

# 27/10: a tabela tem uma linha por lote (no embarque, por amostra); a situação do lote é a pior das três análises
SITUACAO_DO_LOTE = """
CASE WHEN bool_or(lido AND alarme) THEN 'Não ok' WHEN bool_or(NOT lido AND situacao = 'Atrasado') THEN 'Atrasado'
     WHEN bool_or(NOT lido AND situacao = 'Vence hoje') THEN 'Vence hoje' WHEN bool_or(NOT lido AND situacao = 'No prazo') THEN 'No prazo'
     ELSE 'Ok' END
"""
CHAVES = {"Recebimento": "load, item, fabrica, numero", "Embarque": "navio, linha, fase, load, item, fabrica, lote_amostra"}


def lotes_sql(origem: str, onde: str = "true", ter: str = "true") -> str:
    """Quantos lotes (amostras) da origem: `onde` filtra as linhas; `ter` filtra o lote (ex.: a situação dele)."""
    return (f"SELECT count(*) FROM (SELECT {SITUACAO_DO_LOTE} AS situacao_do_lote, bool_or(analise = 'C.T 48h' AND lido) AS ct_lido "
            f"FROM bi.contagens WHERE origem = '{origem}' AND {onde} GROUP BY {CHAVES[origem]}) s WHERE {ter}")



# ------------------------------------------------------------------ Coletas
def test_coletas_sem_filtro_bate_com_bi_coletas(cliente, logado, conexao):
    logado()
    r = cliente.get("/paginas/coletas", params={"por_pagina": 5})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["total"] == _conta(conexao, "SELECT count(*) FROM bi.coletas") > 0
    assert len(corpo["linhas"]) == 5
    assert set(corpo["linhas"][0]) == {
        "coleta_id", "origem", "tanque", "navio", "data_coleta", "coletado_por", "digitado_por", "registrado_em"
    }
    datas = [l["data_coleta"] for l in corpo["linhas"]]
    assert datas == sorted(datas, reverse=True)  # mais recentes primeiro


def test_coletas_filtros_batem_com_sql(cliente, logado, conexao):
    logado()
    corpo = cliente.get("/paginas/coletas", params={"origem": "Navio", "navio": "demo star"}).json()
    assert corpo["total"] == _conta(
        conexao, "SELECT count(*) FROM bi.coletas WHERE origem = 'Navio' AND navio ILIKE '%%demo star%%'"
    ) > 0
    corpo = cliente.get(
        "/paginas/coletas", params={"tanque": "80", "data_de": "2000-01-01", "data_ate": "2100-01-01"}
    ).json()
    assert corpo["total"] == _conta(conexao, "SELECT count(*) FROM bi.coletas WHERE tanque = '80'") > 0
    corpo = cliente.get("/paginas/coletas", params={"quem": "bruno"}).json()
    assert corpo["total"] == _conta(
        conexao, "SELECT count(*) FROM bi.coletas WHERE registrado_por ILIKE '%%bruno%%' OR digitado_por ILIKE '%%bruno%%'"
    ) > 0


def test_paginacao_cobre_tudo_sem_repetir(cliente, logado):
    logado()
    total = cliente.get("/paginas/coletas", params={"por_pagina": 1}).json()["total"]
    vistos = []
    pagina = 1
    while True:
        linhas = cliente.get("/paginas/coletas", params={"por_pagina": 40, "pagina": pagina}).json()["linhas"]
        if not linhas:
            break
        vistos += [l["coleta_id"] for l in linhas]
        pagina += 1
    assert len(vistos) == len(set(vistos)) == total


def test_coletor_ve_so_as_proprias_coletas(cliente, logado, conexao):
    uid = logado("Coletor")
    conexao.execute(
        "INSERT INTO coletas (origem, tanque, data_coleta, registrado_por) VALUES ('terra', '91', CURRENT_DATE, %s)",
        (uid,),
    )
    corpo = cliente.get("/paginas/coletas").json()
    assert corpo["total"] == 1 and corpo["linhas"][0]["tanque"] == "91"
    assert cliente.get("/paginas/recebimento").status_code == 403


def test_por_pagina_tem_limite(cliente, logado):
    logado()
    assert cliente.get("/paginas/coletas", params={"por_pagina": 500}).status_code == 422


def test_texto_do_filtro_nao_vira_sql(cliente, logado):
    logado()
    r = cliente.get("/paginas/coletas", params={"navio": "x' OR '1'='1"})
    assert r.status_code == 200 and r.json()["total"] == 0


# ------------------------------------------------------------------ Recebimento
def test_recebimento_bate_com_bi_contagens(cliente, logado, conexao):
    logado("Consultor")
    corpo = cliente.get("/paginas/recebimento").json()
    assert corpo["total"] == _conta(conexao, lotes_sql("Recebimento")) > 0
    assert {"ct_48", "bl_72", "bl_120"} <= set(corpo["linhas"][0])  # uma linha por lote, uma coluna por análise


@pytest.mark.parametrize(
    "situacao, sql",
    [
        ("Não ok", "situacao_do_lote = 'Não ok'"),
        ("Ok", "situacao_do_lote = 'Ok'"),
        ("Atrasado", "situacao_do_lote = 'Atrasado'"),
    ],
)
def test_recebimento_por_situacao(cliente, logado, conexao, situacao, sql):
    logado()
    corpo = cliente.get("/paginas/recebimento", params={"situacao": situacao, "por_pagina": 200}).json()
    assert corpo["total"] == _conta(conexao, lotes_sql("Recebimento", ter=sql))
    assert all(l["situacao"] == situacao for l in corpo["linhas"])


def test_recebimento_por_load_fabrica_e_analise(cliente, logado, conexao):
    logado()
    load = conexao.execute(
        "SELECT load FROM bi.contagens WHERE origem = 'Recebimento' ORDER BY load LIMIT 1"
    ).fetchone()[0]
    corpo = cliente.get(
        "/paginas/recebimento", params={"load": load, "analise": "C.T 48h", "fabrica": "aqa"}
    ).json()
    assert corpo["total"] == _conta(
        conexao,
        "SELECT count(*) FROM bi.contagens WHERE origem = 'Recebimento' AND load = %s "
        "AND analise = 'C.T 48h' AND fabrica = 'AQA'",
        load,
    )


def test_recebimento_de_varias_fabricas_para_comparar(cliente, logado, conexao):
    """27/10: "AQA,COL" traz as duas fábricas (o gráfico compara uma com a outra)."""
    logado()
    corpo = cliente.get("/paginas/recebimento", params={"fabrica": "aqa, col"}).json()
    assert corpo["total"] == _conta(conexao, lotes_sql("Recebimento", "fabrica IN ('AQA', 'COL')"))


def test_recebimento_por_lote_filtra_a_analise_e_o_resultado(cliente, logado, conexao):
    """27/10: a análise com a situação filtra a situação daquela análise; o resultado ("<10") acha em qualquer coluna."""
    logado()
    ct_nao_ok = cliente.get("/paginas/recebimento", params={"analise": "C.T 48h", "situacao": "Não ok", "por_pagina": 200}).json()
    assert ct_nao_ok["total"] == _conta(
        conexao, "SELECT count(*) FROM bi.contagens WHERE origem = 'Recebimento' AND analise = 'C.T 48h' AND lido AND alarme"
    )
    assert all(l["situacao_ct_48"] == "Não ok" for l in ct_nao_ok["linhas"])
    resultado = conexao.execute(
        "SELECT resultado FROM bi.contagens WHERE origem = 'Recebimento' AND resultado IS NOT NULL LIMIT 1"
    ).fetchone()[0]
    achados = cliente.get("/paginas/recebimento", params={"resultado": resultado, "por_pagina": 200}).json()["linhas"]
    assert achados and all(resultado in (l["ct_48"], l["bl_72"], l["bl_120"]) for l in achados)


def test_sem_login_nao_ve_paginas(cliente):
    assert cliente.get("/paginas/coletas").status_code == 401
    assert cliente.get("/paginas/recebimento").status_code == 401


def test_busca_acha_o_texto_em_qualquer_coluna(cliente, conexao, criar_pessoa):
    """A busca da página (24/10) vale para todos os registros, não só os da página na tela, e segue para o Excel."""
    criar_pessoa(usuario="ana.busca", cargo="Analista")
    cliente.cookies.clear()
    assert cliente.post("/login", json={"usuario": "ana.busca", "senha": "Senha-de-teste-1"}).status_code == 200
    item = conexao.execute("INSERT INTO itens (codigo) VALUES ('99911') RETURNING id").fetchone()[0]
    load = conexao.execute("INSERT INTO loads (numero, item_id) VALUES ('97531', %s) RETURNING id", (item,)).fetchone()[0]
    conexao.execute("INSERT INTO recebimento_lotes (load_id, lote, data_recebimento) VALUES (%s, 1, '2026-10-20')", (load,))
    achados = cliente.get("/paginas/recebimento", params={"busca": "97531"}).json()
    assert achados["total"] >= 1 and all(l["load"] == "97531" for l in achados["linhas"])
    assert cliente.get("/paginas/recebimento", params={"busca": "nada-assim-xyz"}).json()["total"] == 0
    assert cliente.get("/paginas/drops", params={"busca": "nada-assim-xyz"}).json()["total"] == 0
    assert cliente.get("/paginas/navios", params={"busca": "nada-assim-xyz"}).json()["total"] == 0
    assert cliente.get("/paginas/recebimento/excel", params={"busca": "97531"}).status_code == 200
