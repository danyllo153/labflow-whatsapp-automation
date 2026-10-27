"""Água de consumo (pedido de 27/10, migration 079): pontos, coletas mensal e semanal, navios, limites, Leituras e laudos.

Os limites e os nomes dos pontos daqui são FICTÍCIOS (os reais ficam só no banco do servidor).
"""

import io
from datetime import datetime

import pytest
from pypdf import PdfReader

from labflow_api import rotas_turno
from labflow_api.rotas_turno import FUSO

SENHA = "Senha-de-teste-1"


def em(dia: int, hora: int, minuto: int = 0) -> datetime:
    return datetime(2026, 10, dia, hora, minuto, tzinfo=FUSO)


@pytest.fixture
def agora(monkeypatch):
    def _fixar(quando: datetime):
        monkeypatch.setattr(rotas_turno, "_agora", lambda con: quando)

    _fixar(em(22, 10))
    return _fixar


@pytest.fixture(autouse=True)
def _mensal_sem_semanal(conexao):
    """Os pontos fictícios do mensal e do semanal têm os mesmos nomes, então a 080 marca todos do mensal como "semanal";
    os testes começam sem a marca, e o da 080 marca os que quer."""
    conexao.execute("UPDATE app.pontos_agua_consumo SET semanal = false")


@pytest.fixture
def logado(cliente, criar_pessoa):
    def _logar(cargo="Analista"):
        usuario = f"{cargo.lower()}.teste"
        criar_pessoa(usuario=usuario, cargo=cargo)
        cliente.cookies.clear()
        assert cliente.post("/login", json={"usuario": usuario, "senha": SENHA}).status_code == 200

    return _logar


def _coleta(cliente, **campos):
    corpo = {"unidade": "TMG", "tipo": "mensal", "dia": "2026-10-22", "hora": "08:30", **campos}
    r = cliente.post("/aguas/consumo/coletas", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()["coletas"][0]


def test_mensal_cria_um_resultado_por_ponto_e_segue_o_bag_o_ct_e_o_bl(cliente, logado, agora):
    logado()
    ver = cliente.get("/aguas/consumo").json()
    assert len([p for p in ver["pontos"]["TMG"]["mensal"] if p["ativo"]]) == 8
    c = _coleta(cliente)
    assert [r["ponto"] for r in c["resultados"]] == [f"Ponto {n}" for n in range(1, 9)]
    assert c["situacao"] == "Aguardando Coliformes e E.coli (23/10)"
    url = f"/aguas/consumo/coletas/{c['id']}/resultados"
    previa = cliente.put(url, json={"itens": [{"ordem": 1, "coliformes": "a", "ecoli": "P"}]}).json()
    assert previa["previa"] and previa["texto"].split("\n")[0] == "Ponto 1: Coliformes A, E.coli P"
    assert previa["fora"] == ["Ponto 1: E.coli fora do limite"]
    assert cliente.get("/aguas/consumo").json()["coletas"][0]["resultados"][0]["ecoli"] is None  # a prévia não grava
    itens = [{"ordem": n, "coliformes": "A", "ecoli": "A"} for n in range(1, 9)]
    feito = cliente.put(url, json={"itens": itens, "previa": False}).json()
    assert feito["agua"]["coletas"][0]["situacao"] == "Aguardando C.T 48h (24/10)"
    agora(em(24, 9))
    assert cliente.get("/aguas/consumo").json()["coletas"][0]["situacao"] == "Vence hoje: C.T 48h"
    # C.T acima do limite fictício (500) fica fora; "<1" nunca
    r = cliente.put(url, json={"itens": [{"ordem": 1, "ct": "900"}, {"ordem": 2, "ct": "< 1"}], "previa": False}).json()
    assert r["fora"] == ["Ponto 1: C.T fora do limite"]
    assert cliente.put(url, json={"itens": [{"ordem": 1, "ct": "abc"}]}).status_code == 422
    assert cliente.put(url, json={"itens": [{"ordem": 99, "ct": "1"}]}).status_code == 422
    assert cliente.put(url, json={"itens": [{"ordem": 1, "ph": "7"}]}).status_code == 422  # pH é do semanal


def test_semanal_ph_e_cloro_na_hora_e_a_primeira_analise_vai_para_o_cabecalho(cliente, logado, agora):
    logado()
    c = _coleta(cliente, unidade="Santos", tipo="semanal")
    assert len(c["resultados"]) == 2 and c["situacao"] == "Vence hoje: pH e cloro"
    url = f"/aguas/consumo/coletas/{c['id']}/resultados"
    r = cliente.put(url, json={"itens": [{"ordem": 1, "ph": "7,2", "cloro": "9"}, {"ordem": 2, "ph": "5,1", "cloro": "1"}], "previa": False}).json()
    assert r["fora"] == ["Ponto 1: Cloro fora do limite", "Ponto 2: pH fora do limite"]
    coleta = r["agua"]["coletas"][0]
    assert coleta["resultados"][0]["ph"] == 7.2 and coleta["fq_analisada_em"] and coleta["fq_analisada_por"]
    assert coleta["micro_analisada_em"] is None  # só a físico-química foi lançada
    assert coleta["situacao"] == "Aguardando Coliformes e E.coli (23/10)"
    assert cliente.put(url, json={"itens": [{"ordem": 1, "ph": "15"}]}).status_code == 422


def test_agua_do_navio_tec_e_coz_e_o_coletor_coleta_mas_nao_lanca(cliente, logado, agora):
    logado("Coletor")
    c = _coleta(cliente, unidade="Navio", navio=" o.blossom ii  - 123 ")
    assert c["navio"] == "O.BLOSSOM II - 123" and [r["ponto"] for r in c["resultados"]] == ["TEC", "COZ"]
    assert cliente.post("/aguas/consumo/coletas", json={"unidade": "Navio", "dia": "2026-10-22", "hora": "08:30"}).status_code == 422
    assert cliente.put(f"/aguas/consumo/coletas/{c['id']}/resultados", json={"itens": [{"ordem": 1, "ct": "1"}]}).status_code == 403
    assert cliente.get("/aguas/consumo").json()["navios"] == ["O.BLOSSOM II - 123"]


def test_admin_edita_pontos_e_limites(cliente, logado, agora):
    logado("Analista")
    assert cliente.post("/aguas/consumo/pontos", json={"unidade": "Santos", "tipo": "mensal", "nome": "X"}).status_code == 403
    logado("Admin")
    r = cliente.post("/aguas/consumo/pontos", json={"unidade": "Santos", "tipo": "mensal", "nome": "  Bebedouro   A "})
    assert r.status_code == 201
    pontos = r.json()["pontos"]["Santos"]["mensal"]
    novo = pontos[-1]
    assert (novo["nome"], novo["ordem"]) == ("Bebedouro A", 3)
    assert cliente.post("/aguas/consumo/pontos", json={"unidade": "Santos", "tipo": "mensal", "nome": "Bebedouro A"}).status_code == 409
    r = cliente.put(f"/aguas/consumo/pontos/{novo['id']}", json={"nome": "Bebedouro B", "ativo": False}).json()
    assert r["pontos"]["Santos"]["mensal"][-1] == {**novo, "nome": "Bebedouro B", "ativo": False}
    # o máximo de pontos ativos (Santos mensal: 8)
    for n in range(6):
        assert cliente.post("/aguas/consumo/pontos", json={"unidade": "Santos", "tipo": "mensal", "nome": f"Extra {n}"}).status_code == 201
    assert cliente.post("/aguas/consumo/pontos", json={"unidade": "Santos", "tipo": "mensal", "nome": "Nono"}).status_code == 422
    lim = {"ct": 10, "bl": 1, "ph_min": 6, "ph_max": 8, "cloro_min": 0.5, "cloro_max": 2}
    assert cliente.put("/aguas/consumo/limites", json={**lim, "ph_min": 9}).status_code == 422
    assert cliente.put("/aguas/consumo/limites", json=lim).json()["limites"] == lim


def test_renomear_o_ponto_nao_muda_a_coleta_ja_feita(cliente, logado, agora):
    logado("Admin")
    c = _coleta(cliente, unidade="Santos")
    ponto = cliente.get("/aguas/consumo").json()["pontos"]["Santos"]["mensal"][0]
    cliente.put(f"/aguas/consumo/pontos/{ponto['id']}", json={"nome": "Nome novo"})
    coleta = next(x for x in cliente.get("/aguas/consumo").json()["coletas"] if x["id"] == c["id"])
    assert coleta["resultados"][0]["ponto"] == "Ponto 1"


def test_leituras_pendentes_trazem_a_agua_de_consumo(cliente, logado, agora):
    logado()
    _coleta(cliente)
    agora(em(23, 9))
    grupos = cliente.get("/leituras/pendentes").json()["leituras"]
    agua = next(g for g in grupos if g["grupo"] == "Água de consumo")
    assert agua["itens"][0]["rotulo"] == "TMG mensal · Coliformes e E.coli"
    assert agua["itens"][0]["caminho"] == "/leituras?aba=agua-consumo"


def test_excluir_pede_motivo(cliente, logado, agora):
    logado()
    c = _coleta(cliente)
    assert cliente.post(f"/aguas/consumo/coletas/{c['id']}/excluir", json={"motivo": "x"}).status_code == 422
    r = cliente.post(f"/aguas/consumo/coletas/{c['id']}/excluir", json={"motivo": "Coleta em duplicidade"}).json()
    assert all(x["id"] != c["id"] for x in r["coletas"])


def test_laudos_mensal_por_unidade_navio_por_navio_e_semanal_em_blocos(cliente, logado, agora):
    logado()
    _coleta(cliente)  # TMG: 8 pontos
    _coleta(cliente, hora="09:00")  # mais 8
    folhas = cliente.get("/laudos/agua-consumo-mensal-TMG").json()["paginas"]
    assert [p["linhas"] for p in folhas] == [16]
    assert cliente.get("/laudos/agua-consumo-mensal-Santos").json()["paginas"] == []
    _coleta(cliente, unidade="Navio", navio="O.BLOSSOM II - 123")
    _coleta(cliente, unidade="Navio", navio="O.SKY 189")
    navio = cliente.get("/laudos/agua-consumo-navio").json()["paginas"]
    assert sorted(p["linhas"] for p in navio) == [2, 2]  # uma folha por navio
    for _ in range(3):
        _coleta(cliente, tipo="semanal")
    fq = cliente.get("/laudos/agua-consumo-fq-TMG").json()["paginas"]
    micro = cliente.get("/laudos/agua-consumo-micro-TMG").json()["paginas"]
    assert sorted(p["linhas"] for p in fq) == [1, 2] and len(micro) == 3  # 2 blocos por folha / 1 bloco por folha
    pdf = cliente.get(f"/laudos/agua-consumo-mensal-TMG/{folhas[0]['id']}/pdf")
    assert pdf.status_code == 200
    texto = PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()
    assert "22/10/2026" in texto and "Ponto 8" in texto
    assert texto.count("22/10/2026") == 2  # a data só na primeira linha de cada coleta
    pdf = cliente.get(f"/laudos/agua-consumo-navio/{navio[0]['id']}/pdf")
    assert "TEC" in PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()
    pdf = cliente.get(f"/laudos/agua-consumo-fq-TMG/{fq[-1]['id']}/pdf")
    assert pdf.status_code == 200 and "Ponto 1" in PdfReader(io.BytesIO(pdf.content)).pages[0].extract_text()


def test_mensal_com_os_pontos_do_semanal_mede_ph_e_cloro_e_entra_nos_laudos_semanais(cliente, logado, agora):
    """080: no mensal, os pontos marcados "semanal" medem pH e cloro na hora, e a coleta vale como a semanal."""
    logado("Admin")
    mensal = cliente.get("/aguas/consumo").json()["pontos"]["TMG"]["mensal"]
    for p in mensal[:2]:
        r = cliente.put(f"/aguas/consumo/pontos/{p['id']}", json={"semanal": True})
        assert r.status_code == 200
    assert [p["semanal"] for p in r.json()["pontos"]["TMG"]["mensal"]][:3] == [True, True, False]
    semanal = cliente.get("/aguas/consumo").json()["pontos"]["TMG"]["semanal"][0]
    assert cliente.put(f"/aguas/consumo/pontos/{semanal['id']}", json={"semanal": True}).status_code == 422  # só no mensal
    c = _coleta(cliente)
    assert [r["semanal"] for r in c["resultados"]][:3] == [True, True, False]
    assert c["situacao"] == "Vence hoje: pH e cloro"
    url = f"/aguas/consumo/coletas/{c['id']}/resultados"
    assert cliente.put(url, json={"itens": [{"ordem": 3, "ph": "7"}]}).status_code == 422  # ponto 3 não é do semanal
    r = cliente.put(url, json={"itens": [{"ordem": 1, "ph": "7,1", "cloro": "1"}, {"ordem": 2, "ph": "9,9", "cloro": "1"}], "previa": False}).json()
    assert r["fora"] == ["Ponto 2: pH fora do limite"]
    assert r["agua"]["coletas"][0]["situacao"] == "Aguardando Coliformes e E.coli (23/10)"
    # desmarcar o ponto depois não muda a coleta já feita
    cliente.put(f"/aguas/consumo/pontos/{mensal[0]['id']}", json={"semanal": False})
    assert cliente.get("/aguas/consumo").json()["coletas"][0]["resultados"][0]["semanal"] is True
    # a folha mensal com todos os pontos; os laudos semanais com a coleta mensal, só os 2 pontos
    assert [p["linhas"] for p in cliente.get("/laudos/agua-consumo-mensal-TMG").json()["paginas"]] == [8]
    fq = cliente.get("/laudos/agua-consumo-fq-TMG").json()["paginas"]
    micro = cliente.get("/laudos/agua-consumo-micro-TMG").json()["paginas"]
    assert [p["linhas"] for p in fq] == [1] and len(micro) == 1
    texto = PdfReader(io.BytesIO(cliente.get(f"/laudos/agua-consumo-fq-TMG/{fq[0]['id']}/pdf").content)).pages[0].extract_text()
    assert "7,10" in texto and "9,90" in texto and "Ponto 2" in texto and "Ponto 3" not in texto


def _modelo_fq_tmg() -> bytes:
    """Um modelo FICTÍCIO no formato do papel: os dois blocos com o cabeçalho de barras e dois-pontos, as linhas da
    tabela e o "-" impresso nas observações de toda linha."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    from labflow_api import rotas_agua_consumo as rac

    saida = io.BytesIO()
    c = canvas.Canvas(saida, pagesize=A4)
    altura = A4[1]
    for y, topo, base, n in rac.SEMANAL[("fq", "TMG")]["blocos"]:
        c.setFont("Times-Roman", 11)
        c.drawString(40, altura - (y + 8), "Data/ Hora da Coleta: _____/_____/__________:_____")
        c.drawString(300, altura - (y + 8), "Responsável pela Coleta: _______________")
        c.drawString(40, altura - (y + 36), "Data/ Hora da Análise: _____/_____/__________:_____")
        c.drawString(300, altura - (y + 36), "Responsável pela Análise: _______________")
        colunas = rac.SEMANAL[("fq", "TMG")]["colunas"]
        passo = (base - topo) / n
        for k in range(n + 1):
            c.line(colunas[0], altura - (topo + k * passo), colunas[-1], altura - (topo + k * passo))
        for x in colunas:
            c.line(x, altura - topo, x, altura - base)
        for k in range(n):
            c.drawCentredString((colunas[3] + colunas[4]) / 2, altura - (topo + (k + 0.7) * passo), "-")
    c.showPage()
    c.save()
    return saida.getvalue()


def test_laudo_semanal_escreve_o_cabecalho_nos_espacos_do_modelo_e_quem_foi_escolhido(cliente, conexao, logado, agora):
    """27/10: data e hora em cada espaço (dia, mês, ano, hora, minuto), quem coletou e quem analisou escolhidos na leitura,
    e a folha finalizada com o traço das linhas vazias de cada bloco (o bloco sem coleta, inteiro)."""
    from labflow_api import laudos
    from labflow_api import rotas_agua_consumo as rac

    logado("Admin")
    assert cliente.put("/laudos/agua-consumo-fq-TMG/modelo", content=_modelo_fq_tmg()).status_code == 200
    c = _coleta(cliente, tipo="semanal", pontos=[])
    url = f"/aguas/consumo/coletas/{c['id']}/resultados"
    corpo = {"itens": [{"ordem": 1, "ph": "7", "cloro": "1"}, {"ordem": 2, "ph": "7", "cloro": "1"}], "coletado_por": "Bia Coletora",
             "analisado_por": "Caio Analista", "analise_dia": "2026-10-22", "analise_hora": "09:15"}
    previa = cliente.put(url, json=corpo).json()
    assert "Análise: 22/10/2026 09:15, por Caio Analista · coletado por Bia Coletora" in previa["texto"]
    r = cliente.put(url, json={**corpo, "previa": False}).json()
    coleta = next(x for x in r["agua"]["coletas"] if x["id"] == c["id"])
    assert (coleta["quem"], coleta["fq_analisada_por"], coleta["fq_analisada_em"]) == ("Bia Coletora", "Caio Analista", "22/10/2026 09:15")
    folha = cliente.get("/laudos/agua-consumo-fq-TMG").json()["paginas"][0]
    pdf = cliente.get(f"/laudos/agua-consumo-fq-TMG/{folha['id']}/pdf").content
    linhas = laudos.letras_do_modelo(pdf)
    # a linha da coleta do 1º bloco: "22" entre o rótulo e a 1ª barra, "10" entre as barras, "30" depois dos dois-pontos
    rotulo = next(le for le in linhas if laudos.achar(le, "Data/ Hora da Coleta:"))
    escrito = next(le for le in linhas if 0.5 < rotulo[0].y - le[0].y < 4)  # o que o app escreveu, 1,5 pt acima do traço
    assert laudos.achar(escrito, "Bia Coletora")
    barras = [le for le in rotulo if le.letra == "/" and le.x0 > laudos.achar(rotulo, "Coleta:")[1].x1]
    coleta_linha = escrito
    dia, mes = laudos.achar(coleta_linha, "22"), laudos.achar(coleta_linha, "10", barras[0].x1)
    assert dia[1].x1 <= barras[0].x0 and barras[0].x1 <= mes[0].x0 and mes[1].x1 <= barras[1].x0
    assert laudos.achar(coleta_linha, "2026") and laudos.achar(coleta_linha, "30", barras[1].x1)
    assert any(laudos.achar(le, "Caio Analista") for le in linhas)
    # finalizada: o 1º bloco riscado depois dos pontos da coleta e o 2º (sem coleta) inteiro
    cliente.post(f"/laudos/agua-consumo-fq-TMG/{folha['id']}/finalizar")
    modelo = _modelo_fq_tmg()
    riscos = rac._riscos_semanal("fq", "TMG")
    blocos = rac._tabelas_semanal("fq", "TMG", modelo)
    feitos = riscos(conexao, folha["id"], modelo)
    assert feitos == [blocos[0][1].traco_das_vazias(len(c["resultados"])), blocos[1][1].traco_das_vazias(0)]
    assert cliente.get(f"/laudos/agua-consumo-fq-TMG/{folha['id']}/pdf").status_code == 200
