"""APP-045: corrigir e excluir recebimento (FCOJ) pelo app, pelas funções do banco (036) e a 064. Dados fictícios."""

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def load(conexao):
    item = conexao.execute("INSERT INTO itens (codigo) VALUES ('99901') RETURNING id").fetchone()[0]
    load_id = conexao.execute("INSERT INTO loads (numero, item_id) VALUES ('98765', %s) RETURNING id", (item,)).fetchone()[0]
    lotes = [
        conexao.execute(
            "INSERT INTO recebimento_lotes (load_id, lote, data_recebimento) VALUES (%s, %s, '2026-10-20') RETURNING id", (load_id, n)
        ).fetchone()[0]
        for n in (1, 2)
    ]
    return load_id, lotes


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.teste"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


def test_buscar_corrigir_e_excluir(cliente, logado, load):
    load_id, (lote1, lote2) = load
    logado()
    achados = cliente.get("/recebimento-fcoj/load", params={"numero": "98765"}).json()
    assert [(l["item"], [x["lote"] for x in l["lotes"]]) for l in achados] == [("99901", [1, 2])]
    r = cliente.put(f"/recebimento-fcoj/lotes/{lote2}", json={"lote": 1})
    assert r.status_code == 422 and "já tem o lote 1" in r.json()["detail"]  # a regra é a da função do banco
    r = cliente.put(f"/recebimento-fcoj/lotes/{lote2}", json={"lote": 3, "motivo": "digitado errado"})
    assert r.status_code == 200, r.text
    assert [x["lote"] for x in r.json()[0]["lotes"]] == [1, 3]
    r = cliente.post(f"/recebimento-fcoj/lotes/{lote1}/excluir", json={"motivo": "teste"})
    assert r.status_code == 200 and [x["lote"] for x in r.json()[0]["lotes"]] == [3]
    r = cliente.put(f"/recebimento-fcoj/loads/{load_id}", json={"fabrica": "XYZ"})
    assert r.status_code == 422 and "Fábrica inválida" in r.json()["detail"]


def test_coletor_e_recusado_pela_funcao(cliente, logado, load):
    _, (lote1, _) = load
    logado("Coletor")
    r = cliente.put(f"/recebimento-fcoj/lotes/{lote1}", json={"lote": 5})
    assert r.status_code == 422 and "cargo" in r.json()["detail"]


def test_o_app_chama_as_funcoes_do_recebimento(conexao):
    for assinatura in ("corrigir_recebimento(bigint, jsonb, bigint, text)", "excluir_recebimento(bigint, bigint, text)"):
        assert conexao.execute("SELECT has_function_privilege('labflow_app_web', %s, 'EXECUTE')", (assinatura,)).fetchone()[0]
