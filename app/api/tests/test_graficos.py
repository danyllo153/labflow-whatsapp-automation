"""Gráficos de resultado (pedido de 26/10): pontos de C.T/B.L com diluição por página e TAB positivos no ano.

Os números são conferidos contra as próprias views do Power BI no banco de teste.
"""

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        criar_pessoa(usuario=f"{cargo.lower()}.teste", cargo=cargo)
        assert cliente.post("/login", json={"usuario": f"{cargo.lower()}.teste", "senha": SENHA}).status_code == 200

    return _logar


def _conta(conexao, sql, *params):
    return conexao.execute(sql, params).fetchone()[0]


@pytest.mark.parametrize("pagina,origem", [("recebimento", "Recebimento"), ("embarque", "Embarque")])
def test_fcoj_traz_cada_leitura_e_o_alerta_200_50(cliente, logado, conexao, pagina, origem):
    logado()
    r = cliente.get(f"/paginas/{pagina}/resultados")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["alertas"] == {"C.T 48h": 200, "B.L 72h": 50, "B.L 120h": 50}
    lidas = _conta(conexao, "SELECT count(*) FROM bi.contagens WHERE origem = %s AND lido AND data_leitura IS NOT NULL", origem)
    acima = _conta(conexao, "SELECT count(*) FROM bi.contagens WHERE origem = %s AND lido AND alarme AND data_leitura IS NOT NULL", origem)
    assert len(corpo["pontos"]) == lidas
    assert sum(p["acima"] for p in corpo["pontos"]) == acima
    datas = [p["data"] for p in corpo["pontos"]]
    assert datas == sorted(datas)  # do mais antigo ao mais novo
    for p in corpo["pontos"]:
        assert p["lido"].startswith("<") == p["menor"]


def test_grafico_segue_o_filtro_da_pagina(cliente, logado, conexao):
    logado()
    pontos = cliente.get("/paginas/recebimento/resultados", params={"analise": "C.T 48h"}).json()["pontos"]
    assert pontos and {p["analise"] for p in pontos} == {"C.T 48h"}
    load = pontos[0]["load"]
    por_load = cliente.get("/paginas/recebimento/resultados", params={"busca": load}).json()["pontos"]
    assert por_load and all(load in (p["load"] or "") for p in por_load)


def test_nfc_usa_o_valor_com_diluicao_e_nao_tem_alerta(cliente, logado, conexao):
    logado()
    load_id = conexao.execute("SELECT id FROM loads ORDER BY id LIMIT 1").fetchone()[0]
    rid = conexao.execute(
        "INSERT INTO recebimento_nfc (load_id, lote, amostra, diluicao, data_recebimento) "
        "VALUES (%s, 7, 'fresh', 3, CURRENT_DATE - 2) RETURNING id",
        (load_id,),
    ).fetchone()[0]
    conexao.execute(
        "INSERT INTO contagens_nfc (analise, recebimento_nfc_id, sinal, valor, valor_lido, diluicao) VALUES ('CT', %s, '=', 14000, 14, 3)",
        (rid,),
    )
    corpo = cliente.get("/paginas/recebimento-nfc/resultados", params={"lote": 7}).json()
    assert corpo["alertas"] == {}
    [p] = corpo["pontos"]
    assert (p["valor"], p["lido"], p["menor"], p["acima"], p["lote"]) == (14000, "14", False, False, "7")
    assert p["diluicao"]


def test_tab_positivos_do_ano_batem_com_a_view(cliente, logado, conexao):
    logado()
    ano = _conta(conexao, "SELECT coalesce(max(extract(year FROM data_feito))::int, 2026) FROM bi.testes WHERE teste = 'TAB' AND positivo")
    total = _conta(conexao, "SELECT count(*) FROM bi.testes WHERE teste = 'TAB' AND positivo AND extract(year FROM data_feito) = %s", ano)
    r = cliente.get("/paginas/tab/positivos", params={"ano": ano})
    assert r.status_code == 200
    assert len(r.json()) == total
    fabrica = next((p["fabrica"] for p in r.json() if p["fabrica"]), None)
    if fabrica:
        so = cliente.get("/paginas/tab/positivos", params={"ano": ano, "fabrica": fabrica.lower()}).json()
        assert so and {p["fabrica"] for p in so} == {fabrica}


@pytest.mark.parametrize("url", ["/paginas/recebimento/resultados", "/paginas/embarque/resultados",
                                 "/paginas/recebimento-nfc/resultados", "/paginas/tab/positivos?ano=2026"])
def test_coletor_nao_ve(cliente, logado, url):
    logado("Coletor")
    assert cliente.get(url).status_code == 403
