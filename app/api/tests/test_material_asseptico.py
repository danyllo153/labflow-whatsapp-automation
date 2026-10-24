"""APP-041: Controle de Material Asséptico (o que foi usado em cada dia, sugerido e livre) e o laudo."""

import io
from datetime import datetime

import pytest
from pypdf import PdfReader

from labflow_api import laudo_asseptico, rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


def em(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def agora(monkeypatch):
    def _fixar(quando: datetime):
        monkeypatch.setattr(rotas_turno, "_agora", lambda con: quando)

    _fixar(em(22, 9))
    return _fixar


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista", usuario=None):
        usuario = usuario or f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def _esterilizar(conexao, uid, tipo, ciclo, quando, eficiente=True):
    conexao.execute(
        "INSERT INTO app.esterilizacoes (tipo, ciclo, turno_id, dia, feita_por, feita_em, eficiente) VALUES (%s, %s, 1, %s, %s, %s, %s)",
        (tipo, ciclo, quando.date(), uid, quando, eficiente),
    )


def test_sugere_os_ciclos_do_dia_anterior_e_os_esterilizados_depois(cliente, logado, agora, conexao):
    uid = logado()
    _esterilizar(conexao, uid, "Ponteira", "A954", em(20, 10))
    assert cliente.put("/material-asseptico/2026-10-20", json={"ponteiras": "A950, A954", "placas": "P26073, G9093", "meios": "A924"}).status_code == 200
    _esterilizar(conexao, uid, "Ponteira", "A959", em(21, 10))
    _esterilizar(conexao, uid, "Água de diluição", "A953", em(21, 11))
    _esterilizar(conexao, uid, "Meio", "A960", em(22, 8))
    _esterilizar(conexao, uid, "Meio", "A961", em(22, 8, 30), eficiente=False)  # não eficiente não é sugerido
    corpo = cliente.get("/material-asseptico", params={"dia": "2026-10-22"}).json()
    assert corpo["registro"] is None and corpo["pode_preencher"]
    assert corpo["sugestao"] == {"ponteiras": "A950, A954, A959", "agua_diluicao": "A953", "placas": "P26073, G9093", "meios": "A924, A960"}


def test_preencher_grava_quem_e_corrigir_troca_o_responsavel(cliente, logado, agora):
    logado(usuario="ana.teste")
    r = cliente.put("/material-asseptico/2026-10-22", json={"ponteiras": " A959 ;A962, a959 ", "placas": "P26073", "meios": "A964"})
    assert r.status_code == 200, r.text
    reg = r.json()["registro"]
    assert (reg["ponteiras"], reg["ct"], reg["bl"]) == ("A959, A962", "<1", "<1")  # sem repetir e com o <1 padrão
    assert reg["quem"] == "ana.teste (teste)"
    logado(usuario="bia.teste")
    reg = cliente.put("/material-asseptico/2026-10-22", json={"ponteiras": "A959", "agua_diluicao": "A971"}).json()["registro"]
    assert (reg["ponteiras"], reg["agua_diluicao"], reg["placas"], reg["quem"]) == ("A959", "A971", None, "bia.teste (teste)")


def test_so_hoje_ou_ate_7_dias_antes(cliente, logado, agora):
    logado()
    assert cliente.put("/material-asseptico/2026-10-23", json={}).status_code == 422  # amanhã
    assert cliente.put("/material-asseptico/2026-10-14", json={}).status_code == 422  # 8 dias antes
    assert cliente.put("/material-asseptico/2026-10-15", json={}).status_code == 200


def test_laudo_tem_9_dias_por_pagina_e_o_pdf_traz_os_ciclos(cliente, logado, agora):
    logado()
    for d in range(22, 31):  # 9 dias enchem a página (cada um preenchido no próprio dia)
        agora(em(d, 9))
        cliente.put(f"/material-asseptico/2026-10-{d}", json={"ponteiras": f"A9{d}", "placas": "P26073"})
    paginas = cliente.get("/material-asseptico/laudos").json()["paginas"]
    assert [(p["linhas"], p["cheia"]) for p in paginas] == [(9, True)]
    texto = PdfReader(io.BytesIO(cliente.get(f"/material-asseptico/laudos/{paginas[0]['id']}/pdf").content)).pages[0].extract_text()
    assert "A922" in texto and "P26073" in texto and "22.10.26" in texto and "<1" in texto
    cliente.post(f"/material-asseptico/laudos/{paginas[0]['id']}/impresso")
    agora(em(31, 9))
    cliente.put("/material-asseptico/2026-10-31", json={"ponteiras": "A1000"})
    assert sorted((p["numero"], p["linhas"], p["impresso"]) for p in cliente.get("/material-asseptico/laudos").json()["paginas"]) == [
        (1, 9, True), (2, 1, False)
    ]


def test_consultor_ve_mas_nao_preenche(cliente, logado, agora):
    logado("Consultor")
    assert cliente.get("/material-asseptico").status_code == 200
    assert cliente.put("/material-asseptico/2026-10-22", json={}).status_code == 403


def test_esterilizacao_aceita_agua_de_diluicao(cliente, logado, agora):
    logado()
    r = cliente.post("/esterilizacao", json={"tipo": "Água de diluição", "ciclo": "A1089"})
    assert r.status_code == 201 and r.json()["itens"][0]["tipo"] == "Água de diluição"


def test_pdf_de_demonstracao_sem_dias():
    assert PdfReader(io.BytesIO(laudo_asseptico.gerar_pdf([], None))).pages[0]


def test_modelo_do_word_com_folha_extra_vazia_fica_so_com_a_primeira(cliente, logado, agora):
    """O Word exporta às vezes uma 2ª folha vazia: o app guarda só a primeira; folha extra com texto é recusada."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    def pdf(texto_na_segunda):
        saida = io.BytesIO()
        c = canvas.Canvas(saida, pagesize=A4)
        c.drawString(100, 700, "Controle de Material Asséptico")
        c.showPage()
        if texto_na_segunda:
            c.drawString(100, 700, "outra coisa")
        c.showPage()
        c.save()
        return saida.getvalue()

    logado("Admin")
    assert cliente.put("/material-asseptico/laudos/modelo", content=pdf(True)).status_code == 422
    r = cliente.put("/material-asseptico/laudos/modelo", content=pdf(False))
    assert r.status_code == 200 and r.json()["modelo_enviado"]
