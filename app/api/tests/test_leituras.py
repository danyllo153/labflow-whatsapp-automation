"""27/10: os dois blocos do Turno (leituras e análises pendentes) e a leitura dos drops. Dados fictícios do banco de teste."""

from datetime import timedelta

import pytest


SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.leituras"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


def _hoje(conexao):
    return conexao.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]


def test_blocos_separam_leitura_de_analise(cliente, logado):
    logado()
    r = cliente.get("/leituras/pendentes")
    assert r.status_code == 200, r.text
    corpo = r.json()
    leituras = {g["grupo"]: g for g in corpo["leituras"]}
    analises = {g["grupo"]: g for g in corpo["analises"]}
    # o que se lê: placas (o tanque em triplicata), com o atalho para a aba de digitar
    for g in corpo["leituras"]:
        for i in g["itens"]:
            assert i["caminho"].startswith("/leituras?aba=") and i["quantidade"] > 0
    if "Tanques terra" in leituras:
        assert all(i["quantidade"] % 3 == 0 and i["rotulo"] in ("C.T 48h", "B.L 72h", "B.L 120h", "Wort 120h", "Wort 240h")
                   for i in leituras["Tanques terra"]["itens"])
    # o que se analisa: nada de "para ler" aqui
    assert all("ler" not in i["rotulo"] for g in corpo["analises"] for i in g["itens"])
    assert set(analises) <= {"Tanques terra", "Tanques navio", "Drops", "TAB", "Coliformes", "Compostas"}


def test_coletor_nao_ve_os_blocos(cliente, logado):
    logado("Coletor")
    assert cliente.get("/leituras/pendentes").json() == {"leituras": [], "analises": []}


def test_drop_e_analise_no_dia_e_leitura_cinco_dias_depois(cliente, logado, conexao):
    hoje = _hoje(conexao)
    d1, d2 = [r[0] for r in conexao.execute("SELECT id FROM drops ORDER BY id LIMIT 2").fetchall()]
    conexao.execute("DELETE FROM desvios_drop WHERE drop_id IN (%s, %s)", (d1, d2))
    conexao.execute("UPDATE drops SET status = 'Concluído', data_prevista = %s WHERE id IN (%s, %s)", (hoje - timedelta(days=5), d1, d2))
    logado()
    para_ler = {d["drop_id"]: d for d in cliente.get("/leituras/drops").json()["drops"]}
    assert {d1, d2} <= set(para_ler) and para_ler[d1]["ler_em"] == hoje.isoformat()
    r = cliente.post("/leituras/drops/negativos", json={"drop_ids": [d1]})
    assert r.status_code == 200 and d1 not in {d["drop_id"] for d in r.json()["drops"]}
    r = cliente.post(f"/leituras/drops/{d2}/positivo")
    assert r.status_code == 200, r.text
    assert conexao.execute("SELECT count(*) FROM desvios_drop WHERE drop_id = %s", (d2,)).fetchone()[0] == 1
    assert conexao.execute("SELECT resultado FROM app.leituras_drop WHERE drop_id = %s", (d2,)).fetchone()[0] == "Positivo"
    assert cliente.post(f"/leituras/drops/{d2}/positivo").status_code == 422  # desvio já aberto: o banco recusa


def test_drop_ainda_nao_incubado_nao_entra_na_leitura(cliente, logado, conexao):
    d = conexao.execute("SELECT id FROM drops WHERE status = 'Pendente' ORDER BY id LIMIT 1").fetchone()[0]
    logado()
    assert cliente.post("/leituras/drops/negativos", json={"drop_ids": [d]}).status_code == 422
