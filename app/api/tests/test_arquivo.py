"""Arquivo de contra-amostras (PB21, migration 105 do bot): caixas, conteúdo, arquivar e descartar. Dados fictícios."""

from datetime import timedelta

import pytest

SENHA = "Senha-de-teste-1"
REC = "/analises/recebimento-fcoj"


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.arquivo"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


@pytest.fixture
def hoje(conexao):
    return conexao.execute("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date").fetchone()[0]


def _receber(cliente, load, lotes, dia):
    r = cliente.post(f"{REC}/registrar", json={"load": load, "item": "99902", "fabrica": "TMG", "lotes": lotes, "data": str(dia), "previa": False})
    assert r.status_code == 200, r.text


def test_caixas_e_sugerida(cliente, logado):
    logado("Consultor")
    r = cliente.get("/arquivo")
    assert r.status_code == 200, r.text
    dados = r.json()
    rec = [c for c in dados["caixas"] if c["tipo"] == "recebimento"]
    assert [c["numero"] for c in rec][:1] == [121] and rec[-1]["numero"] == 153
    assert {c["numero"] for c in dados["caixas"] if c["tipo"] == "tanque"} >= {34, 49}
    assert 121 <= dados["sugerida_recebimento"] <= 153 and dados["pode_gravar"] is False
    assert cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 121}).status_code == 403


def test_arquivar_recebimento_previa_confirmar_e_descartar(cliente, logado, hoje):
    logado()
    _receber(cliente, "98801", "1-5", hoje - timedelta(days=9))
    pedido = {"load": "98801", "lotes": "1-3", "caixa": 144, "data": str(hoje - timedelta(days=8))}
    previa = cliente.post("/arquivo/arquivar", json={**pedido, "previa": True})
    assert previa.status_code == 200, previa.text
    assert previa.json()["previa"] and "Caixa 144 (recebimento): load 98801 lotes 1-3" in previa.json()["texto"]
    assert cliente.get("/arquivo/recebimento/144").json()["itens"] == []  # a prévia não grava
    assert cliente.post("/arquivo/arquivar", json={**pedido, "previa": False}).status_code == 200

    r = cliente.post("/arquivo/arquivar", json={**pedido, "lotes": "3-4", "previa": True})
    assert r.status_code == 422 and "já está na caixa 144" in r.json()["detail"]  # a mesma recusa do bot
    r = cliente.post("/arquivo/arquivar", json={**pedido, "caixa": 99, "previa": True})
    assert r.status_code == 422 and "121 a 153" in r.json()["detail"]

    caixa = cliente.get("/arquivo/recebimento/144").json()
    assert caixa["caixa"]["situacao"] == "Vencida" and caixa["itens"][0]["situacao"] == "Vencido"
    assert caixa["itens"][0]["load"] == "98801" and caixa["itens"][0]["lotes"] == "1-3"

    previa = cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 144, "previa": True}).json()
    assert "load 98801" in previa["texto"]
    assert cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 144, "previa": False}).status_code == 200
    depois = cliente.get("/arquivo/recebimento/144", params={"descartados": True}).json()
    assert depois["caixa"]["situacao"] == "Disponível" and depois["itens"][0]["situacao"] == "Descartado"
    r = cliente.post("/arquivo/descartar", json={"tipo": "recebimento", "numero": 144, "previa": True})
    assert r.status_code == 422 and "Nada vencido" in r.json()["detail"]


def test_caixa_que_nao_existe(cliente, logado):
    logado()
    assert cliente.get("/arquivo/recebimento/999").status_code == 404


def test_caixa_do_recebimento_so_vence_inteira_e_a_busca_pelo_load(cliente, logado, hoje):
    """26/10: um load vencido sozinho não põe a caixa em "Para descartar"; só quando todos venceram. A busca acha o load."""
    logado()
    _receber(cliente, "98811", "1-3", hoje - timedelta(days=9))
    _receber(cliente, "98812", "1-3", hoje - timedelta(days=1))
    for load, dias in (("98811", 8), ("98812", 1)):
        r = cliente.post("/arquivo/arquivar", json={"load": load, "lotes": "1-3", "caixa": 143, "data": str(hoje - timedelta(days=dias)), "previa": False})
        assert r.status_code == 200, r.text
    caixa = next(c for c in cliente.get("/arquivo").json()["caixas"] if c["tipo"] == "recebimento" and c["numero"] == 143)
    assert caixa["situacao"] == "Em uso" and caixa["itens_vencidos"] == 1
    assert caixa["descarte_em"] == str(hoje + timedelta(days=6))  # a data do último load a vencer
    achados = cliente.get("/arquivo/busca", params={"load": "98812"}).json()
    assert [(a["tipo"], a["caixa"], a["lotes"]) for a in achados] == [("recebimento", 143, "1-3")]


def test_busca_pelo_navio_e_o_laudo_da_caixa(cliente, logado, hoje, conexao):
    """01/11: com letras, a busca acha a caixa do navio ("o.teste 205", sem ponto ou espaço também); o Laudo da caixa é a
    folha do laudo de contra-amostra onde ela está; o tanque não tem laudo."""
    conexao.execute("INSERT INTO arquivo_familias (nome, caixa_de, caixa_ate) VALUES ('O.TESTE', 901, 902)")
    conexao.execute("INSERT INTO arquivo_caixas (tipo, numero, familia) VALUES ('navio', 901, 'O.TESTE'), ('navio', 902, 'O.TESTE')")
    conexao.execute("INSERT INTO arquivo_navios (caixa, navio, viagem, origem, descarte_carga) VALUES (901, 'O.TESTE', '205', 'carga', '2028-10-25')")
    logado()
    for termo in ("O.TESTE 205", "oteste205", "o.teste"):
        achados = cliente.get("/arquivo/busca", params={"load": termo}).json()
        assert ("navio", 901, "O.TESTE 205") in [(a["tipo"], a["caixa"], a["navio"]) for a in achados], termo
    assert cliente.get("/arquivo/busca", params={"load": "O.NADA 1"}).json() == []

    _receber(cliente, "98821", "1-2", hoje - timedelta(days=1))
    assert cliente.post("/arquivo/arquivar", json={"load": "98821", "lotes": "1-2", "caixa": 144, "data": str(hoje), "previa": False}).status_code == 200
    folhas = cliente.get("/arquivo/recebimento/144/laudo").json()
    assert len(folhas) == 1 and folhas[0]["laudo"] == "contra-recebimento"
    assert cliente.get(f"/laudos/contra-recebimento/{folhas[0]['pagina_id']}/pdf").status_code == 200
    assert cliente.get("/arquivo/tanque/34/laudo").status_code == 404


def test_data_inicial_da_caixa_de_navio_a_mao_e_de_volta_a_automatica(cliente, logado, conexao):
    """PB24 (109 do bot), 01/11: a caixa de navio mostra a data inicial; o Analista escolhe outra (prévia e Confirmar) e
    volta à automática."""
    conexao.execute("INSERT INTO arquivo_familias (nome, caixa_de, caixa_ate) VALUES ('O.TESTE', 901, 902)")
    conexao.execute("INSERT INTO arquivo_caixas (tipo, numero, familia) VALUES ('navio', 901, 'O.TESTE'), ('navio', 902, 'O.TESTE')")
    conexao.execute("INSERT INTO arquivo_navios (caixa, navio, viagem, origem, descarte_carga) VALUES (901, 'O.TESTE', '205', 'carga', '2028-10-25')")
    logado()
    cx = cliente.get("/arquivo/navio/901").json()["caixa"]
    assert cx["inicio_fixado"] is False
    r = cliente.post("/arquivo/data-inicial", json={"numero": 901, "data": "2026-10-30"})
    assert r.status_code == 200, r.text
    assert r.json()["previa"] and "30/10/2026 (escolhida à mão)" in r.json()["texto"]
    assert cliente.get("/arquivo/navio/901").json()["caixa"]["inicio_fixado"] is False  # a prévia não grava
    assert cliente.post("/arquivo/data-inicial", json={"numero": 901, "data": "2026-10-30", "previa": False}).status_code == 200
    cx = cliente.get("/arquivo/navio/901").json()["caixa"]
    assert (cx["inicio_em"], cx["inicio_fixado"]) == ("2026-10-30", True)
    assert cliente.post("/arquivo/data-inicial", json={"numero": 901, "data": None, "previa": False}).status_code == 200
    assert cliente.get("/arquivo/navio/901").json()["caixa"]["inicio_fixado"] is False
    r = cliente.post("/arquivo/data-inicial", json={"numero": 902, "data": "2026-10-30"})
    assert r.status_code == 422 and "vazia" in r.json()["detail"]  # a recusa do banco, em português


def test_caixa_da_planilha_guarda_o_pdf_do_laudo_e_o_botao_laudo_abre(cliente, logado, conexao):
    """01/11: a caixa de navio da planilha (carga inicial) recebe o PDF do laudo pronto; o Laudo da caixa abre esse PDF;
    outro PDF troca o anterior; a caixa que não veio da planilha recusa."""
    conexao.execute("INSERT INTO arquivo_familias (nome, caixa_de, caixa_ate) VALUES ('O.TESTE', 901, 902)")
    conexao.execute("INSERT INTO arquivo_caixas (tipo, numero, familia) VALUES ('navio', 901, 'O.TESTE'), ('navio', 902, 'O.TESTE')")
    conexao.execute("INSERT INTO arquivo_navios (caixa, navio, viagem, origem, descarte_carga) VALUES (901, 'O.TESTE', '205', 'carga', '2028-10-25')")
    pdf = b"%PDF-1.4 laudo de teste ficticio"
    cabecalho = {"Content-Type": "application/pdf"}
    logado("Consultor")
    assert cliente.put("/arquivo/navio/901/laudo-pdf", content=pdf, headers=cabecalho).status_code == 403
    logado()
    cx = cliente.get("/arquivo/navio/901").json()["caixa"]
    assert (cx["da_planilha"], cx["laudo_pdf"]) == (True, False)
    assert cliente.get("/arquivo/navio/901/laudo-pdf").status_code == 404

    r = cliente.put("/arquivo/navio/901/laudo-pdf", params={"nome": "caixa 901.pdf"}, content=pdf, headers=cabecalho)
    assert r.status_code == 200, r.text
    assert r.json()["texto"] == "Laudo da caixa 901 guardado."
    assert cliente.get("/arquivo/navio/901").json()["caixa"]["laudo_pdf"] is True
    baixado = cliente.get("/arquivo/navio/901/laudo-pdf")
    assert baixado.status_code == 200 and baixado.content == pdf and baixado.headers["content-type"] == "application/pdf"

    outro = b"%PDF-1.4 outro laudo ficticio"
    assert cliente.put("/arquivo/navio/901/laudo-pdf", content=outro, headers=cabecalho).json()["texto"] == "Laudo da caixa 901 trocado."
    assert cliente.get("/arquivo/navio/901/laudo-pdf").content == outro

    r = cliente.put("/arquivo/navio/901/laudo-pdf", content=b"nao e pdf", headers=cabecalho)
    assert r.status_code == 422 and "não é um PDF" in r.json()["detail"]
    r = cliente.put("/arquivo/navio/902/laudo-pdf", content=pdf, headers=cabecalho)
    assert r.status_code == 422 and "não veio da planilha" in r.json()["detail"]
