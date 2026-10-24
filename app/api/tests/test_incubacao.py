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
    assert d["amostras"] == ["TQ 38 (N), 40 (N) · Receb. FCOJ: L 98770 (1, 2)"]
    assert d["meios"] == {"OSA": "OSA-77", "PDA": "PDA-55", "PCA": "-", "Wort": "WRT-11"}
    assert d["leituras"] == {"48h": "2031-03-12", "72h": "2031-03-13", "120h": "2031-03-15", "240h": "2031-03-20"}
    st = cliente.get("/incubacao", params={"dia": "2031-03-11"}).json()
    assert st["amostras"] == ["TQ 38 (ST)"]


def test_aguas_usam_pca_e_pda_e_dia_sem_tanque_fica_com_traco(cliente, dados):
    r = cliente.post("/aguas/superficies", json={"tipo": "Baia", "pontos": ["10", "08"], "dia": "2031-03-11", "hora": "07:10"})
    assert r.status_code in (200, 201), r.text
    d = cliente.get("/incubacao", params={"dia": "2031-03-11"}).json()
    assert d["amostras"] == ["TQ 38 (ST) · Baias 08, 10"]
    assert d["meios"]["PCA"] is None  # o meio foi usado, mas não há lote de PCA marcado: fica em branco no laudo
    assert d["leituras"]["48h"] == "2031-03-13"


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
    assert "TQ 38 (N), 40 (N)" in texto and "10/03/31" in texto and "OSA-77" in texto and "20/03" in texto
    # listar de novo não duplica os dias
    assert cliente.get("/laudos/incubacao").json()["paginas"][0]["linhas"] == 2


def test_dia_com_muitas_amostras_ocupa_mais_de_um_bloco(cliente, dados, conexao):
    for t in range(100, 160):
        _tanque(conexao, dados, str(t), "Normal", date(2031, 3, 9), ("CT",))
    paginas = cliente.get("/laudos/incubacao").json()["paginas"]
    d9 = cliente.get("/incubacao", params={"dia": "2031-03-09"}).json()
    assert len(d9["amostras"]) > 4
    assert paginas[0]["linhas"] == 2 + -(-len(d9["amostras"]) // 4)  # 10 e 11 com 1 bloco cada, e o 09 com vários
