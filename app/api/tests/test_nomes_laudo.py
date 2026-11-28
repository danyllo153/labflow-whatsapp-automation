"""Quem vai no laudo (086, 27/11): escolher por data (fluxo laminar) e pela folha inteira (recebimento). Dados fictícios.

Na Lite (sem senha) sem ninguém marcado o NOME sai em branco; na Completa continua o nome de quem lançou."""

import io
from datetime import date

import pytest

from pypdf import PdfReader

from labflow_api import laudos, nomes_laudo

SENHA = "Senha-de-teste-1"
DIA = date(2026, 10, 20)


@pytest.fixture
def logado(cliente, criar_pessoa):
    ana = criar_pessoa(usuario="ana.teste", cargo="Analista")
    assert cliente.post("/login", json={"usuario": "ana.teste", "senha": SENHA}).status_code == 200
    return ana


@pytest.fixture
def folha_do_fluxo(conexao, logado):
    pagina = conexao.execute("INSERT INTO app.paginas_laudo (laudo) VALUES ('fluxo-laminar') RETURNING id").fetchone()[0]
    conexao.execute(
        "INSERT INTO app.fluxo_laminar (dia, preenchido_por, pagina_id) VALUES (%s, %s, %s)", (DIA, logado, pagina)
    )
    return pagina


def test_sem_escolha_vem_cada_dia_da_folha_vazio(cliente, folha_do_fluxo):
    r = cliente.get(f"/laudos-nomes/fluxo-laminar/{folha_do_fluxo}")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["por"] == "dia" and corpo["pode_mudar"] is True
    assert corpo["escolhas"] == [{"dia": "2026-10-20", "pessoas": [], "sugeridas": []}]
    assert "ana.teste (teste)" in [p["nome"] for p in corpo["pessoas"]]


def test_escolhe_duas_pessoas_no_dia_e_o_pdf_usa(cliente, conexao, criar_pessoa, folha_do_fluxo, logado):
    bruno = criar_pessoa(usuario="bruno.teste")
    r = cliente.put(f"/laudos-nomes/fluxo-laminar/{folha_do_fluxo}", json={"dia": "2026-10-20", "pessoas": [bruno, logado]})
    assert r.status_code == 200
    assert r.json()["escolhas"][0]["pessoas"] == [bruno, logado]
    assert nomes_laudo.escolhidos(conexao, "fluxo-laminar", folha_do_fluxo, DIA) == ["bruno.teste", "ana.teste"]
    assert nomes_laudo.no_pdf(conexao, "fluxo-laminar", folha_do_fluxo, DIA, "Outro") == "bruno.teste / ana.teste"


def test_lista_vazia_volta_ao_automatico(cliente, conexao, folha_do_fluxo, logado, monkeypatch):
    url = f"/laudos-nomes/fluxo-laminar/{folha_do_fluxo}"
    cliente.put(url, json={"dia": "2026-10-20", "pessoas": [logado]})
    assert cliente.put(url, json={"dia": "2026-10-20", "pessoas": []}).json()["escolhas"][0]["pessoas"] == []
    assert nomes_laudo.escolhidos(conexao, "fluxo-laminar", folha_do_fluxo, DIA) is None
    monkeypatch.delenv("LABFLOW_LITE", raising=False)
    assert nomes_laudo.no_pdf(conexao, "fluxo-laminar", folha_do_fluxo, DIA, "Ana") == "Ana"  # Completa: quem lançou
    monkeypatch.setenv("LABFLOW_LITE", "1")
    assert nomes_laudo.no_pdf(conexao, "fluxo-laminar", folha_do_fluxo, DIA, "Ana") == ""  # Lite: em branco


def test_recusa_dia_fora_da_folha_pessoa_de_fora_e_folha_finalizada(cliente, conexao, folha_do_fluxo, logado):
    url = f"/laudos-nomes/fluxo-laminar/{folha_do_fluxo}"
    assert cliente.put(url, json={"dia": "2026-10-21", "pessoas": [logado]}).status_code == 422
    assert cliente.put(url, json={"dia": "2026-10-20", "pessoas": [999999999]}).status_code == 422
    conexao.execute("UPDATE app.paginas_laudo SET impresso_em = now(), impresso_por = %s WHERE id = %s", (logado, folha_do_fluxo))
    assert cliente.put(url, json={"dia": "2026-10-20", "pessoas": [logado]}).status_code == 409
    assert cliente.get(url).json()["pode_mudar"] is False


def test_recebimento_e_pela_folha_inteira(cliente, conexao, logado):
    pagina = conexao.execute("INSERT INTO app.paginas_laudo (laudo) VALUES ('recebimento-fcoj') RETURNING id").fetchone()[0]
    url = f"/laudos-nomes/recebimento-fcoj/{pagina}"
    corpo = cliente.get(url).json()
    assert corpo["por"] == "folha" and corpo["escolhas"][0]["dia"] is None
    assert cliente.put(url, json={"dia": "2026-10-20", "pessoas": [logado]}).status_code == 422
    assert cliente.put(url, json={"pessoas": [logado]}).status_code == 200
    assert nomes_laudo.no_pdf(conexao, "recebimento-fcoj", pagina, None, "", juntar=", ") == "ana.teste"


def test_laudo_sem_nome_e_folha_de_outro_laudo_dao_404(cliente, conexao, folha_do_fluxo):
    assert cliente.get(f"/laudos-nomes/coliformes/{folha_do_fluxo}").status_code == 404
    assert cliente.get(f"/laudos-nomes/incubacao/{folha_do_fluxo}").status_code == 404  # a folha é do fluxo laminar
    assert cliente.get(f"/laudos-nomes/material-asseptico/{folha_do_fluxo}").status_code == 404


def test_sugere_quem_marcou_entrada_no_turno_do_dia(cliente, conexao, folha_do_fluxo, logado):
    turno = conexao.execute("SELECT id FROM app.turnos ORDER BY id LIMIT 1").fetchone()
    if turno is None:
        pytest.skip("banco de teste sem turnos")
    conexao.execute(
        "INSERT INTO app.entradas_turno (dia, turno_id, usuario_id, entrada, saida) VALUES (%s, %s, %s, now() - interval '1 hour', now())",
        (DIA, turno[0], logado),
    )
    assert cliente.get(f"/laudos-nomes/fluxo-laminar/{folha_do_fluxo}").json()["escolhas"][0]["sugeridas"] == [logado]


def test_sem_login_nao_entra(cliente):
    assert cliente.get("/laudos-nomes/fluxo-laminar/1").status_code == 401


def _texto(pdf: bytes) -> str:
    return "".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf)).pages)


@pytest.mark.parametrize("laudo", ["incubacao", "meios-OSA", "recebimento-fcoj", "recebimento-nfc", "embarque-fcoj"])
def test_laudos_de_folha_inteira_o_nome_sai_no_pdf_e_sem_marcar_fica_em_branco(cliente, conexao, logado, laudo, monkeypatch):
    pagina = conexao.execute("INSERT INTO app.paginas_laudo (laudo) VALUES (%s) RETURNING id", (laudo,)).fetchone()[0]
    url = f"/laudos-nomes/{laudo}/{pagina}"
    assert cliente.get(url).json()["por"] == "folha"
    assert cliente.put(url, json={"pessoas": [logado]}).status_code == 200
    monkeypatch.setenv("LABFLOW_LITE", "1")  # daqui em diante só o PDF (a API da Completa foi usada acima)
    assert nomes_laudo.no_pdf(conexao, laudo, pagina, None, "") == "ana.teste"
    assert "ana.teste" in _texto(laudos.LAUDOS[laudo].gerar(conexao, pagina, None))
    # sem ninguém marcado, o campo sai em branco na Lite, mesmo que alguém tenha lançado
    monkeypatch.delenv("LABFLOW_LITE")
    assert cliente.put(url, json={"pessoas": []}).status_code == 200
    monkeypatch.setenv("LABFLOW_LITE", "1")
    assert "ana.teste" not in _texto(laudos.LAUDOS[laudo].gerar(conexao, pagina, None))


def test_depois_do_rotulo_acha_o_nome_no_rodape_do_modelo():
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=A4)
    c.setFont("Times-Roman", 10)
    c.drawString(40, A4[1] - 100, "Nome da tabela")  # acima da tabela: não conta
    c.drawString(40, A4[1] - 700, "Nome:")
    c.drawString(400, A4[1] - 700, "Visto:")
    c.save()
    cel = laudos.depois_do_rotulo(saida.getvalue(), ("Nome",), "Ana", (0, 1, 2, 3), abaixo_de=650)
    assert cel is not None and 60 < cel.x0 < 75 and cel.x1 < 400 and 690 < cel.topo < 700
    assert laudos.depois_do_rotulo(None, ("Nome",), "Ana", (10, 200, 660, 675)).x0 == 10
    assert laudos.depois_do_rotulo(None, ("Nome",), "", (10, 200, 660, 675)) is None


def test_nome_no_lugar_certo_do_modelo_fictício_da_incubacao(conexao, logado, monkeypatch):
    """O Nome vai logo depois do rótulo "Nome:" do modelo enviado (aqui, um modelo inventado só para o teste)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    monkeypatch.setenv("LABFLOW_LITE", "1")
    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=A4)
    c.setFont("Times-Roman", 10)
    c.drawString(40, A4[1] - 700, "Nome:")
    c.drawString(400, A4[1] - 700, "Visto:")
    c.save()
    pagina = conexao.execute("INSERT INTO app.paginas_laudo (laudo) VALUES ('incubacao') RETURNING id").fetchone()[0]
    conexao.execute(
        "INSERT INTO app.nomes_no_laudo (laudo, pagina_id, dia, pessoas, escolhido_por) VALUES ('incubacao', %s, NULL, %s, %s)",
        (pagina, [logado], logado),
    )
    pdf = laudos.LAUDOS["incubacao"].gerar(conexao, pagina, saida.getvalue())
    pecas: list[tuple[str, float, float]] = []
    for pagina_pdf in PdfReader(io.BytesIO(pdf)).pages:
        pagina_pdf.extract_text(visitor_text=lambda t, cm, tm, fd, fs: pecas.append((t.strip(), tm[4], tm[5])) if t.strip() else None)
    x = {t: (px, py) for t, px, py in pecas}
    assert "ana.teste" in x, pecas
    (nx, ny), (ax, ay), (vx, vy) = x["Nome:"], x["ana.teste"], x["Visto:"]
    assert nx < ax < vx and abs(ay - ny) < 6  # na mesma linha do rótulo, entre o Nome: e o Visto:


def test_so_quem_lanca_escolhe_os_nomes_403(cliente, conexao, criar_pessoa, folha_do_fluxo):
    criar_pessoa(usuario="cris.teste", cargo="Consultor")
    cliente.cookies.clear()
    assert cliente.post("/login", json={"usuario": "cris.teste", "senha": SENHA}).status_code == 200
    assert cliente.get(f"/laudos-nomes/fluxo-laminar/{folha_do_fluxo}").status_code == 403
    assert cliente.put(f"/laudos-nomes/fluxo-laminar/{folha_do_fluxo}", json={"dia": "2026-10-20", "pessoas": []}).status_code == 403
