"""APP-020: gráfico G2 do Recebimento (07 v1.0, §6): C.T e B.L por load ao longo do tempo, com a linha do limite."""

import pytest

from labflow_api.rotas_paginas import LIMITES_RECEBIMENTO

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Operador"):
        criar_pessoa(usuario=f"{cargo.lower()}.teste", cargo=cargo)
        assert cliente.post("/login", json={"usuario": f"{cargo.lower()}.teste", "senha": SENHA}).status_code == 200

    return _logar


def test_limites_da_api_sao_os_mesmos_da_view_do_bot(conexao):
    # Para cada leitura do banco de teste, o "Não ok" da view tem de ser igual ao que os limites da API dizem.
    linhas = conexao.execute(
        "SELECT analise, sinal, valor, alarme FROM bi.contagens WHERE lido AND origem = 'Recebimento'"
    ).fetchall()
    assert linhas and any(alarme for *_, alarme in linhas)
    for analise, sinal, valor, alarme in linhas:
        assert alarme == (sinal != "<" and valor >= LIMITES_RECEBIMENTO[analise]), (analise, sinal, valor)


def test_pontos_sao_as_leituras_feitas_com_os_filtros_da_pagina(cliente, logado, conexao):
    logado()
    corpo = cliente.get("/paginas/recebimento/grafico").json()
    assert corpo["limites"] == {"C.T 48h": 200, "B.L 72h": 50, "B.L 120h": 50}
    lidas = conexao.execute(
        "SELECT count(*) FROM bi.contagens WHERE origem = 'Recebimento' AND lido AND data_leitura IS NOT NULL"
    ).fetchone()[0]
    assert len(corpo["pontos"]) == lidas > 0 and corpo["cortado"] is False
    datas = [p["data"] for p in corpo["pontos"]]
    assert datas == sorted(datas)  # do mais antigo ao mais novo, para desenhar no tempo
    assert {p["analise"] for p in corpo["pontos"]} <= set(LIMITES_RECEBIMENTO)


def test_nao_ok_bate_com_a_pagina(cliente, logado):
    logado()
    pontos = cliente.get("/paginas/recebimento/grafico", params={"situacao": "Não ok"}).json()["pontos"]
    tabela = cliente.get("/paginas/recebimento", params={"situacao": "Não ok"}).json()["total"]
    assert pontos and all(p["nao_ok"] for p in pontos) and len(pontos) == tabela


def test_filtro_de_load_vale_no_grafico(cliente, logado):
    logado()
    load = cliente.get("/paginas/recebimento/grafico").json()["pontos"][0]["load"]
    pontos = cliente.get("/paginas/recebimento/grafico", params={"load": load}).json()["pontos"]
    assert pontos and {p["load"] for p in pontos} == {load}


def test_coletor_nao_ve_o_grafico(cliente, logado):
    logado("Coletor")
    assert cliente.get("/paginas/recebimento/grafico").status_code == 403
