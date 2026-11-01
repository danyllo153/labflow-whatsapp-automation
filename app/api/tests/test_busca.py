"""Busca de rastreio do topo (01/11): load, tanque e navio, com o arquivo de contra-amostras (inclusive o descartado).

Os números vêm do banco de teste (dados fictícios) e são conferidos contra as views.
"""

from urllib.parse import quote

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        criar_pessoa(usuario=f"{cargo.lower()}.busca", cargo=cargo)
        assert cliente.post("/login", json={"usuario": f"{cargo.lower()}.busca", "senha": SENHA}).status_code == 200

    return _logar


def _um(conexao, sql, *p):
    return conexao.execute(sql, p).fetchone()[0]


def test_load_do_recebimento_pelo_comeco_do_numero(cliente, logado, conexao):
    logado()
    load = _um(conexao, "SELECT load FROM bi.contagens WHERE origem = 'Recebimento' ORDER BY prevista DESC LIMIT 1")
    achados = cliente.get("/busca", params={"q": load[:-1]}).json()
    loads = [a for a in achados if a["tipo"] == "Load"]
    assert {"titulo": f"Load {load}", "caminho": f"/paginas/loads/{load}"}.items() <= next(
        a for a in loads if a["titulo"] == f"Load {load}"
    ).items()
    assert all(a["caminho"].startswith("/paginas/loads/") for a in loads)


def test_tanque_com_a_palavra_tanque_abre_cada_coleta(cliente, logado, conexao):
    logado()
    tanque, coleta = conexao.execute(
        "SELECT tanque, coleta_id FROM bi.coletas WHERE origem = 'Terra' ORDER BY data_coleta DESC, coleta_id DESC LIMIT 1"
    ).fetchone()
    achados = cliente.get("/busca", params={"q": f"tanque {tanque}"}).json()
    tanques = [a for a in achados if a["tipo"] == "Tanque"]
    assert tanques and tanques[0]["caminho"] == f"/paginas/tanques-terra/{coleta}"
    assert all(a["titulo"].startswith(f"Tanque {tanque}") for a in tanques)


def test_navio_por_parte_do_nome_e_o_arquivo_dele(cliente, logado, conexao):
    logado()
    navio, viagem = conexao.execute("SELECT navio, viagem FROM vw_arquivo_itens WHERE caixa_tipo = 'navio' LIMIT 1").fetchone()
    achados = cliente.get("/busca", params={"q": navio.split()[0]}).json()
    assert any(a["tipo"] == "Navio" and a["titulo"] == f"{navio} {viagem}" for a in achados)
    arquivo = next(a for a in achados if a["tipo"] == "Arquivo" and a["titulo"] == f"{navio} {viagem} no arquivo")
    assert arquivo["caminho"] == f"/paginas/navios/{navio} {viagem}"


def test_o_descartado_tambem_aparece(cliente, logado, conexao):
    logado()
    item, navio, viagem = conexao.execute(
        """SELECT a.id, n.nome, n.viagem FROM arquivo_amostras a JOIN coletas c ON c.id = a.coleta_id
           JOIN navios n ON n.id = c.navio_id ORDER BY a.id LIMIT 1"""
    ).fetchone()
    conexao.execute("UPDATE arquivo_amostras SET status = 'Descartado', descartado_em = now() WHERE id = %s", (item,))
    achados = cliente.get("/busca", params={"q": navio}).json()
    arquivo = next(a for a in achados if a["tipo"] == "Arquivo" and a["titulo"] == f"{navio} {viagem} no arquivo")
    assert "Descartado" in arquivo["situacao"]


def test_paginas_trazem_o_arquivo(cliente, logado, conexao):
    logado()
    navio, viagem = conexao.execute("SELECT navio, viagem FROM vw_arquivo_itens WHERE caixa_tipo = 'navio' LIMIT 1").fetchone()
    corpo = cliente.get(f"/paginas/navios/{quote(f'{navio} {viagem}')}").json()
    assert len(corpo["arquivo"]) == _um(conexao, "SELECT count(*) FROM vw_arquivo_itens WHERE caixa_tipo = 'navio' AND navio = %s AND viagem = %s", navio, viagem)
    tanque, data, coleta = conexao.execute(
        """SELECT a.tanque, a.data_ref, c.coleta_id FROM vw_arquivo_itens a
           JOIN bi.coletas c ON c.origem = 'Terra' AND c.tanque = a.tanque AND c.data_coleta = a.data_ref
           WHERE a.caixa_tipo = 'tanque' LIMIT 1"""
    ).fetchone()
    assert cliente.get(f"/paginas/tanques-terra/{coleta}").json()["arquivo"][0]["referencia"] == tanque
    load = _um(conexao, "SELECT min(load) FROM bi.contagens WHERE origem = 'Recebimento'")
    corpo = cliente.get(f"/paginas/loads/{load}").json()
    assert corpo["nfc"] == [] or all(l["lote"] is not None for l in corpo["nfc"])
    assert corpo["resumo"]["lotes_nfc"] == len(corpo["nfc"])


def test_sem_nada_parecido_vem_vazio(cliente, logado):
    logado()
    assert cliente.get("/busca", params={"q": "ZZZ-nada"}).json() == []


def test_coletor_nao_rastreia(cliente, logado):
    logado("Coletor")
    assert cliente.get("/busca", params={"q": "90"}).status_code == 403
