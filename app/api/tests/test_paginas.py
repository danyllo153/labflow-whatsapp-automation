"""APP-008: páginas Coletas e Recebimento, só leitura, pelas views do Power BI (07 v1.0, "5."; 08 A11).

Os números são conferidos contra as próprias views bi.* no banco de teste (dados fictícios do demo.sql).
"""

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Operador"):
        uid = criar_pessoa(usuario=f"{cargo.lower()}.teste", cargo=cargo)
        assert cliente.post("/login", json={"usuario": f"{cargo.lower()}.teste", "senha": SENHA}).status_code == 200
        return uid

    return _logar


def _conta(conexao, sql, *params):
    return conexao.execute(sql, params).fetchone()[0]


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
    assert corpo["total"] == _conta(conexao, "SELECT count(*) FROM bi.contagens WHERE origem = 'Recebimento'") > 0


@pytest.mark.parametrize(
    "situacao, sql",
    [
        ("Não ok", "lido AND alarme"),
        ("Ok", "lido AND NOT alarme"),
        ("Atrasado", "NOT lido AND situacao = 'Atrasado'"),
    ],
)
def test_recebimento_por_situacao(cliente, logado, conexao, situacao, sql):
    logado()
    corpo = cliente.get("/paginas/recebimento", params={"situacao": situacao, "por_pagina": 200}).json()
    assert corpo["total"] == _conta(
        conexao, f"SELECT count(*) FROM bi.contagens WHERE origem = 'Recebimento' AND {sql}"
    )
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


def test_sem_login_nao_ve_paginas(cliente):
    assert cliente.get("/paginas/coletas").status_code == 401
    assert cliente.get("/paginas/recebimento").status_code == 401
