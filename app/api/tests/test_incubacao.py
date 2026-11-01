"""APP-040: laudo Controle de Incubação e Leitura (lê a bi.incubacao do bot e as águas do app). Dados fictícios."""

import io
from datetime import date, datetime

import pytest
from pypdf import PdfReader

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"
DIA = date(2031, 3, 10)


@pytest.fixture
def logado(cliente, criar_pessoa, monkeypatch):
    monkeypatch.setattr(rotas_turno, "_agora", lambda con: datetime(2031, 3, 12, 10, tzinfo=FUSO))

    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def _tanque(conexao, uid, tanque, frasco, dia, sub_analises=("CT", "BL", "WORT")):
    coleta = conexao.execute(
        "INSERT INTO coletas (origem, tanque, data_coleta, registrado_por) VALUES ('terra', %s, %s, %s) RETURNING id", (tanque, dia, uid)
    ).fetchone()[0]
    for sub in sub_analises:
        conexao.execute(
            """
            INSERT INTO analises (coleta_id, frasco, sub_analise, metodo, data_analise, pre_leitura_prevista, leitura_final_prevista, status)
            VALUES (%s, %s, %s, 'Profundidade', %s, %s, %s, 'Aguardando Leitura Final')
            """,
            (coleta, frasco, sub, dia, None if sub == "CT" else dia, dia),
        )


@pytest.fixture
def dados(conexao, logado, cliente):
    uid = logado()
    _tanque(conexao, uid, "38", "Normal", DIA)
    _tanque(conexao, uid, "38", "Stress", date(2031, 3, 11))  # o ST com a data que o analista disse, sem somar dia
    _tanque(conexao, uid, "40", "Normal", DIA, ("CT", "BL"))
    item = conexao.execute("INSERT INTO itens (codigo) VALUES ('99902') RETURNING id").fetchone()[0]
    load = conexao.execute("INSERT INTO loads (numero, item_id) VALUES ('98770', %s) RETURNING id", (item,)).fetchone()[0]
    for n in (2, 1):
        conexao.execute("INSERT INTO recebimento_lotes (load_id, lote, data_recebimento) VALUES (%s, %s, %s)", (load, n, DIA))
    for meio, lote in (("OSA", "OSA-77"), ("PDA", "PDA-55"), ("Wort", "WRT-11")):
        r = cliente.post("/meios", json={"meio": meio, "lote": lote, "recebido_em": "2026-01-05", "usar": True})
        assert r.status_code in (200, 201), r.text
    return uid


def test_dia_com_tanques_recebimento_lotes_e_leituras(cliente, dados):
    d = cliente.get("/incubacao", params={"dia": DIA.isoformat()}).json()
    assert d["amostras"] == ["REC: 98770 (1, 2); TQ: 38, 40 (N)."]
    assert d["meios"] == {"OSA": "OSA-77", "PDA": "PDA-55", "PCA": "-", "Wort": "WRT-11"}
    assert d["leituras"] == {"48h": "2031-03-12", "72h": "2031-03-13", "120h": "2031-03-15", "240h": "2031-03-20"}
    st = cliente.get("/incubacao", params={"dia": "2031-03-11"}).json()
    assert st["amostras"] == ["TQ: 38 (ST)."]


def test_aguas_usam_pca_e_pda_e_dia_sem_tanque_fica_com_traco(cliente, dados):
    r = cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["10", "08"], "dia": "2031-03-11", "hora": "07:10"})
    assert r.status_code in (200, 201), r.text
    d = cliente.get("/incubacao", params={"dia": "2031-03-11"}).json()
    assert d["amostras"] == ["TQ: 38 (ST); Baias: 8,10."]
    assert d["meios"]["PCA"] is None  # o meio foi usado, mas não há lote de PCA marcado: fica em branco no laudo
    assert d["leituras"]["48h"] == "2031-03-13"


def test_padrao_de_escrita_ordem_singular_e_agua_sem_pca(cliente, dados, conexao):
    """Ordem do laboratório: REC; embarque; navio; TQ; água do processo; baias; linhas; NFC. Ponto no fim."""
    for tipo, ponto in (("Linha", "4"), ("Baia", "3"), ("Baia", "3")):
        cliente.post("/aguas/superficies", json={"tipo": tipo, "pontos": [ponto], "dia": "2031-03-10", "hora": "07:10"})
    r = cliente.post("/aguas/processo", json={"dia": "2031-03-10", "hora": "09:00", "pontos": ["manifold", "camara5"]})
    assert r.status_code in (200, 201), r.text
    d = cliente.get("/incubacao", params={"dia": DIA.isoformat()}).json()
    assert " ".join(d["amostras"]) == "REC: 98770 (1, 2); TQ: 38, 40 (N); Água do processo: MN, C5; Baias: 3,3; Linha: 4."
    # só água do processo (sem baia nem linha) não usa PCA, e sem tanque não há Wort
    cliente.post("/aguas/processo", json={"dia": "2031-03-12", "hora": "09:00", "pontos": ["camara6"]})
    s = cliente.get("/incubacao", params={"dia": "2031-03-12"}).json()
    assert s["amostras"] == ["Água do processo: C6."]
    assert (s["meios"]["PCA"], s["meios"]["Wort"], s["meios"]["OSA"]) == ("-", "-", "OSA-77")


def test_tanques_por_sequencia_de_frasco_e_navio(cliente, dados, conexao):
    from labflow_api.rotas_incubacao import _navio, _tanques

    assert _tanques({"44": {"N"}, "45": {"N"}, "46": {"ST"}}) == "44, 45 (N), 46 (ST)"
    assert _tanques({"1C": {"N"}, "2P": {"N"}, "8C": {"N"}}) == "1C, 2P, 8C (N)"
    assert _tanques({"38": {"N", "ST"}, "40": {"ST"}}) == "38 (N,ST), 40 (ST)"
    assert _navio("O.SKY 123") == "O.SKY-123"


def test_tab_e_coliformes_nao_entram(cliente, logado, conexao):
    logado()
    d = cliente.get("/incubacao", params={"dia": "2031-03-01"}).json()
    assert d["amostras"] == [] and set(d["meios"].values()) == {"-"} and set(d["leituras"].values()) == {None}


def test_dias_fechados_entram_na_folha_em_ordem_e_o_pdf(cliente, dados):
    paginas = cliente.get("/laudos/incubacao").json()["paginas"]
    assert len(paginas) == 1 and (paginas[0]["linhas"], paginas[0]["capacidade"]) == (2, 7)  # 10 e 11/03; hoje (12) ainda não
    assert (paginas[0]["de"], paginas[0]["ate"]) == ("2031-03-10", "2031-03-11")
    assert cliente.get("/incubacao", params={"dia": DIA.isoformat()}).json()["na_folha"] is True
    pdf = cliente.get(f"/laudos/incubacao/{paginas[0]['id']}/pdf")
    texto = PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()
    assert "TQ: 38, 40 (N)" in texto and "10/03/31" in texto and "OSA-77" in texto and "20/03" in texto
    # listar de novo não duplica os dias
    assert cliente.get("/laudos/incubacao").json()["paginas"][0]["linhas"] == 2


def test_dia_com_muitas_amostras_ocupa_mais_de_um_bloco(cliente, dados, conexao):
    for t in range(100, 160):
        _tanque(conexao, dados, str(t), "Normal", date(2031, 3, 9), ("CT",))
    paginas = cliente.get("/laudos/incubacao").json()["paginas"]
    d9 = cliente.get("/incubacao", params={"dia": "2031-03-09"}).json()
    assert len(d9["amostras"]) > 4
    assert paginas[0]["linhas"] == 2 + -(-len(d9["amostras"]) // 4)  # 10 e 11 com 1 bloco cada, e o 09 com vários


def _lugares(conexao):
    return {d.isoformat(): (p, b, n) for d, p, b, n in conexao.execute("SELECT dia, pagina_id, bloco, blocos FROM app.incubacao_dias ORDER BY dia")}


def test_dia_que_cresce_ganha_blocos_e_o_que_nao_cabe_vai_inteiro_para_a_proxima_folha(cliente, dados, conexao):
    """26/10: a letra da descrição nunca diminui; o dia ocupa os blocos que precisar e, se não couber no resto da folha,
    vai inteiro para a próxima. Folha impressa não muda."""
    cliente.get("/laudos/incubacao")
    antes = _lugares(conexao)
    assert antes["2031-03-10"][1:] == (0, 1) and antes["2031-03-11"][1:] == (1, 1)

    for t in range(200, 240):  # o dia 10 cresce depois de entrar na folha
        _tanque(conexao, dados, str(t), "Normal", DIA, ("CT",))
    cliente.get("/laudos/incubacao")
    depois = _lugares(conexao)
    blocos_10 = depois["2031-03-10"][2]
    assert blocos_10 > 1 and depois["2031-03-11"][1] == blocos_10  # o 11 vem logo depois, na mesma folha
    linhas = len(cliente.get("/incubacao", params={"dia": "2031-03-10"}).json()["amostras"])
    assert blocos_10 == -(-linhas // 4)

    for t in range(1001, 1600, 3):  # cresce (tanques não seguidos) até não caber o 11 junto: o 11 vai para a próxima folha
        _tanque(conexao, dados, str(t), "Normal", DIA, ("CT",))
    cliente.get("/laudos/incubacao")
    fim = _lugares(conexao)
    assert fim["2031-03-10"][2] == 7 and fim["2031-03-11"][0] != fim["2031-03-10"][0] and fim["2031-03-11"][1] == 0

    folha = fim["2031-03-10"][0]
    assert cliente.post(f"/laudos/incubacao/{folha}/impresso").status_code == 200
    with pytest.raises(Exception, match="já foi impressa"):
        with conexao.transaction():
            conexao.execute("UPDATE app.incubacao_dias SET bloco = 0 WHERE dia = %s", (DIA,))


def test_folha_finalizada_fecha_cada_bloco_vazio_com_traco_e_hifens():
    """01/11 (modelo do Danyllo): um traço na descrição de cada bloco vazio e "-" nos lotes, na incubação e nas leituras."""
    from labflow_api import rotas_incubacao as ri

    celulas, riscos = ri.encerramento(1)
    assert len(riscos) == ri.BLOCOS_POR_FOLHA - 1
    x0, y0, x1, y1 = riscos[0]
    assert (x0, x1) == (ri.COLUNAS[0], ri.COLUNAS[1]) and y0 > y1  # só na descrição, de baixo à esquerda para cima à direita
    assert len(celulas) == (ri.BLOCOS_POR_FOLHA - 1) * 9 and {c.texto for c in celulas} == {"-"}
    assert ri.encerramento(ri.BLOCOS_POR_FOLHA) == ([], [])
