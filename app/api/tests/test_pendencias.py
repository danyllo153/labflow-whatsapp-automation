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
    # fora das views: o Stress por fazer e o Coliformes obrigatório (25/10) saem das tabelas do bot
    extras = lambda sit: sum(1 for i in corpo["itens"] if i["situacao"] == sit and (i["tipo"] == "Análise Stress" or "obrigatório" in i["analise"]))  # noqa: E731
    assert corpo["vence_hoje"] - extras("Vence hoje") == _nas_views(conexao, "Vence hoje") > 0
    assert corpo["atrasados"] - extras("Atrasado") == _nas_views(conexao, "Atrasado") > 0
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
    stress = sum(1 for i in so_drops_terra["itens"] if i["tipo"] == "Análise Stress")  # fora das views (25/10)
    assert so_drops_terra["atrasados"] - stress == esperado


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


@pytest.mark.parametrize(
    "bloco, tipo, referencia, analise, grupo, item",
    [
        ("NFC Navio", "Leitura de NFC", "O.SKY 189 · tanque 1C (coleta 13/10)", "Psicrotróficos Normal · Leitura final",
         "O.SKY 189 · Normal", "tanque 1C (coleta 13/10) · Psicrotróficos · Leitura final"),
        ("NFC Navio", "Drop", "O.SKY 189 · tanque 2P (coleta 13/10)", "D5", "O.SKY 189 · Drops", "tanque 2P (coleta 13/10) · D5"),
        ("NFC Tank farm", "Leitura de NFC", "Tanque 38 (coleta 21/10)", "B.L Stress · Pré-leitura", "B.L Stress · Pré-leitura", "Tanque 38 (coleta 21/10)"),
        ("FCOJ Recebimento", "TAB", "Load 43669 · Composta #65", "TAB · para espalhar", "TAB · para espalhar", "Load 43669 · Composta #65"),
        ("FCOJ Recebimento", "C.T/B.L", "Load 43661 · lote 11", "C.T 48h", "C.T 48h", "Load 43661 · lote 11"),
        ("NFC Tank farm", "Drop", "Tanque 40 (coleta 21/10)", "D5", "Drop D5", "Tanque 40 (coleta 21/10)"),
        ("Águas e superfícies", "Baia", "Baia 08 (coleta 22/10)", "C.T 48h", "Baia · C.T 48h", "Baia 08 (coleta 22/10)"),
    ],
)
def test_agrupar_pendencias_para_o_inicio(bloco, tipo, referencia, analise, grupo, item):
    from labflow_api.rotas_pendencias import agrupar

    assert agrupar(bloco, tipo, referencia, analise) == (grupo, item)


def test_stress_por_fazer_e_coliformes_para_estriar(cliente, logado, conexao):
    """25/10: a coleta com o Normal analisado e sem o Stress aparece como pendência; Coliformes no caldo é "para estriar"."""
    logado()
    hoje = conexao.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]
    coleta = {"origem": "terra", "tanques": "9961", "data": str(hoje - __import__("datetime").timedelta(days=3))}
    for url, extra in (("/analises/tanques/coleta", {}), ("/analises/tanques/analise", {"frasco": "Normal"})):
        r = cliente.post(url, json={**coleta, **extra, "data": str(hoje - __import__("datetime").timedelta(days=3)), "previa": False})
        assert r.status_code == 200, r.text
    itens = cliente.get("/pendencias-hoje").json()["itens"]
    stress = [i for i in itens if i["tipo"] == "Análise Stress" and "9961" in i["referencia"]]
    assert len(stress) == 1 and stress[0]["situacao"] == "Atrasado" and stress[0]["bloco"] == "NFC Tank farm"
    assert not any("Coliformes · para espalhar" in i["analise"] for i in itens)  # o Coliformes no caldo é estriado
