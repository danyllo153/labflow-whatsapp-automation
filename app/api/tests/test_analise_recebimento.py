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


@pytest.mark.parametrize(
    ("n", "tamanhos"),
    [(1, [1]), (5, [5]), (6, [6]), (7, [3, 4]), (8, [4, 4]), (10, [5, 5]), (12, [6, 6]), (13, [4, 4, 5]), (18, [4, 4, 5, 5]),
     (20, [5, 5, 5, 5])],
)
def test_recomendar_compostas(n, tamanhos):
    from labflow_api.rotas_analise_recebimento import recomendar_compostas

    grupos = recomendar_compostas(list(range(1, n + 1)))
    assert [len(g) for g in grupos] == tamanhos
    assert sum(grupos, []) == list(range(1, n + 1))  # todos os lotes, na ordem, uma vez só


def test_compostas_recomenda_previa_e_cria(cliente, logado, hoje):
    logado()
    cliente.post(f"{URL}/registrar", json={"load": "98706", "item": "99902", "fabrica": "UCH", "lotes": "1-20", "data": str(hoje), "previa": False})
    load = next(l for l in cliente.get(f"{URL}/compostas").json() if l["load"] == "98706")
    assert (load["livres"], load["n_livres"], load["compostas"]) == ("1-20", 20, [])
    assert load["recomendado"] == "(1-5)(6-10)(11-15)(16-20)"

    pedido = {"load": "98706", "item": "99902", "grupos": "(1-3)(4-6)"}
    r = cliente.post(f"{URL}/compostas", json=pedido)
    assert r.status_code == 200, r.text
    assert r.json()["previa"] and r.json()["criadas"] == 0 and "2 compostas no load 98706" in r.json()["texto"]
    r = cliente.post(f"{URL}/compostas", json={**pedido, "previa": False})
    assert r.json()["criadas"] == 2

    load = cliente.get(f"{URL}/compostas", params={"busca": "98706"}).json()[0]
    assert load["livres"] == "7-20" and [c["lotes"] for c in load["compostas"]] == ["1-3", "4-6"]
    assert load["recomendado"] == "(7-10)(11-15)(16-20)"  # 14 livres: 4+5+5

    r = cliente.post(f"{URL}/compostas", json={**pedido, "grupos": "(6-8)", "previa": True})
    assert r.status_code == 422 and "já está na composta" in r.json()["detail"]
    r = cliente.post(f"{URL}/compostas", json={**pedido, "grupos": "nada"})
    assert r.status_code == 422


def test_coletor_nao_cria_composta(cliente, logado):
    logado("Coletor")
    assert cliente.post(f"{URL}/compostas", json={"load": "1", "item": "1", "grupos": "(1)"}).status_code == 403


def test_lotes_que_faltam_na_sequencia():
    from labflow_api.rotas_analise_recebimento import lotes_que_faltam

    assert lotes_que_faltam([23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 35, 36, 39, 40]) == [33, 34, 37, 38]  # o "*" da foto
    assert lotes_que_faltam(list(range(20, 35))) == []
    assert lotes_que_faltam([]) == []


def test_modelo_do_recebimento_e_deitado():
    from labflow_api.rotas_analise_recebimento import _demonstracao, modelo_deitado_valido

    modelo_deitado_valido(_demonstracao())
    with pytest.raises(ValueError, match="A4 deitado"):
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        import io

        saida = io.BytesIO()
        c = canvas.Canvas(saida, pagesize=A4)
        c.showPage()
        c.save()
        modelo_deitado_valido(saida.getvalue())


def test_laudo_recebe_os_loads_sozinho_e_gera_o_pdf(cliente, logado, hoje):
    logado()
    cliente.post(f"{URL}/registrar", json={"load": "98707", "item": "99902", "fabrica": "TMG", "lotes": "1-2, 4", "data": str(hoje), "previa": False})
    lotes = cliente.get(f"{URL}/resultados", params={"busca": "98707"}).json()["lotes"]
    cliente.post(f"{URL}/lancar", json={"analise": "CT", "previa": False, "itens": [{"recebimento_lote_id": l["id"], "resultado": "<1"} for l in lotes]})

    r = cliente.get("/laudos/recebimento-fcoj")
    assert r.status_code == 200, r.text
    laudo = r.json()
    assert laudo["titulo"] == "Recebimento de FCOJ" and laudo["paginas"]
    pagina = laudo["paginas"][0]
    assert pagina["capacidade"] == 15 and pagina["linhas"] >= 1 and not pagina["impresso"]  # uma linha por lote
    assert cliente.get("/laudos/recebimento-fcoj").json()["paginas"][0]["linhas"] == pagina["linhas"]  # não entra duas vezes

    pdf = cliente.get(f"/laudos/recebimento-fcoj/{pagina['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    from pypdf import PdfReader
    import io

    texto = PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()
    assert "98707" in texto and "TMG" in texto and "<1" in texto and "* 3" in texto  # o lote 3 faltou
    assert "analista.teste" in texto  # Analista Responsável: quem registrou


def test_laudo_do_recebimento_no_banco(conexao):
    assert conexao.execute("SELECT has_table_privilege('labflow_app_web', 'app.recebimento_laudo', 'INSERT')").fetchone()[0]
    assert not conexao.execute("SELECT has_table_privilege('labflow_app_web', 'app.recebimento_laudo', 'DELETE')").fetchone()[0]
