"""APP-057 (Fase E, E2): o app do Recebimento FCOJ, que registra e lança pelas mesmas funções do bot (040). Dados fictícios."""

from datetime import timedelta

import pytest

SENHA = "Senha-de-teste-1"
URL = "/analises/recebimento-fcoj"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.teste"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


@pytest.fixture
def hoje(conexao):
    return conexao.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]


def test_registrar_mostra_a_previa_e_so_grava_no_confirmar(cliente, logado, hoje):
    logado()
    pedido = {"load": "98701", "item": "99902", "fabrica": "aqa", "lotes": "1-3, 5", "data": str(hoje)}
    r = cliente.post(f"{URL}/registrar", json=pedido)
    assert r.status_code == 200, r.text
    assert r.json()["previa"] and r.json()["novos"] == [1, 2, 3, 5] and r.json()["gravados"] == 0
    assert "Load 98701 novo (item 99902, fábrica AQA): lotes 1-3, 5 (4)" in r.json()["texto"]
    assert cliente.get(f"{URL}/resultados", params={"busca": "98701"}).json()["total"] == 0  # a prévia não grava

    r = cliente.post(f"{URL}/registrar", json={**pedido, "previa": False})
    assert r.status_code == 200 and r.json()["gravados"] == 4
    lotes = cliente.get(f"{URL}/resultados", params={"busca": "98701"}).json()["lotes"]
    assert [(l["lote"], l["fabrica"], l["situacao"]) for l in lotes] == [(n, "AQA", "No prazo") for n in (1, 2, 3, 5)]
    assert lotes[0]["ct"] == {"resultado": None, "nao_ok": False, "prevista": str(hoje + timedelta(days=2))}

    r = cliente.post(f"{URL}/registrar", json={**pedido, "lotes": "5-6"})
    assert r.json()["novos"] == [6] and r.json()["repetidos"] == [5]


@pytest.mark.parametrize(
    ("campo", "valor", "mensagem"),
    [("fabrica", "XYZ", "não reconhecida"), ("item", "129", "item 129"), ("lotes", "1-x", "não entendido")],
)
def test_registrar_recusa(cliente, logado, hoje, campo, valor, mensagem):
    logado()
    pedido = {"load": "98702", "item": "99902", "fabrica": "CON", "lotes": "1", "data": str(hoje), campo: valor}
    r = cliente.post(f"{URL}/registrar", json=pedido)
    assert r.status_code == 422 and mensagem in r.json()["detail"]


def test_registrar_recusa_data_futura_e_coletor(cliente, logado, hoje):
    logado()
    pedido = {"load": "98703", "item": "99902", "fabrica": "CON", "lotes": "1", "data": str(hoje + timedelta(days=1))}
    assert cliente.post(f"{URL}/registrar", json=pedido).status_code == 422
    logado("Coletor")
    assert cliente.post(f"{URL}/registrar", json={**pedido, "data": str(hoje)}).status_code == 403
    assert cliente.get(f"{URL}/painel").json()["pode_registrar"] is False


def test_lancar_previa_alarme_e_painel(cliente, logado, hoje):
    logado()
    pedido = {"load": "98704", "item": "99902", "fabrica": "COL", "lotes": "1-2", "previa": False}
    cliente.post(f"{URL}/registrar", json={**pedido, "data": str(hoje - timedelta(days=3))})  # C.T atrasado, B.L 72h para hoje
    lotes = cliente.get(f"{URL}/resultados", params={"busca": "98704"}).json()["lotes"]
    assert [l["situacao"] for l in lotes] == ["Atrasado", "Atrasado"]

    painel = cliente.get(f"{URL}/painel").json()
    assert painel["pode_registrar"]
    col = next((f for f in painel["fabricas"] if f["fabrica"] == "COL"), {"nao_ok": 0, "lidos": 0})
    grupos = {(g["analise"], g["situacao"]): g for g in painel["hoje"]}
    assert "L 98704 (1-2)" in grupos[("C.T 48h", "Atrasado")]["loads"]
    assert "L 98704 (1-2)" in grupos[("B.L 72h", "Para hoje")]["loads"]

    itens = [{"recebimento_lote_id": lotes[0]["id"], "resultado": "<1"}, {"recebimento_lote_id": lotes[1]["id"], "resultado": "210"}]
    r = cliente.post(f"{URL}/lancar", json={"analise": "CT", "itens": itens})
    assert r.status_code == 200, r.text
    assert r.json()["previa"] and r.json()["alarmes"] == 1 and "Acima do limite" in r.json()["texto"]
    assert all(l["ct"]["resultado"] is None for l in cliente.get(f"{URL}/resultados", params={"busca": "98704"}).json()["lotes"])

    r = cliente.post(f"{URL}/lancar", json={"analise": "CT", "itens": itens, "previa": False})
    assert r.json()["gravados"] == 2
    lotes = cliente.get(f"{URL}/resultados", params={"busca": "98704"}).json()["lotes"]
    assert [(l["ct"]["resultado"], l["ct"]["nao_ok"], l["situacao"]) for l in lotes] == [("<1", False, "Para hoje"), ("210", True, "Não ok")]
    depois = next(f for f in cliente.get(f"{URL}/painel").json()["fabricas"] if f["fabrica"] == "COL")
    assert (depois["nao_ok"] - col["nao_ok"], depois["lidos"] - col["lidos"]) == (1, 2)
    assert cliente.get(f"{URL}/resultados", params={"fabrica": "COL", "so_pendentes": True}).json()["total"] >= 2


def test_lancar_recusa_resultado_invalido(cliente, logado):
    logado()
    r = cliente.post(f"{URL}/lancar", json={"analise": "CT", "itens": [{"recebimento_lote_id": 1, "resultado": "abc"}]})
    assert r.status_code == 422 and "inválido" in r.json()["detail"]
    r = cliente.post(f"{URL}/lancar", json={"analise": "CT", "itens": [{"recebimento_lote_id": 999999999, "resultado": "<1"}]})
    assert r.status_code == 422 and "não encontrado" in r.json()["detail"]


def test_o_app_chama_as_funcoes_do_bot(conexao):
    for assinatura in (
        "registrar_recebimento(bigint, text, text, text, int[], date, boolean, boolean)",
        "lancar_contagem(bigint, text, jsonb, boolean)",
    ):
        assert conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]
