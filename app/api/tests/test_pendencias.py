"""APP-010: pendências de hoje (07 v1.0, "3. Início"; 06, "Primeiros endpoints").

Os totais são conferidos contra as próprias views bi.* (as mesmas do Power BI) no banco de teste.
"""

import pytest

SENHA = "Senha-de-teste-1"
VIEWS = ["bi.contagens", "bi.testes", "bi.drops", "bi.leituras_nfc", "bi.recebimento_nfc", "bi.desvios"]


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Operador"):
        criar_pessoa(usuario=f"{cargo.lower()}.teste", cargo=cargo)
        assert cliente.post("/login", json={"usuario": f"{cargo.lower()}.teste", "senha": SENHA}).status_code == 200

    return _logar


def _nas_views(conexao, situacao):
    return sum(
        conexao.execute(f"SELECT count(*) FROM {v} WHERE situacao = %s", (situacao,)).fetchone()[0] for v in VIEWS
    )


def test_totais_batem_com_as_views_do_power_bi(cliente, logado, conexao):
    logado()
    corpo = cliente.get("/pendencias-hoje").json()
    assert corpo["vence_hoje"] == _nas_views(conexao, "Vence hoje") > 0
    assert corpo["atrasados"] == _nas_views(conexao, "Atrasado") > 0
    assert len(corpo["itens"]) == corpo["vence_hoje"] + corpo["atrasados"]
    assert {i["situacao"] for i in corpo["itens"]} == {"Vence hoje", "Atrasado"}


def test_cada_item_tem_referencia_e_data(cliente, logado):
    logado()
    for item in cliente.get("/pendencias-hoje").json()["itens"]:
        assert item["referencia"] and item["prevista"] and item["tipo"]


def test_blocos_na_ordem_do_relatorio_do_dia(cliente, logado):
    logado()
    ordem = ["FCOJ Recebimento", "FCOJ Embarque", "NFC Tank farm", "NFC Navio", "Recebimento NFC", "Desvios"]
    blocos = [i["bloco"] for i in cliente.get("/pendencias-hoje").json()["itens"]]
    vistos = list(dict.fromkeys(blocos))
    assert vistos == [b for b in ordem if b in vistos]


def test_filtro_por_bloco_e_situacao(cliente, logado, conexao):
    logado()
    so_drops_terra = cliente.get("/pendencias-hoje", params={"bloco": "NFC Tank farm", "situacao": "Atrasado"}).json()
    assert {i["bloco"] for i in so_drops_terra["itens"]} == {"NFC Tank farm"}
    assert so_drops_terra["vence_hoje"] == 0 and so_drops_terra["atrasados"] > 0
    esperado = sum(
        conexao.execute(f"SELECT count(*) FROM {v} WHERE situacao = 'Atrasado' AND origem = 'Terra'").fetchone()[0]
        for v in ["bi.drops", "bi.leituras_nfc"]
    ) + conexao.execute("SELECT count(*) FROM bi.testes WHERE situacao = 'Atrasado' AND origem = 'Tank farm'").fetchone()[0]
    assert so_drops_terra["atrasados"] == esperado


def test_bloco_invalido_da_422(cliente, logado):
    logado()
    assert cliente.get("/pendencias-hoje", params={"bloco": "Qualquer"}).status_code == 422


def test_vence_hoje_aparece_depois_de_atrasado_no_mesmo_bloco(cliente, logado):
    logado()
    itens = [i for i in cliente.get("/pendencias-hoje").json()["itens"] if i["bloco"] == "NFC Tank farm"]
    situacoes = [i["situacao"] for i in itens]
    assert situacoes == sorted(situacoes, key=lambda s: s == "Vence hoje")


@pytest.mark.parametrize("cargo", ["Admin", "Consultor"])
def test_outros_cargos_tambem_veem(cliente, logado, cargo):
    logado(cargo)
    assert cliente.get("/pendencias-hoje").json()["atrasados"] > 0


def test_coletor_nao_ve_pendencias_de_analise(cliente, logado):
    logado("Coletor")
    assert cliente.get("/pendencias-hoje").json() == {"vence_hoje": 0, "atrasados": 0, "itens": []}


def test_sem_login_da_401(cliente):
    assert cliente.get("/pendencias-hoje").status_code == 401
