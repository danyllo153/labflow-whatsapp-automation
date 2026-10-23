"""APP-010: pendências de hoje (07 v1.0, "3. Início"; 06, "Primeiros endpoints").

Os totais são conferidos contra as próprias views bi.* (as mesmas do Power BI) no banco de teste.
"""

import pytest

SENHA = "Senha-de-teste-1"
VIEWS = ["bi.contagens", "bi.testes", "bi.drops", "bi.leituras_nfc", "bi.recebimento_nfc", "bi.desvios"]


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
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


def test_desvios_abertos_contam_todos_os_nao_concluidos(cliente, logado, conexao):
    # APP-014: o cartão "Desvios abertos" conta também o desvio ainda no prazo (não só vence hoje e atrasado)
    logado()
    abertos = conexao.execute("SELECT count(*) FROM bi.desvios WHERE status <> 'Concluído'").fetchone()[0]
    no_prazo = conexao.execute("SELECT count(*) FROM bi.desvios WHERE situacao = 'No prazo'").fetchone()[0]
    corpo = cliente.get("/pendencias-hoje", params={"bloco": "Desvios"}).json()
    assert corpo["desvios_abertos"] == abertos > 0
    assert corpo["desvios_abertos"] == len(corpo["itens"]) + no_prazo


def test_testes_do_mesmo_load_tem_referencias_diferentes(cliente, logado):
    # APP-014: "90009 · Coliformes" aparecia 4 vezes igual; agora vem "Load 90009 · Composta #18, lote 8"
    logado()
    itens = [i for i in cliente.get("/pendencias-hoje").json()["itens"] if i["tipo"] in ("TAB", "Coliformes")]
    recebimento = [i for i in itens if i["bloco"] == "FCOJ Recebimento"]
    assert recebimento and all(i["referencia"].startswith("Load ") and "Composta #" in i["referencia"] for i in recebimento)
    chaves = [(i["referencia"], i["analise"]) for i in itens]
    assert len(chaves) == len(set(chaves))


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
    assert cliente.get("/pendencias-hoje").json() == {"vence_hoje": 0, "atrasados": 0, "desvios_abertos": 0, "itens": []}


def test_sem_login_da_401(cliente):
    assert cliente.get("/pendencias-hoje").status_code == 401
