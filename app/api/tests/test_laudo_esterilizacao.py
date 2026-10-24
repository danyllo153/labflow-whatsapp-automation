"""APP-035: laudo de esterilização (páginas de 35 linhas, eficiente Sim/Não, PDF preenchido e modelo da empresa)."""

import io
import re
from datetime import datetime

import pytest
from pypdf import PdfReader

from labflow_api import laudo_esterilizacao, rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


def em(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def agora(monkeypatch):
    def _fixar(quando: datetime):
        monkeypatch.setattr(rotas_turno, "_agora", lambda con: quando)

    agora = _fixar
    agora(em(22, 9))
    return agora


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista", usuario=None):
        usuario = usuario or f"{cargo.lower()}.teste"
        uid = criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200
        return uid

    return _logar


def registrar(cliente, ciclo, tipo="Ponteira", **extra):
    r = cliente.post("/esterilizacao", json={"tipo": tipo, "ciclo": ciclo, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def texto_do_pdf(cliente, laudo_id):
    r = cliente.get(f"/esterilizacao/laudos/{laudo_id}/pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    return PdfReader(io.BytesIO(r.content)).pages[0].extract_text()


def test_eficiente_comeca_em_sim_e_a_pagina_agrupa_materiais_do_mesmo_ciclo(cliente, logado, agora):
    logado()
    registrar(cliente, "A1092/26", "Meio", meio="PDA")
    corpo = registrar(cliente, " a1092/26 ", "Frasco")
    assert all(i["eficiente"] for i in corpo["itens"])
    paginas = cliente.get("/esterilizacao/laudos").json()["paginas"]
    assert len(paginas) == 1 and paginas[0]["linhas"] == 1 and paginas[0]["cheia"] is False and paginas[0]["numero"] == 1
    texto = texto_do_pdf(cliente, paginas[0]["id"])
    assert "Meio de cultura (PDA) / Frascos" in texto and "A1092/26" in texto and re.search(r"\d\d\.\d\d\.26", texto) and "OK" in texto


def test_pagina_cheia_abre_a_proxima_e_impressa_vai_para_o_arquivo(cliente, logado, agora):
    logado()
    for n in range(laudo_esterilizacao.CAPACIDADE):
        registrar(cliente, f"A{1000 + n}/26")
    p = cliente.get("/esterilizacao/laudos").json()["paginas"]
    assert [(x["linhas"], x["cheia"]) for x in p] == [(35, True)]
    registrar(cliente, "A2000/26")
    p = cliente.get("/esterilizacao/laudos").json()["paginas"]
    assert sorted((x["numero"], x["linhas"]) for x in p) == [(1, 35), (2, 1)]
    # imprimir a página 1: ela vai para o fim da lista (arquivo), com quem imprimiu
    primeira = next(x for x in p if x["numero"] == 1)
    r = cliente.post(f"/esterilizacao/laudos/{primeira['id']}/impresso")
    assert r.status_code == 200
    p = r.json()["paginas"]
    assert [(x["numero"], x["impresso"]) for x in p] == [(2, False), (1, True)] and p[1]["impresso_por"]
    # a nova esterilização não entra na página impressa: segue na 2 (que tem vaga)
    registrar(cliente, "A2001/26")
    assert sorted((x["numero"], x["linhas"]) for x in cliente.get("/esterilizacao/laudos").json()["paginas"]) == [(1, 35), (2, 2)]
    # imprimir a 2 e registrar de novo abre a 3
    segunda = next(x for x in cliente.get("/esterilizacao/laudos").json()["paginas"] if x["numero"] == 2)
    cliente.post(f"/esterilizacao/laudos/{segunda['id']}/impresso")
    registrar(cliente, "A2002/26")
    assert sorted(x["numero"] for x in cliente.get("/esterilizacao/laudos").json()["paginas"]) == [1, 2, 3]


def test_marcar_nao_eficiente_pede_motivo_vale_para_o_ciclo_todo_e_troca_o_x_no_pdf(cliente, logado, agora):
    logado()
    registrar(cliente, "A1092/26", "Meio")
    itens = registrar(cliente, "A1092/26", "Frasco")["itens"]
    url = f"/esterilizacao/{itens[0]['id']}/eficiente"
    assert cliente.put(url, json={"eficiente": False}).status_code == 422
    r = cliente.put(url, json={"eficiente": False, "motivo": "indicador da fita não virou"})
    assert r.status_code == 200 and not any(i["eficiente"] for i in r.json()["itens"])
    assert all(i["corrigida"] for i in r.json()["itens"])
    r = cliente.put(url, json={"eficiente": True})
    assert r.status_code == 200 and all(i["eficiente"] for i in r.json()["itens"])


def test_pdf_do_nao_eficiente_marca_a_coluna_nao(conexao):
    from datetime import date

    linhas = [
        {"data": date(2026, 10, 22), "dia": date(2026, 10, 22), "ciclo": "A1", "material": "Ponteiras", "eficiente": False, "analista": "Ana"}
    ]
    texto = PdfReader(io.BytesIO(laudo_esterilizacao.gerar_pdf(linhas, None))).pages[0].extract_text()
    assert "Ponteiras" in texto and "A1" in texto and "Ana" in texto


def test_aviso_de_ciclo_ja_registrado_nao_sugere_numero(cliente, logado, agora):
    logado()
    registrar(cliente, "A1092/26", "Meio")
    r = cliente.get("/esterilizacao/ciclo", params={"ciclo": "a1092/26"})
    assert [(i["tipo"], bool(i["quem"])) for i in r.json()] == [("Meio", True)]
    assert cliente.get("/esterilizacao/ciclo", params={"ciclo": "A9999/26"}).json() == []


def test_corrigir_o_ciclo_muda_a_linha_do_laudo(cliente, logado, agora):
    logado()
    item = registrar(cliente, "A1/26")["itens"][0]
    r = cliente.put(f"/esterilizacao/{item['id']}", json={"tipo": "Ponteira", "ciclo": "A2/26", "motivo": "digitei errado"})
    assert r.status_code == 200
    pagina = cliente.get("/esterilizacao/laudos").json()["paginas"][0]
    texto = texto_do_pdf(cliente, pagina["id"])
    assert "A2/26" in texto and "A1/26" not in texto


def test_so_o_admin_envia_o_modelo_e_o_pdf_precisa_ser_a4_de_uma_pagina(cliente, logado, agora):
    logado("Analista")
    assert cliente.put("/esterilizacao/laudos/modelo", content=laudo_esterilizacao._modelo_de_demonstracao()).status_code == 403
    logado("Admin")
    url = "/esterilizacao/laudos/modelo"
    assert cliente.put(url, content=b"nao e pdf").status_code == 422
    from reportlab.pdfgen import canvas

    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=(300, 300))
    c.save()
    assert cliente.put(url, content=saida.getvalue()).status_code == 422  # não é A4
    r = cliente.put(url, content=laudo_esterilizacao._modelo_de_demonstracao())
    assert r.status_code == 200 and r.json()["modelo_enviado"] and r.json()["modelo_enviado_em"]


def test_coletor_e_consultor_nao_veem_o_laudo(cliente, logado, agora):
    logado("Consultor")
    assert cliente.get("/esterilizacao/laudos").status_code == 403
