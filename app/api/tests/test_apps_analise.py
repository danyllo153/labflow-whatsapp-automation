"""APP-061 (Fase E, E3 a E8): os apps de análise gravam pelas mesmas funções do bot (042 a 047). Dados fictícios."""

from datetime import timedelta

import pytest

SENHA = "Senha-de-teste-1"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.apps"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


@pytest.fixture
def hoje(conexao):
    return conexao.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]


def _confirmar(cliente, url, pedido):
    """Prévia e Confirmar, como a tela faz: a prévia não grava, o Confirmar grava."""
    previa = cliente.post(url, json={**pedido, "previa": True})
    assert previa.status_code == 200, previa.text
    assert previa.json()["previa"] and previa.json()["texto"]
    feito = cliente.post(url, json={**pedido, "previa": False})
    assert feito.status_code == 200, feito.text
    return previa.json(), feito.json()


# --- E3 tanques ---------------------------------------------------------------------------------------------------


def test_tanques_coleta_analise_leituras_e_placas(cliente, logado, hoje):
    logado()
    coleta = {"origem": "terra", "tanques": "9901, 9902", "data": str(hoje - timedelta(days=11))}
    previa, _ = _confirmar(cliente, "/analises/tanques/coleta", coleta)
    assert previa["dados"]["tanques"] == ["9901", "9902"]
    r = cliente.post("/analises/tanques/coleta", json={**coleta, "previa": True})
    assert r.status_code == 422 and "já registrada" in r.json()["detail"]  # a mesma regra do bot

    _confirmar(cliente, "/analises/tanques/analise", {**coleta, "tanques": "9901", "frasco": "Normal"})
    leituras = [l for l in cliente.get("/analises/tanques/leituras", params={"busca": "9901"}).json() if l["tanque"] == "9901"]
    assert {l["analise"] for l in leituras} >= {"C.T 48h"} and all(l["situacao"] == "Atrasado" for l in leituras)

    ct = next(l for l in leituras if l["analise"] == "C.T 48h")
    previa, feito = _confirmar(cliente, "/analises/tanques/placas", {
        "itens": [{"analise_id": ct["analise_id"], "etapa": ct["etapa"], "placas": "<1, <1, 2"}]})
    assert "Placas:" in previa["texto"] and feito["dados"]["leituras"] == 1
    outra = next(l for l in leituras if l["analise_id"] != ct["analise_id"])
    r = cliente.post("/analises/tanques/leituras/concluir", json={"itens": [{"analise_id": outra["analise_id"], "etapa": outra["etapa"]}]})
    assert r.status_code == 200 and r.json()["dados"]["concluidas"] == 1
    restantes = {(l["analise_id"], l["etapa"]) for l in cliente.get("/analises/tanques/leituras", params={"busca": "9901"}).json()}
    assert (ct["analise_id"], ct["etapa"]) not in restantes and (outra["analise_id"], outra["etapa"]) not in restantes

    r = cliente.post("/analises/tanques/placas", json={"itens": [{"analise_id": ct["analise_id"], "etapa": "final", "placas": "1 2"}]})
    assert r.status_code == 422 and "3 placas" in r.json()["detail"]


def test_coletor_registra_coleta_mas_nao_analise(cliente, logado, hoje):
    logado("Coletor")
    coleta = {"origem": "navio", "navio": "NAVIO TESTE 901", "tanques": "1C, 2P", "data": str(hoje)}
    assert cliente.post("/analises/tanques/coleta", json=coleta).status_code == 200
    assert cliente.post("/analises/tanques/analise", json={**coleta, "frasco": "Normal"}).status_code == 403


# --- E5 drops e E8 desvios ------------------------------------------------------------------------------------------


def test_drops_concluir_e_desvio(cliente, logado, hoje):
    logado()
    _confirmar(cliente, "/analises/tanques/coleta", {"origem": "terra", "tanques": "9903", "data": str(hoje - timedelta(days=16))})
    pendentes = [d for d in cliente.get("/analises/drops", params={"busca": "9903"}).json()["pendentes"] if d["tanque"] == "9903"]
    assert sorted(d["drop"] for d in pendentes) == ["D10", "D15", "D5"]
    d5, d10 = (next(d for d in pendentes if d["drop"] == x) for x in ("D5", "D10"))
    previa, feito = _confirmar(cliente, "/analises/drops/concluir", {"ids": [d5["drop_id"]]})
    assert feito["dados"]["concluidos"] == 1

    r = cliente.post("/analises/drops/desvio", json={"drop_id": d10["drop_id"]})
    assert r.status_code == 200, r.text
    desvio = next(d for d in cliente.get("/analises/drops", params={"busca": "9903"}).json()["desvios"] if d["tanque"] == "9903")
    r = cliente.post(f"/analises/drops/desvio/{desvio['desvio_id']}/fechar", json={"temperaturas": [25, 7]})
    assert r.status_code == 200 and "confirmou em 7, 25" in r.json()["texto"]


def test_desvio_de_tanque_repeticao_e_finalizar_o_dia(cliente, logado, hoje):
    logado()
    coleta = {"origem": "terra", "tanques": "9904", "data": str(hoje - timedelta(days=11))}
    _confirmar(cliente, "/analises/tanques/coleta", coleta)
    _confirmar(cliente, "/analises/tanques/analise", {**coleta, "frasco": "Normal"})
    ct = next(l for l in cliente.get("/analises/tanques/leituras", params={"busca": "9904"}).json() if l["analise"] == "C.T 48h")
    _, feito = _confirmar(cliente, "/analises/tanques/placas", {"itens": [{"analise_id": ct["analise_id"], "etapa": ct["etapa"], "placas": ">300, 2, 2"}]})
    assert feito["dados"]["nao_ok"] == 1

    para_abrir = cliente.get("/analises/desvios", params={"busca": "9904"}).json()["para_abrir"]
    assert [(l["analise_id"], l["etapa"]) for l in para_abrir] == [(ct["analise_id"], ct["etapa"])]
    r = cliente.post("/analises/desvios/abrir", json={"analise_id": ct["analise_id"], "etapa": ct["etapa"]})
    assert r.status_code == 200 and "Desvio aberto" in r.json()["texto"]
    assert cliente.post("/analises/desvios/abrir", json={"analise_id": ct["analise_id"], "etapa": ct["etapa"]}).status_code == 422

    aberto = next(d for d in cliente.get("/analises/desvios", params={"busca": "9904"}).json()["abertos"] if d["tanque"] == "9904")
    assert not aberto["repeticao_feita"]
    assert cliente.post(f"/analises/desvios/{aberto['desvio_id']}/repeticao").status_code == 200
    assert next(d for d in cliente.get("/analises/desvios", params={"busca": "9904"}).json()["abertos"] if d["tanque"] == "9904")["repeticao_feita"]

    r = cliente.post("/analises/leitura-do-dia/finalizar", json={"previa": True})
    assert r.status_code == 200 and r.json()["texto"].startswith("Finalizar o dia:")


# --- E4 testes e E6 embarque ----------------------------------------------------------------------------------------


def test_tab_do_recebimento_em_lote(cliente, logado, hoje):
    logado()
    url = "/analises/recebimento-fcoj"
    cliente.post(f"{url}/registrar", json={"load": "98720", "item": "99902", "fabrica": "AQA", "lotes": "1-6", "data": str(hoje), "previa": False, "compostas": ""})
    cliente.post(f"{url}/compostas", json={"load": "98720", "item": "99902", "grupos": "(1-3)(4-6)", "previa": False})
    sem_tab = [c for c in cliente.get("/analises/testes/compostas", params={"tipo": "TAB"}).json() if c["alvo"].startswith("Load 98720")]
    assert len(sem_tab) == 2
    _confirmar(cliente, "/analises/testes/feito", {"tipo": "TAB", "composta_ids": [c["composta_id"] for c in sem_tab], "data": str(hoje)})

    meus = [t for t in cliente.get("/analises/testes/pendentes", params={"busca": "98720"}).json() if t["teste"] == "Tab"]
    assert len(meus) == 2 and {t["proxima"] for t in meus} == {"espalhar"}
    r = cliente.post("/analises/testes/acao", json={"acao": "espalhar", "tipo": "TAB", "ids": [t["teste_id"] for t in meus]})
    assert r.status_code == 200 and r.json()["dados"]["atualizados"] == 2
    meus = [t for t in cliente.get("/analises/testes/pendentes", params={"busca": "98720"}).json() if t["teste"] == "Tab"]
    assert {t["proxima"] for t in meus} == {"ler"}
    r = cliente.post("/analises/testes/acao", json={"acao": "negativos", "tipo": "TAB", "ids": [t["teste_id"] for t in meus]})
    assert r.json()["dados"]["atualizados"] == 2
    assert not [t for t in cliente.get("/analises/testes/pendentes", params={"busca": "98720"}).json() if t["teste"] == "Tab"]


def test_embarque_amostras_compostas_resultados_e_howard(cliente, logado, hoje):
    logado()
    embarque = {"navio": "NAVIO TESTE 902", "linha": 1, "fase": 2, "load": "98721", "item": "99902", "amostras": "1-4", "data": str(hoje)}
    previa, _ = _confirmar(cliente, "/analises/embarque/registrar", embarque)
    assert previa["dados"]["novas"] == [1, 2, 3, 4]
    amostras = [a for a in cliente.get("/analises/embarque/amostras", params={"busca": "NAVIO TESTE 902"}).json()]
    assert [a["amostra"] for a in amostras] == ["A1", "A2", "A3", "A4"] and all(a["ct"] is None for a in amostras)

    _confirmar(cliente, "/analises/embarque/compostas", {"navio": "NAVIO TESTE 902", "linha": 1, "fase": 2, "grupos": "(1-2)(3-4)"})
    _confirmar(cliente, "/analises/embarque/lancar", {
        "analise": "CT", "itens": [{"embarque_amostra_id": a["id"], "resultado": "<1"} for a in amostras]})
    amostras = cliente.get("/analises/embarque/amostras", params={"busca": "NAVIO TESTE 902"}).json()
    assert {a["ct"] for a in amostras} == {"<1"} and all(a["composta"] for a in amostras)

    howard = [c for c in cliente.get("/analises/testes/compostas", params={"tipo": "HOWARD"}).json() if "NAVIO TESTE 902" in c["alvo"]]
    assert len(howard) == 2
    assert cliente.post("/analises/testes/howard", json={"composta_id": howard[0]["composta_id"], "percentual": 31}).status_code == 422
    r = cliente.post("/analises/testes/howard", json={"composta_id": howard[0]["composta_id"], "percentual": 30})
    assert r.status_code == 200 and "15 campos positivos de 50" in r.json()["texto"]


# --- E7 NFC recebido ------------------------------------------------------------------------------------------------


def test_nfc_registrar_e_lancar(cliente, logado, hoje):
    logado()
    pedido = {"load": "98722", "fabrica": "ucH", "data": str(hoje - timedelta(days=3)),
              "lotes": [{"lote": 5, "amostra": "fresh", "diluicao": 1}, {"lote": 5, "amostra": "past", "diluicao": 0}]}
    previa, _ = _confirmar(cliente, "/analises/recebimento-nfc/registrar", pedido)
    assert "Load 98722 (UCH)" in previa["texto"] and "lote 5 fresh 10^1" in previa["texto"]
    pendentes = [p for p in cliente.get("/analises/recebimento-nfc/pendentes", params={"busca": "98722"}).json()]
    assert {(p["amostra"], p["analise"]) for p in pendentes} == {("fresh", "CT"), ("fresh", "BL72"), ("past", "CT"), ("past", "BL72")}
    fresh_ct = next(p for p in pendentes if p["amostra"] == "fresh" and p["analise"] == "CT")
    previa, feito = _confirmar(cliente, "/analises/recebimento-nfc/lancar", {"itens": [{"id": fresh_ct["id"], "analise": "CT", "resultado": "12"}]})
    assert previa["texto"] == "load 98722 lote 5 fresh · C.T 48h: lido 12 → 120 (10^1)" and feito["dados"]["gravados"] == 1
    assert len(cliente.get("/analises/recebimento-nfc/pendentes", params={"busca": "98722"}).json()) == 3
    r = cliente.post("/analises/recebimento-nfc/registrar", json={**pedido, "fabrica": "XYZ"})
    assert r.status_code == 422


def test_o_consultor_ve_mas_nao_grava(cliente, logado):
    logado("Consultor")
    assert cliente.get("/analises/tanques/leituras").status_code == 200
    assert cliente.get("/analises/drops").status_code == 200
    assert cliente.post("/analises/leitura-do-dia/finalizar", json={"previa": True}).status_code == 403


def test_laudo_do_recebimento_nfc_no_modelo_do_fcoj(cliente, logado, hoje):
    """073: folhas próprias do NFC, no mesmo modelo do FCOJ; o lido na placa e, na Observação, o tipo e a diluição."""
    logado()
    pedido = {"load": "98723", "fabrica": "UCH", "data": str(hoje - timedelta(days=2)),
              "lotes": [{"lote": 7, "amostra": "fresh", "diluicao": 3}, {"lote": 7, "amostra": "past", "diluicao": 1}]}
    _confirmar(cliente, "/analises/recebimento-nfc/registrar", pedido)
    ct = next(p for p in cliente.get("/analises/recebimento-nfc/pendentes", params={"busca": "98723"}).json()
              if p["amostra"] == "fresh" and p["analise"] == "CT")
    _confirmar(cliente, "/analises/recebimento-nfc/lancar", {"itens": [{"id": ct["id"], "analise": "CT", "resultado": "2"}]})

    r = cliente.get("/laudos/recebimento-nfc")
    assert r.status_code == 200, r.text
    laudo = r.json()
    assert laudo["titulo"] == "Recebimento NFC" and laudo["paginas"][0]["capacidade"] == 15
    assert cliente.get("/laudos/recebimento-nfc").json()["paginas"][0]["linhas"] == laudo["paginas"][0]["linhas"]  # não entra duas vezes
    pdf = cliente.get(f"/laudos/recebimento-nfc/{laudo['paginas'][0]['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    from pypdf import PdfReader
    import io

    texto = PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()
    assert "98723" in texto and "129" in texto and "fresh 10³" in texto and "past 10¹" in texto
    assert "2000" not in texto  # o C.T sai como lido na placa (2), não multiplicado
    fcoj = cliente.get("/laudos/recebimento-fcoj").json()["paginas"]
    assert all(p["id"] != laudo["paginas"][0]["id"] for p in fcoj)  # folhas separadas do FCOJ
